import fc from 'fast-check';
import {
  abandonBattle,
  createBattle,
  resolvePlayerAction,
} from '../services/battle-engine';
import type { AvatarStats, BattleSession } from '../models/battle';

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

function assertSessionBounds(session: BattleSession): void {
  for (const participant of [session.player, session.bot]) {
    expect(participant.currentHp).toBeGreaterThanOrEqual(0);
    expect(participant.currentHp).toBeLessThanOrEqual(participant.maxHp);
    expect(participant.energy).toBeGreaterThanOrEqual(0);
    expect(participant.energy).toBeLessThanOrEqual(2);
  }

  if (session.phase === 'TERMINAL') {
    expect(['won', 'lost', 'abandoned'].filter((status) => status === session.status)).toHaveLength(
      1
    );
    expect(session.status).not.toBe('active');
  } else {
    expect(session.status).toBe('active');
    expect(session.phase).toBe('PLAYER_ACTION');
  }
}

describe('battle engine invariants', () => {
  it('keeps HP and Sun bounded with exactly one terminal outcome', () => {
    fc.assert(
      fc.property(
        statsArbitrary,
        fc.integer({ min: 0, max: 0xffff_ffff }),
        moveChoiceArbitrary,
        fc.boolean(),
        (stats, rngSeed, moveChoices, shouldAbandon) => {
          let session = createBattle({
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
            now: '2026-07-22T08:00:00.000Z',
          });
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

            session = resolvePlayerAction(session, moveId);
            assertSessionBounds(session);
          }

          if (shouldAbandon && session.status === 'active') {
            session = abandonBattle(session);
            assertSessionBounds(session);
          }
        }
      ),
      { numRuns: 1_000 }
    );
  });
});
