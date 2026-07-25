import { isDeepStrictEqual } from 'node:util';
import type {
  BattleEvent,
  BattleParticipant,
  BattleSession,
} from '../models/battle';
import {
  abandonBattle,
  prepareBotIntent,
  resolvePlayerAction,
} from '../services/battle-engine';

function replayError(reason: string): never {
  throw new Error(`deterministic replay failed: ${reason}`);
}

function initialParticipant(participant: BattleParticipant): BattleParticipant {
  return {
    ...participant,
    stats: { ...participant.stats },
    currentHp: participant.maxHp,
    energy: 0,
    healUsed: false,
    moves: participant.moves.map((move) => ({ ...move })),
  };
}

function reconstructInitialSession(session: BattleSession): BattleSession {
  const player = initialParticipant(session.player);
  const bot = initialParticipant(session.bot);
  return prepareBotIntent({
    id: session.id,
    userId: session.userId,
    avatarId: session.avatarId,
    status: 'active',
    phase: 'PREPARE_BOT_INTENT',
    turnNumber: 1,
    player,
    bot,
    pendingBotMoveId: null,
    botIntent: null,
    rngSeed: session.rngSeed,
    rngState: session.rngSeed,
    rngStep: 0,
    moveCatalogVersion: session.moveCatalogVersion,
    npcPresetVersion: session.npcPresetVersion,
    log: [
      {
        turnNumber: 1,
        type: 'battle_started',
        actor: 'system',
        message: `${player.name} faces ${bot.name}.`,
      },
    ],
    rewardApplied: false,
    xpAwarded: 0,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
    completedAt: null,
  });
}

function completedRoundCount(session: BattleSession): number {
  if (session.status === 'won' || session.status === 'lost') {
    return session.turnNumber;
  }
  return session.turnNumber - 1;
}

function syntheticTransitions(session: BattleSession, count: number): string[] {
  if (count === 0) return [];
  const created = Date.parse(session.createdAt);
  const updated = Date.parse(session.updatedAt);
  if (updated - created < count) {
    replayError('timestamp span cannot contain every persisted transition');
  }
  const first = updated - count + 1;
  return Array.from({ length: count }, (_, index) =>
    new Date(first + index).toISOString()
  );
}

function playerMoveForTurn(log: BattleEvent[], turnNumber: number): string {
  const actions = log.filter(
    (event) =>
      event.turnNumber === turnNumber &&
      event.actor === 'player' &&
      (event.type === 'move_used' || event.type === 'player_action_skipped')
  );
  if (actions.length !== 1 || !actions[0].moveId) {
    replayError(`turn ${turnNumber} must identify exactly one player move`);
  }
  return actions[0].moveId;
}

function comparablePersistedSession(session: BattleSession): BattleSession {
  if (session.status !== 'won' && session.status !== 'lost') return session;
  return { ...session, rewardApplied: false };
}

export function assertBattleReplayIntegrity(session: BattleSession): void {
  const completedRounds = completedRoundCount(session);
  if (completedRounds < 0 || completedRounds > session.log.length) {
    replayError('turn count is inconsistent with the structured log');
  }
  const transitionCount =
    completedRounds + (session.status === 'abandoned' ? 1 : 0);
  const transitions = syntheticTransitions(session, transitionCount);
  let replayed = reconstructInitialSession(session);

  for (let turn = 1; turn <= completedRounds; turn += 1) {
    if (
      replayed.status !== 'active' ||
      replayed.phase !== 'PLAYER_ACTION' ||
      replayed.turnNumber !== turn
    ) {
      replayError(`engine did not reach replayable turn ${turn}`);
    }
    replayed = resolvePlayerAction(
      replayed,
      playerMoveForTurn(session.log, turn),
      { transitionAt: transitions[turn - 1] }
    );
  }

  if (session.status === 'abandoned') {
    if (replayed.status !== 'active') {
      replayError('abandonment must follow an active turn');
    }
    replayed = abandonBattle(replayed, {
      transitionAt: transitions[transitions.length - 1],
    });
  }

  if (!isDeepStrictEqual(replayed, comparablePersistedSession(session))) {
    replayError('persisted state differs from deterministic engine output');
  }
}
