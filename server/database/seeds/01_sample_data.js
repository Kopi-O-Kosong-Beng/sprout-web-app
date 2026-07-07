/** Local dev/test seed — tasks.md 2.7.
 *  Demo login: demo@sprout.app / Password123!   (verified)
 *  Second user: pending@sprout.app / Password123!   (unverified)
 */
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

const BCRYPT_COST = 12; // Req 11.8

const demoAvatars = (userId) => [
  {
    speciesName: 'Helianthus annuus',
    speciesFamily: 'Asteraceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 96, attack: 72, defense: 41, speed: 68 },
    metadata: { taxonomy: 'flower', confidence: 0.97, locality: { city: 'Singapore', venue: 'Gardens by the Bay' } },
  },
  {
    speciesName: 'Quercus robur',
    speciesFamily: 'Fagaceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 168, attack: 44, defense: 88, speed: 22 },
    metadata: { taxonomy: 'tree', confidence: 0.93, locality: { city: 'Singapore', venue: 'Botanic Gardens' } },
  },
  {
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 112, attack: 58, defense: 63, speed: 47 },
    metadata: { taxonomy: 'plant', confidence: 0.91 },
  },
  {
    speciesName: 'Ficus lyrata',
    speciesFamily: 'Moraceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 134, attack: 39, defense: 74, speed: 33 },
    metadata: { taxonomy: 'tree', confidence: 0.89 },
  },
  {
    speciesName: 'Amanita muscaria',
    speciesFamily: 'Amanitaceae',
    source: 'web',
    isTemporary: true, // TempAvatar from a web upload — 24h TTL
    stats: { hp: 74, attack: 91, defense: 28, speed: 55 },
    metadata: { taxonomy: 'fungus', confidence: 0.82 },
  },
].map((a) => ({
  id: randomUUID(),
  userId,
  spriteUrl: `/static/sprites/${a.speciesName.toLowerCase().replace(/\s+/g, '-')}.png`,
  discoveredAt: new Date().toISOString(),
  expiresAt: a.isTemporary ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
  ...a,
  stats: JSON.stringify(a.stats),
  metadata: JSON.stringify(a.metadata),
}));

exports.seed = async (knex) => {
  await knex('query_tickets').del();
  await knex('battle_sessions').del();
  await knex('avatar_records').del();
  await knex('password_history').del();
  await knex('users').del();

  const passwordHash = await bcrypt.hash('Password123!', BCRYPT_COST);
  const demoUserId = randomUUID();

  await knex('users').insert([
    {
      id: demoUserId,
      email: 'demo@sprout.app',
      passwordHash,
      displayName: 'DemoSprout',
      isVerified: true,
    },
    {
      id: randomUUID(),
      email: 'pending@sprout.app',
      passwordHash,
      displayName: 'PendingUser',
      isVerified: false,
      verificationToken: randomUUID(),
    },
  ]);

  await knex('avatar_records').insert(demoAvatars(demoUserId));
};
