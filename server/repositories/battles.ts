import { createThornback } from '../data/battle-catalog';
import { getDb } from '../firebase';
import type {
  BattleActor,
  BattleEvent,
  BattleEventType,
  BattleIntent,
  BattleMove,
  BattleParticipant,
  BattlePhase,
  BattleSession,
  BattleStatus,
  MoveKind,
} from '../models/battle';
import {
  abandonBattle,
  calculateProgression,
  resolvePlayerAction,
} from '../services/battle-engine';
import { nextRandom } from '../services/seeded-rng';
import {
  invalidFirestoreDocument,
  normalizeNullableTimestamp,
  normalizeRequiredTimestamp,
  requireBoolean,
  requireDocumentData,
  requireFiniteNumber,
  requireString,
  type FirestoreSnapshotLike,
} from './firestore-normalization';

const COLLECTION = 'battle_sessions';
const MAX_ENERGY = 2;
const MAX_UINT32 = 0xffff_ffff;

const BATTLE_STATUSES = ['active', 'won', 'lost', 'abandoned'] as const;
const BATTLE_PHASES = [
  'PREPARE_BOT_INTENT',
  'PLAYER_ACTION',
  'RESOLVE_ROUND',
  'CHECK_RESULT',
  'TERMINAL',
] as const;
const MOVE_KINDS = ['quick', 'guard', 'signature', 'heal'] as const;
const BATTLE_INTENTS = ['building', 'committed', 'uncertain'] as const;
const BATTLE_ACTORS = ['player', 'bot', 'system'] as const;
const BATTLE_EVENT_TYPES = [
  'battle_started',
  'bot_intent_prepared',
  'move_used',
  'move_missed',
  'damage_dealt',
  'healed',
  'player_action_skipped',
  'bot_action_skipped',
  'battle_won',
  'battle_lost',
  'battle_abandoned',
] as const;

export interface BattleActionResult {
  session: BattleSession;
  stale: boolean;
}

export interface BattleRepository {
  create(session: BattleSession): Promise<BattleSession>;
  getOwned(userId: string, sessionId: string): Promise<BattleSession | null>;
  applyAction(
    userId: string,
    sessionId: string,
    moveId: string,
    expectedTurn: number
  ): Promise<BattleActionResult>;
  abandon(userId: string, sessionId: string): Promise<BattleSession>;
}

export class BattleRepositoryError extends Error {
  readonly name = 'BattleRepositoryError';

  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export interface BattleRepositoryOptions {
  clock?: () => Date;
}

interface ProfileProgression {
  pveXp: number;
  pveWins: number;
  pveLosses: number;
  currentPveWinStreak: number;
  bestPveWinStreak: number;
}

function invalid(documentId: string, reason: string): never {
  throw invalidFirestoreDocument(COLLECTION, documentId, reason);
}

function requireObject(
  value: unknown,
  fieldName: string,
  documentId: string
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(documentId, `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireOneOf<T extends string>(
  value: unknown,
  supported: readonly T[],
  fieldName: string,
  documentId: string
): T {
  if (typeof value !== 'string' || !supported.includes(value as T)) {
    invalid(documentId, `${fieldName} has an unsupported value`);
  }
  return value as T;
}

function requireSafeInteger(
  value: unknown,
  fieldName: string,
  documentId: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  const number = requireFiniteNumber(value, fieldName, COLLECTION, documentId);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    invalid(
      documentId,
      `${fieldName} must be a safe integer from ${minimum} to ${maximum}`
    );
  }
  return number;
}

function requireNonNegativeNumber(
  value: unknown,
  fieldName: string,
  documentId: string
): number {
  const number = requireFiniteNumber(value, fieldName, COLLECTION, documentId);
  if (number < 0) invalid(documentId, `${fieldName} must not be negative`);
  return number;
}

function requireNullableString(
  value: unknown,
  fieldName: string,
  documentId: string
): string | null {
  if (value === null) return null;
  if (value === undefined) invalid(documentId, `${fieldName} is required`);
  return requireString(value, fieldName, COLLECTION, documentId);
}

function requireNullableIntent(
  value: unknown,
  fieldName: string,
  documentId: string
): BattleIntent | null {
  if (value === null) return null;
  if (value === undefined) invalid(documentId, `${fieldName} is required`);
  return requireOneOf(value, BATTLE_INTENTS, fieldName, documentId);
}

function requireNullableTimestamp(
  value: unknown,
  fieldName: string,
  documentId: string
): string | null {
  if (value === undefined) invalid(documentId, `${fieldName} is required`);
  return (
    normalizeNullableTimestamp(value, fieldName, COLLECTION, documentId) ?? null
  );
}

function assertAbsent(
  value: unknown,
  fieldName: string,
  eventIndex: number,
  documentId: string
): void {
  if (value !== undefined) {
    invalid(documentId, `log[${eventIndex}].${fieldName} is not allowed`);
  }
}

function decodeMove(
  value: unknown,
  participantField: string,
  index: number,
  documentId: string
): BattleMove {
  const field = `${participantField}.moves[${index}]`;
  const data = requireObject(value, field, documentId);
  const move: BattleMove = {
    id: requireString(data.id, `${field}.id`, COLLECTION, documentId),
    name: requireString(data.name, `${field}.name`, COLLECTION, documentId),
    kind: requireOneOf<MoveKind>(data.kind, MOVE_KINDS, `${field}.kind`, documentId),
    power: requireSafeInteger(data.power, `${field}.power`, documentId, 0),
    accuracy: requireSafeInteger(
      data.accuracy,
      `${field}.accuracy`,
      documentId,
      1,
      100
    ),
    energyGain: requireSafeInteger(
      data.energyGain,
      `${field}.energyGain`,
      documentId,
      0,
      MAX_ENERGY
    ),
    energyCost: requireSafeInteger(
      data.energyCost,
      `${field}.energyCost`,
      documentId,
      0,
      MAX_ENERGY
    ),
  };

  const expectedById: Record<
    string,
    Pick<BattleMove, 'kind' | 'power' | 'accuracy' | 'energyGain' | 'energyCost'>
  > = {
    quick: {
      kind: 'quick',
      power: 1,
      accuracy: 100,
      energyGain: 1,
      energyCost: 0,
    },
    guard: {
      kind: 'guard',
      power: 0,
      accuracy: 100,
      energyGain: 1,
      energyCost: 0,
    },
    signature: {
      kind: 'signature',
      power: 1,
      accuracy: 85,
      energyGain: 0,
      energyCost: 2,
    },
    photosynthesis: {
      kind: 'heal',
      power: 0,
      accuracy: 100,
      energyGain: 0,
      energyCost: 0,
    },
  };
  const expected = expectedById[move.id];
  if (!expected || move.kind !== expected.kind) {
    invalid(documentId, `${field} has an unsupported ID and kind relationship`);
  }
  if (
    (move.id === 'quick' || move.id === 'signature') &&
    move.power < expected.power
  ) {
    invalid(documentId, `${field}.power must be positive for a damaging move`);
  }
  if (
    (move.id === 'guard' || move.id === 'photosynthesis') &&
    move.power !== expected.power
  ) {
    invalid(documentId, `${field}.power must be zero for a non-damaging move`);
  }
  if (
    move.accuracy < expected.accuracy ||
    move.energyGain !== expected.energyGain ||
    move.energyCost !== expected.energyCost
  ) {
    invalid(documentId, `${field} has illegal accuracy or energy fields`);
  }
  if (move.id === 'quick' && move.power !== 22) {
    invalid(documentId, `${field}.power must match catalog v1`);
  }
  if (
    move.id === 'signature' &&
    (move.power < 46 || move.power > 52 || move.accuracy > 90)
  ) {
    invalid(documentId, `${field} must match catalog v1 signature bounds`);
  }
  return move;
}

function decodeParticipant(
  value: unknown,
  fieldName: 'player' | 'bot',
  documentId: string
): BattleParticipant {
  const data = requireObject(value, fieldName, documentId);
  const statsData = requireObject(data.stats, `${fieldName}.stats`, documentId);
  if (!Array.isArray(data.moves) || data.moves.length !== 4) {
    invalid(documentId, `${fieldName}.moves must contain exactly four moves`);
  }
  const moves = data.moves.map((move, index) =>
    decodeMove(move, fieldName, index, documentId)
  );
  if (new Set(moves.map((move) => move.id)).size !== moves.length) {
    invalid(documentId, `${fieldName}.moves must have unique IDs`);
  }

  const participant: BattleParticipant = {
    id: requireString(data.id, `${fieldName}.id`, COLLECTION, documentId),
    name: requireString(data.name, `${fieldName}.name`, COLLECTION, documentId),
    spriteUrl: requireString(
      data.spriteUrl,
      `${fieldName}.spriteUrl`,
      COLLECTION,
      documentId
    ),
    stats: {
      hp: requireSafeInteger(statsData.hp, `${fieldName}.stats.hp`, documentId, 1),
      attack: requireNonNegativeNumber(
        statsData.attack,
        `${fieldName}.stats.attack`,
        documentId
      ),
      defense: requireNonNegativeNumber(
        statsData.defense,
        `${fieldName}.stats.defense`,
        documentId
      ),
      speed: requireNonNegativeNumber(
        statsData.speed,
        `${fieldName}.stats.speed`,
        documentId
      ),
    },
    currentHp: requireSafeInteger(
      data.currentHp,
      `${fieldName}.currentHp`,
      documentId,
      0
    ),
    maxHp: requireSafeInteger(data.maxHp, `${fieldName}.maxHp`, documentId, 1),
    energy: requireSafeInteger(
      data.energy,
      `${fieldName}.energy`,
      documentId,
      0,
      MAX_ENERGY
    ),
    healUsed: requireBoolean(
      data.healUsed,
      `${fieldName}.healUsed`,
      COLLECTION,
      documentId
    ),
    moves,
  };

  if (participant.maxHp !== participant.stats.hp) {
    invalid(documentId, `${fieldName}.maxHp must match ${fieldName}.stats.hp`);
  }
  if (participant.currentHp > participant.maxHp) {
    invalid(documentId, `${fieldName}.currentHp must not exceed maxHp`);
  }
  return participant;
}

function assertFixedBot(bot: BattleParticipant, documentId: string): void {
  const expected = createThornback();
  if (
    bot.id !== expected.id ||
    bot.name !== expected.name ||
    bot.spriteUrl !== expected.spriteUrl ||
    JSON.stringify(bot.stats) !== JSON.stringify(expected.stats) ||
    JSON.stringify(bot.moves) !== JSON.stringify(expected.moves)
  ) {
    invalid(documentId, 'bot snapshot does not match thornback-v1');
  }
}

function decodeEvent(
  value: unknown,
  index: number,
  turnNumber: number,
  participants: Pick<BattleSession, 'player' | 'bot'>,
  documentId: string
): BattleEvent {
  const field = `log[${index}]`;
  const data = requireObject(value, field, documentId);
  const type = requireOneOf<BattleEventType>(
    data.type,
    BATTLE_EVENT_TYPES,
    `${field}.type`,
    documentId
  );
  const actor = requireOneOf<BattleActor>(
    data.actor,
    BATTLE_ACTORS,
    `${field}.actor`,
    documentId
  );
  const eventTurn = requireSafeInteger(
    data.turnNumber,
    `${field}.turnNumber`,
    documentId,
    1,
    turnNumber
  );
  const message = requireString(data.message, `${field}.message`, COLLECTION, documentId);
  const moveId =
    data.moveId === undefined
      ? undefined
      : requireString(data.moveId, `${field}.moveId`, COLLECTION, documentId);
  const amount =
    data.amount === undefined
      ? undefined
      : requireSafeInteger(data.amount, `${field}.amount`, documentId, 1);
  const intent =
    data.intent === undefined
      ? undefined
      : requireOneOf<BattleIntent>(
          data.intent,
          BATTLE_INTENTS,
          `${field}.intent`,
          documentId
        );

  const requireSystemEvent = () => {
    if (actor !== 'system') invalid(documentId, `${field}.actor must be system`);
    assertAbsent(moveId, 'moveId', index, documentId);
    assertAbsent(amount, 'amount', index, documentId);
    assertAbsent(intent, 'intent', index, documentId);
  };
  const requireParticipantMove = (expectedActor?: 'player' | 'bot') => {
    if (actor === 'system' || (expectedActor && actor !== expectedActor)) {
      invalid(documentId, `${field}.actor is inconsistent with ${type}`);
    }
    if (!moveId) invalid(documentId, `${field}.moveId is required`);
    const participant = actor === 'player' ? participants.player : participants.bot;
    if (!participant.moves.some((move) => move.id === moveId)) {
      invalid(documentId, `${field}.moveId is not owned by ${actor}`);
    }
    assertAbsent(intent, 'intent', index, documentId);
  };

  switch (type) {
    case 'battle_started':
    case 'battle_won':
    case 'battle_lost':
    case 'battle_abandoned':
      requireSystemEvent();
      break;
    case 'bot_intent_prepared':
      if (actor !== 'bot' || !intent) {
        invalid(documentId, `${field} must contain a bot intent`);
      }
      assertAbsent(moveId, 'moveId', index, documentId);
      assertAbsent(amount, 'amount', index, documentId);
      break;
    case 'move_used':
    case 'move_missed':
      requireParticipantMove();
      assertAbsent(amount, 'amount', index, documentId);
      break;
    case 'damage_dealt':
    case 'healed':
      requireParticipantMove();
      if (amount === undefined) invalid(documentId, `${field}.amount is required`);
      break;
    case 'player_action_skipped':
      requireParticipantMove('player');
      assertAbsent(amount, 'amount', index, documentId);
      break;
    case 'bot_action_skipped':
      requireParticipantMove('bot');
      assertAbsent(amount, 'amount', index, documentId);
      break;
  }

  return {
    turnNumber: eventTurn,
    type,
    actor,
    message,
    ...(moveId === undefined ? {} : { moveId }),
    ...(amount === undefined ? {} : { amount }),
    ...(intent === undefined ? {} : { intent }),
  };
}

function expectedIntent(bot: BattleParticipant, move: BattleMove): BattleIntent {
  const legalMoves = bot.moves.filter((candidate) => {
    if (candidate.kind === 'signature') return bot.energy >= candidate.energyCost;
    if (candidate.kind === 'heal') {
      return !bot.healUsed && bot.currentHp < bot.maxHp;
    }
    return true;
  });
  const building = legalMoves.filter(
    (candidate) => candidate.kind === 'quick' || candidate.kind === 'guard'
  );
  const committed = legalMoves.filter(
    (candidate) => candidate.kind === 'signature' || candidate.kind === 'heal'
  );
  if (committed.length === 0 && building.length >= 2) return 'building';
  if (
    building.length >= 2 &&
    committed.some((candidate) => candidate.kind === 'signature') &&
    committed.some((candidate) => candidate.kind === 'heal')
  ) {
    return committed.some((candidate) => candidate.id === move.id)
      ? 'committed'
      : 'building';
  }
  return 'uncertain';
}

function validateSessionInvariants(session: BattleSession, documentId: string): void {
  if (session.id !== documentId) invalid(documentId, 'id must match the document path');
  if (session.player.id !== session.avatarId) {
    invalid(documentId, 'player.id must match avatarId');
  }
  if (session.player.id === session.bot.id) {
    invalid(documentId, 'player and bot IDs must differ');
  }
  assertFixedBot(session.bot, documentId);

  if (Date.parse(session.updatedAt) < Date.parse(session.createdAt)) {
    invalid(documentId, 'updatedAt must not precede createdAt');
  }
  if (session.log[0]?.type !== 'battle_started') {
    invalid(documentId, 'log must start with battle_started');
  }
  if (session.log.filter((event) => event.type === 'battle_started').length !== 1) {
    invalid(documentId, 'log must contain exactly one battle_started event');
  }

  const intentEvents = session.log.filter(
    (event) => event.type === 'bot_intent_prepared'
  );
  const damagingMoves = session.log.filter((event) => {
    if (event.type !== 'move_used' || event.actor === 'system' || !event.moveId) {
      return false;
    }
    const participant = event.actor === 'player' ? session.player : session.bot;
    const move = participant.moves.find((candidate) => candidate.id === event.moveId);
    return move?.kind === 'quick' || move?.kind === 'signature';
  });
  if (session.rngStep !== intentEvents.length + damagingMoves.length) {
    invalid(documentId, 'rngStep is inconsistent with RNG-consuming events');
  }
  let expectedRngState = session.rngSeed;
  for (let step = 0; step < session.rngStep; step += 1) {
    expectedRngState = nextRandom(expectedRngState).state;
  }
  if (session.rngState !== expectedRngState) {
    invalid(documentId, 'rngState does not match rngSeed and rngStep');
  }

  for (let index = 0; index < session.log.length; index += 1) {
    const event = session.log[index];
    const isOutcome =
      event.type === 'move_missed' ||
      event.type === 'damage_dealt' ||
      event.type === 'healed';
    if (!isOutcome) continue;
    const previous = session.log[index - 1];
    if (
      !previous ||
      previous.type !== 'move_used' ||
      previous.turnNumber !== event.turnNumber ||
      previous.actor !== event.actor ||
      previous.moveId !== event.moveId ||
      event.actor === 'system' ||
      !event.moveId
    ) {
      invalid(documentId, `log[${index}] is not paired with its move_used event`);
    }
    const participant = event.actor === 'player' ? session.player : session.bot;
    const move = participant.moves.find((candidate) => candidate.id === event.moveId)!;
    const damaging = move.kind === 'quick' || move.kind === 'signature';
    if (
      ((event.type === 'move_missed' || event.type === 'damage_dealt') &&
        !damaging) ||
      (event.type === 'healed' && move.kind !== 'heal')
    ) {
      invalid(documentId, `log[${index}] is illegal for the selected move kind`);
    }
  }

  for (let index = 0; index < session.log.length; index += 1) {
    const event = session.log[index];
    if (event.type !== 'move_used' || event.actor === 'system' || !event.moveId) {
      continue;
    }
    const participant = event.actor === 'player' ? session.player : session.bot;
    const move = participant.moves.find((candidate) => candidate.id === event.moveId)!;
    if (move.kind === 'guard') continue;
    const outcome = session.log[index + 1];
    const expectedTypes =
      move.kind === 'heal' ? ['healed'] : ['move_missed', 'damage_dealt'];
    if (
      !outcome ||
      !expectedTypes.includes(outcome.type) ||
      outcome.turnNumber !== event.turnNumber ||
      outcome.actor !== event.actor ||
      outcome.moveId !== event.moveId
    ) {
      invalid(documentId, `log[${index}] does not have a legal move outcome`);
    }
  }

  const terminalTypes = ['battle_won', 'battle_lost', 'battle_abandoned'] as const;
  const terminalEvents = session.log.filter((event) =>
    terminalTypes.includes(event.type as (typeof terminalTypes)[number])
  );
  if (session.status === 'active') {
    if (
      session.phase !== 'PLAYER_ACTION' ||
      session.pendingBotMoveId === null ||
      session.botIntent === null ||
      session.completedAt !== null ||
      session.rewardApplied ||
      session.xpAwarded !== 0 ||
      session.player.currentHp <= 0 ||
      session.bot.currentHp <= 0 ||
      terminalEvents.length !== 0
    ) {
      invalid(documentId, 'active status fields are inconsistent');
    }
    const pendingMove = session.bot.moves.find(
      (move) => move.id === session.pendingBotMoveId
    );
    if (!pendingMove) invalid(documentId, 'pendingBotMoveId is not a bot move');
    if (
      (pendingMove.kind === 'signature' &&
        session.bot.energy < pendingMove.energyCost) ||
      (pendingMove.kind === 'heal' &&
        (session.bot.healUsed || session.bot.currentHp >= session.bot.maxHp))
    ) {
      invalid(documentId, 'pending bot move is illegal for the bot state');
    }
    if (expectedIntent(session.bot, pendingMove) !== session.botIntent) {
      invalid(documentId, 'botIntent is inconsistent with the pending move');
    }
    const currentIntent = [...intentEvents]
      .reverse()
      .find((event) => event.turnNumber === session.turnNumber);
    if (!currentIntent || currentIntent.intent !== session.botIntent) {
      invalid(documentId, 'botIntent must match the current turn intent event');
    }
    return;
  }

  if (
    session.phase !== 'TERMINAL' ||
    session.pendingBotMoveId !== null ||
    session.botIntent !== null ||
    session.completedAt === null ||
    session.completedAt !== session.updatedAt
  ) {
    invalid(documentId, 'terminal status fields are inconsistent');
  }
  const expectedTerminalType =
    session.status === 'won'
      ? 'battle_won'
      : session.status === 'lost'
        ? 'battle_lost'
        : 'battle_abandoned';
  if (
    terminalEvents.length !== 1 ||
    terminalEvents[0].type !== expectedTerminalType ||
    session.log.at(-1)?.type !== expectedTerminalType
  ) {
    invalid(documentId, 'terminal event does not match status');
  }

  if (session.status === 'won') {
    if (
      session.bot.currentHp !== 0 ||
      session.player.currentHp <= 0 ||
      !session.rewardApplied ||
      session.xpAwarded !== 20
    ) {
      invalid(documentId, 'won status has inconsistent HP or reward fields');
    }
  } else if (session.status === 'lost') {
    if (
      session.player.currentHp !== 0 ||
      session.bot.currentHp <= 0 ||
      !session.rewardApplied ||
      session.xpAwarded !== 5
    ) {
      invalid(documentId, 'lost status has inconsistent HP or reward fields');
    }
  } else if (
    session.player.currentHp <= 0 ||
    session.bot.currentHp <= 0 ||
    session.rewardApplied ||
    session.xpAwarded !== 0
  ) {
    invalid(documentId, 'abandoned status has inconsistent HP or reward fields');
  }
}

function decodeBattleSessionUnsafe(snapshot: FirestoreSnapshotLike): BattleSession {
  const data = requireDocumentData(snapshot, COLLECTION);
  const id = requireString(data.id, 'id', COLLECTION, snapshot.id);
  const userId = requireString(data.userId, 'userId', COLLECTION, snapshot.id);
  const avatarId = requireString(data.avatarId, 'avatarId', COLLECTION, snapshot.id);
  const status = requireOneOf<BattleStatus>(
    data.status,
    BATTLE_STATUSES,
    'status',
    snapshot.id
  );
  const phase = requireOneOf<BattlePhase>(
    data.phase,
    BATTLE_PHASES,
    'phase',
    snapshot.id
  );
  const turnNumber = requireSafeInteger(
    data.turnNumber,
    'turnNumber',
    snapshot.id,
    1
  );
  const player = decodeParticipant(data.player, 'player', snapshot.id);
  const bot = decodeParticipant(data.bot, 'bot', snapshot.id);
  const pendingBotMoveId = requireNullableString(
    data.pendingBotMoveId,
    'pendingBotMoveId',
    snapshot.id
  );
  const botIntent = requireNullableIntent(
    data.botIntent,
    'botIntent',
    snapshot.id
  );
  const rngSeed = requireSafeInteger(data.rngSeed, 'rngSeed', snapshot.id, 0, MAX_UINT32);
  const rngState = requireSafeInteger(
    data.rngState,
    'rngState',
    snapshot.id,
    0,
    MAX_UINT32
  );
  const rngStep = requireSafeInteger(data.rngStep, 'rngStep', snapshot.id, 0);
  if (data.moveCatalogVersion !== 'v1') {
    invalid(snapshot.id, 'moveCatalogVersion must be v1');
  }
  if (data.npcPresetVersion !== 'thornback-v1') {
    invalid(snapshot.id, 'npcPresetVersion must be thornback-v1');
  }
  if (!Array.isArray(data.log) || data.log.length === 0) {
    invalid(snapshot.id, 'log must be a non-empty array');
  }
  const participants = { player, bot };
  const log = data.log.map((event, index) =>
    decodeEvent(event, index, turnNumber, participants, snapshot.id)
  );
  const rewardApplied = requireBoolean(
    data.rewardApplied,
    'rewardApplied',
    COLLECTION,
    snapshot.id
  );
  const xpAwarded = requireSafeInteger(data.xpAwarded, 'xpAwarded', snapshot.id, 0);
  const createdAt = normalizeRequiredTimestamp(
    data.createdAt,
    'createdAt',
    COLLECTION,
    snapshot.id
  );
  const updatedAt = normalizeRequiredTimestamp(
    data.updatedAt,
    'updatedAt',
    COLLECTION,
    snapshot.id
  );
  const completedAt = requireNullableTimestamp(
    data.completedAt,
    'completedAt',
    snapshot.id
  );

  const session: BattleSession = {
    id,
    userId,
    avatarId,
    status,
    phase,
    turnNumber,
    player,
    bot,
    pendingBotMoveId,
    botIntent,
    rngSeed,
    rngState,
    rngStep,
    moveCatalogVersion: 'v1',
    npcPresetVersion: 'thornback-v1',
    log,
    rewardApplied,
    xpAwarded,
    createdAt,
    updatedAt,
    completedAt,
  };
  validateSessionInvariants(session, snapshot.id);
  return session;
}

export function decodeBattleSession(snapshot: FirestoreSnapshotLike): BattleSession {
  try {
    return decodeBattleSessionUnsafe(snapshot);
  } catch (error) {
    if (error instanceof BattleRepositoryError) throw error;
    const message =
      error instanceof Error
        ? error.message
        : invalidFirestoreDocument(COLLECTION, snapshot.id, 'unknown decoder failure')
            .message;
    throw new BattleRepositoryError('invalid_battle_document', 500, message);
  }
}

function repositoryError(code: string, status: number, message: string) {
  return new BattleRepositoryError(code, status, message);
}

function battleNotFound(): BattleRepositoryError {
  return repositoryError('battle_not_found', 404, 'Battle session was not found.');
}

function battleNotActive(): BattleRepositoryError {
  return repositoryError('battle_not_active', 409, 'Battle session is already terminal.');
}

function transitionTimestamp(previous: string, clock: () => Date): string {
  const candidate = clock();
  const candidateMilliseconds = candidate instanceof Date ? candidate.getTime() : Number.NaN;
  if (!Number.isFinite(candidateMilliseconds)) {
    throw repositoryError('invalid_repository_clock', 500, 'Battle clock is invalid.');
  }
  return new Date(Math.max(candidateMilliseconds, Date.parse(previous) + 1)).toISOString();
}

function profileProgressionValue(
  value: unknown,
  fieldName: keyof ProfileProgression,
  documentId: string
): number {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw repositoryError(
      'battle_profile_invalid',
      500,
      `Invalid Firestore users document ${documentId}: ${fieldName} must be a non-negative safe integer.`
    );
  }
  return value;
}

function decodeProfileProgression(
  snapshot: FirestoreSnapshotLike
): ProfileProgression {
  const data = snapshot.data();
  if (!data) {
    throw repositoryError(
      'battle_profile_missing',
      409,
      'Battle reward profile is missing.'
    );
  }
  return {
    pveXp: profileProgressionValue(data.pveXp, 'pveXp', snapshot.id),
    pveWins: profileProgressionValue(data.pveWins, 'pveWins', snapshot.id),
    pveLosses: profileProgressionValue(data.pveLosses, 'pveLosses', snapshot.id),
    currentPveWinStreak: profileProgressionValue(
      data.currentPveWinStreak,
      'currentPveWinStreak',
      snapshot.id
    ),
    bestPveWinStreak: profileProgressionValue(
      data.bestPveWinStreak,
      'bestPveWinStreak',
      snapshot.id
    ),
  };
}

function safeProgressionSum(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw repositoryError(
      'battle_profile_invalid',
      500,
      'Battle progression exceeds the supported integer range.'
    );
  }
  return result;
}

function mapEngineError(error: unknown): never {
  if (error instanceof BattleRepositoryError) throw error;
  const code = error instanceof Error ? error.message : 'battle_action_failed';
  const invalidActionCodes = new Set([
    'invalid_move',
    'insufficient_energy',
    'heal_already_used',
    'full_health',
  ]);
  if (invalidActionCodes.has(code)) {
    throw repositoryError(code, 400, 'Battle action is invalid.');
  }
  throw repositoryError('battle_resolution_failed', 500, 'Battle resolution failed.');
}

export function createBattleRepository(
  options: BattleRepositoryOptions = {}
): BattleRepository {
  const clock = options.clock ?? (() => new Date());

  return {
    async create(session): Promise<BattleSession> {
      const decoded = decodeBattleSession({
        id: session.id,
        data: () => session,
      });
      const reference = getDb().collection(COLLECTION).doc(decoded.id);
      await reference.create(decoded);
      return decoded;
    },

    async getOwned(userId, sessionId): Promise<BattleSession | null> {
      const snapshot = await getDb().collection(COLLECTION).doc(sessionId).get();
      if (!snapshot.exists) return null;
      const session = decodeBattleSession(snapshot);
      return session.userId === userId ? session : null;
    },

    async applyAction(userId, sessionId, moveId, expectedTurn) {
      if (!Number.isSafeInteger(expectedTurn) || expectedTurn < 1) {
        throw repositoryError(
          'invalid_expected_turn',
          400,
          'Expected turn must be a positive integer.'
        );
      }
      const db = getDb();
      const battleReference = db.collection(COLLECTION).doc(sessionId);
      const profileReference = db.collection('users').doc(userId);

      return db.runTransaction(async (transaction): Promise<BattleActionResult> => {
        const battleSnapshot = await transaction.get(battleReference);
        if (!battleSnapshot.exists) throw battleNotFound();
        const session = decodeBattleSession(battleSnapshot);
        if (session.userId !== userId) throw battleNotFound();
        if (session.status !== 'active') throw battleNotActive();
        if (expectedTurn < session.turnNumber) return { session, stale: true };
        if (expectedTurn > session.turnNumber) {
          throw repositoryError(
            'future_turn',
            409,
            'Expected turn is ahead of the stored battle.'
          );
        }

        const transitionAt = transitionTimestamp(session.updatedAt, clock);
        let resolved: BattleSession;
        try {
          resolved = resolvePlayerAction(session, moveId, { transitionAt });
        } catch (error) {
          mapEngineError(error);
        }

        if (resolved.status === 'won' || resolved.status === 'lost') {
          const profileSnapshot = await transaction.get(profileReference);
          if (!profileSnapshot.exists) {
            throw repositoryError(
              'battle_profile_missing',
              409,
              'Battle reward profile is missing.'
            );
          }
          const profile = decodeProfileProgression(profileSnapshot);
          const delta = calculateProgression(resolved.status);
          const currentPveWinStreak =
            delta.streak === 'increment'
              ? safeProgressionSum(profile.currentPveWinStreak, 1)
              : 0;
          const progression: ProfileProgression = {
            pveXp: safeProgressionSum(profile.pveXp, delta.xp),
            pveWins: safeProgressionSum(profile.pveWins, delta.wins),
            pveLosses: safeProgressionSum(profile.pveLosses, delta.losses),
            currentPveWinStreak,
            bestPveWinStreak: Math.max(
              profile.bestPveWinStreak,
              currentPveWinStreak
            ),
          };
          resolved = {
            ...resolved,
            xpAwarded: delta.xp,
            rewardApplied: true,
          };
          transaction.update(profileReference, {
            ...progression,
            updatedAt: transitionAt,
          });
        }

        transaction.set(battleReference, resolved);
        return { session: resolved, stale: false };
      });
    },

    async abandon(userId, sessionId): Promise<BattleSession> {
      const db = getDb();
      const battleReference = db.collection(COLLECTION).doc(sessionId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(battleReference);
        if (!snapshot.exists) throw battleNotFound();
        const session = decodeBattleSession(snapshot);
        if (session.userId !== userId) throw battleNotFound();
        if (session.status === 'abandoned') return session;
        if (session.status !== 'active') throw battleNotActive();

        const transitionAt = transitionTimestamp(session.updatedAt, clock);
        let abandoned: BattleSession;
        try {
          abandoned = abandonBattle(session, { transitionAt });
        } catch (error) {
          mapEngineError(error);
        }
        transaction.set(battleReference, abandoned);
        return abandoned;
      });
    },
  };
}

const firestoreBattleRepository = createBattleRepository();

export default firestoreBattleRepository;
