# Firestore-Only Archive and PVE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove SQLite after safely reconciling active profiles, make Firestore the only application datastore, connect Archive to owned records with an environment-gated demo toggle, and deliver a persisted server-authoritative PVE battle.

**Architecture:** Firebase Authentication remains the identity authority and Firestore becomes the only database. Archive and PVE use verified bearer-token APIs; Firestore transactions enforce avatar/session ownership, expected-turn idempotency, seeded bot behavior, and one-time rewards. Pure battle functions remain independent of Express and Firebase so the mechanics receive fast unit and property tests, while repository and route behavior run against Firebase Emulator.

**Tech Stack:** Node.js 22, TypeScript, Express, Firebase Admin SDK, Firebase Authentication, Cloud Firestore, Firebase Emulator Suite, Joi, React 19, React Router, Axios, Jest, Supertest, fast-check, Vitest, React Testing Library.

## Global Constraints

- Never write automated tests to the production Firebase project.
- Run all server work with Node.js 22.x.
- Migrate active Firebase-backed local profiles before deleting SQLite files or dependencies.
- Do not migrate a local profile whose Firebase Authentication UID no longer exists.
- Never overwrite an existing Firestore profile during reconciliation.
- Clear reset OTP hash, expiry, and failed-attempt fields during reconciliation.
- Firebase and the server remain authoritative for authentication, ownership, battle state, RNG, and rewards.
- Demo mutation requires `ENABLE_DEMO_TOOLS=true`; the UI additionally requires `VITE_ENABLE_DEMO_TOOLS=true`.
- Demo removal may delete only caller-owned `checkoff3-v1` demo documents.
- Battle requests carry `expectedTurn`; retries cannot duplicate damage or XP.
- Win awards 20 PVE XP, loss awards 5 PVE XP, and abandon awards none.
- No PVP, switching, leaderboard, lasting status effects, or XP-based combat scaling in this increment.
- Do not add any co-author trailer to commits.

---

## File Structure

### Transitional migration

- `server/scripts/reconcile-sqlite-to-firestore.ts`: temporary dry-run/apply CLI used before SQLite removal, then deleted after evidence is recorded.
- `server/tests/reconcile-sqlite-to-firestore.test.ts`: temporary pure reconciliation-planner tests, deleted with the migration CLI.
- `docs/checkoff3/firestore-migration-evidence.md`: redacted counts, commands, and verification outcome.

### Firebase-only backend

- `firebase.json`: Firestore Emulator configuration.
- `server/tests/setup-env.ts`: emulator-only test environment.
- `server/tests/firestore-test-utils.ts`: collection cleanup and fixture helpers.
- `server/repositories/auth-users.ts`: direct Firestore auth-profile repository.
- `server/repositories/avatars.ts`: direct Firestore archive and demo repository.
- `server/repositories/tickets.ts`: direct Firestore ticket repository.
- `server/data/demo-avatar-templates.ts`: stable five-item demo catalogue and deterministic document IDs.
- `server/scripts/seed-firestore.ts`: optional Firestore demo seed.
- `server/scripts/seed-firebase-auth-demo.ts`: optional Firebase Auth demo identity seed.
- `server/scripts/inspect-firestore.ts`: safe Firestore count inspection.

### PVE backend

- `server/models/battle.ts`: persisted battle, move, event, repository, and API types.
- `server/data/battle-catalog.ts`: versioned move catalogue and NPC preset.
- `server/services/seeded-rng.ts`: deterministic unsigned 32-bit RNG.
- `server/services/battle-engine.ts`: pure start/intent/round/abandon/reward calculations.
- `server/repositories/battles.ts`: Firestore transaction implementation.
- `server/services/battle.service.ts`: ownership-aware orchestration.
- `server/controllers/battle.controller.ts`: HTTP handlers.
- `server/routes/battle.routes.ts`: verified routes, validation, and rate limiting.

### Frontend

- `client/src/utils/avatarPresentation.ts`: API-record to visual-model adapter.
- `client/src/hooks/useArchive.ts`: archive fetch and demo mutation state.
- `client/src/pages/ArchivePage.tsx`: real archive states and demo switch.
- `client/src/pages/ArchivePage.test.tsx`: archive component contract.
- `client/src/pages/BattlePage.tsx`: server-driven PVE experience.
- `client/src/pages/BattlePage.test.tsx`: PVE component contract.
- `client/src/services/sproutApi.ts`: demo and battle API types/functions.
- `client/src/components/common/PlantVisuals.tsx`: API-backed avatar and HP rendering.
- `client/src/App.css`: archive/PVE state and control styling.

---

### Task 1: Reconcile Active SQLite Profiles Into Firestore

**Files:**
- Create: `server/scripts/reconcile-sqlite-to-firestore.ts`
- Create: `server/tests/reconcile-sqlite-to-firestore.test.ts`
- Create: `docs/checkoff3/firestore-migration-evidence.md`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `buildReconciliationPlan(input: ReconciliationInput): ReconciliationPlan`.
- Produces CLI: `npm run reconcile:firestore -- --dry-run` and `npm run reconcile:firestore -- --apply`.
- Produces evidence fields: local counts, Firestore counts, Auth-backed migrations, skipped existing profiles, discarded orphan count, avatar fingerprint comparison, and post-apply verification.

- [ ] **Step 1: Write failing reconciliation planner tests**

```ts
import { buildReconciliationPlan, avatarFingerprint } from '../scripts/reconcile-sqlite-to-firestore';

describe('Firestore reconciliation plan', () => {
  it('migrates only Auth-backed profiles missing from Firestore', () => {
    const plan = buildReconciliationPlan({
      localProfiles: [profile('active'), profile('existing'), profile('orphan')],
      firebaseAuthUids: new Set(['active', 'existing']),
      firestoreProfileUids: new Set(['existing']),
      localAvatars: [],
      firestoreAvatars: [],
    });
    expect(plan.profileUidsToCreate).toEqual(['active']);
    expect(plan.profileUidsToSkip).toEqual(['existing']);
    expect(plan.orphanProfileUids).toEqual(['orphan']);
  });

  it('clears reset state in a migrated profile', () => {
    const plan = buildReconciliationPlan({
      localProfiles: [profile('active', { resetOtpHash: 'secret', resetOtpFailedAttempts: 2 })],
      firebaseAuthUids: new Set(['active']),
      firestoreProfileUids: new Set(),
      localAvatars: [],
      firestoreAvatars: [],
    });
    expect(plan.profilesToCreate[0]).toMatchObject({
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpFailedAttempts: 0,
    });
  });

  it('matches legacy demo avatars without relying on random IDs or timestamps', () => {
    expect(avatarFingerprint(localDemoAvatar('local-id')))
      .toBe(avatarFingerprint(remoteDemoAvatar('remote-id')));
  });

  it('blocks removal when a local avatar has no Firestore equivalent', () => {
    const plan = buildReconciliationPlan({
      localProfiles: [],
      firebaseAuthUids: new Set(),
      firestoreProfileUids: new Set(),
      localAvatars: [localDemoAvatar('local-id')],
      firestoreAvatars: [],
    });
    expect(plan.safeToRemoveSqlite).toBe(false);
    expect(plan.unmatchedLocalAvatarFingerprints).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the planner tests and verify RED**

Run:

```powershell
npm test -w server -- --runTestsByPath tests/reconcile-sqlite-to-firestore.test.ts
```

Expected: FAIL because `reconcile-sqlite-to-firestore.ts` and its exports do not exist.

- [ ] **Step 3: Implement the pure planner and guarded CLI**

Use these exact exported shapes:

```ts
export interface ReconciliationInput {
  localProfiles: AuthUserProfile[];
  firebaseAuthUids: Set<string>;
  firestoreProfileUids: Set<string>;
  localAvatars: AvatarRecord[];
  firestoreAvatars: AvatarRecord[];
}

export interface ReconciliationPlan {
  profilesToCreate: AuthUserProfile[];
  profileUidsToCreate: string[];
  profileUidsToSkip: string[];
  orphanProfileUids: string[];
  unmatchedLocalAvatarFingerprints: string[];
  safeToRemoveSqlite: boolean;
}

export function avatarFingerprint(avatar: AvatarRecord): string {
  return JSON.stringify({
    speciesName: avatar.speciesName,
    speciesFamily: avatar.speciesFamily,
    source: avatar.source,
    isTemporary: avatar.isTemporary,
    stats: avatar.stats,
  });
}
```

`buildReconciliationPlan` must sort UID arrays, clear all reset fields in copied
profiles, compare avatar fingerprints as multisets, and set
`safeToRemoveSqlite=false` for any unmatched local avatar or non-demo owner.
The CLI must default to dry-run. `--apply` is accepted only when the plan is
safe; it uses `DocumentReference.create(profile)` so an existing document fails
instead of being overwritten, and
copies password-history rows only for migrated UIDs. Console output contains
counts and UIDs only, never email addresses, hashes, OTPs, or ticket bodies.

Add scripts:

```json
"reconcile:firestore": "tsx scripts/reconcile-sqlite-to-firestore.ts"
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
npm test -w server -- --runTestsByPath tests/reconcile-sqlite-to-firestore.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Dry-run against the real local database and Firebase project**

Run with Node 22 and the ignored service-account environment already used by
the application:

```powershell
npm run reconcile:firestore -w server -- --dry-run
```

Expected summary: two active missing profiles planned, one orphan skipped, five
legacy avatars matched by fingerprint, `safeToRemoveSqlite=true`. Stop if any
count differs or any unmatched avatar appears.

- [ ] **Step 6: Apply once and verify the postcondition**

Run:

```powershell
npm run reconcile:firestore -w server -- --apply
npm run reconcile:firestore -w server -- --dry-run
```

Expected second summary: zero profiles left to create, existing profiles
skipped, orphan still excluded, and `safeToRemoveSqlite=true`.

- [ ] **Step 7: Record redacted evidence and commit**

`docs/checkoff3/firestore-migration-evidence.md` records date, commit, commands,
counts, avatar fingerprint result, and the absence of printed secrets.

```powershell
git add server/scripts/reconcile-sqlite-to-firestore.ts server/tests/reconcile-sqlite-to-firestore.test.ts server/package.json docs/checkoff3/firestore-migration-evidence.md
git commit -m "chore: reconcile active profiles into Firestore"
```

---

### Task 2: Establish Firebase Emulator Test Infrastructure

**Files:**
- Create: `firebase.json`
- Create: `server/tests/firestore-test-utils.ts`
- Modify: `server/tests/setup-env.ts`
- Modify: `server/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `clearFirestore(): Promise<void>` and `seedFirestoreUser(profile): Promise<void>`.
- Produces command: `npm run test:server` that starts Firestore Emulator and runs Jest inside it.
- Test project ID: `sprout-test`; Firestore port: `8080`.

- [ ] **Step 1: Write a failing emulator smoke test**

Create `server/tests/firestore-emulator.test.ts`:

```ts
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

describe('Firestore Emulator', () => {
  beforeEach(clearFirestore);

  it('writes and reads an isolated document', async () => {
    await getDb().collection('smoke').doc('one').set({ ok: true });
    const doc = await getDb().collection('smoke').doc('one').get();
    expect(doc.data()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the intended emulator command and verify RED**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/firestore-emulator.test.ts"
```

Expected: FAIL because Firebase Emulator configuration and helper do not exist.

- [ ] **Step 3: Add Firebase Emulator configuration and helpers**

Create `firebase.json`:

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "firestore": { "host": "127.0.0.1", "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

Replace SQLite setup values in `server/tests/setup-env.ts` with:

```ts
process.env.NODE_ENV = 'test';
process.env.GCLOUD_PROJECT = 'sprout-test';
process.env.GOOGLE_CLOUD_PROJECT = 'sprout-test';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.EMAIL_MODE = 'console';
process.env.BCRYPT_COST = '4';
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
```

Implement `clearFirestore` with `getDb().listCollections()` and
`getDb().recursiveDelete(collectionRef)`. Add `firebase-tools` as a server dev
dependency and scripts:

```json
"test": "firebase emulators:exec --project sprout-test --only firestore \"jest --runInBand\"",
"test:jest": "jest --runInBand"
```

The root `test:server` script remains `npm test -w server` so every normal test
run receives the emulator boundary.

- [ ] **Step 4: Run the smoke test and verify GREEN**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/firestore-emulator.test.ts"
```

Expected: emulator starts, one test passes, emulator exits with code 0.

- [ ] **Step 5: Commit the emulator foundation**

```powershell
git add firebase.json server/tests/firestore-emulator.test.ts server/tests/firestore-test-utils.ts server/tests/setup-env.ts server/package.json package.json package-lock.json
git commit -m "test: run backend integration tests on Firestore Emulator"
```

---

### Task 3: Make Firestore the Only Runtime Repository and Remove SQLite

**Files:**
- Modify: `server/repositories/auth-users.ts`
- Modify: `server/repositories/avatars.ts`
- Modify: `server/repositories/tickets.ts`
- Modify: `server/server.ts`
- Modify: `server/tests/auth.test.ts`
- Modify: `server/tests/query.test.ts`
- Modify: `server/tests/auth-user-repo-firestore.test.ts`
- Modify: `server/tests/ticket-repo-firestore.test.ts`
- Create: `server/data/demo-avatar-templates.ts`
- Create: `server/scripts/seed-firestore.ts`
- Create: `server/scripts/seed-firebase-auth-demo.ts`
- Create: `server/scripts/inspect-firestore.ts`
- Delete: `server/repositories/auth-user.repo.firestore.ts`
- Delete: `server/repositories/auth-user.repo.sqlite.ts`
- Delete: `server/repositories/avatar.repo.firestore.ts`
- Delete: `server/repositories/avatar.repo.sqlite.ts`
- Delete: `server/repositories/ticket.repo.firestore.ts`
- Delete: `server/repositories/ticket.repo.sqlite.ts`
- Delete: `server/tests/ticket-repo-sqlite.test.ts`
- Delete: `server/scripts/reconcile-sqlite-to-firestore.ts`
- Delete: `server/tests/reconcile-sqlite-to-firestore.test.ts`
- Delete: `server/database/`
- Delete: `server/knexfile.ts`
- Modify: `server/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `server/FIREBASE_SETUP.md`
- Modify: `README.md`
- Modify: `client/src/pages/BackendTestPage.tsx`

**Interfaces:**
- `authUserRepository`, `avatarRepository`, and `ticketRepository` keep their existing exported interfaces and become direct Firestore implementations.
- `server.ts` starts without migration logic or a datastore mode.
- Firestore seed data moves out of the removed `database` directory.

- [ ] **Step 1: Add a failing Firestore-only runtime test**

Create `server/tests/firestore-only-runtime.test.ts`:

```ts
import avatarRepository from '../repositories/avatars';
import { getDb } from '../firebase';
import { clearFirestore } from './firestore-test-utils';

describe('Firestore-only runtime repositories', () => {
  beforeEach(clearFirestore);

  it('reads Firestore without a DATASTORE selector', async () => {
    delete process.env.DATASTORE;
    await getDb().collection('avatar_records').doc('owned').set({
      id: 'owned', userId: 'user-1', speciesName: 'Fern', speciesFamily: 'Test',
      spriteUrl: '/fern.png', discoveredAt: '2026-07-22T00:00:00.000Z',
      source: 'mobile', isTemporary: false, expiresAt: null,
      stats: { hp: 100, attack: 50, defense: 50, speed: 50 }, metadata: null,
    });
    await expect(avatarRepository.listByUser('user-1', 1, 20))
      .resolves.toMatchObject({ total: 1 });
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/firestore-only-runtime.test.ts"
```

Expected: FAIL because the repository selector defaults to SQLite.

- [ ] **Step 3: Collapse repository selectors into direct Firestore implementations**

Move each `.repo.firestore.ts` implementation into its stable plural module and
delete both implementation-specific variants. Preserve these imports used by
services and controllers:

```ts
import authUserRepository from '../repositories/auth-users';
import avatarRepository from '../repositories/avatars';
import ticketRepository from '../repositories/tickets';
```

Remove every `DATASTORE` branch and lazy `require`. Update comments to state
that Firebase Admin is the only runtime database adapter.

- [ ] **Step 4: Convert route tests from SQL assertions to emulator assertions**

In `auth.test.ts`, remove `fs`, `path`, and `db`. Make the Firebase mock partial
so real `getDb` remains available:

```ts
jest.mock('../firebase', () => {
  const actual = jest.requireActual('../firebase');
  return { ...actual, getAuthAdmin: () => mockAuthAdmin };
});
```

Use `clearFirestore`, `authUserRepository.createProfile`,
`authUserRepository.addPasswordHistory`, and Firestore document reads instead
of SQL inserts/selects. In `query.test.ts`, clear the emulator before each test
and read `query_tickets` using `getDb().collection(...).where(...).get()`.
Remove SQL migration hooks and database-file deletion hooks.

- [ ] **Step 5: Move Firebase seed/inspection assets and simplify startup**

Move the shared sample catalogue to `server/data/demo-avatar-templates.ts` and
make its exported templates deterministic. Move Firebase seed scripts under
`server/scripts`. Replace `server/server.ts` startup with:

```ts
import app from './app';

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`Sprout backend listening on http://localhost:${PORT} (Firestore)`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
```

`inspect-firestore.ts` reports collection counts by default and requires an
explicit `--include-documents` flag before printing redacted document summaries.

- [ ] **Step 6: Delete SQLite and remove dependencies/scripts**

Delete every SQL file listed above, including the transitional reconciliation
script only after its evidence shows a successful apply. Remove `knex` and
`better-sqlite3` with:

```powershell
npm uninstall knex better-sqlite3 -w server
```

Server scripts after removal include `seed:firestore`,
`seed:firebase-auth-demo`, `inspect:firestore`, `check:email`, and
`check:storage`; they do not include SQL migrate/rollback/seed commands. Root
`seed` delegates to `seed:firestore`.

- [ ] **Step 7: Remove active documentation/config references**

Remove `DATASTORE` and `DB_FILENAME` from `.env.example`; require one Firebase
credential method outside emulator tests. Update README, Firebase setup, and
Backend Test page to say Firestore only. Historical plans that discuss SQLite
receive a one-line `Superseded by 2026-07-22 Firestore-only design` banner so
they cannot be mistaken for current architecture.

- [ ] **Step 8: Verify runtime removal and GREEN tests**

Run:

```powershell
rg -n "better-sqlite3|from 'knex'|database/db|DATASTORE|DB_FILENAME" server client package.json .env.example
npm run test:server
npm run typecheck -w server
npm run build -w server
```

Expected: `rg` returns no runtime/test/config match; historical documentation
may still contain explicitly superseded references. All server tests,
typecheck, and build pass.

- [ ] **Step 9: Commit Firestore-only runtime**

```powershell
git add -A
git commit -m "refactor: remove SQLite and use Firestore only"
```

---

### Task 4: Add Environment-Gated Demo Avatar Persistence

**Files:**
- Modify: `server/models/avatar.ts`
- Modify: `server/data/demo-avatar-templates.ts`
- Modify: `server/repositories/avatars.ts`
- Modify: `server/controllers/avatar.controller.ts`
- Modify: `server/routes/avatar.routes.ts`
- Create: `server/tests/avatar-demo.test.ts`
- Modify: `.env.example`

**Interfaces:**
- `AvatarRepository.ensureDemoSet(userId: string): Promise<PaginatedAvatars>`.
- `AvatarRepository.removeDemoSet(userId: string): Promise<PaginatedAvatars>`.
- `POST /api/avatar/demo` and `DELETE /api/avatar/demo`.

- [ ] **Step 1: Write failing repository and route tests**

```ts
it('idempotently creates five caller-owned demo records', async () => {
  await avatarRepository.ensureDemoSet('user-1');
  const second = await avatarRepository.ensureDemoSet('user-1');
  expect(second.total).toBe(5);
});

it('removes demo records without deleting a collected record', async () => {
  await seedCollectedAvatar('user-1', 'caught-1');
  await avatarRepository.ensureDemoSet('user-1');
  const result = await avatarRepository.removeDemoSet('user-1');
  expect(result.items.map((item) => item.id)).toEqual(['caught-1']);
});

it('returns 404 when demo tools are disabled', async () => {
  process.env.ENABLE_DEMO_TOOLS = 'false';
  const response = await authed(request(app).post('/api/avatar/demo'));
  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/avatar-demo.test.ts"
```

Expected: FAIL because repository methods and routes do not exist.

- [ ] **Step 3: Implement deterministic demo templates and Firestore batch writes**

Use `DEMO_SET_VERSION='checkoff3-v1'` and deterministic IDs:

```ts
export function demoAvatarId(userId: string, templateId: string): string {
  return createHash('sha256')
    .update(`${DEMO_SET_VERSION}:${userId}:${templateId}`)
    .digest('hex')
    .slice(0, 32);
}
```

Each created record has caller UID, stable species/stats, current discovery
timestamp, a demo sprite/presentation key, and metadata containing
`isDemo=true`, version, template ID, and display name. `removeDemoSet` loads the
five deterministic refs, verifies owner and metadata on each existing doc, and
deletes only verified matches in a batch.

- [ ] **Step 4: Add server flag middleware and routes**

```ts
const requireDemoTools: RequestHandler = (_req, res, next) => {
  if (process.env.ENABLE_DEMO_TOOLS !== 'true') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
};

router.post('/demo', requireDemoTools, handleEnableDemoAvatars);
router.delete('/demo', requireDemoTools, handleDisableDemoAvatars);
```

The router remains protected by verified `authMiddleware`. Add
`ENABLE_DEMO_TOOLS=false` to `.env.example`.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/avatar-demo.test.ts"
npm run typecheck -w server
```

Expected: demo tests and typecheck pass.

```powershell
git add server/models/avatar.ts server/data/demo-avatar-templates.ts server/repositories/avatars.ts server/controllers/avatar.controller.ts server/routes/avatar.routes.ts server/tests/avatar-demo.test.ts .env.example
git commit -m "feat: add gated per-user demo avatars"
```

---

### Task 5: Connect Archive to Owned Firestore Records

**Files:**
- Create: `client/src/utils/avatarPresentation.ts`
- Create: `client/src/hooks/useArchive.ts`
- Create: `client/src/pages/ArchivePage.test.tsx`
- Modify: `client/src/pages/ArchivePage.tsx`
- Modify: `client/src/services/sproutApi.ts`
- Modify: `client/src/components/common/PlantVisuals.tsx`
- Modify: `client/src/App.css`
- Modify: `client/.env.example`

**Interfaces:**
- `listOwnedAvatars(page?, pageSize?): Promise<PaginatedAvatars>`.
- `setDemoAvatars(enabled: boolean): Promise<PaginatedAvatars>`.
- `useArchive(): { avatars, status, error, demoEnabled, setDemoEnabled, retry }`.
- `toPlantAvatarData(record: AvatarRecord): PlantAvatarData`.

- [ ] **Step 1: Write failing Archive component tests**

Mock only `sproutApi` and cover these exact behaviors:

```tsx
it('shows an empty archive for a new account', async () => {
  listOwnedAvatars.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  renderArchive();
  expect(await screen.findByText(/no plants collected yet/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /battle with/i })).not.toBeInTheDocument();
});

it('adds and removes only demo plants through the switch', async () => {
  listOwnedAvatars.mockResolvedValueOnce(emptyPage).mockResolvedValueOnce(demoPage).mockResolvedValueOnce(emptyPage);
  renderArchive({ demoTools: true });
  await user.click(await screen.findByRole('switch', { name: /demo plants/i }));
  expect(setDemoAvatars).toHaveBeenCalledWith(true);
  await user.click(screen.getByRole('switch', { name: /demo plants/i }));
  expect(setDemoAvatars).toHaveBeenCalledWith(false);
});

it('shows retry after an archive request fails', async () => {
  listOwnedAvatars.mockRejectedValue(new Error('offline'));
  renderArchive();
  expect(await screen.findByRole('button', { name: /retry/i })).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm test -w client -- --run src/pages/ArchivePage.test.tsx
```

Expected: FAIL because Archive still imports the static five-item array.

- [ ] **Step 3: Implement API methods, presentation adapter, and hook**

`listOwnedAvatars` calls authenticated `GET /api/avatar` and relies on the
existing Axios token interceptor. `setDemoAvatars(true)` uses POST and `false`
uses DELETE. `useArchive` fetches on mount, exposes explicit
`loading|ready|error|mutating` state, and determines demo enabled only when all
five `checkoff3-v1` records are present.

`toPlantAvatarData` maps API stats, discovery date, metadata display name, demo
flag, and a stable palette class. It uses `spriteUrl` when available and a CSS
plant fallback when an image fails.

- [ ] **Step 4: Replace static Archive rendering**

Remove `plantAvatars` from Archive. Render:

- skeleton/loading status without layout shift;
- retryable error;
- empty collection message;
- API-backed card grid and selected detail;
- `role="switch"` demo control only when
  `import.meta.env.VITE_ENABLE_DEMO_TOOLS === 'true'`;
- a visible Demo badge on demo cards;
- Battle button only for a selected owned avatar.

Add `VITE_ENABLE_DEMO_TOOLS=false` to `client/.env.example`. Do not include
instructional feature copy in the visible application.

- [ ] **Step 5: Verify GREEN, quality gates, and commit**

Run:

```powershell
npm test -w client -- --run src/pages/ArchivePage.test.tsx
npm run typecheck -w client
npm run lint -w client
```

Expected: Archive tests pass, typecheck passes, lint has no new errors.

```powershell
git add client/src/utils/avatarPresentation.ts client/src/hooks/useArchive.ts client/src/pages/ArchivePage.tsx client/src/pages/ArchivePage.test.tsx client/src/services/sproutApi.ts client/src/components/common/PlantVisuals.tsx client/src/App.css client/.env.example
git commit -m "feat: connect Archive to Firestore avatars"
```

---

### Task 6: Build the Pure Seeded Battle Engine

**Files:**
- Create: `server/models/battle.ts`
- Create: `server/data/battle-catalog.ts`
- Create: `server/services/seeded-rng.ts`
- Create: `server/services/battle-engine.ts`
- Create: `server/tests/battle-engine.test.ts`
- Create: `server/tests/battle-engine.property.test.ts`

**Interfaces:**
- `createBattle(input: CreateBattleInput): BattleSession`.
- `resolvePlayerAction(session, moveId): BattleSession`.
- `abandonBattle(session): BattleSession`.
- `calculateProgression(outcome): ProgressionDelta`.
- `nextRandom(state: number): { value: number; state: number }`.

- [ ] **Step 1: Define tests for mechanics and state transitions**

Tests must assert:

```ts
expect(calculateDamage(attacker, defender, quickMove, false)).toBe(expectedQuickDamage);
expect(calculateDamage(attacker, defender, quickMove, true)).toBe(Math.floor(expectedQuickDamage / 2));
expect(resolvePlayerAction(twoSunSession, 'signature').player.energy).toBe(0);
expect(() => resolvePlayerAction(zeroSunSession, 'signature')).toThrow('insufficient_energy');
// damagedSession has maxHp 100 and currentHp 50.
expect(resolvePlayerAction(damagedSession, 'photosynthesis').player.currentHp).toBe(75);
expect(() => resolvePlayerAction(healUsedSession, 'photosynthesis')).toThrow('heal_already_used');
expect(fastWinningRound.status).toBe('won');
expect(fastWinningRound.log.some((event) => event.type === 'bot_action_skipped')).toBe(true);
expect(prepareBotIntent(session).pendingBotMoveId).toBe(repeatedFromSameSeed.pendingBotMoveId);
```

Property tests use `fast-check` to assert for 1,000 generated valid stat/move
combinations that HP stays within `[0,maxHp]`, energy stays within `[0,2]`, and
a terminal session has exactly one of `won|lost|abandoned`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-engine.test.ts tests/battle-engine.property.test.ts"
```

Expected: FAIL because battle model, catalogue, RNG, and engine do not exist.

- [ ] **Step 3: Define versioned battle types and catalogue**

Use these core types:

```ts
export type BattleStatus = 'active' | 'won' | 'lost' | 'abandoned';
export type BattlePhase =
  | 'PREPARE_BOT_INTENT'
  | 'PLAYER_ACTION'
  | 'RESOLVE_ROUND'
  | 'CHECK_RESULT'
  | 'TERMINAL';
export type BattleIntent = 'attacking' | 'guarding' | 'charging' | 'recovering';
export type MoveKind = 'quick' | 'guard' | 'signature' | 'heal';

export interface BattleMove {
  id: string; name: string; kind: MoveKind; power: number; accuracy: number;
  energyGain: number; energyCost: number;
}

export interface BattleParticipant {
  id: string; name: string; spriteUrl: string; stats: AvatarStats;
  currentHp: number; maxHp: number; energy: number; healUsed: boolean;
  moves: BattleMove[];
}

export interface BattleSession {
  id: string; userId: string; avatarId: string; status: BattleStatus;
  phase: BattlePhase; turnNumber: number;
  player: BattleParticipant; bot: BattleParticipant;
  pendingBotMoveId: string | null; botIntent: BattleIntent | null;
  rngSeed: number; rngState: number; rngStep: number; moveCatalogVersion: 'v1';
  npcPresetVersion: 'thornback-v1'; log: BattleEvent[];
  rewardApplied: boolean; xpAwarded: number;
  createdAt: string; updatedAt: string; completedAt: string | null;
}
```

Create one fixed Thornback NPC and deterministic taxonomy/family move selection
with a fallback. Every participant receives quick, guard, signature, and heal.

- [ ] **Step 4: Implement deterministic engine functions**

Use the specified formula:

```ts
const raw = Math.round(move.power * (0.75 + attacker.stats.attack / 200)
  - defender.stats.defense * 0.12);
const damage = Math.max(5, raw);
return guarded ? Math.floor(damage / 2) : damage;
```

Use an unsigned 32-bit LCG:

```ts
const nextState = (Math.imul(state, 1664525) + 1013904223) >>> 0;
return { state: nextState, value: nextState / 0x1_0000_0000 };
```

Bot selection filters invalid actions, weights Heal only below 40 percent HP,
persists the next RNG state/step, and exposes intent rather than the exact move.
Guard affects the whole round; remaining actions resolve by speed with player
winning ties. A faint skips the second action. Terminal progression is computed
but not marked applied by the pure engine.

Quick always has 100 percent accuracy and grants one Sun; Guard grants one Sun
and halves incoming damage after the five-point minimum; Signature consumes two
Sun and uses its catalog accuracy, which is at least 85 percent; Photosynthesis
heals `round(maxHp * 0.25)` capped at max HP and sets `healUsed=true`. Energy is
capped at two. Accuracy and bot-choice rolls consume the stored RNG stream. An
active session is persisted only in `PLAYER_ACTION`; internal transitions pass
through `RESOLVE_ROUND`, `CHECK_RESULT`, and either `PREPARE_BOT_INTENT` or
`TERMINAL` before the transaction returns.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-engine.test.ts tests/battle-engine.property.test.ts"
npm run typecheck -w server
```

Expected: deterministic and property tests pass.

```powershell
git add server/models/battle.ts server/data/battle-catalog.ts server/services/seeded-rng.ts server/services/battle-engine.ts server/tests/battle-engine.test.ts server/tests/battle-engine.property.test.ts
git commit -m "feat: add deterministic PVE battle engine"
```

---

### Task 7: Persist Battles and One-Time Rewards in Firestore Transactions

**Files:**
- Modify: `server/models/auth.ts`
- Modify: `server/repositories/auth-users.ts`
- Create: `server/repositories/battles.ts`
- Create: `server/tests/battle-repository.test.ts`

**Interfaces:**
- `BattleRepository.create(session): Promise<BattleSession>`.
- `BattleRepository.getOwned(userId, sessionId): Promise<BattleSession | null>`.
- `BattleRepository.applyAction(userId, sessionId, moveId, expectedTurn): Promise<BattleActionResult>`.
- `BattleRepository.abandon(userId, sessionId): Promise<BattleSession>`.

- [ ] **Step 1: Write failing Firestore transaction tests**

Using emulator fixtures, assert:

```ts
it('rejects a foreign session without mutation');
it('returns stale state without duplicate damage for an old expectedTurn');
it('rejects a future expectedTurn');
it('persists one full round and increments turn');
it('applies win XP and streak exactly once');
it('applies loss XP and resets current streak exactly once');
it('abandons without XP or win/loss increments');
it('rejects actions after a terminal outcome');
```

The duplicate-action test sends the same `{ moveId, expectedTurn }` twice and
asserts identical HP and XP after the second response.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-repository.test.ts"
```

Expected: FAIL because `repositories/battles.ts` does not exist.

- [ ] **Step 3: Add progression defaults to user profiles**

Extend `AuthUserProfile` with non-optional runtime defaults:

```ts
pveXp: number;
pveWins: number;
pveLosses: number;
currentPveWinStreak: number;
bestPveWinStreak: number;
```

`createProfile` initializes each to zero; `toProfile` normalizes missing legacy
fields to zero so migrated/existing documents remain valid.

- [ ] **Step 4: Implement battle Firestore transactions**

`applyAction` executes one Firestore transaction:

1. Load battle and reject missing/foreign/terminal/future-turn requests.
2. Return `{ session, stale: true }` when `expectedTurn < turnNumber`.
3. Call `resolvePlayerAction` for an exact turn.
4. If terminal and `rewardApplied=false`, read the user doc, apply the exact
   progression delta, set `rewardApplied=true`, and set `xpAwarded`.
5. Write session and user changes in the same transaction.

`abandon` uses the same ownership/terminal checks, writes no progression delta,
and remains idempotent for an already abandoned session.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-repository.test.ts"
npm run typecheck -w server
```

Expected: all repository transaction tests pass.

```powershell
git add server/models/auth.ts server/repositories/auth-users.ts server/repositories/battles.ts server/tests/battle-repository.test.ts
git commit -m "feat: persist PVE sessions and rewards"
```

---

### Task 8: Expose Verified PVE APIs

**Files:**
- Create: `server/services/battle.service.ts`
- Create: `server/controllers/battle.controller.ts`
- Create: `server/routes/battle.routes.ts`
- Create: `server/tests/battle-api.test.ts`
- Modify: `server/app.ts`

**Interfaces:**
- `startPveBattle(userId, avatarId): Promise<BattleSession>`.
- `getPveBattle(userId, sessionId): Promise<BattleSession>`.
- `submitPveAction(userId, sessionId, moveId, expectedTurn): Promise<BattleActionResult>`.
- `abandonPveBattle(userId, sessionId): Promise<BattleSession>`.

- [ ] **Step 1: Write failing Supertest API tests**

```ts
it('starts a battle only with a caller-owned avatar');
it('rejects an unverified Firebase token with 403');
it('returns 404 for a foreign avatar or session');
it('rejects an unknown move without advancing the turn');
it('returns stale=true for a duplicate expected turn');
it('returns persisted state from GET');
it('abandons an active session without XP');
it('rate-limits repeated action requests per user');
```

The happy path creates an owned avatar, starts a session, submits valid moves
until terminal, and asserts the final Firestore user progression matches the
response.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-api.test.ts"
```

Expected: 404s because `/api/battle/pve` is not mounted.

- [ ] **Step 3: Implement service ownership orchestration**

`startPveBattle` loads `avatarRepository.getOwned`, rejects absent/temporary
expired records, maps the avatar into a participant snapshot, creates a crypto
RNG seed, builds Thornback, prepares the first bot intent, and persists the
session. Other service methods delegate to the battle repository and translate
domain errors into controlled status-bearing errors without raw Firebase text.

- [ ] **Step 4: Implement validation, rate limits, controllers, and routes**

Use Joi:

```ts
const startSchema = Joi.object({ avatarId: Joi.string().max(128).required() });
const actionSchema = Joi.object({
  moveId: Joi.string().max(64).required(),
  expectedTurn: Joi.number().integer().min(1).required(),
});
```

Mount verified routes:

```ts
router.use(authMiddleware);
router.post('/start', battleStartLimiter, validate(startSchema), handleStartPve);
router.get('/:sessionId', handleGetPve);
router.post('/:sessionId/action', battleActionLimiter, validate(actionSchema), handlePveAction);
router.post('/:sessionId/abandon', battleActionLimiter, handleAbandonPve);
```

Mount `app.use('/api/battle/pve', battleRoutes)`. The action limiter is keyed by
`req.user!.uid`, allows 60 actions per 15 minutes outside tests, and emits
standard rate-limit headers.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-api.test.ts"
npm run typecheck -w server
```

Expected: API tests and typecheck pass.

```powershell
git add server/services/battle.service.ts server/controllers/battle.controller.ts server/routes/battle.routes.ts server/tests/battle-api.test.ts server/app.ts
git commit -m "feat: expose verified PVE battle APIs"
```

---

### Task 9: Build the Server-Driven PVE Interface

**Files:**
- Modify: `client/src/services/sproutApi.ts`
- Modify: `client/src/pages/BattlePage.tsx`
- Create: `client/src/pages/BattlePage.test.tsx`
- Modify: `client/src/components/common/PlantVisuals.tsx`
- Modify: `client/src/App.css`

**Interfaces:**
- `startPveBattle(avatarId): Promise<BattleSession>`.
- `getPveBattle(sessionId): Promise<BattleSession>`.
- `submitPveAction(sessionId, moveId, expectedTurn): Promise<BattleActionResult>`.
- `abandonPveBattle(sessionId): Promise<BattleSession>`.

- [ ] **Step 1: Write failing PVE component tests**

Mock `sproutApi` and cover:

```tsx
it('shows an empty-roster path when the user owns no avatars');
it('starts a persisted battle with the selected owned avatar');
it('renders bot intent, HP, Sun, accuracy, power, and costs');
it('disables every move while an action request is pending');
it('submits the current expected turn exactly once on double click');
it('renders structured round log events returned by the server');
it('shows victory and awarded XP');
it('shows defeat and awarded XP');
it('abandons and returns to selection without XP');
it('recovers the authoritative session after a stale response');
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm test -w client -- --run src/pages/BattlePage.test.tsx
```

Expected: FAIL because current buttons have no handlers and the page imports
static showcase avatars.

- [ ] **Step 3: Add client battle types and API methods**

Mirror the server's serialized battle shapes in `sproutApi.ts`. All methods use
the existing authenticated Axios client. `submitPveAction` sends exactly:

```ts
apiClient.post(`/api/battle/pve/${sessionId}/action`, { moveId, expectedTurn });
```

- [ ] **Step 4: Replace the static Battle page with server state**

The page state is `selecting|starting|active|submitting|terminal|error`.
Selection uses `listOwnedAvatars`. Starting calls the backend before showing the
arena. The arena renders:

- server HP as current/max values and a bounded percentage bar;
- player and bot Sun energy;
- public bot intent;
- move name, kind, power, accuracy, energy gain/cost;
- disabled reasons for insufficient Sun or consumed Heal;
- ordered structured battle log;
- pending lock across all actions;
- win/loss summary, XP, replay, abandon, and change-avatar controls.

Remove timer-based fake loading and all hard-coded HP/log text. The browser does
not compute damage, bot moves, outcome, or rewards.

- [ ] **Step 5: Verify GREEN, responsive behavior, and commit**

Run:

```powershell
npm test -w client -- --run src/pages/BattlePage.test.tsx
npm run typecheck -w client
npm run lint -w client
npm run build -w client
```

Expected: PVE tests, typecheck, lint, and build pass with no new errors.

```powershell
git add client/src/services/sproutApi.ts client/src/pages/BattlePage.tsx client/src/pages/BattlePage.test.tsx client/src/components/common/PlantVisuals.tsx client/src/App.css
git commit -m "feat: connect PVE interface to battle APIs"
```

---

### Task 10: Synchronize Documentation, Diagrams, and Checkoff Evidence

**Files:**
- Modify: `server/FIREBASE_SETUP.md`
- Modify: `docs/checkoff3/auth-email-verification-evidence.md`
- Create: `docs/checkoff3/archive-pve-verification-evidence.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/02 Requirements/UC4 Browse Avatar Archival.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/02 Requirements/UC5 PVE Battle.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/03 Design/API Contract.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/03 Design/Database Schema.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/03 Design/System Architecture.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/03 Design/Sequence Diagram Plan.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/05 Testing/Test Matrix.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/07 Decisions and QA/Open Questions and Inconsistencies.md`

**Interfaces:**
- Documentation names exactly the implemented endpoints, fields, states, rewards, and environment flags.
- Evidence distinguishes automated emulator tests from live browser/Firestore checks.

- [ ] **Step 1: Update requirements and architecture to implemented truth**

UC4 states new users have an empty archive and the demo set is explicitly
environment-gated. UC5 uses `PREPARE_BOT_INTENT -> PLAYER_ACTION ->
RESOLVE_ROUND -> CHECK_RESULT`, expected turns, seeded RNG, one-time rewards,
and the exact move mechanics. Architecture and database notes remove SQLite as
an active adapter and show Firebase Auth, Firestore, backend-only Storage, and
Firebase Emulator for automated integration tests.

- [ ] **Step 2: Synchronize MVC, BCE, sequence, and API artifacts**

The API contract lists the two demo routes and four PVE routes. Sequence/BCE
artifacts include Browser UI, Express controller, battle service, pure engine,
Firestore battle repository, Firestore transaction, and reward update. The MVC
view/controller/model labels match these exact code owners.

- [ ] **Step 3: Record test evidence**

`archive-pve-verification-evidence.md` contains a table with test ID, use case,
strategy, command, expected result, actual result, commit, and evidence path for:

- empty archive;
- demo add/remove and preservation;
- battle start/ownership;
- engine state and properties;
- stale turn idempotency;
- one-time rewards;
- full UI battle;
- browser smoke test;
- Firestore document inspection with personal fields redacted.

- [ ] **Step 4: Run documentation consistency checks and commit**

Run:

```powershell
rg -n "SQLite|DATASTORE|Attack / Special / Defend|POST /api/battle/pve/\*" README.md server/FIREBASE_SETUP.md docs/checkoff3 "D:\SUTD\Term5\ESC\Sprout_WebApp\Sprout_Vault"
git diff --check
```

Expected: active docs contain no obsolete runtime claim; any historical mention
is explicitly marked superseded. `git diff --check` is clean.

```powershell
git add server/FIREBASE_SETUP.md docs/checkoff3
git commit -m "docs: synchronize Firestore archive and PVE evidence"

git -C "D:\SUTD\Term5\ESC\Sprout_WebApp\Sprout_Vault" add "02 Requirements" "03 Design" "05 Testing" "07 Decisions and QA"
git -C "D:\SUTD\Term5\ESC\Sprout_WebApp\Sprout_Vault" commit -m "docs: synchronize Firestore archive and PVE design"
```

The application and Obsidian vault are separate Git repositories, so their
documentation changes are reviewed and committed independently.

---

### Task 11: Full Verification and Local Browser Acceptance

**Files:**
- Modify only files required by failures discovered in this task, with a failing regression test before each production correction.
- Create screenshots/log summaries under ignored local test-artifact paths; do not commit credentials or personal inbox contents.

**Interfaces:**
- Local frontend: `http://localhost:5180`.
- Local backend: `http://localhost:3012`.
- Local backend uses real Firebase Auth/Firestore and SMTP credentials; automated tests use Firestore Emulator.

- [ ] **Step 1: Run the complete automated gate with Node 22**

```powershell
npm test
npm run typecheck -w server
npm run build -w server
npm run typecheck -w client
npm run lint -w client
npm run build -w client
```

Expected: all server/emulator and client tests pass; both builds pass; lint has
zero errors and no new warnings.

- [ ] **Step 2: Verify SQLite removal**

```powershell
rg -n "better-sqlite3|from 'knex'|database/db|DATASTORE|DB_FILENAME|\.sqlite3" server client package.json package-lock.json .env.example
```

Expected: no runtime, test, dependency, or active configuration match.

- [ ] **Step 3: Start the local Firestore-only application**

Set:

```env
ENABLE_DEMO_TOOLS=true
VITE_ENABLE_DEMO_TOOLS=true
FRONTEND_URL=http://localhost:5180
CORS_ORIGIN=http://localhost:5180
```

Keep service-account and SMTP secrets in ignored environment files. Start
backend on 3012 and Vite on 5180, then verify `/api/health` returns 200.

- [ ] **Step 4: Run browser acceptance flows**

Using the verified test account:

1. Open Archive and confirm zero owned avatars initially.
2. Enable Demo Plants and confirm exactly five cards.
3. Disable and confirm empty Archive.
4. Enable again, select one plant, and start PVE.
5. Use Quick, Guard, Signature after two Sun, and Heal after damage.
6. Confirm bot intent, HP, energy, and logs change only after API responses.
7. Complete or abandon one battle and verify terminal controls.
8. Refresh during battle and confirm GET restores the authoritative session.
9. Disable demo records after the battle and confirm no collected record is removed.

- [ ] **Step 5: Verify Firestore persistence and idempotency**

Inspect redacted documents for the test UID: five demo avatars only while
enabled, one battle session with version/seed/turn/log/reward fields, and one
progression update. Replay the final action request with its old expected turn
and confirm HP and XP remain unchanged.

- [ ] **Step 6: Run final repository checks and commit any evidence-only update**

```powershell
git status --short
git diff --check
git log -1 --format="%h | %an <%ae> | %s"
```

Expected: only intended evidence changes remain, whitespace check is clean, and
commit authorship is Zhi Feng without co-author trailers.

If evidence content changed after the final browser run:

```powershell
git add docs/checkoff3
git commit -m "test: record Archive and PVE acceptance evidence"

git -C "D:\SUTD\Term5\ESC\Sprout_WebApp\Sprout_Vault" add "05 Testing" "07 Decisions and QA"
git -C "D:\SUTD\Term5\ESC\Sprout_WebApp\Sprout_Vault" commit -m "test: record Archive and PVE acceptance evidence"
```
