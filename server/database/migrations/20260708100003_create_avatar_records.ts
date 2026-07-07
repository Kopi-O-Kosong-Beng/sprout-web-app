/** Avatar records — Req 5/6/10, tasks.md 2.4. One row per avatar (Pokédex model);
 *  source + isTemporary carry the web-upload anti-abuse policy. */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('avatar_records', (t) => {
    t.uuid('id').primary();
    t.uuid('userId')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    t.string('speciesName').notNullable();
    t.string('speciesFamily').nullable();
    t.string('spriteUrl').notNullable();
    t.datetime('discoveredAt').notNullable().defaultTo(knex.fn.now());
    t.string('source').notNullable().defaultTo('web'); // 'mobile' | 'web'
    t.boolean('isTemporary').notNullable().defaultTo(false);
    t.datetime('expiresAt').nullable(); // TempAvatar: now + 24h
    t.json('stats').notNullable(); // {hp, attack, defense, speed}
    t.json('metadata').nullable(); // taxonomy, confidence, optional locality
    t.index('userId');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('avatar_records');
}
