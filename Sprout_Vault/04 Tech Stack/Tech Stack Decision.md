---
tags: [tech-stack, decision, checkoff3]
source: Master.docx, current web repository, team decision 2026-07-20
updated: 2026-07-20
---

# Tech Stack Decision

## Current approved stack

| Layer | Decision | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript + React Router | Existing implementation |
| Backend | Node.js + Express + TypeScript | REST API, services, middleware, adapters |
| Authentication | Firebase Auth client + Firebase Admin token verification | Firebase is identity/token authority |
| Production data | Firestore | Repository access only |
| Local/test data | SQLite + Knex | Deterministic/offline adapter |
| Image objects | Firebase Storage | Local/seeded adapter fallback if billing unavailable |
| Email | Nodemailer/SMTP deployed; console/fake local/tests | Secrets backend-only |
| Plant intelligence | Identification adapter + prompt adapter + configured Gemini image adapter | Provider models are environment/version configured |
| Image post-processing | Background-removal adapter + internal FLORENTINE24 quantizer | 56x56 transparent PNG |
| Backend tests | Jest + Supertest | Existing framework |
| Frontend tests | Vitest + React Testing Library | Must be configured for PM3 evidence |
| System tests | Playwright or Cypress | Optional PM3 evidence, expected by final |
| Hosting | Vercel frontend + Render/approved Node backend | Firebase for identity/data/objects |

## Auth decision

The earlier custom JWT versus Firebase fork is closed. The repository uses Firebase client login and Express Firebase ID-token verification. Keep the custom six-digit OTP reset for UC3 because it is already implemented and demonstrates security/testing logic. Do not add a second custom signup-verification token system.

## Persistence decision

Firestore is the production application store; SQLite is a local/test fallback behind the same repository interface. Clients use Sprout APIs for cross-platform workflows and do not receive unrestricted database access. Images live in object storage and documents contain only references/metadata.

## AI/storage decision

The Android Gemma/FLUX pipeline is a reference, not the web target. Checkoff 3 uses versioned prompt and Gemini image adapters, background removal, deterministic 56x56 FLORENTINE24 quantization, and canonical per-species storage.

## Historical rationale

SQLite/custom auth was useful for Checkoff 2 because it reduced cloud dependencies and matched the early requirements. The code then adopted Firebase Auth/Firestore. Checkoff 3 documentation follows the actual implementation and records the change instead of presenting the obsolete option as current.

## Related

[[External APIs]] · [[Database Schema]] · [[System Architecture]] · [[Checkoff 3 Readiness and Development Plan]]
