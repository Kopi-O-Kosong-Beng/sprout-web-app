import type { RequestHandler } from 'express';
import type {
  AvatarStats,
  BattleEvent,
  BattleIntent,
  BattleMove,
  BattlePhase,
  BattleSession,
  BattleStatus,
} from '../models/battle';
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
  healUsed: boolean;
}

export interface PublicBattleSession {
  id: string;
  avatarId: string;
  status: BattleStatus;
  phase: BattlePhase;
  turnNumber: number;
  player: PublicBattlePlayer;
  bot: PublicBattleBot;
  botIntent: BattleIntent | null;
  moveCatalogVersion: 'v1';
  npcPresetVersion: 'thornback-v1';
  log: BattleEvent[];
  rewardApplied: boolean;
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

function serializeEvent(event: BattleEvent): BattleEvent {
  const serialized: BattleEvent = {
    turnNumber: event.turnNumber,
    type: event.type,
    actor: event.actor,
    message: event.message,
  };
  if (event.moveId !== undefined) serialized.moveId = event.moveId;
  if (event.amount !== undefined) serialized.amount = event.amount;
  if (event.intent !== undefined) serialized.intent = event.intent;
  return serialized;
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
      healUsed: bot.healUsed,
    },
    botIntent: session.botIntent,
    moveCatalogVersion: session.moveCatalogVersion,
    npcPresetVersion: session.npcPresetVersion,
    log: session.log.map(serializeEvent),
    rewardApplied: session.rewardApplied,
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
