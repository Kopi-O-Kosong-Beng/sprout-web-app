import type { AvatarStats } from './avatar';

export type { AvatarStats } from './avatar';

export type BattleStatus = 'active' | 'won' | 'lost' | 'abandoned';
export type BattlePhase =
  | 'PREPARE_BOT_INTENT'
  | 'PLAYER_ACTION'
  | 'RESOLVE_ROUND'
  | 'CHECK_RESULT'
  | 'TERMINAL';
export type BattleIntent = 'attacking' | 'guarding' | 'charging' | 'recovering';
export type MoveKind = 'quick' | 'guard' | 'signature' | 'heal';
export type BattleActor = 'player' | 'bot' | 'system';
export type BattleEventType =
  | 'battle_started'
  | 'bot_intent_prepared'
  | 'move_used'
  | 'move_missed'
  | 'damage_dealt'
  | 'healed'
  | 'player_action_skipped'
  | 'bot_action_skipped'
  | 'battle_won'
  | 'battle_lost'
  | 'battle_abandoned';

export interface BattleMove {
  id: string;
  name: string;
  kind: MoveKind;
  power: number;
  accuracy: number;
  energyGain: number;
  energyCost: number;
}

export interface BattleParticipant {
  id: string;
  name: string;
  spriteUrl: string;
  stats: AvatarStats;
  currentHp: number;
  maxHp: number;
  energy: number;
  healUsed: boolean;
  moves: BattleMove[];
}

export interface BattleEvent {
  turnNumber: number;
  type: BattleEventType;
  actor: BattleActor;
  message: string;
  moveId?: string;
  amount?: number;
  intent?: BattleIntent;
}

export interface BattleSession {
  id: string;
  userId: string;
  avatarId: string;
  status: BattleStatus;
  phase: BattlePhase;
  turnNumber: number;
  player: BattleParticipant;
  bot: BattleParticipant;
  pendingBotMoveId: string | null;
  botIntent: BattleIntent | null;
  rngSeed: number;
  rngState: number;
  rngStep: number;
  moveCatalogVersion: 'v1';
  npcPresetVersion: 'thornback-v1';
  log: BattleEvent[];
  rewardApplied: boolean;
  xpAwarded: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AvatarBattleInput {
  id: string;
  name: string;
  speciesFamily: string | null;
  spriteUrl: string;
  stats: AvatarStats;
}

export interface CreateBattleInput {
  id: string;
  userId: string;
  avatarId: string;
  player: AvatarBattleInput;
  rngSeed: number;
  now: string;
}

export type TerminalBattleStatus = Exclude<BattleStatus, 'active'>;
export type StreakProgression = 'increment' | 'reset' | 'unchanged';

export interface ProgressionDelta {
  xp: number;
  wins: number;
  losses: number;
  streak: StreakProgression;
}
