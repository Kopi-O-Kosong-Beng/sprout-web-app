import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';
import BackButton from '../components/common/BackButton';
import {
  BotAvatar,
  HealthBar,
  PlantAvatar,
  StatGrid,
  type PlantAvatarData,
} from '../components/common/PlantVisuals';
import { extractApiError } from '../services/apiClient';
import {
  abandonPveBattle,
  getPveBattle,
  listOwnedAvatars,
  startPveBattle,
  submitPveAction,
  type AvatarRecord,
  type BattleEvent,
  type BattleEventType,
  type BattleIntent,
  type BattleMove,
  type BattleSession,
} from '../services/sproutApi';
import { useNavigationLock } from '../hooks/useNavigationLock';
import { toPlantAvatarData } from '../utils/avatarPresentation';

const ROSTER_PAGE_SIZE = 100;

/** Where the id of an in-progress battle survives a reload. The session lives
 *  in Firestore either way; this is only the pointer back to it, so a refresh
 *  resumes the fight instead of silently dumping the player at the roster
 *  while the server still counts the battle as active. */
const ACTIVE_SESSION_STORAGE_KEY = 'sprout.battle.sessionId';

function readStoredSessionId(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSessionId(sessionId: string | null): void {
  try {
    if (sessionId === null) {
      window.sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
    }
  } catch {
    // Storage blocked (private mode) — resume degrades, battles still work.
  }
}

/** True when the environment cannot or should not animate: the user asked for
 *  reduced motion, or matchMedia is absent (jsdom). The battle then resolves
 *  turns instantly — the same end state, none of the choreography. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type BattleView =
  | 'loading'
  | 'selecting'
  | 'starting'
  | 'active'
  | 'submitting'
  | 'terminal'
  | 'error';
type PendingCommand = 'start' | 'replay' | 'action' | 'abandon';
type RetryCommand =
  | { kind: 'load' }
  | { kind: 'start' | 'replay'; avatarId: string }
  | {
      kind: 'action';
      sessionId: string;
      moveId: string;
      expectedTurn: number;
    }
  | { kind: 'abandon'; sessionId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function routeAvatarId(state: unknown): string | null {
  if (!isRecord(state) || typeof state.avatarId !== 'string') return null;
  const id = state.avatarId.trim();
  return id.length > 0 ? id : null;
}

async function fetchAllOwnedAvatars(
  shouldContinue: () => boolean
): Promise<AvatarRecord[]> {
  const recordsById = new Map<string, AvatarRecord>();
  let requestedPage = 1;

  while (shouldContinue()) {
    const result = await listOwnedAvatars(requestedPage, ROSTER_PAGE_SIZE);
    if (!shouldContinue() || result.page !== requestedPage) break;

    const previousCount = recordsById.size;
    for (const record of result.items) recordsById.set(record.id, record);

    const total =
      Number.isFinite(result.total) && result.total >= 0
        ? result.total
        : recordsById.size;
    if (recordsById.size >= total) break;
    if (result.items.length === 0 || recordsById.size === previousCount) break;
    requestedPage = result.page + 1;
  }

  return [...recordsById.values()];
}

function viewForSession(session: BattleSession): BattleView {
  return session.status === 'active' ? 'active' : 'terminal';
}

function boundedEnergy(
  value: number,
  maxEnergy: number
): { current: number; max: number } {
  const max =
    Number.isSafeInteger(maxEnergy) && maxEnergy >= 0 ? maxEnergy : 0;
  const current =
    Number.isSafeInteger(value) && value >= 0
      ? Math.min(max, value)
      : 0;
  return { current, max };
}

function intentMessage(name: string, intent: BattleIntent | null): string {
  switch (intent) {
    case 'building':
      return `${name} is building momentum.`;
    case 'committed':
      return `${name} is committed to a decisive action.`;
    case 'uncertain':
      return `${name}'s next action remains uncertain.`;
    default:
      return `${name}'s intent is not available.`;
  }
}

const EVENT_LABELS: Record<BattleEventType, string> = {
  battle_started: 'Battle started',
  bot_intent_prepared: 'Intent prepared',
  move_used: 'Move used',
  move_missed: 'Move missed',
  damage_dealt: 'Damage dealt',
  healed: 'Healed',
  player_action_skipped: 'Player action skipped',
  bot_action_skipped: 'Opponent action skipped',
  battle_won: 'Battle won',
  battle_lost: 'Battle lost',
  battle_abandoned: 'Battle abandoned',
};

function actorLabel(event: BattleEvent): string {
  if (event.actor === 'player') return 'Player';
  if (event.actor === 'bot') return 'Opponent';
  return 'System';
}

/**
 * Who is on the receiving end of a damage or heal event.
 *
 * The server's own copy names the actor but never the target — "Thornback dealt
 * 8 damage." reads identically whether you are winning or losing, which is what
 * made Guard look like it was hurting the opponent. Derived here rather than in
 * the API because the bot's messages are deliberately sanitized server-side,
 * and because this also repairs log entries already stored in Firestore.
 */
function eventTargetLine(
  event: BattleEvent,
  playerName: string,
  botName: string
): string | null {
  if (event.amount === undefined) return null;
  if (event.actor === 'system') return null;

  if (event.type === 'healed') {
    const healer = event.actor === 'player' ? playerName : botName;
    return `${healer} recovered ${event.amount} HP`;
  }
  if (event.type === 'damage_dealt') {
    const target = event.actor === 'player' ? botName : playerName;
    return `${target} took ${event.amount} damage`;
  }
  return null;
}

/** One thing that happened to one combatant on the turn just resolved. */
interface TurnFeedback {
  /** Changes per turn so React remounts the element and replays the animation. */
  id: string;
  kind: 'damage' | 'heal' | 'miss';
  amount: number;
}

const RESOLVED_EVENTS = new Set<BattleEventType>([
  'move_used',
  'damage_dealt',
  'move_missed',
  'healed',
]);

type CombatantSide = 'player' | 'opponent';

/**
 * One beat of the turn's choreography: an actor's move and its outcome, played
 * back in the server's own speed order. `hpDelta` is signed from the target's
 * point of view (damage negative, heal positive) so the displayed bars can
 * drain step by step instead of jumping to the final state.
 */
interface TurnBeat {
  id: string;
  actor: CombatantSide;
  target: CombatantSide;
  /** Null for a move with no outcome event — Guard resolves silently. */
  feedback: TurnFeedback | null;
  hpDelta: number;
  /** The attack line ("Fern Ward used Vine Tap."), when the log carries one. */
  useMessage: string | null;
  /** The outcome line ("Opponent dealt 17 damage."). */
  outcomeMessage: string;
  /** Set for player beats so the resolving move card can light up. */
  moveId: string | null;
}

/**
 * The latest resolved turn, read back off the server's own log rather than
 * diffed from HP, so the display cannot disagree with the record — a miss and
 * a fully-guarded hit both leave HP looking similar, and only the log
 * distinguishes them. A miss lands on the intended *target*, since that is
 * where the player is looking. Events arrive in true speed order (move_used
 * then its outcome, faster combatant first), which is exactly the playback
 * script.
 */
function deriveTurnScript(session: BattleSession): TurnBeat[] {
  let latestTurn: number | null = null;
  for (const event of session.log) {
    if (RESOLVED_EVENTS.has(event.type)) latestTurn = event.turnNumber;
  }
  if (latestTurn === null) return [];

  const beats: TurnBeat[] = [];
  let pendingUse: { actor: CombatantSide; message: string; moveId: string | null } | null =
    null;

  /** A move with no outcome event still happened — Guard is exactly that.
   *  Without this the guarding side never narrated, never lunged, and a
   *  guard-vs-guard turn played no cinematic at all despite resolving. */
  function flushPendingUse() {
    const open = pendingUse;
    if (!open) return;
    beats.push({
      id: `${latestTurn}-${beats.length}-${open.actor}-move`,
      actor: open.actor,
      target: open.actor,
      feedback: null,
      hpDelta: 0,
      useMessage: null,
      outcomeMessage: open.message,
      moveId: open.moveId,
    });
    pendingUse = null;
  }

  for (const event of session.log) {
    if (event.turnNumber !== latestTurn) continue;
    if (event.actor === 'system') continue;
    const actor: CombatantSide = event.actor === 'player' ? 'player' : 'opponent';
    const other: CombatantSide = actor === 'player' ? 'opponent' : 'player';

    if (event.type === 'move_used') {
      flushPendingUse();
      pendingUse = {
        actor,
        message: event.message,
        // Narrowed on event.actor: only the player variant carries moveId —
        // the serializer redacts the bot's.
        moveId: event.actor === 'player' && event.moveId ? event.moveId : null,
      };
      continue;
    }

    let beat: TurnBeat | null = null;
    if (event.type === 'damage_dealt' && event.amount !== undefined) {
      beat = {
        id: `${latestTurn}-${beats.length}-${actor}-damage-${event.amount}`,
        actor,
        target: other,
        feedback: {
          id: `${latestTurn}-${actor}-damage-${event.amount}`,
          kind: 'damage',
          amount: event.amount,
        },
        hpDelta: -event.amount,
        useMessage: null,
        outcomeMessage: event.message,
        moveId: null,
      };
    } else if (event.type === 'healed' && event.amount !== undefined) {
      beat = {
        id: `${latestTurn}-${beats.length}-${actor}-heal-${event.amount}`,
        actor,
        target: actor,
        feedback: {
          id: `${latestTurn}-${actor}-heal-${event.amount}`,
          kind: 'heal',
          amount: event.amount,
        },
        hpDelta: event.amount,
        useMessage: null,
        outcomeMessage: event.message,
        moveId: null,
      };
    } else if (event.type === 'move_missed') {
      beat = {
        id: `${latestTurn}-${beats.length}-${actor}-miss`,
        actor,
        target: other,
        feedback: {
          id: `${latestTurn}-${actor}-miss`,
          kind: 'miss',
          amount: 0,
        },
        hpDelta: 0,
        useMessage: null,
        outcomeMessage: event.message,
        moveId: null,
      };
    }

    if (beat) {
      if (pendingUse && pendingUse.actor === actor) {
        beat.useMessage = pendingUse.message;
        beat.moveId = pendingUse.moveId;
        pendingUse = null;
      } else {
        // The outcome belongs to a different actor than the open move — the
        // open move resolved silently (Guard). Give it its own beat first.
        flushPendingUse();
      }
      beats.push(beat);
    }
  }
  flushPendingUse();

  return beats;
}

/** The reduced-motion (and test) rendering of a script: the final floats for
 *  each side at once, exactly what the pre-cinematic battle screen showed. */
function aggregateScript(beats: TurnBeat[]): {
  player: TurnFeedback | null;
  opponent: TurnFeedback | null;
} {
  let player: TurnFeedback | null = null;
  let opponent: TurnFeedback | null = null;
  for (const beat of beats) {
    if (!beat.feedback) continue; // silent moves (Guard) float nothing
    if (beat.target === 'player') player = beat.feedback;
    else opponent = beat.feedback;
  }
  return { player, opponent };
}

/** Where each side's HP bar stood before the turn's script ran, recovered by
 *  undoing the script against the final session values. Clamping is left to
 *  the HealthBar, which already bounds display to [0, max]. */
function hpBeforeScript(
  session: BattleSession,
  beats: TurnBeat[]
): { player: number; opponent: number } {
  let player = session.player.currentHp;
  let opponent = session.bot.currentHp;
  for (const beat of beats) {
    if (beat.target === 'player') player -= beat.hpDelta;
    else opponent -= beat.hpDelta;
  }
  return { player, opponent };
}

/** What a move actually does, in words. The stat row alone reads "Power 0" for
 *  Guard, which says nothing about the one thing Guard is for. */
function moveDescription(move: BattleMove): string {
  switch (move.kind) {
    case 'guard':
      return 'Halves the damage you take this turn. Deals none.';
    case 'quick':
      return 'Reliable chip damage. Never misses.';
    case 'signature':
      return 'Your heaviest hit. Spends all stored Sun.';
    case 'heal':
      return 'Restores a quarter of your max HP. Once per battle.';
  }
}

function moveDisabledReason(
  move: BattleMove,
  session: BattleSession,
  commandLocked: boolean,
  commandFailed: boolean
): string | null {
  if (commandLocked) return 'Another battle command is being saved.';
  if (commandFailed) return 'Retry or dismiss the failed command first.';
  const playerEnergy = boundedEnergy(
    session.player.energy,
    session.player.maxEnergy
  );
  if (move.energyCost > playerEnergy.current) {
    return `Needs ${move.energyCost} Sun; ${playerEnergy.current} available.`;
  }
  if (move.kind === 'heal' && session.player.healUsed) {
    return 'Already used this battle.';
  }
  if (
    move.kind === 'heal' &&
    session.player.currentHp >= session.player.maxHp
  ) {
    return 'HP is already full.';
  }
  return null;
}

function combatAvatar(
  session: BattleSession,
  rosterAvatar: PlantAvatarData | null
): PlantAvatarData {
  return {
    id: session.player.id,
    name: session.player.name,
    species: rosterAvatar?.species ?? '',
    family: rosterAvatar?.family ?? '',
    discovered: rosterAvatar?.discovered ?? '',
    hp: session.player.stats.hp,
    attack: session.player.stats.attack,
    defense: session.player.stats.defense,
    speed: session.player.stats.speed,
    color: rosterAvatar?.color ?? 'emerald',
    spriteUrl: session.player.spriteUrl.trim() || undefined,
  };
}

function retryLabel(command: RetryCommand | null): string {
  switch (command?.kind) {
    case 'load':
      return 'Retry roster';
    case 'start':
      return 'Retry start';
    case 'replay':
      return 'Retry replay';
    case 'action':
      return 'Retry move';
    case 'abandon':
      return 'Retry abandon';
    default:
      return 'Retry';
  }
}

function ArchiveControl({
  className,
  disabled = false,
}: {
  className: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        Return to Archive
      </span>
    );
  }

  return (
    <Link className={className} to="/archive">
      Return to Archive
    </Link>
  );
}

export default function BattlePage() {
  const location = useLocation();
  const { isNavigationLocked, acquireNavigationLock } = useNavigationLock();
  const preferredAvatarId = useMemo(
    () => routeAvatarId(location.state),
    [location.state]
  );
  const [records, setRecords] = useState<AvatarRecord[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [session, setSession] = useState<BattleSession | null>(null);
  const [view, setView] = useState<BattleView>('loading');
  const [pendingCommand, setPendingCommand] =
    useState<PendingCommand | null>(null);
  const [retryCommand, setRetryCommand] = useState<RetryCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    { kind: 'stale' | 'abandoned'; message: string } | null
  >(null);
  const requestVersion = useRef(0);
  const inFlight = useRef(false);
  const releaseNavigationLock = useRef<(() => void) | null>(null);
  /** Cancels the quiet roster refresh on unmount ONLY. It must not share
   *  requestVersion: every battle command bumps that, which silently killed a
   *  refresh still in flight and left Change Plant staring at an empty roster. */
  const rosterEpoch = useRef(0);
  const [turnFeedback, setTurnFeedback] = useState<{
    player: TurnFeedback | null;
    opponent: TurnFeedback | null;
  }>({ player: null, opponent: null });
  /** The turn cinematic. While non-null the arena is replaying the server's
   *  script: bars drain beat by beat, the narration strip speaks, and the
   *  acting side lunges. Null the rest of the time — the session is truth. */
  const [cinematic, setCinematic] = useState<{
    narration: string;
    actingSide: CombatantSide;
    resolvingMoveId: string | null;
    displayedHp: { player: number; opponent: number };
  } | null>(null);

  const beginRequest = useCallback((): number | null => {
    if (inFlight.current) return null;
    inFlight.current = true;
    return ++requestVersion.current;
  }, []);

  const finishRequest = useCallback((request: number) => {
    if (request === requestVersion.current) inFlight.current = false;
  }, []);

  const loadRoster = useCallback(async () => {
    const request = beginRequest();
    if (request === null) return;
    setView('loading');
    setError(null);
    setRetryCommand(null);
    setNotice(null);

    try {
      const fetchedRecords = await fetchAllOwnedAvatars(
        () => request === requestVersion.current
      );
      if (request !== requestVersion.current) return;
      const nextRecords = fetchedRecords.filter(
        (record) => record.battleEligible
      );
      setRecords(nextRecords);
      setSelectedAvatarId(
        preferredAvatarId &&
          nextRecords.some((record) => record.id === preferredAvatarId)
          ? preferredAvatarId
          : null
      );
      setSession(null);
      setView('selecting');
    } catch (caught) {
      if (request !== requestVersion.current) return;
      setError(extractApiError(caught, 'Could not load your battle roster.'));
      setRetryCommand({ kind: 'load' });
      setView('error');
    } finally {
      finishRequest(request);
    }
  }, [beginRequest, finishRequest, preferredAvatarId]);

  /** Refills the roster without touching view or session state — used behind a
   *  resumed battle so Change Plant has plants to change to. Deliberately
   *  outside the beginRequest lock: it must not block the player's first move,
   *  and setRecords is safe to apply whenever it lands. */
  const refreshRosterQuietly = useCallback(async () => {
    const epoch = rosterEpoch.current;
    try {
      const fetchedRecords = await fetchAllOwnedAvatars(
        () => epoch === rosterEpoch.current
      );
      if (epoch !== rosterEpoch.current) return;
      setRecords(fetchedRecords.filter((record) => record.battleEligible));
    } catch {
      // Swallowed on purpose; the selection paths below retry it when they
      // find the roster empty.
    }
  }, []);

  /** A reload mid-battle used to dump the player at the roster while the
   *  server still counted the session as active. If a session id survived in
   *  storage, pick the battle back up from the un-rate-limited GET first. */
  const resumeStoredSession = useCallback(
    async (sessionId: string) => {
      const request = beginRequest();
      if (request === null) return;
      setView('loading');
      setError(null);
      setRetryCommand(null);
      setNotice(null);

      try {
        const storedSession = await getPveBattle(sessionId);
        if (request !== requestVersion.current) return;
        if (storedSession.status === 'active') {
          setSession(storedSession);
          setView('active');
          finishRequest(request);
          void refreshRosterQuietly();
          return;
        }
        writeStoredSessionId(null);
        finishRequest(request);
        void loadRoster();
      } catch (caught) {
        if (request !== requestVersion.current) return;
        // Only a definitive server verdict proves the pointer dead (gone,
        // foreign, malformed). A network blip or 5xx keeps the pointer so the
        // next visit retries the resume instead of orphaning a live battle.
        const status = axios.isAxiosError(caught)
          ? caught.response?.status
          : undefined;
        if (status === 400 || status === 403 || status === 404) {
          writeStoredSessionId(null);
        }
        // Either way the roster is the right place to land — resume failures
        // are not worth an error screen.
        finishRequest(request);
        void loadRoster();
      }
    },
    [beginRequest, finishRequest, loadRoster, refreshRosterQuietly]
  );

  /** The server has contradicted the client's picture of this battle — a
   *  command bounced with a conflict, or the session vanished. Retrying the
   *  same command can never succeed, so fetch the session and show what
   *  actually happened: its result screen if it ended, the live turn if the
   *  client was merely behind, or the roster if it is gone entirely. */
  const resyncSession = useCallback(
    async (sessionId: string) => {
      const request = beginRequest();
      if (request === null) return;
      setView('loading');
      setError(null);
      setRetryCommand(null);

      try {
        const current = await getPveBattle(sessionId);
        if (request !== requestVersion.current) return;
        setSession(current);
        setNotice({
          kind: 'stale',
          message:
            current.status === 'active'
              ? 'Battle synchronized to the latest server turn.'
              : 'This battle had already ended — showing its final result.',
        });
        setView(viewForSession(current));
        finishRequest(request);
      } catch {
        if (request !== requestVersion.current) return;
        // Gone entirely (or unreachable) — the roster is the only place left,
        // and a dead pointer must not resurrect this session on the next visit.
        writeStoredSessionId(null);
        finishRequest(request);
        void loadRoster();
      }
    },
    [beginRequest, finishRequest, loadRoster]
  );

  useEffect(() => {
    const storedSessionId = readStoredSessionId();
    // An explicit route avatarId is the player mid-gesture (Archive's Battle
    // button) — that intent outranks resuming a stored session, which stays
    // stored for the next direct visit.
    if (storedSessionId && !preferredAvatarId) {
      void resumeStoredSession(storedSessionId);
    } else {
      void loadRoster();
    }
    return () => {
      requestVersion.current += 1;
      rosterEpoch.current += 1;
      inFlight.current = false;
      releaseNavigationLock.current?.();
      releaseNavigationLock.current = null;
    };
  }, [loadRoster, preferredAvatarId, resumeStoredSession]);

  /** Back/forward can restore this document from the back/forward cache with
   *  a finished battle frozen on screen, fully playable-looking — turn number,
   *  HP, live move buttons. The frozen state is not evidence of anything:
   *  re-run the entry decision against the server exactly as a fresh mount
   *  would (the stored pointer already reflects how the battle ended). */
  useEffect(() => {
    const revalidate = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // Whatever was in flight when the document froze is dead. A stuck lock
      // here would make the revalidation a silent no-op.
      requestVersion.current += 1;
      inFlight.current = false;
      setPendingCommand(null);
      const storedSessionId = readStoredSessionId();
      if (storedSessionId) {
        void resumeStoredSession(storedSessionId);
      } else {
        void loadRoster();
      }
    };
    window.addEventListener('pageshow', revalidate);
    return () => window.removeEventListener('pageshow', revalidate);
  }, [loadRoster, resumeStoredSession]);

  /** The stored pointer follows the session: written while a battle is live,
   *  cleared the moment it ends, so a reload can only ever resume something
   *  the server still considers active. */
  useEffect(() => {
    if (!session) return;
    writeStoredSessionId(session.status === 'active' ? session.id : null);
  }, [session]);

  const runStart = useCallback(
    async (avatarId: string, kind: 'start' | 'replay') => {
      const request = beginRequest();
      if (request === null) return;
      const releaseLock = acquireNavigationLock();
      releaseNavigationLock.current = releaseLock;
      setPendingCommand(kind);
      setView('starting');
      setError(null);
      setRetryCommand(null);
      setNotice(null);

      try {
        const nextSession = await startPveBattle(avatarId);
        if (request !== requestVersion.current) return;
        setSession(nextSession);
        setView(viewForSession(nextSession));
      } catch (caught) {
        if (request !== requestVersion.current) return;
        setError(extractApiError(caught, 'Could not start this battle.'));
        setRetryCommand({ kind, avatarId });
        setView('error');
      } finally {
        releaseLock();
        if (releaseNavigationLock.current === releaseLock) {
          releaseNavigationLock.current = null;
        }
        if (request === requestVersion.current) setPendingCommand(null);
        finishRequest(request);
      }
    },
    [acquireNavigationLock, beginRequest, finishRequest]
  );

  const runAction = useCallback(
    async (
      sessionId: string,
      moveId: string,
      expectedTurn: number
    ) => {
      const request = beginRequest();
      if (request === null) return;
      setPendingCommand('action');
      setView('submitting');
      setError(null);
      setRetryCommand(null);
      setNotice(null);
      let conflicted = false;

      try {
        const result = await submitPveAction(
          sessionId,
          moveId,
          expectedTurn
        );
        if (request !== requestVersion.current) return;
        setSession(result.session);
        setNotice(
          result.stale
            ? {
                kind: 'stale',
                message: 'Battle synchronized to the latest server turn.',
              }
            : null
        );
        setView(viewForSession(result.session));
      } catch (caught) {
        if (request !== requestVersion.current) return;
        const status = axios.isAxiosError(caught)
          ? caught.response?.status
          : undefined;
        // 409/404: the server says this session is complete, mismatched, or
        // gone. A Retry of the same command can never succeed (the bfcache
        // resurrection dead-ended exactly here), so resync to the truth
        // instead of offering one.
        if (status === 409 || status === 404) {
          conflicted = true;
        } else {
          setError(extractApiError(caught, 'Could not submit this move.'));
          setRetryCommand({
            kind: 'action',
            sessionId,
            moveId,
            expectedTurn,
          });
          setView('error');
        }
      } finally {
        if (request === requestVersion.current) setPendingCommand(null);
        finishRequest(request);
      }
      if (conflicted) await resyncSession(sessionId);
    },
    [beginRequest, finishRequest, resyncSession]
  );

  const runAbandon = useCallback(
    async (sessionId: string) => {
      const request = beginRequest();
      if (request === null) return;
      setPendingCommand('abandon');
      setView('submitting');
      setError(null);
      setRetryCommand(null);
      setNotice(null);
      let conflicted = false;

      try {
        const abandonedSession = await abandonPveBattle(sessionId);
        if (request !== requestVersion.current) return;
        // setSession(null) skips the pointer-follows-session effect, so the
        // stored id is dropped here — an abandoned battle must not resume.
        writeStoredSessionId(null);
        setSession(null);
        setNotice({
          kind: 'abandoned',
          message: `Battle abandoned. ${abandonedSession.xpAwarded} XP awarded.`,
        });
        setView('selecting');
        // A resumed session may have landed here before its quiet roster
        // refresh ever succeeded; retry rather than show a false empty state.
        if (records.length === 0) void refreshRosterQuietly();
      } catch (caught) {
        if (request !== requestVersion.current) return;
        const status = axios.isAxiosError(caught)
          ? caught.response?.status
          : undefined;
        // Same conflict rule as runAction: if the session already ended or is
        // gone, retrying the abandon is pointless — show what the server has.
        if (status === 409 || status === 404) {
          conflicted = true;
        } else {
          setError(extractApiError(caught, 'Could not abandon this battle.'));
          setRetryCommand({ kind: 'abandon', sessionId });
          setView('error');
        }
      } finally {
        if (request === requestVersion.current) setPendingCommand(null);
        finishRequest(request);
      }
      if (conflicted) await resyncSession(sessionId);
    },
    [
      beginRequest,
      finishRequest,
      records.length,
      refreshRosterQuietly,
      resyncSession,
    ]
  );

  const handleRetry = () => {
    if (!retryCommand) return;
    switch (retryCommand.kind) {
      case 'load':
        void loadRoster();
        break;
      case 'start':
      case 'replay':
        void runStart(retryCommand.avatarId, retryCommand.kind);
        break;
      case 'action':
        void runAction(
          retryCommand.sessionId,
          retryCommand.moveId,
          retryCommand.expectedTurn
        );
        break;
      case 'abandon':
        void runAbandon(retryCommand.sessionId);
        break;
    }
  };

  /*
    The turn cinematic. When the server returns a resolved turn, its log is a
    speed-ordered script — move used, then its outcome, faster combatant first.
    With motion available each beat plays in sequence: the acting side lunges,
    the narration strip speaks the server's own lines, the float lands on the
    target and only that beat's HP drains. Under reduced motion (or jsdom) the
    whole script collapses to the final state with both floats at once, which
    is exactly what this screen showed before it learned to choreograph.

    Feedback is transient either way: it replays whenever the server returns a
    new session, then clears itself so a player returning to the tab does not
    find a stale "-21" hanging over their plant.
  */
  useEffect(() => {
    if (!session) {
      setTurnFeedback({ player: null, opponent: null });
      setCinematic(null);
      return;
    }
    const script = deriveTurnScript(session);
    if (script.length === 0) {
      setTurnFeedback({ player: null, opponent: null });
      setCinematic(null);
      return;
    }

    if (prefersReducedMotion()) {
      setCinematic(null);
      setTurnFeedback(aggregateScript(script));
      const timer = window.setTimeout(
        () => setTurnFeedback({ player: null, opponent: null }),
        1300
      );
      return () => window.clearTimeout(timer);
    }

    const BEAT_MS = 1250;
    const timers: number[] = [];
    const hp = hpBeforeScript(session, script);
    setTurnFeedback({ player: null, opponent: null });
    // Bars start the playback at their pre-turn values, not the final state —
    // otherwise the outcome leaks a frame before the first beat lands.
    setCinematic({
      narration: '',
      actingSide: script[0].actor,
      resolvingMoveId: null,
      displayedHp: { ...hp },
    });

    script.forEach((beat, index) => {
      timers.push(
        window.setTimeout(() => {
          hp[beat.target === 'player' ? 'player' : 'opponent'] += beat.hpDelta;
          setCinematic({
            narration: beat.useMessage
              ? `${beat.useMessage} ${beat.outcomeMessage}`
              : beat.outcomeMessage,
            actingSide: beat.actor,
            resolvingMoveId: beat.moveId,
            displayedHp: { ...hp },
          });
          setTurnFeedback({
            player: beat.target === 'player' ? beat.feedback : null,
            opponent: beat.target === 'opponent' ? beat.feedback : null,
          });
        }, index * BEAT_MS)
      );
    });
    timers.push(
      window.setTimeout(() => {
        setCinematic(null);
        setTurnFeedback({ player: null, opponent: null });
      }, script.length * BEAT_MS + 400)
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [session]);

  const avatars = useMemo(() => records.map(toPlantAvatarData), [records]);
  const selectedAvatar =
    avatars.find((avatar) => avatar.id === selectedAvatarId) ?? null;
  const sessionRosterAvatar = session
    ? avatars.find((avatar) => avatar.id === session.avatarId) ?? null
    : null;
  const playerAvatar = session
    ? combatAvatar(session, sessionRosterAvatar)
    : null;
  const playerEnergy = session
    ? boundedEnergy(session.player.energy, session.player.maxEnergy)
    : null;
  const botEnergy = session
    ? boundedEnergy(session.bot.energy, session.bot.maxEnergy)
    : null;
  const commandLocked = pendingCommand !== null;
  const sessionCommandFailed = view === 'error' && session !== null;
  const showSelection = session === null && view !== 'loading';

  const selectAvatar = (avatarId: string) => {
    if (commandLocked) return;
    setSelectedAvatarId(avatarId);
    setError(null);
    setRetryCommand(null);
    setNotice(null);
    setView('selecting');
  };

  /** Stable identity on purpose: as a ref callback it then fires only when
   *  the error panel mounts, not on every rerender while it is visible. */
  const scrollErrorIntoView = useCallback((node: HTMLDivElement | null) => {
    // jsdom has no scrollIntoView, hence the optional call.
    node?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, []);

  const dismissSessionError = () => {
    if (!session || commandLocked) return;
    setError(null);
    setRetryCommand(null);
    setView(viewForSession(session));
  };

  const returnToSelection = () => {
    if (commandLocked) return;
    setSession(null);
    setError(null);
    setRetryCommand(null);
    setNotice(null);
    setView('selecting');
    // A resumed session may never have loaded a roster to change plants from.
    if (records.length === 0) void refreshRosterQuietly();
  };

  return (
    <main className="screen screen-scrollable flex flex-col">
      {/*
        Pinned to the viewport, not to the screen box. `.screen` sets only
        min-height, so on a scrollable screen its used height grows with the
        content — and `h-full` grew with it, handing object-fit: cover a box
        taller than the viewport to fill. Measured on the archive: a 500x813
        viewport gave the image a 500x1288 box, magnifying the painted art
        1.26x and more as plants are added, which reads as a stretched
        background. A fixed backdrop also stays put while the shelves scroll
        over it, instead of scrolling away and leaving bare colour.
      */}
      <img
        src="/img/bg_battle.jpg"
        alt=""
        className="fixed inset-0 -z-10 h-[100dvh] w-full object-cover"
      />

      <div className="safe-top flex items-center px-3">
        <BackButton />
      </div>

      <div className="px-4 pt-1 text-center">
        <p className="font-pixel text-outline text-[9px] text-white">PVE battle lab</p>
        <h1
          className={`font-pixel text-outline mt-2 text-sm leading-relaxed text-white${
            session ? ' battle-server-copy' : ''
          }`}
        >
          {session ? `${session.player.name} vs ${session.bot.name}` : 'Battle practice'}
        </h1>
        <p className="text-soft-shadow mt-2 text-xs text-white/85">
          Read the intent, manage Sun, and commit one move per turn.
        </p>
      </div>

      {/* Wider than the other boards: the arena is three columns across on a
          laptop, and 48rem squeezed the flanks to roughly 200px each. */}
      <div className="safe-bottom mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-3 py-3">
        {view === 'loading' && (
          <section
            className="pixel-panel flex flex-col items-center gap-3 p-6 text-center"
            role="status"
            aria-label="Loading battle roster"
            aria-live="polite"
          >
            <span className="spin h-6 w-6 rounded-full border-2 border-black border-t-transparent" />
            <h2 className="font-pixel text-xs leading-relaxed">Loading your battle plants...</h2>
          </section>
        )}

        {view === 'error' && retryCommand?.kind === 'load' && (
          <section className="pixel-panel p-5 text-center" role="alert">
            <h2 className="font-pixel text-xs leading-relaxed">Battle roster unavailable</h2>
            <p className="mt-2 text-xs leading-relaxed opacity-80">{error}</p>
            <button
              className="press pixel-button mt-4 w-full px-3 py-2 text-[9px]"
              type="button"
              onClick={handleRetry}
            >
              Retry roster
            </button>
          </section>
        )}

        {/* The abandon receipt renders regardless of roster size: a player
            whose quiet roster refresh is still in flight (or failed) must not
            lose the record that the abandon persisted with 0 XP. */}
        {showSelection && notice?.kind === 'abandoned' && (
          <p
            className="pixel-panel px-3 py-2 text-center text-[10px] leading-relaxed"
            role="status"
            aria-label="Battle abandoned"
          >
            {notice.message}
          </p>
        )}

        {showSelection && records.length === 0 && retryCommand?.kind !== 'load' && (
          <section className="pixel-panel p-5 text-center">
            <h2 className="font-pixel text-xs leading-relaxed">No battle plants yet</h2>
            <p className="mt-2 text-xs leading-relaxed opacity-80">
              Collect a plant in your Archive before starting a PVE match.
            </p>
            <ArchiveControl className="press pixel-button mt-4 inline-block px-3 py-2 text-[9px]" />
          </section>
        )}

        {showSelection && records.length > 0 && (
          <>
            {error && retryCommand?.kind !== 'load' && (
              <div className="pixel-panel p-3" role="alert">
                <strong className="font-pixel block text-[9px] leading-relaxed">
                  Battle command not saved
                </strong>
                <p className="battle-server-copy mt-1.5 text-[10px] leading-relaxed opacity-80">{error}</p>
                <button
                  className="press pixel-button mt-3 px-3 py-2 text-[9px]"
                  type="button"
                  onClick={handleRetry}
                >
                  {retryLabel(retryCommand)}
                </button>
              </div>
            )}

            <section className="flex flex-col gap-3">
              <div className="pixel-panel p-3">
                <p className="font-pixel text-[9px] opacity-60">Owned roster</p>
                <h2 className="font-pixel mt-2 text-xs leading-relaxed">Choose your plant</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {avatars.map((avatar) => (
                    <button
                      key={avatar.id}
                      className={`press flex flex-col items-center gap-1 border-3 p-2 ${
                        avatar.id === selectedAvatar?.id
                          ? 'border-[color:var(--color-brand-lo)] bg-[color:var(--color-brand-lo)]/15'
                          : 'border-black/20'
                      }`}
                      type="button"
                      aria-label={`Select ${avatar.name}${avatar.isDemo ? ' (Demo)' : ''}`}
                      aria-pressed={avatar.id === selectedAvatar?.id}
                      disabled={commandLocked}
                      onClick={() => selectAvatar(avatar.id)}
                    >
                      {avatar.isDemo && (
                        <span className="font-pixel border-2 border-black bg-[color:var(--color-hp-mid)] px-1 text-[9px]">
                          Demo
                        </span>
                      )}
                      <PlantAvatar avatar={avatar} />
                      <span className="battle-server-copy font-pixel max-w-full truncate text-[9px]">
                        {avatar.name}
                      </span>
                      <small className="battle-server-copy max-w-full truncate text-[9px] opacity-70">
                        {avatar.species}
                      </small>
                    </button>
                  ))}
                </div>
              </div>

              <aside className="pixel-panel p-4 text-center">
                {selectedAvatar ? (
                  <>
                    <div className="flex justify-center">
                      <PlantAvatar avatar={selectedAvatar} large />
                    </div>
                    <p className="font-pixel mt-2 text-[9px] opacity-60">Selected combatant</p>
                    <h2 className="battle-server-copy font-pixel mt-2 text-xs leading-relaxed">
                      {selectedAvatar.name} is ready
                    </h2>
                    <p className="battle-server-copy mt-2 text-xs leading-relaxed opacity-80">
                      {selectedAvatar.species} from {selectedAvatar.family}.
                    </p>
                    <StatGrid avatar={selectedAvatar} compact />
                    {view === 'starting' && pendingCommand === 'start' && (
                      <p
                        className="pulse-soft mt-3 text-[10px] leading-relaxed opacity-80"
                        role="status"
                        aria-label="Starting battle"
                      >
                        Creating a persisted match...
                      </p>
                    )}
                    <button
                      className="press pixel-button is-primary mt-4 w-full px-3 py-3 text-[9px]"
                      type="button"
                      disabled={commandLocked}
                      onClick={() => void runStart(selectedAvatar.id, 'start')}
                    >
                      Start Match
                    </button>
                    <ArchiveControl
                      className="mt-3 inline-block text-[10px] underline underline-offset-2"
                      disabled={isNavigationLocked}
                    />
                  </>
                ) : (
                  <>
                    <p className="font-pixel text-[9px] opacity-60">Match setup</p>
                    <h2 className="font-pixel mt-2 text-xs leading-relaxed">
                      Choose an owned plant for this match
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed opacity-80">
                      Your roster is loaded. Pick one plant to inspect and start.
                    </p>
                    <ArchiveControl className="mt-3 inline-block text-[10px] underline underline-offset-2" />
                  </>
                )}
              </aside>
            </section>
          </>
        )}

        {session && playerAvatar && playerEnergy && botEnergy && (
          <>
            {notice?.kind === 'stale' && (
              <p
                className="pixel-panel px-3 py-2 text-center text-[10px] leading-relaxed"
                role="status"
                aria-label="Battle synchronized"
              >
                {notice.message}
              </p>
            )}
            {error && (
              <div
                className="pixel-panel p-3"
                role="alert"
                // The panel renders above the arena; a player who was looking
                // at the move grid saw every control grey out with the
                // explanation sitting off-screen above the fold. The stable
                // ref callback brings it into view once, on mount.
                ref={scrollErrorIntoView}
              >
                <strong className="font-pixel block text-[9px] leading-relaxed">
                  Battle command not saved
                </strong>
                <p className="battle-server-copy mt-1.5 text-[10px] leading-relaxed opacity-80">{error}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="press pixel-button px-3 py-2 text-[9px]"
                    type="button"
                    onClick={handleRetry}
                  >
                    {retryLabel(retryCommand)}
                  </button>
                  <button
                    className="press pixel-button px-3 py-2 text-[9px]"
                    type="button"
                    onClick={dismissSessionError}
                  >
                    Back to turn
                  </button>
                </div>
              </div>
            )}

            {/*
              The arena reads top-to-bottom the way the Android battle screen
              did: opponent above, the turn console between them, your plant
              below — so the two health bars frame whatever is happening.
            */}
            {/*
              A face-off, laid out on the horizontal axis: your plant and the
              opponent hold the flanks and the moves sit between them. DOM order
              is player, console, opponent; CSS grid areas put the console below
              the pair on a phone and between them on a laptop.
            */}
            <div className="battle-stage">
              <div className="arena stage-player">
                <Combatant
                  role="Your plant"
                  name={session.player.name}
                  currentHp={
                    cinematic ? cinematic.displayedHp.player : session.player.currentHp
                  }
                  maxHp={session.player.maxHp}
                  energy={playerEnergy}
                  side="player"
                  feedback={turnFeedback.player}
                  acting={cinematic?.actingSide === 'player'}
                  visual={<PlantAvatar avatar={playerAvatar} large />}
                />
              </div>

              <div className="arena stage-opponent">
                <Combatant
                  role="Opponent"
                  name={session.bot.name}
                  currentHp={
                    cinematic ? cinematic.displayedHp.opponent : session.bot.currentHp
                  }
                  maxHp={session.bot.maxHp}
                  energy={botEnergy}
                  side="opponent"
                  feedback={turnFeedback.opponent}
                  acting={cinematic?.actingSide === 'opponent'}
                  visual={
                    <BotAvatar name={session.bot.name} spriteUrl={session.bot.spriteUrl} />
                  }
                />
              </div>
            </div>

            {/* The narration strip: the server's own lines, spoken one beat at
                a time while the cinematic plays. Mounted for the WHOLE playback
                (a non-breaking space holds the first, wordless beat) so the
                move console does not jump at every beat. aria-hidden because
                the log below carries the same record for assistive tech, and
                under reduced motion this never renders at all. */}
            {cinematic && (
              <p
                key={cinematic.narration || 'pending'}
                className="battle-narration battle-server-copy"
                aria-hidden="true"
              >
                {cinematic.narration || ' '}
              </p>
            )}

            <div className="pixel-panel p-3">
              {session.status === 'active' ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-pixel text-[11px]">Turn {session.turnNumber}</h2>
                    <span className="text-[13px] font-semibold opacity-70">
                      Choose one move
                    </span>
                  </div>

                  {/*
                    The tell the player is meant to read before committing, so
                    it gets real size rather than a 7px kicker over 10px copy.
                  */}
                  <div
                    key={`intent-${session.turnNumber}`}
                    className="turn-banner mt-2 border-2 border-black/25 px-2.5 py-2"
                  >
                    <strong className="battle-server-copy block text-[14px] leading-snug font-semibold">
                      {intentMessage(session.bot.name, session.botIntent)}
                    </strong>
                  </div>

                  {/* Standing intel the payload always carried but the board
                      never said: who moves first (speed order is fixed for the
                      whole battle) and whether the opponent still holds its
                      once-per-battle recovery. */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="battle-server-copy battle-intel">
                      {session.player.stats.speed >= session.bot.stats.speed
                        ? `${session.player.name} acts first each round`
                        : `${session.bot.name} acts first each round`}
                    </span>
                    <span
                      className={`battle-server-copy battle-intel${
                        session.bot.healUsed ? ' is-spent' : ''
                      }`}
                    >
                      {session.bot.healUsed
                        ? `${session.bot.name} has spent its recovery`
                        : `${session.bot.name} still holds a recovery`}
                    </span>
                  </div>

                  {pendingCommand === 'action' && (
                    <p
                      className="pulse-soft mt-2 text-[10px] leading-relaxed opacity-80"
                      role="status"
                      aria-label={`Resolving turn ${session.turnNumber}`}
                    >
                      Resolving turn {session.turnNumber} on the server...
                    </p>
                  )}
                  {pendingCommand === 'abandon' && (
                    <p
                      className="pulse-soft mt-2 text-[10px] leading-relaxed opacity-80"
                      role="status"
                      aria-label="Abandoning battle"
                    >
                      Saving abandonment...
                    </p>
                  )}

                  <div className="move-grid mt-3" role="group" aria-label="Battle moves">
                    {session.player.moves.map((move, index) => {
                      const reason = moveDisabledReason(
                        move,
                        session,
                        commandLocked,
                        sessionCommandFailed
                      );
                      /*
                        While a command is in flight every move reports the same
                        "being saved" note. Printing it four times said nothing
                        the spinner above does not, and adding four lines at once
                        is what made the board jump on click. The per-move notes
                        that are actually about the move still show.
                      */
                      const shownReason = commandLocked ? null : reason;
                      const reasonId = `move-reason-${index}`;
                      return (
                        <div className="move-slot" key={move.id}>
                          <button
                            className={`press move-card kind-${move.kind}${
                              cinematic?.resolvingMoveId === move.id
                                ? ' is-resolving'
                                : ''
                            }`}
                            type="button"
                            disabled={commandLocked}
                            aria-disabled={
                              reason !== null && !commandLocked ? true : undefined
                            }
                            aria-describedby={shownReason ? reasonId : undefined}
                            onClick={() => {
                              if (reason !== null) return;
                              void runAction(session.id, move.id, session.turnNumber);
                            }}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="battle-server-copy move-name">
                                {move.name}
                              </span>
                              {/* The move's category, kept because it is a real
                                  field of the record and because it is how a
                                  player learns that "signature" means the big
                                  one they are saving Sun for. */}
                              <span className="move-kind">{move.kind}</span>
                            </span>
                            {/* Without this, Guard advertises "Power 0" and
                                nothing else — the stat row cannot express the
                                only thing the move does. */}
                            <span className="move-effect mt-1 block">
                              {moveDescription(move)}
                            </span>
                            {/*
                              Every public field stays on the card — the record
                              is meant to be complete. The ones that cannot
                              change this turn's decision (no power, a certain
                              hit, a free move) recede instead of disappearing.
                            */}
                            <span className="mt-2 flex flex-wrap gap-1.5">
                              <span
                                className={`move-stat${move.power > 0 ? '' : ' is-muted'}`}
                              >
                                Power {move.power}
                              </span>
                              <span
                                className={`move-stat${move.accuracy < 100 ? '' : ' is-muted'}`}
                              >
                                Accuracy {move.accuracy}%
                              </span>
                              <span
                                className={`move-stat${move.energyGain > 0 ? '' : ' is-muted'}`}
                              >
                                Sun gain {move.energyGain}
                              </span>
                              <span
                                className={`move-stat${move.energyCost > 0 ? '' : ' is-muted'}`}
                              >
                                Sun cost {move.energyCost}
                              </span>
                            </span>
                          </button>
                          {/* Always rendered so the row's height is reserved
                              whether or not there is anything to say. */}
                          <span className="move-reason" id={reasonId}>
                            {shownReason}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/*
                    Quitting is not a move. Full-width solid red gave it more
                    visual weight than the four moves above it, which is exactly
                    backwards for the one control a player should rarely want.
                  */}
                  <button
                    className="mt-3 w-full py-2 text-[12px] font-semibold underline underline-offset-2 disabled:opacity-45"
                    style={{ color: 'var(--color-hp-low)' }}
                    type="button"
                    disabled={commandLocked || sessionCommandFailed}
                    onClick={() => void runAbandon(session.id)}
                  >
                    Abandon Match
                  </button>
                </>
              ) : cinematic ? (
                /* Hold the result while the final turn's choreography drains
                   the bars — announcing Victory two beats early spoils the
                   very sequence the cinematic exists to show. The script's
                   last timer clears `cinematic`, which reveals the panel.
                   Reduced motion (and jsdom) never sets `cinematic`, so this
                   arm is invisible there. */
                <p
                  className="pulse-soft py-2 text-center text-[10px] leading-relaxed opacity-80"
                  role="status"
                >
                  The final turn is resolving...
                </p>
              ) : (
                <div className="text-center">
                  <p className="font-pixel text-[9px] opacity-60">Match complete</p>
                  <h2 className="font-pixel mt-2 text-sm leading-relaxed">
                    {session.status === 'won'
                      ? 'Victory'
                      : session.status === 'lost'
                        ? 'Defeat'
                        : 'Battle abandoned'}
                  </h2>
                  <p className="mt-2 text-[15px] font-semibold">
                    {session.xpAwarded} XP awarded
                  </p>
                  {/* A match ends with a number that only means something next
                      to everyone else's, so the standings are one tap away
                      rather than a hunt through the nav. */}
                  <Link
                    className="press pixel-button mt-3 inline-block px-3 py-2 text-[9px]"
                    to="/leaderboard"
                  >
                    View ranking
                  </Link>
                  {pendingCommand === 'replay' && (
                    <p
                      className="pulse-soft mt-2 text-[10px] leading-relaxed opacity-80"
                      role="status"
                      aria-label="Starting replay"
                    >
                      Creating a new persisted match...
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      className="press pixel-button is-primary w-full px-2 py-3 text-[9px]"
                      type="button"
                      disabled={commandLocked || sessionCommandFailed}
                      onClick={() => void runStart(session.avatarId, 'replay')}
                    >
                      Replay
                    </button>
                    <button
                      className="text-[10px] underline underline-offset-2 disabled:opacity-45"
                      type="button"
                      disabled={commandLocked || sessionCommandFailed}
                      onClick={returnToSelection}
                    >
                      Change Plant
                    </button>
                  </div>
                </div>
              )}
              </div>

            <section className="pixel-panel px-3 py-1">
              {/*
                Closed by default. During a turn the player is reading the
                intent and their four moves; the record matters after a
                surprise, not during one — and open, it was most of the page's
                length and pushed the action bar off the first screen.
              */}
              <details>
                <summary className="log-toggle">
                  Battle log ({session.log.length})
                </summary>
                <ol
                  className="mt-1 mb-2 max-h-64 space-y-2 overflow-y-auto"
                  role="log"
                  aria-label="Battle log"
                >
                {session.log.map((event, index) => {
                  const targetLine = eventTargetLine(
                    event,
                    session.player.name,
                    session.bot.name
                  );
                  return (
                    <li
                      key={`${event.turnNumber}-${event.type}-${event.actor}-${index}`}
                      className="border-2 border-black/15 px-2 py-1.5"
                    >
                      <div className="font-pixel flex flex-wrap gap-x-2 text-[9px] opacity-60">
                        <span>
                          {event.turnNumber === 0 ? 'Opening' : `Turn ${event.turnNumber}`}
                        </span>
                        <span>{actorLabel(event)}</span>
                        <span>{EVENT_LABELS[event.type]}</span>
                      </div>
                      <p className="battle-server-copy mt-1 text-[10px] leading-relaxed">{event.message}</p>
                      {targetLine && (
                        <p
                          className="mt-0.5 text-[10px] leading-relaxed font-semibold"
                          style={{
                            color:
                              event.type === 'healed'
                                ? 'var(--color-hp-high)'
                                : event.actor === 'player'
                                  ? 'var(--color-hp-high)'
                                  : 'var(--color-hp-low)',
                          }}
                        >
                          {targetLine}
                        </p>
                      )}
                    </li>
                  );
                })}
                </ol>
              </details>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * One side of the arena: the sprite, then a panel carrying the name, the HP bar
 * and the Sun readout.
 *
 * Both sides use the same left-to-right order. The opponent used to be mirrored
 * with `flex-row-reverse` so the two faced each other, which put the two health
 * bars on opposite edges of the screen with only a 7px role label to tell them
 * apart — so a losing turn and a winning one looked the same. Reading down one
 * axis, with the role stated at a legible size, is what makes the bars
 * comparable at a glance.
 */
function Combatant({
  role,
  name,
  currentHp,
  maxHp,
  energy,
  side,
  visual,
  feedback,
  acting = false,
}: {
  role: string;
  name: string;
  currentHp: number;
  maxHp: number;
  energy: { current: number; max: number };
  side: 'player' | 'opponent';
  visual: React.ReactNode;
  /** What just happened to this combatant this turn, if anything. */
  feedback: TurnFeedback | null;
  /** True while the cinematic says this side is the one delivering its move. */
  acting?: boolean;
}) {
  return (
    <section className={`combatant is-${side}`}>
      {feedback && (
        <span
          key={feedback.id}
          className={`damage-float${
            feedback.kind === 'heal'
              ? ' is-heal'
              : feedback.kind === 'miss'
                ? ' is-miss'
                : ''
          }`}
          aria-hidden="true"
        >
          {feedback.kind === 'heal'
            ? `+${feedback.amount}`
            : feedback.kind === 'miss'
              ? 'MISS'
              : `-${feedback.amount}`}
        </span>
      )}

      <div
        key={feedback?.kind === 'damage' ? `hit-${feedback.id}` : 'idle'}
        className={`combatant-visual shrink-0${
          feedback?.kind === 'damage' ? ' hit-shake' : ''
        }${acting ? ' is-acting' : ''}`}
      >
        {visual}
      </div>

      <div className="combatant-readout">
        <p className="combatant-role">{role}</p>
        <h2 className="battle-server-copy combatant-name mt-0.5 truncate">{name}</h2>
        <div className="mt-1.5">
          <HealthBar label={`${name} HP`} current={currentHp} max={maxHp} />
        </div>
        <div className="mt-1.5">
          <SunTrack current={energy.current} max={energy.max} name={name} />
        </div>
      </div>
    </section>
  );
}

/** Stored Sun as pips rather than "Sun 1 / 2" — whether the signature move is
 *  affordable becomes a glance instead of a fraction to parse. */
function SunTrack({
  current,
  max,
  name,
}: {
  current: number;
  max: number;
  name: string;
}) {
  return (
    <span className="sun-track" role="img" aria-label={`${name} Sun ${current} of ${max}`}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={index < current ? 'sun-pip is-filled' : 'sun-pip'}
          aria-hidden="true"
        />
      ))}
      <span className="ml-1 text-[11px] font-semibold text-white/70" aria-hidden="true">
        Sun
      </span>
    </span>
  );
}
