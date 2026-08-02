import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

  useEffect(() => {
    void loadRoster();
    return () => {
      requestVersion.current += 1;
      inFlight.current = false;
      releaseNavigationLock.current?.();
      releaseNavigationLock.current = null;
    };
  }, [loadRoster]);

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
        setError(extractApiError(caught, 'Could not submit this move.'));
        setRetryCommand({
          kind: 'action',
          sessionId,
          moveId,
          expectedTurn,
        });
        setView('error');
      } finally {
        if (request === requestVersion.current) setPendingCommand(null);
        finishRequest(request);
      }
    },
    [beginRequest, finishRequest]
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

      try {
        const abandonedSession = await abandonPveBattle(sessionId);
        if (request !== requestVersion.current) return;
        setSession(null);
        setNotice({
          kind: 'abandoned',
          message: `Battle abandoned. ${abandonedSession.xpAwarded} XP awarded.`,
        });
        setView('selecting');
      } catch (caught) {
        if (request !== requestVersion.current) return;
        setError(extractApiError(caught, 'Could not abandon this battle.'));
        setRetryCommand({ kind: 'abandon', sessionId });
        setView('error');
      } finally {
        if (request === requestVersion.current) setPendingCommand(null);
        finishRequest(request);
      }
    },
    [beginRequest, finishRequest]
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
        <p className="font-pixel text-outline text-[8px] text-white">PVE battle lab</p>
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

      <div className="safe-bottom mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-3 py-3">
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
            {notice?.kind === 'abandoned' && (
              <p
                className="pixel-panel px-3 py-2 text-center text-[10px] leading-relaxed"
                role="status"
                aria-label="Battle abandoned"
              >
                {notice.message}
              </p>
            )}
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
                <p className="font-pixel text-[8px] opacity-60">Owned roster</p>
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
                        <span className="font-pixel border-2 border-black bg-[color:var(--color-hp-mid)] px-1 text-[7px]">
                          Demo
                        </span>
                      )}
                      <PlantAvatar avatar={avatar} />
                      <span className="battle-server-copy font-pixel max-w-full truncate text-[8px]">
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
                    <p className="font-pixel mt-2 text-[8px] opacity-60">Selected combatant</p>
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
                      className="press pixel-button mt-4 w-full px-3 py-3 text-[9px]"
                      style={{ background: 'var(--color-hp-high)', color: '#fff' }}
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
                    <p className="font-pixel text-[8px] opacity-60">Match setup</p>
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
              <div className="pixel-panel p-3" role="alert">
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
            <Combatant
              role="Opponent"
              name={session.bot.name}
              currentHp={session.bot.currentHp}
              maxHp={session.bot.maxHp}
              energy={botEnergy}
              align="end"
              visual={<BotAvatar name={session.bot.name} spriteUrl={session.bot.spriteUrl} />}
            />

            <div className="pixel-panel p-3">
              {session.status === 'active' ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-pixel text-[8px] opacity-60">Your turn</p>
                    <h2 className="font-pixel text-[10px]">Turn {session.turnNumber}</h2>
                  </div>

                  <div className="mt-2 border-2 border-black/25 px-2 py-1.5">
                    <span className="font-pixel block text-[7px] opacity-60">
                      Opponent intent
                    </span>
                    <strong className="battle-server-copy mt-1 block text-[10px] leading-relaxed">
                      {intentMessage(session.bot.name, session.botIntent)}
                    </strong>
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

                  <div
                    className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
                    role="group"
                    aria-label="Battle moves"
                  >
                    {session.player.moves.map((move, index) => {
                      const reason = moveDisabledReason(
                        move,
                        session,
                        commandLocked,
                        sessionCommandFailed
                      );
                      const reasonId = `move-reason-${index}`;
                      return (
                        <div key={move.id}>
                          <button
                            className="press pixel-button w-full px-2 py-2 text-left"
                            type="button"
                            disabled={commandLocked}
                            aria-disabled={
                              reason !== null && !commandLocked ? true : undefined
                            }
                            aria-describedby={reason ? reasonId : undefined}
                            onClick={() => {
                              if (reason !== null) return;
                              void runAction(session.id, move.id, session.turnNumber);
                            }}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <strong className="battle-server-copy text-[9px] leading-relaxed">{move.name}</strong>
                              <span className="text-[7px] opacity-60">{move.kind}</span>
                            </span>
                            <span className="mt-1.5 grid grid-cols-2 gap-x-2 text-[8px] font-normal opacity-75">
                              <span>Power {move.power}</span>
                              <span>Accuracy {move.accuracy}%</span>
                              <span>Sun gain {move.energyGain}</span>
                              <span>Sun cost {move.energyCost}</span>
                            </span>
                          </button>
                          {reason && (
                            <span
                              className="mt-1 block text-[9px] leading-relaxed opacity-70"
                              id={reasonId}
                            >
                              {reason}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    className="press pixel-button mt-3 w-full px-2 py-2 text-[9px]"
                    style={{ background: 'var(--color-hp-low)', color: '#fff' }}
                    type="button"
                    disabled={commandLocked || sessionCommandFailed}
                    onClick={() => void runAbandon(session.id)}
                  >
                    Abandon Match
                  </button>
                </>
              ) : (
                <div className="text-center">
                  <p className="font-pixel text-[8px] opacity-60">Match complete</p>
                  <h2 className="font-pixel mt-2 text-sm leading-relaxed">
                    {session.status === 'won'
                      ? 'Victory'
                      : session.status === 'lost'
                        ? 'Defeat'
                        : 'Battle abandoned'}
                  </h2>
                  <p className="mt-2 text-xs">XP awarded: {session.xpAwarded}</p>
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
                      className="press pixel-button w-full px-2 py-3 text-[9px]"
                      style={{ background: 'var(--color-hp-high)', color: '#fff' }}
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

            <Combatant
              role="Your plant"
              name={session.player.name}
              currentHp={session.player.currentHp}
              maxHp={session.player.maxHp}
              energy={playerEnergy}
              align="start"
              visual={<PlantAvatar avatar={playerAvatar} large />}
            />

            <section className="pixel-panel p-3">
              <p className="font-pixel text-[8px] opacity-60">Server record</p>
              <h2 className="font-pixel mt-2 text-xs leading-relaxed">Battle log</h2>
              <ol
                className="mt-3 max-h-72 space-y-2 overflow-y-auto"
                role="log"
                aria-label="Battle log"
              >
                {session.log.map((event, index) => (
                  <li
                    key={`${event.turnNumber}-${event.type}-${event.actor}-${index}`}
                    className="border-2 border-black/15 px-2 py-1.5"
                  >
                    <div className="font-pixel flex flex-wrap gap-x-2 text-[7px] opacity-60">
                      <span>
                        {event.turnNumber === 0 ? 'Opening' : `Turn ${event.turnNumber}`}
                      </span>
                      <span>{actorLabel(event)}</span>
                      <span>{EVENT_LABELS[event.type]}</span>
                    </div>
                    <p className="battle-server-copy mt-1 text-[10px] leading-relaxed">{event.message}</p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * One side of the arena: the sprite, then a panel carrying the name, the HP bar
 * and the Sun readout. Mirrored for the opponent so the two face each other, as
 * the Android battle screen laid them out.
 */
function Combatant({
  role,
  name,
  currentHp,
  maxHp,
  energy,
  align,
  visual,
}: {
  role: string;
  name: string;
  currentHp: number;
  maxHp: number;
  energy: { current: number; max: number };
  align: 'start' | 'end';
  visual: React.ReactNode;
}) {
  return (
    <section
      className={`flex items-center gap-3 ${align === 'end' ? 'flex-row-reverse' : ''}`}
    >
      <div className="shrink-0">{visual}</div>

      <article className="pixel-panel min-w-0 flex-1 px-3 py-2">
        <p className="font-pixel text-[7px] opacity-60">{role}</p>
        <h2 className="battle-server-copy font-pixel mt-1 truncate text-[10px]">{name}</h2>
        <div className="mt-2">
          <HealthBar label={`${name} HP`} current={currentHp} max={maxHp} />
        </div>
        <p
          className="font-pixel mt-1.5 text-[8px]"
          aria-label={`${name} Sun ${energy.current} of ${energy.max}`}
        >
          Sun {energy.current} / {energy.max}
        </p>
      </article>
    </section>
  );
}
