# Firebase Auth User Audit Timestamps Implementation Plan

> Superseded by 2026-07-22 Firestore-only design.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store user login timestamps from Firebase Auth `metadata.lastSignInTime` and logout timestamps from explicit Sprout app logout actions.

**Architecture:** Keep the existing `AuthUserRepository` boundary. Add a timestamp-aware login recorder that accepts Firebase Auth's sign-in timestamp, call it from `GET /api/auth/me`, and make the frontend call the existing logout audit endpoint before Firebase `signOut()`.

**Tech Stack:** Express, TypeScript, Firebase Admin SDK, Firestore repository, SQLite test repository, Jest/Supertest, React/Firebase client SDK.

## Global Constraints

- Firebase Auth `metadata.lastSignInTime` is the source of truth for `lastLoginAt`.
- Firebase Auth has no logout trigger; `lastLogoutAt` is app-sourced from explicit logout.
- Existing dirty worktree changes must not be reverted.
- Tests must be written or adjusted before implementation changes.

---

### Task 1: Backend Login Timestamp Source

**Files:**
- Modify: `server/tests/auth.test.ts`
- Modify: `server/models/auth.ts`
- Modify: `server/repositories/auth-user.repo.firestore.ts`
- Modify: `server/repositories/auth-user.repo.sqlite.ts`
- Modify: `server/services/auth.service.ts`
- Modify: `server/controllers/auth.controller.ts`

**Interfaces:**
- Consumes: `req.user.uid` from `auth.middleware.ts`.
- Produces: `recordUserLogin(uid: string, signedInAt?: string | null): Promise<PublicProfile>`.
- Produces: `AuthUserRepository.recordLogin(id: string, signedInAt?: string | null): Promise<AuthUserProfile | null>`.

- [ ] **Step 1: Write the failing backend test**

Add a `GET /api/auth/me` test that mocks `mockAuthAdmin.getUser` returning:

```ts
metadata: { lastSignInTime: 'Sat, 11 Jul 2026 10:00:00 GMT' }
```

Assert the response and `users` row contain `lastLoginAt === '2026-07-11T10:00:00.000Z'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- --runInBand server/tests/auth.test.ts`

Expected: FAIL because `GET /api/auth/me` does not call Firebase Admin `getUser` for metadata-derived login audit.

- [ ] **Step 3: Implement backend timestamp flow**

Update repository `recordLogin` to accept an optional ISO-compatible timestamp. Derive display fields from that timestamp when present, otherwise use current server time for backward compatibility. Update `getCurrentUserProfile` to return the profile after marking verification only when needed. Add `recordUserLoginFromFirebase(uid)` or equivalent service logic that calls Firebase Admin `getUser(uid)` and passes `metadata.lastSignInTime` to `recordUserLogin`.

- [ ] **Step 4: Run backend auth tests**

Run: `npm test -w server -- --runInBand server/tests/auth.test.ts`

Expected: PASS.

### Task 2: Frontend Explicit Logout Audit

**Files:**
- Modify: `client/src/services/sproutApi.ts` or the current auth API service that owns profile calls
- Modify: `client/src/context/AuthContext.tsx`

**Interfaces:**
- Consumes: authenticated `apiClient` request interceptor.
- Produces: `logout()` attempts `POST /api/auth/session/logout` before Firebase `signOut()`.

- [ ] **Step 1: Write or adjust frontend auth test if test harness exists**

If client tests exist, add a test asserting `logout()` calls the audit API before `signOut()` and still calls `signOut()` if the audit request rejects.

- [ ] **Step 2: Implement minimal client logout flow**

Add an exported `recordSessionLogout()` API helper if missing. In `AuthContext.logout`, call it inside a `try/catch`, then call `signOut(getSproutFirebaseAuth())` regardless of audit result.

- [ ] **Step 3: Run available frontend validation**

Run the available client test/build command from `client/package.json`.

Expected: PASS, or report if no client test command exists.

### Task 3: Schema And Seed Consistency

**Files:**
- Review: `server/database/seed-firestore.ts`
- Review: `server/database/seed-firebase-auth-demo.ts`
- Review: `server/database/migrations/20260711180001_add_user_login_logout_audit.ts`
- Review: `server/scripts/backfill-user-login-audit-fields.ts`

**Interfaces:**
- Produces: Firestore user documents and SQLite users rows include all eight audit fields.

- [ ] **Step 1: Confirm no schema gaps**

Verify new users initialize all audit fields to `null` and existing backfill script fills missing Firestore fields with `null`.

- [ ] **Step 2: Run targeted server tests**

Run: `npm test -w server -- --runInBand server/tests/auth.test.ts`

Expected: PASS.
