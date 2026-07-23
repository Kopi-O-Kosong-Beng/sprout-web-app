import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
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

function isExpiredTemporaryAvatar(
  avatar: AvatarRecord,
  nowMilliseconds: number
): boolean {
  if (!avatar.isTemporary || avatar.expiresAt === null) return false;
  const expiresAt = Date.parse(avatar.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= nowMilliseconds;
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
      const nowMilliseconds = Date.now();
      const nextRecords = fetchedRecords.filter(
        (record) => !isExpiredTemporaryAvatar(record, nowMilliseconds)
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
    };
  }, [loadRoster]);

  const runStart = useCallback(
    async (avatarId: string, kind: 'start' | 'replay') => {
      const request = beginRequest();
      if (request === null) return;
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
        if (request === requestVersion.current) setPendingCommand(null);
        finishRequest(request);
      }
    },
    [beginRequest, finishRequest]
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
  const startNavigationLocked =
    view === 'starting' && pendingCommand === 'start';
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
    <main className="content-page battle-page">
      <section className="page-heading battle-heading">
        <p className="eyebrow">PVE battle lab</p>
        <h1 className={session ? 'battle-server-copy' : undefined}>
          {session
            ? `${session.player.name} vs ${session.bot.name}`
            : 'Battle practice'}
        </h1>
        <p>Read the intent, manage Sun, and commit one move per turn.</p>
      </section>

      {view === 'loading' && (
        <section
          className="archive-state battle-loading"
          role="status"
          aria-label="Loading battle roster"
          aria-live="polite"
        >
          <span className="battle-loading-mark" aria-hidden="true" />
          <h2>Loading your battle plants...</h2>
        </section>
      )}

      {view === 'error' && retryCommand?.kind === 'load' && (
        <section className="archive-state battle-empty" role="alert">
          <h2>Battle roster unavailable</h2>
          <p className="battle-server-copy">{error}</p>
          <button
            className="primary-cta archive-retry"
            type="button"
            onClick={handleRetry}
          >
            Retry roster
          </button>
        </section>
      )}

      {showSelection && records.length === 0 && retryCommand?.kind !== 'load' && (
        <section className="archive-state battle-empty">
          <h2>No battle plants yet</h2>
          <p>Collect a plant in your Archive before starting a PVE match.</p>
          <ArchiveControl className="primary-cta archive-retry" />
        </section>
      )}

      {showSelection && records.length > 0 && (
        <>
          {notice?.kind === 'abandoned' && (
            <p
              className="battle-notice"
              role="status"
              aria-label="Battle abandoned"
            >
              {notice.message}
            </p>
          )}
          {error && retryCommand?.kind !== 'load' && (
            <div className="battle-command-error" role="alert">
              <div>
                <strong>Battle command not saved</strong>
                <p className="battle-server-copy">{error}</p>
              </div>
              <button type="button" onClick={handleRetry}>
                {retryLabel(retryCommand)}
              </button>
            </div>
          )}
          <section className="battle-select">
            <div className="battle-roster">
              <div className="battle-section-heading">
                <p className="eyebrow">Owned roster</p>
                <h2>Choose your plant</h2>
              </div>
              <div className="avatar-grid compact">
                {avatars.map((avatar) => (
                  <button
                    key={avatar.id}
                    className={
                      avatar.id === selectedAvatar?.id
                        ? `avatar-card ${avatar.color} is-selected`
                        : `avatar-card ${avatar.color}`
                    }
                    type="button"
                    aria-label={`Select ${avatar.name}${avatar.isDemo ? ' (Demo)' : ''}`}
                    aria-pressed={avatar.id === selectedAvatar?.id}
                    disabled={commandLocked}
                    onClick={() => selectAvatar(avatar.id)}
                  >
                    {avatar.isDemo && <span className="demo-badge">Demo</span>}
                    <PlantAvatar avatar={avatar} />
                    <span className="battle-server-copy">{avatar.name}</span>
                    <small className="battle-server-copy">{avatar.species}</small>
                  </button>
                ))}
              </div>
            </div>

            <aside className="battle-ready">
              {selectedAvatar ? (
                <>
                  <PlantAvatar avatar={selectedAvatar} large />
                  <p className="eyebrow">Selected combatant</p>
                  <h2 className="battle-server-copy">
                    {selectedAvatar.name} is ready
                  </h2>
                  <p className="battle-server-copy">
                    {selectedAvatar.species} from {selectedAvatar.family}.
                  </p>
                  <StatGrid avatar={selectedAvatar} compact />
                  {view === 'starting' && pendingCommand === 'start' && (
                    <p
                      className="battle-pending"
                      role="status"
                      aria-label="Starting battle"
                    >
                      Creating a persisted match...
                    </p>
                  )}
                  <button
                    className="primary-cta detail-action"
                    type="button"
                    disabled={commandLocked}
                    onClick={() => void runStart(selectedAvatar.id, 'start')}
                  >
                    Start Match
                  </button>
                  <ArchiveControl
                    className="details-link"
                    disabled={startNavigationLocked}
                  />
                </>
              ) : (
                <>
                  <p className="eyebrow">Match setup</p>
                  <h2>Choose an owned plant for this match</h2>
                  <p>Your roster is loaded. Pick one plant to inspect and start.</p>
                  <ArchiveControl className="details-link" />
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
              className="battle-notice"
              role="status"
              aria-label="Battle synchronized"
            >
              {notice.message}
            </p>
          )}
          {error && (
            <div className="battle-command-error" role="alert">
              <div>
                <strong>Battle command not saved</strong>
                <p className="battle-server-copy">{error}</p>
              </div>
              <div className="battle-error-actions">
                <button type="button" onClick={handleRetry}>
                  {retryLabel(retryCommand)}
                </button>
                <button type="button" onClick={dismissSessionError}>
                  Back to turn
                </button>
              </div>
            </div>
          )}

          <section className="battle-console">
            <div className="battle-arena">
              <article className="fighter-panel user-fighter">
                <PlantAvatar avatar={playerAvatar} large />
                <p className="fighter-label">Your plant</p>
                <h2 className="battle-server-copy">{session.player.name}</h2>
                <HealthBar
                  label={`${session.player.name} HP`}
                  current={session.player.currentHp}
                  max={session.player.maxHp}
                />
                <p
                  className="sun-meter"
                  aria-label={`${session.player.name} Sun ${playerEnergy.current} of ${playerEnergy.max}`}
                >
                  Sun {playerEnergy.current} / {playerEnergy.max}
                </p>
              </article>

              <div className="battle-menu">
                {session.status === 'active' ? (
                  <>
                    <p className="eyebrow">Your turn</p>
                    <h2>Turn {session.turnNumber}</h2>
                    <div className="intent-panel">
                      <span>Opponent intent</span>
                      <strong className="battle-server-copy">
                        {intentMessage(session.bot.name, session.botIntent)}
                      </strong>
                    </div>

                    {pendingCommand === 'action' && (
                      <p
                        className="battle-pending"
                        role="status"
                        aria-label={`Resolving turn ${session.turnNumber}`}
                      >
                        Resolving turn {session.turnNumber} on the server...
                      </p>
                    )}
                    {pendingCommand === 'abandon' && (
                      <p
                        className="battle-pending"
                        role="status"
                        aria-label="Abandoning battle"
                      >
                        Saving abandonment...
                      </p>
                    )}

                    <div
                      className="battle-actions"
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
                          <div className="battle-move" key={move.id}>
                            <button
                              type="button"
                              disabled={commandLocked}
                              aria-disabled={
                                reason !== null && !commandLocked
                                  ? true
                                  : undefined
                              }
                              aria-describedby={reason ? reasonId : undefined}
                              onClick={() => {
                                if (reason !== null) return;
                                void runAction(
                                  session.id,
                                  move.id,
                                  session.turnNumber
                                );
                              }}
                            >
                              <span className="move-title">
                                <strong className="battle-server-copy">
                                  {move.name}
                                </strong>
                                <span>{move.kind}</span>
                              </span>
                              <span className="move-facts">
                                <span>Power {move.power}</span>
                                <span>Accuracy {move.accuracy}%</span>
                                <span>Sun gain {move.energyGain}</span>
                                <span>Sun cost {move.energyCost}</span>
                              </span>
                            </button>
                            {reason && (
                              <span className="move-disabled-reason" id={reasonId}>
                                {reason}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      className="battle-abandon"
                      type="button"
                      disabled={commandLocked || sessionCommandFailed}
                      onClick={() => void runAbandon(session.id)}
                    >
                      Abandon Match
                    </button>
                  </>
                ) : (
                  <div className="battle-result">
                    <p className="eyebrow">Match complete</p>
                    <h2>
                      {session.status === 'won'
                        ? 'Victory'
                        : session.status === 'lost'
                          ? 'Defeat'
                          : 'Battle abandoned'}
                    </h2>
                    <p>XP awarded: {session.xpAwarded}</p>
                    {pendingCommand === 'replay' && (
                      <p
                        className="battle-pending"
                        role="status"
                        aria-label="Starting replay"
                      >
                        Creating a new persisted match...
                      </p>
                    )}
                    <div className="battle-result-actions">
                      <button
                        className="primary-cta"
                        type="button"
                        disabled={commandLocked || sessionCommandFailed}
                        onClick={() => void runStart(session.avatarId, 'replay')}
                      >
                        Replay
                      </button>
                      <button
                        className="details-link"
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

              <article className="fighter-panel bot-fighter">
                <BotAvatar
                  name={session.bot.name}
                  spriteUrl={session.bot.spriteUrl}
                />
                <p className="fighter-label">Opponent</p>
                <h2 className="battle-server-copy">{session.bot.name}</h2>
                <HealthBar
                  label={`${session.bot.name} HP`}
                  current={session.bot.currentHp}
                  max={session.bot.maxHp}
                />
                <p
                  className="sun-meter"
                  aria-label={`${session.bot.name} Sun ${botEnergy.current} of ${botEnergy.max}`}
                >
                  Sun {botEnergy.current} / {botEnergy.max}
                </p>
              </article>
            </div>

            <section className="battle-log-panel">
              <div className="battle-section-heading">
                <p className="eyebrow">Server record</p>
                <h2>Battle log</h2>
              </div>
              <ol className="battle-log" role="log" aria-label="Battle log">
                {session.log.map((event, index) => (
                  <li
                    key={`${event.turnNumber}-${event.type}-${event.actor}-${index}`}
                  >
                    <div className="battle-log-meta">
                      <span>
                        {event.turnNumber === 0
                          ? 'Opening'
                          : `Turn ${event.turnNumber}`}
                      </span>
                      <span>{actorLabel(event)}</span>
                      <span>{EVENT_LABELS[event.type]}</span>
                    </div>
                    <p className="battle-server-copy">{event.message}</p>
                  </li>
                ))}
              </ol>
            </section>
          </section>
        </>
      )}
    </main>
  );
}
