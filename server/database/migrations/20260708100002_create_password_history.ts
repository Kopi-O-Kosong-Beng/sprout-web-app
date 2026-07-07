/** Password history — Req 3.9/3.10 (reject last-3 reuse on reset), tasks.md 2.9 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('password_history', (t) => {
    t.uuid('id').primary();
    t.uuid('userId')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    t.string('passwordHash').notNullable();
    t.datetime('changedAt').notNullable().defaultTo(knex.fn.now());
    t.index('userId');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('password_history');
}
