/** Users table — Req 1–3, tasks.md 2.3 */
exports.up = (knex) =>
  knex.schema.createTable('users', (t) => {
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

exports.down = (knex) => knex.schema.dropTableIfExists('users');
