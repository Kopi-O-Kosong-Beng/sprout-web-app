import {
  createPlayerParticipant,
  createThornback,
  MOVE_CATALOG_VERSION,
  NPC_PRESET_VERSION,
} from '../data/battle-catalog';
import type {
  BattleActor,
  BattleEvent,
  BattleIntent,
  BattleMove,
  BattleParticipant,
  BattleSession,
  BattleTransitionInput,
  CreateBattleInput,
  ProgressionDelta,
  TerminalBattleStatus,
} from '../models/battle';
import { nextRandom } from './seeded-rng';

const MAX_ENERGY = 2;
const HEAL_WEIGHT_BELOW_FORTY_PERCENT = 3;

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  return {
    ...participant,
    stats: { ...participant.stats },
    moves: participant.moves.map((move) => ({ ...move })),
  };
}

function cloneSession(session: BattleSession): BattleSession {
  return {
    ...session,
    player: cloneParticipant(session.player),
    bot: cloneParticipant(session.bot),
    log: session.log.map((event) => ({ ...event })),
  };
}

function appendEvent(session: BattleSession, event: BattleEvent): void {
  session.log.push(event);
}

function assertValidStats(input: CreateBattleInput): void {
  const stats = input.player.stats;
  if (
    !Number.isFinite(input.rngSeed) ||
    !Number.isInteger(stats.hp) ||
    stats.hp <= 0 ||
    !Number.isFinite(stats.attack) ||
    !Number.isFinite(stats.defense) ||
    !Number.isFinite(stats.speed)
  ) {
    throw new Error('invalid_battle_input');
  }
}

function canonicalTimestampMillis(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === value ? milliseconds : null;
}

function validateTransitionTimestamp(
  session: BattleSession,
  transition: BattleTransitionInput
): string {
  const transitionAt = transition?.transitionAt;
  const transitionMilliseconds = canonicalTimestampMillis(transitionAt);
  const previousMilliseconds = canonicalTimestampMillis(session.updatedAt);
  if (
    transitionMilliseconds === null ||
    previousMilliseconds === null ||
    transitionMilliseconds <= previousMilliseconds
  ) {
    throw new Error('invalid_transition_timestamp');
  }
  return transitionAt;
}

function intentForMove(move: BattleMove, candidates: BattleMove[]): BattleIntent {
  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidate.id, candidate] as const)).values(),
  ];
  if (uniqueCandidates.length < 2) throw new Error('no_ambiguous_bot_intent');

  const buildingCandidates = uniqueCandidates.filter(
    (candidate) => candidate.kind === 'quick' || candidate.kind === 'guard'
  );
  const committedCandidates = uniqueCandidates.filter(
    (candidate) => candidate.kind === 'signature' || candidate.kind === 'heal'
  );
  const hasSignature = committedCandidates.some(
    (candidate) => candidate.kind === 'signature'
  );
  const hasHeal = committedCandidates.some((candidate) => candidate.kind === 'heal');

  if (committedCandidates.length === 0 && buildingCandidates.length >= 2) {
    return 'building';
  }
  if (
    hasSignature &&
    hasHeal &&
    buildingCandidates.length >= 2 &&
    committedCandidates.length >= 2
  ) {
    return committedCandidates.some((candidate) => candidate.id === move.id)
      ? 'committed'
      : 'building';
  }
  return 'uncertain';
}

function intentMessage(intent: BattleIntent): string {
  switch (intent) {
    case 'building':
      return 'Thornback is building momentum.';
    case 'committed':
      return 'Thornback is committing to a decisive action.';
    case 'uncertain':
      return "Thornback's next action remains uncertain.";
  }
}

function validWeightedBotMoves(bot: BattleParticipant): BattleMove[] {
  const weighted: BattleMove[] = [];

  for (const move of bot.moves) {
    if (move.kind === 'signature' && bot.energy < move.energyCost) continue;
    if (move.kind === 'heal') {
      if (bot.healUsed || bot.currentHp >= bot.maxHp) continue;
      weighted.push(move);
      if (bot.currentHp / bot.maxHp < 0.4) {
        for (let index = 1; index < HEAL_WEIGHT_BELOW_FORTY_PERCENT; index += 1) {
          weighted.push(move);
        }
      }
      continue;
    }
    weighted.push(move);
  }

  return weighted;
}

export function prepareBotIntent(session: BattleSession): BattleSession {
  if (session.status !== 'active') throw new Error('battle_not_active');
  if (session.phase !== 'PREPARE_BOT_INTENT') {
    throw new Error('invalid_battle_phase');
  }

  const next = cloneSession(session);
  const candidates = validWeightedBotMoves(next.bot);
  if (candidates.length === 0) throw new Error('no_valid_bot_move');

  const random = nextRandom(next.rngState);
  const selected = candidates[Math.floor(random.value * candidates.length)];
  const intent = intentForMove(selected, candidates);
  next.rngState = random.state;
  next.rngStep += 1;
  next.pendingBotMoveId = selected.id;
  next.botIntent = intent;
  next.phase = 'PLAYER_ACTION';
  appendEvent(next, {
    turnNumber: next.turnNumber,
    type: 'bot_intent_prepared',
    actor: 'bot',
    intent,
    message: intentMessage(intent),
  });
  return next;
}

export function createBattle(input: CreateBattleInput): BattleSession {
  assertValidStats(input);
  const rngSeed = input.rngSeed >>> 0;
  const initial: BattleSession = {
    id: input.id,
    userId: input.userId,
    avatarId: input.avatarId,
    status: 'active',
    phase: 'PREPARE_BOT_INTENT',
    turnNumber: 1,
    player: createPlayerParticipant(input.player),
    bot: createThornback(),
    pendingBotMoveId: null,
    botIntent: null,
    rngSeed,
    rngState: rngSeed,
    rngStep: 0,
    moveCatalogVersion: MOVE_CATALOG_VERSION,
    npcPresetVersion: NPC_PRESET_VERSION,
    log: [
      {
        turnNumber: 1,
        type: 'battle_started',
        actor: 'system',
        message: `${input.player.name} faces Thornback.`,
      },
    ],
    rewardApplied: false,
    xpAwarded: 0,
    createdAt: input.now,
    updatedAt: input.now,
    completedAt: null,
  };

  return prepareBotIntent(initial);
}

export function calculateDamage(
  attacker: BattleParticipant,
  defender: BattleParticipant,
  move: BattleMove,
  guarded: boolean
): number {
  const raw = Math.round(
    move.power * (0.75 + attacker.stats.attack / 200) -
      defender.stats.defense * 0.12
  );
  const damage = Math.max(5, raw);
  return guarded ? Math.floor(damage / 2) : damage;
}

function participantForActor(
  session: BattleSession,
  actor: Exclude<BattleActor, 'system'>
): BattleParticipant {
  return actor === 'player' ? session.player : session.bot;
}

function opponentForActor(
  session: BattleSession,
  actor: Exclude<BattleActor, 'system'>
): BattleParticipant {
  return actor === 'player' ? session.bot : session.player;
}

function executeMove(
  session: BattleSession,
  actor: 'player' | 'bot',
  move: BattleMove,
  opponentGuarded: boolean
): void {
  const participant = participantForActor(session, actor);
  const opponent = opponentForActor(session, actor);
  appendEvent(session, {
    turnNumber: session.turnNumber,
    type: 'move_used',
    actor,
    moveId: move.id,
    message: `${participant.name} used ${move.name}.`,
  });

  if (move.kind === 'guard') {
    participant.energy = Math.min(MAX_ENERGY, participant.energy + move.energyGain);
    return;
  }

  if (move.kind === 'heal') {
    const requested = Math.round(participant.maxHp * 0.25);
    const amount = Math.min(requested, participant.maxHp - participant.currentHp);
    participant.currentHp += amount;
    participant.healUsed = true;
    appendEvent(session, {
      turnNumber: session.turnNumber,
      type: 'healed',
      actor,
      moveId: move.id,
      amount,
      message: `${participant.name} recovered ${amount} HP.`,
    });
    return;
  }

  participant.energy = Math.max(0, participant.energy - move.energyCost);
  participant.energy = Math.min(MAX_ENERGY, participant.energy + move.energyGain);
  const accuracyRoll = nextRandom(session.rngState);
  session.rngState = accuracyRoll.state;
  session.rngStep += 1;

  if (accuracyRoll.value * 100 >= move.accuracy) {
    appendEvent(session, {
      turnNumber: session.turnNumber,
      type: 'move_missed',
      actor,
      moveId: move.id,
      message: `${participant.name}'s ${move.name} missed.`,
    });
    return;
  }

  const damage = calculateDamage(participant, opponent, move, opponentGuarded);
  const appliedDamage = Math.min(damage, opponent.currentHp);
  opponent.currentHp = Math.max(0, opponent.currentHp - damage);
  appendEvent(session, {
    turnNumber: session.turnNumber,
    type: 'damage_dealt',
    actor,
    moveId: move.id,
    amount: appliedDamage,
    message: `${participant.name} dealt ${appliedDamage} damage.`,
  });
}

function validatePlayerMove(session: BattleSession, moveId: string): BattleMove {
  const move = session.player.moves.find((candidate) => candidate.id === moveId);
  if (!move) throw new Error('invalid_move');
  if (move.kind === 'signature' && session.player.energy < move.energyCost) {
    throw new Error('insufficient_energy');
  }
  if (move.kind === 'heal') {
    if (session.player.healUsed) throw new Error('heal_already_used');
    if (session.player.currentHp >= session.player.maxHp) throw new Error('full_health');
  }
  return move;
}

export function resolvePlayerAction(
  session: BattleSession,
  moveId: string,
  transition: BattleTransitionInput
): BattleSession {
  if (session.status !== 'active') throw new Error('battle_not_active');
  if (session.phase !== 'PLAYER_ACTION') throw new Error('invalid_battle_phase');

  const playerMove = validatePlayerMove(session, moveId);
  const botMove = session.bot.moves.find(
    (candidate) => candidate.id === session.pendingBotMoveId
  );
  if (!botMove) throw new Error('invalid_bot_move');
  const transitionAt = validateTransitionTimestamp(session, transition);

  const next = cloneSession(session);
  next.updatedAt = transitionAt;
  next.completedAt = null;
  next.phase = 'RESOLVE_ROUND';
  const nextPlayerMove = next.player.moves.find((move) => move.id === playerMove.id)!;
  const nextBotMove = next.bot.moves.find((move) => move.id === botMove.id)!;
  const playerGuarded = nextPlayerMove.kind === 'guard';
  const botGuarded = nextBotMove.kind === 'guard';
  const playerFirst = next.player.stats.speed >= next.bot.stats.speed;
  const actions: Array<{
    actor: 'player' | 'bot';
    move: BattleMove;
    opponentGuarded: boolean;
  }> = playerFirst
    ? [
        { actor: 'player', move: nextPlayerMove, opponentGuarded: botGuarded },
        { actor: 'bot', move: nextBotMove, opponentGuarded: playerGuarded },
      ]
    : [
        { actor: 'bot', move: nextBotMove, opponentGuarded: playerGuarded },
        { actor: 'player', move: nextPlayerMove, opponentGuarded: botGuarded },
      ];

  for (const action of actions) {
    const participant = participantForActor(next, action.actor);
    if (participant.currentHp <= 0) {
      appendEvent(next, {
        turnNumber: next.turnNumber,
        type:
          action.actor === 'player' ? 'player_action_skipped' : 'bot_action_skipped',
        actor: action.actor,
        moveId: action.move.id,
        message: `${participant.name} fainted before acting.`,
      });
      continue;
    }
    executeMove(next, action.actor, action.move, action.opponentGuarded);
  }

  next.phase = 'CHECK_RESULT';
  if (next.bot.currentHp <= 0) {
    return completeBattle(next, 'won', transitionAt);
  }
  if (next.player.currentHp <= 0) {
    return completeBattle(next, 'lost', transitionAt);
  }

  next.turnNumber += 1;
  next.phase = 'PREPARE_BOT_INTENT';
  next.pendingBotMoveId = null;
  next.botIntent = null;
  return prepareBotIntent(next);
}

function completeBattle(
  session: BattleSession,
  outcome: Extract<TerminalBattleStatus, 'won' | 'lost'>,
  transitionAt: string
): BattleSession {
  session.status = outcome;
  session.phase = 'TERMINAL';
  session.pendingBotMoveId = null;
  session.botIntent = null;
  session.completedAt = transitionAt;
  session.xpAwarded = calculateProgression(outcome).xp;
  appendEvent(session, {
    turnNumber: session.turnNumber,
    type: outcome === 'won' ? 'battle_won' : 'battle_lost',
    actor: 'system',
    message: outcome === 'won' ? 'Victory over Thornback.' : 'Thornback won the battle.',
  });
  return session;
}

export function abandonBattle(
  session: BattleSession,
  transition: BattleTransitionInput
): BattleSession {
  if (session.status === 'abandoned') {
    validateTransitionTimestamp(session, transition);
    return session;
  }
  if (session.status !== 'active') throw new Error('battle_not_active');
  const transitionAt = validateTransitionTimestamp(session, transition);

  const next = cloneSession(session);
  next.status = 'abandoned';
  next.phase = 'TERMINAL';
  next.pendingBotMoveId = null;
  next.botIntent = null;
  next.updatedAt = transitionAt;
  next.completedAt = transitionAt;
  next.xpAwarded = 0;
  appendEvent(next, {
    turnNumber: next.turnNumber,
    type: 'battle_abandoned',
    actor: 'system',
    message: 'The battle was abandoned.',
  });
  return next;
}

export function calculateProgression(
  outcome: TerminalBattleStatus
): ProgressionDelta {
  switch (outcome) {
    case 'won':
      return { xp: 20, wins: 1, losses: 0, streak: 'increment' };
    case 'lost':
      return { xp: 5, wins: 0, losses: 1, streak: 'reset' };
    case 'abandoned':
      return { xp: 0, wins: 0, losses: 0, streak: 'unchanged' };
  }
}
