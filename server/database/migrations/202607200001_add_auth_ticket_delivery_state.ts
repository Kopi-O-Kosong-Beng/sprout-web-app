import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.integer('resetOtpFailedAttempts').notNullable().defaultTo(0);
  });
  await knex.schema.alterTable('query_tickets', (t) => {
    t.string('submitterEmailStatus').notNullable().defaultTo('pending');
    t.string('adminEmailStatus').notNullable().defaultTo('pending');
    t.text('lastEmailError').nullable();
    t.datetime('notificationUpdatedAt').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('query_tickets', (t) => {
    t.dropColumn('submitterEmailStatus');
    t.dropColumn('adminEmailStatus');
    t.dropColumn('lastEmailError');
    t.dropColumn('notificationUpdatedAt');
  });
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('resetOtpFailedAttempts');
  });
}
