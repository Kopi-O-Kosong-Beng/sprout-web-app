/** SQLite seed (Knex) — tasks.md 2.7. Shares its dataset with the Firestore
 *  seed via ../sample-data, so both datastores hold identical demo data. */
import bcrypt from 'bcrypt';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { SEED_USERS, buildAvatarRows } from '../sample-data';

const BCRYPT_COST = 12; // Req 11.8 (SQLite fallback keeps a password hash column)

export async function seed(knex: Knex): Promise<void> {
  await knex('query_tickets').del();
  await knex('battle_sessions').del();
  await knex('avatar_records').del();
  await knex('password_history').del();
  await knex('users').del();

  const passwordHash = await bcrypt.hash('Password123!', BCRYPT_COST);

  await knex('users').insert(
    SEED_USERS.map((u) => ({
      id: u.id,
      email: u.email,
      passwordHash,
      displayName: u.displayName,
      isVerified: u.isVerified,
    }))
  );
  // an extra unverified user for auth testing later
  await knex('users').insert({
    id: randomUUID(),
    email: 'pending@sprout.app',
    passwordHash,
    displayName: 'PendingUser',
    isVerified: false,
    verificationToken: randomUUID(),
  });

  await knex('avatar_records').insert(
    buildAvatarRows().map((a) => ({
      ...a,
      stats: JSON.stringify(a.stats),
      metadata: JSON.stringify(a.metadata),
    }))
  );
}
