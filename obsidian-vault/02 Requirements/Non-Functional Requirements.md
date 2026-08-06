---
tags: [requirements, nfr, security, performance, checkoff3]
source: process.md, requirements.md, approved design 2026-07-20
---

# Non-Functional Requirements

## Catalogue

| ID | Requirement | Checkoff 3 interpretation |
|---|---|---|
| NFR1 | Testability | Interfaces for Firebase, providers, storage, email, and repositories; deterministic game/image functions |
| NFR2 | Maintainability | Routes/controllers/services/domain/repositories/adapters have separate responsibilities |
| NFR3 | Reliability | Stable errors, timeout handling, no partial completed asset, recoverable email/generation states |
| NFR4 | Security | Firebase token verification, verified-route gating, input/file validation, private photos, rate limits, no exposed secrets |
| NFR5 | Performance | Paginated archive, immutable cached sprites, no generation on cache hit, nonblocking API behavior |
| NFR6 | Scalability | Canonical assets grow by species/recipe rather than total scans; PVP remains separable |
| NFR7 | Usability | Clear upload/verification progress and recoverable error actions |

## Security

- Validate request schemas before service work.
- Verify upload magic bytes, accepted type, and 5 MB limit before provider calls.
- Keep Firebase Admin, provider, SMTP, and storage credentials in backend deployment secrets only.
- Accept Firebase ID tokens; reject missing/invalid tokens with 401 and unverified gameplay access with 403.
- Keep local/demo auth bypass flags false in production.
- Never store/log plaintext passwords or OTPs; OTP is bcrypt-hashed with 15-minute TTL.
- Rate-limit auth, verification resend, uploads, tickets, and battle actions.
- Use owner/service-only rules for user photos and server-only writes for canonical art.
- Treat action-code, provider, and storage errors as sanitized public failures.

## Reliability and consistency

- Canonical recipe key and generation lock prevent duplicate generation.
- No collection row references an incomplete/missing sprite object.
- Ticket persistence is independent from each email outcome.
- PVE expected turn number and reward marker make retries idempotent.
- `VISITED` may promote to `CAUGHT`, never demote.
- External providers are replaceable with deterministic fakes.

## Performance targets

| Scenario | Target/evidence direction |
|---|---|
| Login/profile | p95 under 500 ms excluding Firebase network variance; no cross-user leakage |
| Upload validation | Reject invalid/oversized file before external work |
| Cache hit | No generation/background-removal call; archive result returned from stored asset |
| Generation | User sees staged progress; bounded provider timeouts; backup seeded path available |
| Archive | Paginated, default 20, owner-filtered |
| Same-species concurrency | One completed recipe asset |
| PVE | 50 isolated sessions target; no duplicated action/reward |
| Tickets | Atomic daily reference numbers; no duplicates under concurrency |

Do not quote an unrealistic fixed upload p95 while live generation may take tens of seconds. Measure cache-hit and cache-miss paths separately in the report.

## Testability

- Pure/versioned quantizer and battle calculations.
- Repository contracts shared by Firestore and SQLite adapters.
- Provider/storage/email interfaces injected into services.
- Unit tests for normal, boundary, negative, state, and concurrency cases.
- Call-graph bottom-up integration and use-case-derived system tests.
- Property/fuzz targets for image parsing, quantization, ticket refs, and battle invariants.

## Related

[[System Architecture]] · [[Testing Strategy]] · [[Robustness and Fuzzing]] · [[GenAI Sprite Pipeline]]
