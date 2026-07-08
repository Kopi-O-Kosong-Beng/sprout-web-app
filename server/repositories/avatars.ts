/** Avatar repository selector — datastore seam (see repositories/tickets.ts).
 *  Lazy require() keeps firebase-admin out of SQLite/Jest processes. */
import type { AvatarRepository } from '../models/avatar';

function loadRepository(): AvatarRepository {
  if ((process.env.DATASTORE ?? 'sqlite') === 'firestore') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('./avatar.repo.firestore') as { default: AvatarRepository }).default;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('./avatar.repo.sqlite') as { default: AvatarRepository }).default;
}

const avatarRepository: AvatarRepository = loadRepository();

export default avatarRepository;
