/** Single shared Knex instance for the SQLite fallback — all SQL data access
 *  goes through here (Req 10.3: parameterised via the query builder). */
import knex from 'knex';
import config from '../knexfile';

const db = knex(config);

export default db;
