---
tags: [meeting, feedback, checkoff1]
source: Prof feedback notes (Checkoff 1), 2026-06
---

# Checkoff 1 — Prof Feedback & Action Items

Overall verdict: **"Generally happy."** Use case diagram good; good that landing-page/UI-specific items were deleted; UC4 (Upload, in old numbering) cited as a good example.

## Use case corrections

| # | Feedback | Action | Where |
|---|---|---|---|
| 1 | Keep use cases **generic** (no "goes to landing page") — generic ≠ ambiguous | Sweep all UC text for UI specifics | [[Use Case Model]] |
| 2 | **Preconditions generalised**; if an alternative flow handles it, don't put it in the precondition | Rewrite preconditions in every UC | all UC notes |
| 3 | Precondition must be **consistent with error states** | Cross-check each UC's precondition vs error list | all UC notes |
| 4 | **Reset password = separate base case**, not `extends UC2` | Update diagram + doc | [[UC3 Reset Password]] |
| 5 | UC3: remove "registered account and password" precondition — *"we cannot control how users feel; anyone can click that button"* | Precondition → none; invalid users → alternative flows | [[UC3 Reset Password]] |
| 6 | Handle invalid people in **alternative flows** + weaken preconditions so flows are accessible by anyone | Pattern applied across UC1–UC8 | all UC notes |
| 7 | **Atomic steps** — one action per step; UC3's OTP step was jumped | Split request/receive/enter/validate OTP | [[UC3 Reset Password]] |
| 8 | UC6 (Upload): make the confidence decision explicit — say **"greater than threshold"** in natural language | Threshold named + phrased in flow step 4 | [[UC6 Upload Plant Picture]] |
| 9 | **Database is part of your system, not a secondary actor** | Remove DB from actor list, redraw diagram | [[Use Case Model]] |

## Sequence diagram guidance

- **Distinguish mobile and web endpoints** (two client lifelines)
- Cross-platform = **backend API call**, never client → database; keep one modular backend endpoint for both platforms
→ implemented in [[Sequence Diagram Plan]]

## Tech stack / hosting

- **Vercel sufficient** — no custom domain, no CI/CD needed
- "ESC doesn't care about hosting" → don't burn PM2 time on deploy infra ([[Tech Stack Decision]])

## Testing

- Consider **uptime, limits**
- React is easy to unit test around component lifecycle (client-side)
- Server-side per-class testing is easy — structure services accordingly
- Move logic from client to server where possible
→ folded into [[Testing Strategy]] and [[Non-Functional Requirements]]

## PM2 consequence

"Changes in requirement since PM1 (1%)" — this feedback **is** the change list. Write it up explicitly in the PM2 report: what changed (UC3 relationship, preconditions, atomic steps, threshold wording, DB-as-internal) and why. See [[Checkoff 2 Plan]].
