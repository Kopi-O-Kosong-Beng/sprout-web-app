/** PVE battle sessions — Req 8, tasks.md 2.5 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('battle_sessions', (t) => {
    t.uuid('sessionId').primary();
    t.uuid('userId')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    t.uuid('userAvatarId').notNullable();
    t.json('npcAvatar').notNullable();
    t.integer('userCurrentHp').notNullable();
    t.integer('npcCurrentHp').notNullable();
    t.string('turn').notNullable().defaultTo('user'); // 'user' | 'npc'
    t.string('status').notNullable().defaultTo('active'); // 'active' | 'won' | 'lost'
    t.json('log').notNullable().defaultTo('[]');
    t.datetime('startedAt').notNullable().defaultTo(knex.fn.now());
    t.datetime('endedAt').nullable();
    t.index('userId');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('battle_sessions');
}
