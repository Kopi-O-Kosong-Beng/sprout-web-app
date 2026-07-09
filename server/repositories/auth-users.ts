import type { AuthUserRepository } from '../models/auth';

function loadRepository(): AuthUserRepository {
  if ((process.env.DATASTORE ?? 'sqlite') === 'firestore') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('./auth-user.repo.firestore') as { default: AuthUserRepository })
      .default;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (require('./auth-user.repo.sqlite') as { default: AuthUserRepository })
    .default;
}

const authUserRepository: AuthUserRepository = loadRepository();

export default authUserRepository;
