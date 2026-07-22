import fc from 'fast-check';
import {
  abandonBattle,
  createBattle,
  resolvePlayerAction,
} from '../services/battle-engine';
import type {
  AvatarStats,
  BattleSession,
  TerminalBattleStatus,
} from '../models/battle';

const START_AT = '2026-07-22T08:00:00.000Z';
const START_MILLISECONDS = Date.parse(START_AT);
const TERMINAL_STATUSES: TerminalBattleStatus[] = ['won', 'lost', 'abandoned'];

const statsArbitrary: fc.Arbitrary<AvatarStats> = fc.record({
  hp: fc.integer({ min: 25, max: 250 }),
  attack: fc.integer({ min: 0, max: 200 }),
  defense: fc.integer({ min: 0, max: 200 }),
  speed: fc.integer({ min: 0, max: 200 }),
});

const moveChoiceArbitrary = fc.array(fc.integer({ min: 0, max: 3 }), {
  minLength: 1,
  maxLength: 20,
});

function transitionAt(step: number): { transitionAt: string } {
  return { transitionAt: new Date(START_MILLISECONDS + step * 1_000).toISOString() };
}

function createGeneratedBattle(stats: AvatarStats, rngSeed: number): BattleSession {
  return createBattle({
    id: 'property-battle',
    userId: 'property-user',
    avatarId: 'property-avatar',
    player: {
      id: 'property-avatar',
      name: 'Generated plant',
      speciesFamily: null,
      spriteUrl: '/generated.png',
      stats,
    },
    rngSeed,
    now: START_AT,
  });
}

function assertSessionBounds(session: BattleSession): void {
  for (const participant of [session.player, session.bot]) {
    expect(participant.currentHp).toBeGreaterThanOrEqual(0);
    expect(participant.currentHp).toBeLessThanOrEqual(participant.maxHp);
    expect(participant.energy).toBeGreaterThanOrEqual(0);
    expect(participant.energy).toBeLessThanOrEqual(2);
  }

  const terminalEvents = session.log
    .filter((event) =>
      ['battle_won', 'battle_lost', 'battle_abandoned'].includes(event.type)
    )
    .map((event) => event.type);

  switch (session.status) {
    case 'active':
      expect(session.phase).toBe('PLAYER_ACTION');
      expect(session.completedAt).toBeNull();
      expect(terminalEvents).toEqual([]);
      break;
    case 'won':
      expect(session.phase).toBe('TERMINAL');
      expect(session.bot.currentHp).toBe(0);
      expect(session.player.currentHp).toBeGreaterThan(0);
      expect(session.completedAt).toBe(session.updatedAt);
      expect(terminalEvents).toEqual(['battle_won']);
      break;
    case 'lost':
      expect(session.phase).toBe('TERMINAL');
      expect(session.player.currentHp).toBe(0);
      expect(session.completedAt).toBe(session.updatedAt);
      expect(terminalEvents).toEqual(['battle_lost']);
      break;
    case 'abandoned':
      expect(session.phase).toBe('TERMINAL');
      expect(session.completedAt).toBe(session.updatedAt);
      expect(terminalEvents).toEqual(['battle_abandoned']);
      break;
  }
}

function forceTerminalOutcome(
  session: BattleSession,
  outcome: TerminalBattleStatus
): BattleSession {
  const transition = transitionAt(1);
  switch (outcome) {
    case 'won':
      return resolvePlayerAction(
        {
          ...session,
          bot: { ...session.bot, currentHp: 1 },
          pendingBotMoveId: 'guard',
          botIntent: 'uncertain',
        },
        'quick',
        transition
      );
    case 'lost':
      return resolvePlayerAction(
        {
          ...session,
          player: { ...session.player, currentHp: 1 },
          pendingBotMoveId: 'quick',
          botIntent: 'building',
        },
        'guard',
        transition
      );
    case 'abandoned':
      return abandonBattle(session, transition);
  }
}

describe('battle engine invariants', () => {
  it('keeps generated rounds bounded and gives every terminal status meaningful state', () => {
    fc.assert(
      fc.property(
        statsArbitrary,
        fc.integer({ min: 0, max: 0xffff_ffff }),
        moveChoiceArbitrary,
        (stats, rngSeed, moveChoices) => {
          let session = createGeneratedBattle(stats, rngSeed);
          let transitionStep = 1;
          assertSessionBounds(session);

          for (const choice of moveChoices) {
            if (session.status !== 'active') break;

            const requested = ['quick', 'guard', 'signature', 'photosynthesis'][choice];
            const canUseSignature = session.player.energy >= 2;
            const canHeal =
              !session.player.healUsed && session.player.currentHp < session.player.maxHp;
            const moveId =
              requested === 'signature' && !canUseSignature
                ? 'quick'
                : requested === 'photosynthesis' && !canHeal
                  ? 'quick'
                  : requested;
            const transition = transitionAt(transitionStep);

            session = resolvePlayerAction(session, moveId, transition);
            expect(session.updatedAt).toBe(transition.transitionAt);
            transitionStep += 1;
            assertSessionBounds(session);
          }

          for (const outcome of TERMINAL_STATUSES) {
            const terminal = forceTerminalOutcome(
              createGeneratedBattle(stats, rngSeed),
              outcome
            );
            expect(terminal.status).toBe(outcome);
            assertSessionBounds(terminal);
          }
        }
      ),
      { numRuns: 1_000 }
    );
  });
});
