---
tags: [requirements, scope, checkoff3]
source: process.md, Sprout_Features.md, Sprout_Storage_IP.md, team decisions 2026-07-20
---

# Feature Priorities

Checkoff 3 uses evidence levels so the team can show useful progress without overclaiming integration.

## P0 - integrated and regression-protected

- Firebase signup/login with real signup verification email, in-app verification, resend, and verified-route gating.
- Password reset OTP email with expiry, attempt limit, recent-password protection, and privacy-preserving response.
- Plant upload validation and identification.
- Canonical-per-species sprite reuse/generation with versioned recipe lock.
- remove.bg plus 56x56 FLORENTINE24 post-processing.
- Object storage for canonical sprites and private source photos.
- One cross-platform collection entry per user/species with `VISITED`/`CAUGHT` provenance.
- Archive display of persisted collection records.
- Contact Us ticket persistence and independent Sprout-admin notification.
- Backend and frontend framework tests plus table-form test plan.
- Current, standardized use-case, domain/class, MVC/BCE, and sequence diagrams.

## P1 - isolated Checkoff 3 feature

- Playable PVE slice: one collected plant versus a fixed/versioned NPC.
- Server-authoritative alternating state machine with seeded RNG.
- Idempotent rewards: win +20 XP, loss +5 XP, abandon +0 XP.

PVE may be demonstrated in isolation when that preserves the reliability of the P0 vertical slice. It must still have running tests and a current sequence/state diagram.

## P2 - planned final architecture

- Real-time PVP and matchmaking.
- Public seasonal leaderboard with anti-farming limits.
- Advanced NPC difficulties, stat scaling, move progression, and cosmetics.
- Admin ticket dashboard and automated notification retry worker.
- Business analytics and advertisement API.

## Scope rule

Protect the complete upload-to-archive evidence chain first. A smaller integrated feature with correct diagrams and tests scores more reliably than a broad demo with crashes or undocumented behavior.

## Related

[[Checkoff 3 Readiness and Development Plan]] · [[Use Case Model]] · [[Timeline and Milestones]]
