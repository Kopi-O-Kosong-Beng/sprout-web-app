# Firestore Profile Reconciliation Evidence

**Date:** 2026-07-22

## Scope

This one-time safety gate reconciled active local SQLite profiles into the
existing Firestore `users` collection before the later SQLite-removal task.
Existing Firestore documents remained authoritative. No SQLite data was
deleted in this task.

## Runtime

All npm commands used Node.js `v22.23.1` with the Node 22 executable directory
prepended to `PATH` so the `tsx` child process used the same ABI:

```powershell
$node22 = 'C:\Users\zhife\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin'
$env:PATH = "$node22;$env:PATH"
& "$node22\node.exe" 'D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' <npm args>
```

The live commands set `DB_FILENAME=./database/sprout.local-test.sqlite3` and
resolved the ignored Firebase service-account path for the current process
only. Neither the credential value nor an email, password hash, OTP, ticket
body, or other secret was printed or committed.

## Automated Evidence

| Check | Command | Result |
| --- | --- | --- |
| RED | `npm test -w server -- --runTestsByPath tests/reconcile-sqlite-to-firestore.test.ts` | Failed as expected: planner module did not exist (`TS2307`). |
| GREEN | Same focused command after implementation | PASS: 1 suite, 4 tests. |
| Type check | `npm run typecheck -w server` | PASS. |
| Full server suite | `npm test -w server` | PASS: 10 suites, 83 tests. |

## Live Reconciliation

The first attempted live dry-run was stopped before any data operation because
the default shell selected Node 24 for `tsx`, producing a SQLite ABI mismatch.
After forcing Node 22, the worktree default SQLite file was confirmed empty.
The preserved audited source was then explicitly selected as
`sprout.local-test.sqlite3`.

| Stage | Local profiles | Firestore profiles | Firebase Auth users | Local avatars | Firestore avatars | Create | Existing skip | Orphan exclude | Unmatched avatars | Safe |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Guarded dry-run | 4 | 4 | 11 | 5 | 5 | 2 | 1 | 1 | 0 | Yes |
| Explicit apply | 4 | 4 | 11 | 5 | 5 | 2 | 1 | 1 | 0 | Yes |
| Post-apply dry-run | 4 | 6 | 11 | 5 | 5 | 0 | 3 | 1 | 0 | Yes |

The apply created two Auth-backed Firestore profiles and copied zero
password-history records because no matching local history rows existed. It
cleared all reset-OTP fields in the copied profile objects. The five legacy
avatars matched Firestore as fingerprint multisets despite independently
generated document IDs and timestamps.

## Safety Review

- A profile is created only when its UID exists in Firebase Authentication and
  its Firestore profile is absent.
- Existing Firestore profile documents are never overwritten: creation uses
  Firestore `DocumentReference.create`.
- The CLI defaults to `--dry-run`; `--apply` refuses an unsafe plan.
- Local avatar fingerprints are compared as multisets, and a non-demo local
  avatar owner also blocks safe removal.
- The orphan local profile was intentionally excluded. It remains in SQLite
  until the later removal task, which must retain this evidence.

**Task commit:** the Git commit that adds this evidence and the reconciliation
script is the authoritative immutable record for this run.
