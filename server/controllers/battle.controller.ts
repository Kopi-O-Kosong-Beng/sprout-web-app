import type { RequestHandler } from 'express';
import type {
  AvatarStats,
  BattleEvent,
  BattleEventType,
  BattleIntent,
  BattleMove,
  BattlePhase,
  BattleSession,
  BattleStatus,
} from '../models/battle';
import { MAX_BATTLE_ENERGY } from '../data/battle-rules';
import {
  abandonPveBattle,
  getPveBattle,
  startPveBattle,
  submitPveAction,
} from '../services/battle.service';

export interface PublicBattlePlayer {
  id: string;
  name: string;
  spriteUrl: string;
  stats: AvatarStats;
  currentHp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  healUsed: boolean;
  moves: BattleMove[];
}

export interface PublicBattleBot {
  id: string;
  name: string;
  spriteUrl: string;
  stats: AvatarStats;
  currentHp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  healUsed: boolean;
}

interface PublicBattleEventBase {
  turnNumber: number;
  type: BattleEventType;
  message: string;
  amount?: number;
}

export interface PublicBotBattleEvent extends PublicBattleEventBase {
  actor: 'bot';
  intent?: BattleIntent;
}

export interface PublicPlayerBattleEvent extends PublicBattleEventBase {
  actor: 'player';
  moveId?: string;
}

export interface PublicSystemBattleEvent extends PublicBattleEventBase {
  actor: 'system';
}

export type PublicBattleEvent =
  | PublicBotBattleEvent
  | PublicPlayerBattleEvent
  | PublicSystemBattleEvent;

export interface PublicBattleSession {
  id: string;
  avatarId: string;
  status: BattleStatus;
  phase: BattlePhase;
  turnNumber: number;
  player: PublicBattlePlayer;
  bot: PublicBattleBot;
  botIntent: BattleIntent | null;
  log: PublicBattleEvent[];
  xpAwarded: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

function serializeMove(move: BattleMove): BattleMove {
  return {
    id: move.id,
    name: move.name,
    kind: move.kind,
    power: move.power,
    accuracy: move.accuracy,
    energyGain: move.energyGain,
    energyCost: move.energyCost,
  };
}

function botEventMessage(event: BattleEvent): string {
  switch (event.type) {
    case 'bot_intent_prepared':
      return 'Opponent intent prepared.';
    case 'move_missed':
      return 'Opponent attack missed.';
    case 'damage_dealt':
      return `Opponent dealt ${event.amount ?? 0} damage.`;
    case 'healed':
      return `Opponent recovered ${event.amount ?? 0} HP.`;
    case 'bot_action_skipped':
      return 'Opponent fainted before acting.';
    default:
      return 'Opponent acted.';
  }
}

function serializeEvent(event: BattleEvent): PublicBattleEvent {
  const base = {
    turnNumber: event.turnNumber,
    type: event.type,
    ...(event.amount !== undefined ? { amount: event.amount } : {}),
  };
  if (event.actor === 'bot') {
    return {
      ...base,
      actor: 'bot',
      message: botEventMessage(event),
      ...(event.type === 'bot_intent_prepared' && event.intent !== undefined
        ? { intent: event.intent }
        : {}),
    };
  }
  if (event.actor === 'player') {
    return {
      ...base,
      actor: 'player',
      message: event.message,
      ...(event.moveId !== undefined ? { moveId: event.moveId } : {}),
    };
  }
  return { ...base, actor: 'system', message: event.message };
}

export function serializeBattleSession(
  session: BattleSession
): PublicBattleSession {
  const player = session.player;
  const bot = session.bot;
  return {
    id: session.id,
    avatarId: session.avatarId,
    status: session.status,
    phase: session.phase,
    turnNumber: session.turnNumber,
    player: {
      id: player.id,
      name: player.name,
      spriteUrl: player.spriteUrl,
      stats: { ...player.stats },
      currentHp: player.currentHp,
      maxHp: player.maxHp,
      energy: player.energy,
      maxEnergy: MAX_BATTLE_ENERGY,
      healUsed: player.healUsed,
      moves: player.moves.map(serializeMove),
    },
    bot: {
      id: bot.id,
      name: bot.name,
      spriteUrl: bot.spriteUrl,
      stats: { ...bot.stats },
      currentHp: bot.currentHp,
      maxHp: bot.maxHp,
      energy: bot.energy,
      maxEnergy: MAX_BATTLE_ENERGY,
      healUsed: bot.healUsed,
    },
    botIntent: session.botIntent,
    log: session.log.map(serializeEvent),
    xpAwarded: session.xpAwarded,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
  };
}

export const handleStartPve: RequestHandler = async (req, res, next) => {
  try {
    const session = await startPveBattle(req.user!.uid, req.body.avatarId);
    res.status(201).json(serializeBattleSession(session));
  } catch (error) {
    next(error);
  }
};

export const handleGetPve: RequestHandler = async (req, res, next) => {
  try {
    const session = await getPveBattle(req.user!.uid, req.params.sessionId);
    res.status(200).json(serializeBattleSession(session));
  } catch (error) {
    next(error);
  }
};

export const handlePveAction: RequestHandler = async (req, res, next) => {
  try {
    const result = await submitPveAction(
      req.user!.uid,
      req.params.sessionId,
      req.body.moveId,
      req.body.expectedTurn
    );
    res.status(200).json({
      session: serializeBattleSession(result.session),
      stale: result.stale,
    });
  } catch (error) {
    next(error);
  }
};

export const handleAbandonPve: RequestHandler = async (req, res, next) => {
  try {
    const session = await abandonPveBattle(req.user!.uid, req.params.sessionId);
    res.status(200).json(serializeBattleSession(session));
  } catch (error) {
    next(error);
  }
};
