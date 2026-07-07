/** Password history — Req 3.9/3.10 (reject last-3 reuse on reset), tasks.md 2.9 */
exports.up = (knex) =>
  knex.schema.createTable('password_history', (t) => {
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

exports.down = (knex) => knex.schema.dropTableIfExists('password_history');
