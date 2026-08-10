import { randomBytes, randomUUID } from 'node:crypto';
import { isAvatarBattleEligible } from '../data/battle-eligibility';
import type { AvatarRecord, AvatarRepository } from '../models/avatar';
import type { BattleSession } from '../models/battle';
import avatarRepository from '../repositories/avatars';
import battleRepository, {
  BattleRepositoryError,
  type BattleActionResult,
  type BattleRepository,
} from '../repositories/battles';
import { createBattle } from './battle-engine';

const MAX_UINT32 = 0xffff_ffff;

export class BattleServiceError extends Error {
  readonly name = 'BattleServiceError';

  constructor(
    readonly code: string,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export interface BattleService {
  startPveBattle(userId: string, avatarId: string): Promise<BattleSession>;
  getPveBattle(userId: string, sessionId: string): Promise<BattleSession>;
  submitPveAction(
    userId: string,
    sessionId: string,
    moveId: string,
    expectedTurn: number
  ): Promise<BattleActionResult>;
  abandonPveBattle(userId: string, sessionId: string): Promise<BattleSession>;
}

export interface BattleServiceOptions {
  avatarRepository?: AvatarRepository;
  battleRepository?: BattleRepository;
  clock?: () => Date;
  generateSeed?: () => number;
  generateSessionId?: () => string;
}

interface StableErrorDefinition {
  status: number;
  message: string;
}

const REPOSITORY_ERROR_MAP: Readonly<Record<string, StableErrorDefinition>> = {
  battle_not_found: { status: 404, message: 'Battle session not found.' },
  battle_already_exists: { status: 409, message: 'Battle session already exists.' },
  battle_not_active: { status: 409, message: 'Battle session is already complete.' },
  future_turn: {
    status: 409,
    message: 'Expected turn is ahead of the current battle.',
  },
  battle_profile_missing: { status: 409, message: 'Battle profile is unavailable.' },
  invalid_expected_turn: { status: 400, message: 'Battle action is invalid.' },
  invalid_move: { status: 400, message: 'Battle action is invalid.' },
  insufficient_energy: { status: 400, message: 'Battle action is invalid.' },
  heal_already_used: { status: 400, message: 'Battle action is invalid.' },
  full_health: { status: 400, message: 'Battle action is invalid.' },
};

function avatarNotFound(): BattleServiceError {
  return new BattleServiceError('avatar_not_found', 404, 'Avatar not found.');
}

function battleNotFound(): BattleServiceError {
  return new BattleServiceError(
    'battle_not_found',
    404,
    'Battle session not found.'
  );
}

function internalServiceError(): BattleServiceError {
  return new BattleServiceError(
    'battle_service_unavailable',
    500,
    'Battle service is unavailable.'
  );
}

function mapServiceError(error: unknown): BattleServiceError {
  if (error instanceof BattleServiceError) return error;
  if (error instanceof BattleRepositoryError) {
    const stable = REPOSITORY_ERROR_MAP[error.code];
    if (stable) return new BattleServiceError(error.code, stable.status, stable.message);
  }
  return internalServiceError();
}

function secureUint32(): number {
  return randomBytes(4).readUInt32BE(0);
}

function validateSeed(seed: number): number {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_UINT32) {
    throw internalServiceError();
  }
  return seed;
}

function validateSessionId(sessionId: string): string {
  if (
    typeof sessionId !== 'string' ||
    sessionId.length < 1 ||
    sessionId.length > 128 ||
    sessionId.includes('/')
  ) {
    throw internalServiceError();
  }
  return sessionId;
}

function currentInstant(clock: () => Date): { date: Date; iso: string } {
  const date = clock();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw internalServiceError();
  }
  return { date, iso: date.toISOString() };
}

function avatarDisplayName(avatar: AvatarRecord): string {
  const candidate = avatar.metadata?.displayName;
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : avatar.speciesName;
}

export function createBattleService(
  options: BattleServiceOptions = {}
): BattleService {
  const avatars = options.avatarRepository ?? avatarRepository;
  const battles = options.battleRepository ?? battleRepository;
  const clock = options.clock ?? (() => new Date());
  const generateSeed = options.generateSeed ?? secureUint32;
  const generateSessionId = options.generateSessionId ?? randomUUID;

  return {
    async startPveBattle(userId, avatarId): Promise<BattleSession> {
      try {
        const avatar = await avatars.getOwned(userId, avatarId);
        if (!avatar) throw avatarNotFound();

        const now = currentInstant(clock);
        if (!isAvatarBattleEligible(avatar, now.date)) throw avatarNotFound();

        const session = createBattle({
          id: validateSessionId(generateSessionId()),
          userId,
          avatarId: avatar.id,
          player: {
            id: avatar.id,
            name: avatarDisplayName(avatar),
            speciesName: avatar.speciesName,
            speciesFamily: avatar.speciesFamily,
            spriteUrl: avatar.spriteUrl,
            stats: { ...avatar.stats },
          },
          rngSeed: validateSeed(generateSeed()),
          now: now.iso,
        });
        return await battles.create(session);
      } catch (error) {
        throw mapServiceError(error);
      }
    },

    async getPveBattle(userId, sessionId): Promise<BattleSession> {
      try {
        const session = await battles.getOwned(userId, sessionId);
        if (!session) throw battleNotFound();
        return session;
      } catch (error) {
        throw mapServiceError(error);
      }
    },

    async submitPveAction(userId, sessionId, moveId, expectedTurn) {
      try {
        return await battles.applyAction(userId, sessionId, moveId, expectedTurn);
      } catch (error) {
        throw mapServiceError(error);
      }
    },

    async abandonPveBattle(userId, sessionId): Promise<BattleSession> {
      try {
        return await battles.abandon(userId, sessionId);
      } catch (error) {
        throw mapServiceError(error);
      }
    },
  };
}

const battleService = createBattleService();

export const startPveBattle = battleService.startPveBattle;
export const getPveBattle = battleService.getPveBattle;
export const submitPveAction = battleService.submitPveAction;
export const abandonPveBattle = battleService.abandonPveBattle;
