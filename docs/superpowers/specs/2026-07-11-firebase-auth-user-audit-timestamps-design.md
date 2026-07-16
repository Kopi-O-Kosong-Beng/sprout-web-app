# Firebase Auth User Audit Timestamps Design

## Goal

Record login and logout audit timestamps on each Firestore `users/{uid}` profile document while respecting what Firebase Auth can and cannot report.

## Source Of Truth

Firebase Auth exposes a real last sign-in timestamp through the Admin SDK user record metadata (`metadata.lastSignInTime`). That timestamp is the source of truth for `lastLoginAt`.

Firebase Auth does not expose a server-side logout trigger. A logout timestamp can only represent an explicit app logout action, recorded by the Sprout app before or around Firebase client `signOut()`.

## User Schema

Each `users/{uid}` document stores:

- `lastLoginAt: string | null` - ISO timestamp derived from Firebase Auth `metadata.lastSignInTime`.
- `lastLoginDate: string | null` - date display helper derived from `lastLoginAt`.
- `lastLoginTime: string | null` - Singapore-time display helper derived from `lastLoginAt`.
- `lastLoginAtReadable: string | null` - readable Singapore-time display helper derived from `lastLoginAt`.
- `lastLogoutAt: string | null` - ISO timestamp recorded when Sprout receives an explicit logout request.
- `lastLogoutDate: string | null` - date display helper derived from `lastLogoutAt`.
- `lastLogoutTime: string | null` - Singapore-time display helper derived from `lastLogoutAt`.
- `lastLogoutAtReadable: string | null` - readable Singapore-time display helper derived from `lastLogoutAt`.

New profile documents initialize all eight fields to `null`. Existing Firestore user documents can be backfilled with `null` values for missing fields.

## Backend Behavior

`GET /api/auth/me` remains the normal profile-read endpoint. When called with a valid Firebase ID token, it loads the Firebase Auth user by UID, reads `metadata.lastSignInTime`, and updates the matching user profile's login audit fields from that Auth timestamp. If Firebase Auth has no sign-in timestamp, it leaves login audit fields unchanged.

`POST /api/auth/session/logout` remains the app-level logout audit endpoint. It records the current server time as the user's logout timestamp and returns the public profile. This is intentionally app-sourced, not described as a Firebase Auth trigger.

`POST /api/auth/session/login` should not be the primary login source because login already happens through the Firebase client SDK. If kept for compatibility, it should also derive `lastLoginAt` from Firebase Auth metadata instead of using server receipt time.

## Frontend Behavior

After Firebase client login succeeds, the existing auth state flow calls `GET /api/auth/me`; that backend read records `lastLoginAt` from Firebase Auth metadata.

On explicit logout, the frontend calls `POST /api/auth/session/logout` while a Firebase user token is still available, then calls Firebase `signOut()`. If the audit request fails, logout should still proceed so users are not trapped in a session.

## Testing

Backend tests mock Firebase Admin `getUser(uid)` with `metadata.lastSignInTime` and assert that `GET /api/auth/me` stores and returns login audit fields based on that timestamp.

Backend tests assert explicit logout stores and returns logout audit fields based on server time.

Frontend tests, if added in this slice, assert `logout()` calls the audit endpoint before Firebase `signOut()` and still signs out if the audit call rejects.

## Non-Goals

No Cloud Functions auth trigger is added because Firebase Auth has no logout trigger to attach to.

No inactivity-based logout timestamp is added because it would be an inferred session expiry, not an actual logout.
