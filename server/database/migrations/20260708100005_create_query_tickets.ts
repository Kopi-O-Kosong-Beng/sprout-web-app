/** Query tickets — Req 9, tasks.md 2.6. refNumber format SPR-YYYYMMDD-NNNN. */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('query_tickets', (t) => {
    t.uuid('id').primary();
    t.string('refNumber').notNullable().unique();
    t.string('name').notNullable();
    t.string('email').notNullable();
    t.string('category').notNullable(); // general|bug|billing|partnership|other
    t.text('message').notNullable(); // <= 2000 chars, enforced at validation layer
    t.string('status').notNullable().defaultTo('open');
    t.datetime('createdAt').notNullable().defaultTo(knex.fn.now());
    t.datetime('updatedAt').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('query_tickets');
}
