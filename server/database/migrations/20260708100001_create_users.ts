/** Users table — Req 1–3, tasks.md 2.3 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary();
    t.string('email').notNullable().unique();
    t.string('passwordHash').notNullable();
    t.string('displayName').notNullable();
    t.boolean('isVerified').notNullable().defaultTo(false);
    t.string('verificationToken').nullable();
    t.string('resetOtpHash').nullable();
    t.datetime('resetOtpExpiresAt').nullable();
    t.datetime('createdAt').notNullable().defaultTo(knex.fn.now());
    t.datetime('updatedAt').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
