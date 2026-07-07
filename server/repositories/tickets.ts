/** Ticket repository selector — the ONLY seam between business logic and the
 *  datastore. Services depend on this module (via the TicketRepository
 *  interface), never on Knex or Firestore directly, so the datastore swaps
 *  without touching controllers/services.
 *
 *  DATASTORE=firestore → Firebase (final architecture per Master.docx)
 *  DATASTORE=sqlite    → local fallback until the Firebase project exists,
 *                        and the zero-setup path for unit tests.
 *
 *  Impls are require()d lazily so SQLite-mode processes (dev without a key,
 *  Jest) never load firebase-admin and its ESM-only dependencies.
 */
import type { TicketRepository } from '../models/ticket';

function loadRepository(): TicketRepository {
  if ((process.env.DATASTORE ?? 'sqlite') === 'firestore') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('./ticket.repo.firestore') as { default: TicketRepository }).default;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('./ticket.repo.sqlite') as { default: TicketRepository }).default;
}

const ticketRepository: TicketRepository = loadRepository();

export default ticketRepository;
