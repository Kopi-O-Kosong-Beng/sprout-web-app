const knex = require('knex');
const config = require('../knexfile');

// Single shared Knex instance — all data access goes through here (Req 10.3:
// parameterised queries via the query builder; no raw string interpolation).
const db = knex(config);

module.exports = db;
