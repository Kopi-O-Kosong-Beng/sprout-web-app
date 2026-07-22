# Archive/PVE Task 8 Report

## Outcome

Implemented verified, server-authoritative PVE battle APIs for start, persisted
GET, action, and abandon. The API uses the existing Firestore avatar and battle
repositories, maps avatar taxonomy separately from its display name, hides all
pending bot-action details, and preserves repository transaction semantics for
stale turns and exactly-once progression.

Implementation commit:
`22e4dad53b1f4f8d30e913b9eea3d1980672da1e`

Review-fix commit:
`64c27e32532f9e6d55775893835d165df54b8642`

Author and committer:
`Zhi Feng <zhifeng_chia@mymail.sutd.edu.sg>`

## TDD Evidence

### RED

The first executable API RED run followed creation of
`server/tests/battle-api.test.ts` and preceded all Task 8 production files. All
14 tests reached the exported Express app and failed against the unmounted
paths. Expected authenticated, validation, and success statuses received 404,
and missing/foreign resources received the app's generic `Not found` response.

The first attempted run had stopped at a test-only TypeScript fixture mismatch;
that was corrected and was not counted as valid RED evidence. The subsequent
14-test run is the route-absence RED described above.

A second RED cycle added the deterministic service collision seam and isolated
per-user limiter test before their modules existed. Compilation failed with the
expected `TS2307` errors for `routes/battle.routes` and
`services/battle.service`.

The first GREEN attempt passed 15 of 16 tests. The remaining test assumed two
Quick moves always reached the reward transaction, but Thornback can Guard. The
fixture was corrected to advance valid rounds until it reached the intended
missing-profile boundary; no production behavior was changed for that failure.

The response-privacy review RED expanded the shared recursive API assertion
before changing the serializer. Six response-path tests failed because
`moveCatalogVersion`, `npcPresetVersion`, and `rewardApplied` were public. The
same assertion also inspects every bot log event for exact move IDs, bot move
names, and unsafe messages across start, action, stale, GET, terminal, and
abandon responses.

The avatar-ownership review RED added repository and API tests before changing
`getOwned`. The combined avatar/API run reported 4 failures out of 38 tests:
missing, non-string, and foreign raw owner markers all reached full decoding,
and malformed foreign battle start returned 500 instead of the shared 404.

### GREEN

Focused API command under Node 22.23.1:

```powershell
& $node $npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-api.test.ts"
```

Final result: 1 suite passed, 17 tests passed. Coverage includes verified auth,
missing/foreign ownership, expired and unexpired temporary avatars, strict body
and parameter validation, persisted GET, malformed and unknown moves,
same-turn concurrency and stale serialization, abandonment, missing profiles,
terminal progression, repository-error redaction, injected ID collision, rate
limit ordering, standard headers, and per-user quota isolation.

Review-fix focused command under Node 22.23.1:

```powershell
& $node $npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/avatar-demo.test.ts tests/battle-api.test.ts"
```

Final result: 2 suites passed, 38 tests passed. The API suite retained 17 tests;
the avatar suite increased to 21 tests with raw-owner gating and `listByUser`
query-boundary coverage.

Full guarded server command under Node 22.23.1:

```powershell
& $node $npm test -w server
```

Final review-fix result: 20 suites passed, 271 tests passed. The guarded runner shut down
the Firestore Emulator and the final port inspection returned
`PORT_8080_FREE`.

Static verification under Node 22.23.1:

```powershell
& $node $npm run typecheck -w server
& $node $npm run build -w server
git diff --cached --check
```

Typecheck and build exited 0. The staged diff had no whitespace errors, and the
staged metadata scan found no co-author or prohibited attribution metadata.

## Decisions

- `createBattleService` injects the repositories, clock, seed generator, and
  session-ID generator. Production uses four bytes from `node:crypto` for the
  full unsigned 32-bit seed range and `randomUUID()` for collision-resistant
  session IDs.
- The service reads the owned `AvatarRecord`, uses trimmed
  `metadata.displayName` with a species-name fallback, and independently passes
  `speciesName` and `speciesFamily` into `AvatarBattleInput`. This keeps display
  naming separate from move taxonomy.
- A temporary avatar is hidden as not found only when it has a finite
  `expiresAt` at or before the injected current time. Future expiries and a null
  expiry remain eligible.
- `createBattle` remains the sole initial-intent preparation step. The service
  sends its prepared snapshot directly to one repository `create` call. The
  stored initial session has one intent event and `rngStep=1`.
- `PublicBattleSession` is an explicit allow-list contract. Its serializer omits
  `userId`, `pendingBotMoveId`, all RNG state, the bot move catalog,
  `moveCatalogVersion`, `npcPresetVersion`, and `rewardApplied`. Start, GET,
  action, stale action, terminal action, and abandon responses all use this
  serializer and expose only the broad current `botIntent`.
- `PublicBattleEvent` is an actor-discriminated union. Player events preserve
  their move IDs and name-bearing messages for the UI. Bot events cannot carry
  `moveId`; their messages are generated only from event type and amount, and
  only `bot_intent_prepared` can carry the broad intent category.
- `avatarRepository.getOwned` reads only the raw `userId` marker before full
  decoding. Missing, non-string, or foreign markers return null. Caller-owned
  documents still pass through strict decoding, and `listByUser` retains its
  Firestore owner query before decoding the returned caller-owned documents.
- `BattleServiceError` translates known repository codes into stable statuses
  and messages. Missing and foreign sessions share one 404. Unknown Firestore,
  avatar-decoder, and battle-decoder failures become a generic internal response
  without provider or document details.
- Battle route bodies and `sessionId` parameters use Joi with conversion and
  unknown keys disabled. Validation follows verified auth and precedes rate
  limiting, so unauthenticated or malformed requests consume no battle quota.
  Syntactically accepted action attempts consume quota consistently even when
  the domain later rejects them.
- The action/abandon limiter shares a caller-UID key and emits standard headers.
  Production is fixed at 60 attempts per 15 minutes. The router factory accepts
  lower limits only when `NODE_ENV=test`; overrides are ignored in production.

## Changed Files

- `server/services/battle.service.ts`: ownership orchestration, entropy seams,
  expiry handling, avatar mapping, and controlled repository-error translation.
- `server/controllers/battle.controller.ts`: explicit public response types,
  actor-safe event serialization, and four request handlers.
- `server/repositories/avatars.ts`: pre-decode raw ownership gate for single
  avatar reads.
- `server/routes/battle.routes.ts`: verified routes, strict Joi validation, and
  per-user production/test rate-limit configuration.
- `server/tests/battle-api.test.ts`: emulator-backed API, service-boundary,
  concurrency, progression, recursive redaction, malformed-foreign ownership,
  and limiter coverage.
- `server/tests/avatar-demo.test.ts`: raw-owner marker, malformed-owned, and
  `listByUser` query-boundary coverage.
- `server/app.ts`: `/api/battle/pve` mount before the API 404 boundary.

## Uncertainties

- Firebase ID-token verification is mocked at the Admin SDK boundary, matching
  the existing protected-route test pattern; no Firebase Auth Emulator is
  configured in this repository. The real auth middleware, verification checks,
  controllers, service, Firestore repositories, and Firestore Emulator are used.
- The Firebase CLI printed its expected local unauthenticated warning. No test
  contacted a production Firebase project, and this warning did not affect the
  emulator run.
