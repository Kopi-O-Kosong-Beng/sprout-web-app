---
tags: [tech-stack, firebase, storage, cloud, checkoff3]
source: Firebase official documentation, repository environment audit 2026-07-20
updated: 2026-07-20
---

# Firebase Storage Activation

This is a deployment task, not a blocker for implementing the storage interface and local deterministic tests. Until activation succeeds, keep `STORAGE_MODE=local`; switch only the storage adapter after its Firebase preflight passes.

## Project-owner steps

1. Open the Firebase project `sprout-dev-66f08` as a project owner or billing administrator.
2. Upgrade the project to Blaze and link a Google Cloud Billing account with the teammate's payment method.
3. Configure low Google Cloud Billing budget alerts. Alerts notify the team but do not impose a hard spending cap.
4. In Firebase Console, open **Databases & Storage -> Storage -> Get started**.
5. Select the bucket location deliberately. Prefer the same Singapore/Asia region as Firestore and the backend for latency and data locality; record any cost/free-tier trade-off before confirming because the location is difficult to change later.
6. Publish the repository's restrictive `storage.rules`; do not leave test-mode rules deployed.
7. Set the backend config variable `FIREBASE_STORAGE_BUCKET=sprout-dev-66f08.firebasestorage.app` locally and in Render. Confirm the console's displayed bucket name before using this value.
8. With `FIREBASE_STORAGE_BUCKET` and backend Firebase credentials configured, run `npm.cmd run check:storage -w server`.
9. Require `[storage-check] bucket=<bucket-name> writeReadDelete=true`, then set `STORAGE_MODE=firebase` only after the application adapter and separate rule tests pass.

Official references: [Cloud Storage web setup](https://firebase.google.com/docs/storage/web/start), [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Cloud Storage billing changes FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

## Required storage boundary

| Object | Path | Access |
|---|---|---|
| Canonical sprite | `canonical-sprites/{speciesId}/{recipeHash}.png` | Immutable; authenticated application read; backend write |
| User source photo | `users/{userId}/plant-photos/{scanId}.{ext}` | Owner/backend only; never public |

Firestore stores object paths, checksums, media metadata, and recipe versions. It does not store image blobs.

## Verification evidence

- Emulator rule tests prove cross-user source-photo reads are rejected.
- `npm.cmd run check:storage -w server` writes a tiny unique `.preflight/` object, reads and compares it, then deletes it before reporting success.
- The command uses the Admin SDK, so it verifies backend credentials and bucket write/read/delete access; it does **not** verify client Firebase Security Rules. Keep emulator rule tests as separate evidence.
- Capture the Firebase bucket/rules screen and Render variable names with all secret values hidden.
- Record command, timestamp, commit SHA, result, and evidence path in [[Test Matrix]].

## Current status

As of `2026-07-21 01:49 +08:00`, Blaze/Storage is activated and the Node 22 live Admin preflight passed against `sprout-dev-66f08.firebasestorage.app`: write, exact read-back, and cleanup all succeeded. The console screenshot shows deny-all client rules, which is safe for backend-only access. This Admin result does not test client rules. Keep `STORAGE_MODE=local` until the application Firebase Storage adapter is implemented and its integration/rule tests pass.

## Related

[[External APIs]] · [[QA Sprite Storage and Web Cache]] · [[System Architecture]] · [[Checkoff 3 Readiness and Development Plan]]
