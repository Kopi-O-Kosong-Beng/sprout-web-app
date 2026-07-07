/** Ticket repository selector — the ONLY seam between business logic and the
 *  datastore. Services depend on this module, never on Knex or Firestore
 *  directly, so the datastore swaps without touching controllers/services.
 *
 *  DATASTORE=firestore → Firebase (final architecture per Master.docx)
 *  DATASTORE=sqlite    → local fallback until the Firebase project exists,
 *                        and the zero-setup path for unit tests.
 */
const DATASTORE = process.env.DATASTORE || 'sqlite';

module.exports =
  DATASTORE === 'firestore'
    ? require('./ticket.repo.firestore')
    : require('./ticket.repo.sqlite');
