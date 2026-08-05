# Graph Report - sprout-web-app  (2026-08-04)

## Corpus Check
- Large corpus: 268 files · ~1,175,521 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1236 nodes · 3179 edges · 63 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 910 · MODIFIES: 681 · imports: 548 · imports_from: 376 · calls: 261 · ON_BRANCH: 252 · PARENT_OF: 133 · inherits: 10 · method: 7 · re_exports: 1


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 268 · Candidates: 298
- Excluded: 0 untracked · 75309 ignored · 1 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `d6c488d`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `getDb()` - 26 edges
2. `clearFirestore()` - 17 edges
3. `cx()` - 16 edges
4. `invalid()` - 15 edges
5. `resolvePlayerAction()` - 14 edges
6. `invalidFirestoreDocument()` - 11 edges
7. `extractApiError()` - 10 edges
8. `Spinner()` - 10 edges
9. `decodeBattleSessionUnsafe()` - 10 edges
10. `prepareBotIntent()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `0046938 fix: address PVE client review findings` --ON_BRANCH--> `feature/frontend-log-sign-reset-contact`  [EXTRACTED]
  git → git  _Bridges community 20 → community 18_
- `0046938 fix: address PVE client review findings` --ON_BRANCH--> `main`  [EXTRACTED]
  git → git  _Bridges community 20 → community 13_
- `01fe983 fix(storage): nest the create-only precondition so Firebase actually enforces it` --ON_BRANCH--> `main`  [EXTRACTED]
  git → git  _Bridges community 18 → community 13_
- `0bab6c5 docs(spec): stop Scope listing pipeline auth as work still to do` --PARENT_OF--> `f7c5057 feat(pipeline): persist a completed scan into the caller's archive`  [EXTRACTED]
  git → git  _Bridges community 18 → community 33_
- `0cddb1a feat(auth): add admin login flow with allowlist-backed isAdmin and seed script` --ON_BRANCH--> `feature/frontend-log-sign-reset-contact`  [EXTRACTED]
  git → git  _Bridges community 29 → community 18_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (51): 8502a75 fix: bound reset OTP attempts and stabilize auth tests, afa4b9f fix: make reset OTP consumption atomic, AuthUserProfile, AuthUserRepository, CreateAuthUserProfile, PasswordHistoryEntry, decodeAuthUserProfile(), firestoreAuthUserRepository (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (33): 3ce3dc6 feat(uc8,uc4): align contact form and archive detail with the diagrams, 8757231 fix: harden Archive pagination and battle handoff, 93c1fc5 feat: connect Archive to Firestore avatars, b9e2538 Merge pull request #4 from Kopi-O-Kosong-Beng/feat/checkoff3-auth-email, BotAvatar(), HealthBar(), MiniArchive(), PlantAvatar() (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (20): 583bd3b feat(auth): Google sign-in and admin account dashboard, c7082c2 Merge pull request #3 from Kopi-O-Kosong-Beng/feat/checkoff3-auth-email, apiMocks, authValue, logout, moves, ownedAvatar, roster (+12 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (35): assertAbsent(), assertFixedBot(), BATTLE_ACTORS, BATTLE_EVENT_TYPES, BATTLE_INTENTS, BATTLE_PHASES, BATTLE_STATUSES, battleNotActive() (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (18): 43429f0 feat: complete in-app email verification, 64af5d7 fix: address email verification review, 8e1077d signup_login_query w/ console auth, useAuth(), FEATURES, STEPS, Mode, loginWithGoogle (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (29): 1fb0212 fix: clean up Firestore Emulator after tests, 4e6ea88 fix: harden emulator process cleanup, 9cd0e73 fix: validate Firestore emulator artifacts, buildPosixLsofArgs(), cleanupFirestoreEmulator(), EmulatorProcessController, encodeOwner(), execFileAsync (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (24): 3cca01f feat: add deterministic PVE battle engine, 58eda30 fix: address Task 6 battle engine review, ac45de7 fix: keep battle intents ambiguous, AvatarBattleInput, BattleActor, BattleEventType, BattleIntent, BattleSession (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (27): Status, AdminAccount, AdminAccountList, AvatarStats, BattleActor, BattleBot, BattleEventBase, BattleMoveKind (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (24): failures, full, input, rel, docs, lines, rel, designPath (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (11): ScanUpsertInput, getDb(), baseProfile, mockAuthAdmin, clearFirestore(), seedFirestoreUser(), mockAuthAdmin, mockIdentifyPlant (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (19): 27cbe57 feat: wire Cloud Firestore and add avatar archive endpoint, 6163375 fix: harden demo avatar transactions, cde62c9 feat: add gated per-user demo avatars, fc5b6e4 fix: compare demo avatar maps semantically, DEMO_AVATAR_TEMPLATES, demoAvatarId(), DemoAvatarTemplate, SeedAvatarRow (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (15): c82be54 refactor: convert backend to TypeScript, HttpError, DeliveryStatus, Ticket, TICKET_CATEGORIES, TICKET_INQUIRY_TYPES, TicketCategory, TicketInput (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (16): BattleActionResult, createBattleRepository(), createTestSession(), DiscardedAttempt, makeCompletedLosingSession(), makeCompletedWinningSession(), makeHealedSession(), makeLosingSession() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (25): main, 0718964 feat: scaffold backend with query ticket API and datastore seam, 0fd5313 fix(archive): log a failed discovery lookup instead of degrading silently, 1570297 test: cover avatar archive API, 23b6077 feat(ui): field-guide redesign of the web client, 3b5a03c fix(pipeline): stop the app-wide JSON parser shadowing the 20 MB scan limit, 49c4e89 feat(archive): show who first discovered a species on the avatar detail, 4f52b0c chore: reconcile active profiles into Firestore (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (11): 1a61d61 fix(scan): scope an unidentified scan's species key to the scanning user, 7cf346e fix(scan): hide raw save-failure text and relabel the discovery count, e3d4070 fix(scan): send the resolved discoverer on the complete event, not the dex record, SCAN_STEPS, ScanDiscovery, ScanStep, Status, STEP_FOR_HOP (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (17): 20cca88 Merge pull request #2 from Kopi-O-Kosong-Beng/feat/checkoff3-auth-email, 4bbe0d1 feat(email): add Resend HTTPS transport and isolate tests from local .env, 529400f docs: plan auth and email readiness, 5b315a5 docs: define checkoff 3 backend cloud testing design, 96e4de6 feat: persist independent ticket email outcomes, ac1cd3e test: define SMTP delivery contract, bb0ca2f fix: address ticket notification review, c93523e test: restore email service coverage (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (15): 6efee5d feat: add firebase auth demo flow, mapFirebaseLoginError(), apiClient, extractApiError(), STATUS_MESSAGES, firebaseConfig, getSproutFirebaseApp(), getSproutFirebaseAuth() (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (19): BattlePage(), BattleView, boundedEnergy(), combatAvatar(), EVENT_LABELS, intentMessage(), isRecord(), moveDisabledReason() (+11 more)

### Community 18 - "Community 18"
Cohesion: 0.16
Nodes (24): feature/frontend-log-sign-reset-contact, 01fe983 fix(storage): nest the create-only precondition so Firebase actually enforces it, 0bab6c5 docs(spec): stop Scope listing pipeline auth as work still to do, 22e4dad feat: expose verified PVE battle APIs, 2f012c5 fix(storage): make the first sprite upload create-only so a lost race returns a live URL, 3122d34 docs: record PVE API review fixes, 378bdd0 Upgrade matched temporary avatar records to persistent on scan, 39a1689 docs: plan the scan-to-archive persistence implementation (+16 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (16): BattleEligibilityInput, isAvatarBattleEligible(), BattleRepository, avatarNotFound(), battleNotFound(), BattleService, BattleServiceError, BattleServiceOptions (+8 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (18): 0046938 fix: address PVE client review findings, botEventMessage(), handleAbandonPve(), handleGetPve(), handlePveAction(), handleStartPve(), PublicBattleBot, PublicBattleEvent (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (10): 115175f Merge pull request #1 from Kopi-O-Kosong-Beng/feat/checkoff3-auth-email, 40a7f42 fix: harden Firestore-only repository cutover, a3afd3c refactor: remove SQLite and use Firestore only, cleanServerDist(), COLLECTIONS, InspectMode, parseInspectMode(), redactFirestoreDocument() (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.20
Nodes (18): AdminDashboardProps, KEY_DESCRIPTIONS, ProbeDef, PROBES, Badge(), BtnProps, Button(), cx() (+10 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (17): PipelineStudioProps, STAGES, STATUS_TONE, StepIcon, StepState, StepStatus, assets, byFilename (+9 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (20): abandonBattle(), appendEvent(), assertValidStats(), calculateDamage(), calculateProgression(), canonicalTimestampMillis(), cloneParticipant(), cloneSession() (+12 more)

### Community 25 - "Community 25"
Cohesion: 0.16
Nodes (14): AdminDashboard(), PipelineStudio(), Sidebar(), SidebarProps, Topbar(), TopbarProps, UnitTests(), ADMIN_ROUTES (+6 more)

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (15): adminRouter, adminDexStore, adminLogBuffer, AdminLogEntry, logAdminEvent(), serverStartTime, attributeConsoleOutput(), collectResultLines() (+7 more)

### Community 27 - "Community 27"
Cohesion: 0.16
Nodes (16): 8bcb458 fix: validate persisted player move catalogs, createPlayerParticipant(), createThornback(), FALLBACK_THEME, FAMILY_THEMES, isAllowedPlayerMoveSet(), MOVE_CATALOG_VERSION, movesFromTheme() (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (18): FILE_SUBJECTS, fromTag(), KIND_ORDER, kindOf(), KINDS, metaFor(), shortFile(), STATUS (+10 more)

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (10): 0cddb1a feat(auth): add admin login flow with allowlist-backed isAdmin and seed script, 2880a57 test: preserve battle compatibility and authority, authValue(), renderHeader(), NavItem, navItems, NavigationLockContext, NavigationLockContextValue (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (9): 6101e69 fix(storage): repair a token-less sprite object instead of returning a dead URL, f75bd73 ci: run scan-to-archive persistence test suites in CI groups, createFirebaseSpriteStorage(), defaultSpriteStorageDependencies, SpriteStorage, SpriteStorageDependencies, SpriteStorageFile, PNG (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.27
Nodes (9): a38e27b Merge pull request #7 from Kopi-O-Kosong-Beng/feat/migrate-plantemon-ui-and-dev-platform, shouldAutoApprove(), programmaticEval(), EvalScores, SPROUT_PALETTE, cropPhoto(), finishSprite(), removeStrayIslands() (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (9): 627c6b0 feat(platform): migrate Sprout_Dev_Platform into the client and server, resolveTrustProxy(), AssembledPlant, assemblePlant(), PlantMove, IdentificationError, IdentificationResult, identifyPlant() (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.18
Nodes (13): 96e24bb fix(scan-persistence): tighten error boundary and narrow identification type, e7dd44c fix(pipeline): lowercase taxonomy keys in identify mock path, f7c5057 feat(pipeline): persist a completed scan into the caller's archive, persistScan(), ScanPersistenceDependencies, ScanPersistOptions, ScanPersistResult, scopeSpeciesKeyToUser() (+5 more)

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (9): apiMocks, enterActiveBattle(), playerMoves, renderBattle(), rosterPage, SessionOptions, BattleActionResult, BattleMove (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (9): app, devOrigins, parseJsonBody, asAdmin(), asMember(), authorization(), mockAuthAdmin, mockAuthAdmin (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (11): authorization(), BOT_MOVE_NAMES, expectedBotEventMessage(), expectPublicSession(), findForbiddenKeys(), INTERNAL_BATTLE_KEYS, mockAuthAdmin, seedAvatar() (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (3): 56ba162 feat: scaffold React client and wire it to the live backend, cc23d84 feat(ui): migrate the plantemon-web pixel-art UI into the client, AuthProvider()

### Community 38 - "Community 38"
Cohesion: 0.24
Nodes (9): d6c488d Merge pull request #8 from Kopi-O-Kosong-Beng/features/zhifeng/scan-to-archive-persistence, DexDiscovery, DexRepository, firestoreDexRepository, DiscoveryResolver, logFailure(), PublicDiscovery, resolveDiscovery() (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.21
Nodes (12): AvatarRecord, handleDisableDemoAvatars(), handleEnableDemoAvatars(), handleGetAvatar(), handleListAvatars(), PublicAvatarRecord, PublicPaginatedAvatars, serializeAvatar() (+4 more)

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (11): EmailPayload, EmailProviderError, EmailResult, EmailTransportStatus, getSmtpTransporter(), MissingEmailEnvironmentError, requireEnv(), resendFromAddress() (+3 more)

### Community 41 - "Community 41"
Cohesion: 0.14
Nodes (5): mockAuthAdmin, MockFirebaseUser, mockSendEmail, mockUsersByEmail, mockUsersByUid

### Community 42 - "Community 42"
Cohesion: 0.17
Nodes (12): 2953ccf fix: harden verification resend security, dddf9e1 feat: complete Firebase verification resend flow, ec01228 fix: align ticket notification state contract, authLimiter, requestResetSchema, router, signupSchema, verificationResendAccountLimiter (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.23
Nodes (9): defaultDependencies, main(), MainOptions, requireBucketName(), runStoragePreflight(), StoragePreflightResult, StorageProbeDependencies, StorageProbeFile (+1 more)

### Community 44 - "Community 44"
Cohesion: 0.23
Nodes (9): getApp(), getAuthAdmin(), getCredential(), getStorageAdmin(), parseServiceAccount(), AdminAccountSummary, AdminOperationError, deleteAccount() (+1 more)

### Community 45 - "Community 45"
Cohesion: 0.30
Nodes (9): PipelineTier, buildInstruction(), cleanVlmPromptText(), craftPromptGemini(), craftPromptGemma(), craftPromptTiered(), SPECIES_BOTANICAL_TRAITS, stripDataUrl() (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.21
Nodes (11): actionSchema, battleLimiter(), BattleRouterOptions, createBattleRouter(), emptyBodySchema, idSchema, rateLimitMax(), sessionParamsSchema (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (5): generateProceduralPixelArt(), generateSprite(), RenderKeys, RenderResult, keys

### Community 48 - "Community 48"
Cohesion: 0.24
Nodes (6): handleMe(), handleSessionLogin(), handleSessionLogout(), ProfileResponse, PublicProfile, withAdminFlag()

### Community 49 - "Community 49"
Cohesion: 0.27
Nodes (8): deriveSpeciesStats(), fnv1a(), SPECIES_STAT_RANGES, STAT_SEEDS, AvatarStats, createDexDoc(), DexDoc, sanitizeSpeciesKey()

### Community 50 - "Community 50"
Cohesion: 0.25
Nodes (4): geminiJudgeEval(), AUDITED_KEYS, serverEnv, router

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (8): ConfigStatus, DexEntry, HealthCheckData, LogEntry, PlatformStatus, ProbeResult, usePlatformStatus(), studioFetch()

### Community 52 - "Community 52"
Cohesion: 0.35
Nodes (10): BattleEvent, BattleParticipant, assertBattleReplayIntegrity(), comparablePersistedSession(), completedRoundCount(), initialParticipant(), playerMoveForTurn(), reconstructInitialSession() (+2 more)

### Community 53 - "Community 53"
Cohesion: 0.27
Nodes (8): AuthCard(), FEATURES, auth, checkRedirectAuth(), googleProvider, logoutUser(), signInWithGoogle(), syncUserProfile()

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (9): 712f923 docs: polish deployment guide for teammates, 7952410 chore: ignore local deployment artifacts, 83666a4 chore: configure vercel frontend deployment, 8a0aad6 docs: add first-time local setup guide, 8e43d6c docs: explain deployment wiring, 9e386fe chore: prepare backend render deployment, ac8d0ac docs: explain vercel render deployment, ae936d7 chore: tighten vercel local ignores (+1 more)

### Community 55 - "Community 55"
Cohesion: 0.25
Nodes (7): CATEGORIES, CATEGORY_TONE, CategoryType, NotesManager(), NotesManagerProps, UserNote, UserProfile

### Community 56 - "Community 56"
Cohesion: 0.31
Nodes (5): createDeadline(), Deadline, PERMANENT, removeBackgroundSafe(), RemoveBgResult

### Community 57 - "Community 57"
Cohesion: 0.25
Nodes (8): 0f85777 fix(server): allow both Vite dev ports in development CORS, 3dc9a10 test: verify navigation lock unload release, 5bc87d0 docs: correct Checkoff 3 test taxonomy, 7991254 test(client): provide navigation lock in archive harness, 89d6e3f ci: run focused Checkoff 3 suites on pull requests, b2556c9 docs: clarify Checkoff 3 evidence artifact, cdbe171 ci: pin server jest entrypoint to server-local jest 29, d2cc497 docs: record Archive and PVE verification evidence

### Community 58 - "Community 58"
Cohesion: 0.25
Nodes (6): AuthedUser, authMiddleware, AuthMiddlewareOptions, Request, strictUnverifiedAuthMiddleware, unverifiedAuthMiddleware

### Community 59 - "Community 59"
Cohesion: 0.43
Nodes (6): isUserNotFound(), resolveSeedInput(), run(), SeedInput, upsertFirebaseUser(), upsertSproutProfile()

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (7): 5123e37 docs: refresh auth email verification evidence, 6b8b273 docs: record auth and email verification evidence, a28e6e2 fix: harden auth and email failure handling, a7e6043 docs: fix auth verification evidence audit, b7b3ac2 docs: record live Firebase Storage preflight, cd7e836 fix: add storage deployment preflight, f9b6636 docs: configure production auth email delivery

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (5): buildAvatarRows(), SEED_USERS, run(), seedFirestoreDemo(), SeedFirestoreOptions

### Community 62 - "Community 62"
Cohesion: 0.83
Nodes (3): adminEmailAllowlist(), isAdminEmail(), requireAdmin()

## Knowledge Gaps
- **288 isolated node(s):** `Status`, `apiMocks`, `moves`, `ownedAvatar`, `roster` (+283 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `Community 9` to `Community 0`, `Community 10`, `Community 3`, `Community 38`, `Community 11`, `Community 21`, `Community 61`, `Community 44`, `Community 35`, `Community 41`, `Community 36`, `Community 12`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `clearFirestore()` connect `Community 9` to `Community 35`, `Community 41`, `Community 10`, `Community 36`, `Community 12`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `Status`, `apiMocks`, `moves` to the rest of the system?**
  _288 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.061507936507936505 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06561085972850679 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07439024390243902 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.10931174089068826 - nodes in this community are weakly interconnected._