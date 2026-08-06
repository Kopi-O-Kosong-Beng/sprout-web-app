---
tags: [meeting, feedback, checkoff2, minutes]
date: 2026-07-16
source: C:\Users\zhife\Downloads\check off2 for esc.mp4
transcript: ../../transcripts/check off2 for esc.transcript.md
---

# Checkoff 2 Consultation Minutes

## Context

Consultation after the Checkoff 2 submission. The rough transcript is stored at `transcripts/check off2 for esc.transcript.md`; use this note as the cleaned decision/action record because the machine transcript is noisy.

## Overall Feedback

- Overall feedback was positive. Prof had no major negative comments and was generally happy with the diagrams/design direction.
- Some notation differences across diagrams were acceptable for now, especially if different teammates split the work, but final artifacts should be unified.
- Continue highlighting newly implemented parts in the report and demo. If implementation changes after the video, update the corresponding diagrams so they match the actual system.

## Sequence Diagram and Use Case Guidance

- A use case should complete a round trip back to the primary actor: something starts with the actor and the system returns an acknowledgement/result.
- For email verification/reset flows, do not model direct communication from the Email Server to the User as if it is inside our system. Show:
  - Backend/System calls Email Server.
  - Backend/System acknowledges to User that an email/OTP has been sent.
  - User later confirms through the system, e.g. by opening a verification link or entering OTP.
- Nested `alt`/`opt` frames are acceptable if they are the clearest way to show the flow. Keep diagrams readable.
- Do not add a Timer/Clock as an external actor/entity for timeout logic. Model timeouts as an `alt` branch after an expected async response, and document the timeout in the use-case alternative flow.
- Sequence diagrams should focus on interactions that matter within the system boundary. Irrelevant external life-cycle details can stay out.

## Boundary, Control, Entity, and Adapter Notes

- Database remains inside the system boundary, not a secondary actor.
- Adapters/interfaces are useful where we want to swap implementations without changing the rest of the system, e.g. internal image storage vs external object storage, or external APIs.
- Internal domain entities should stay within the boundary. Use adapters mainly for persistence/service boundaries, not as extra actors.

## Avatar Generation Discussion

- Prof asked whether uploading the same plant/species from different angles should generate the same avatar or different sprites.
- Current team explanation: classification drives the avatar characteristics; the generated sprite may vary, but species/genus-level traits should remain consistent.
- Follow-up needed: decide the cache key and product rule:
  - species-level reusable sprite,
  - user-level saved sprite,
  - or generated variants with shared species traits.
- This affects database design, sprite storage, cost control, and PM3 scaling.

## AI-Assisted Maintenance Advice

- It is acceptable to use AI tools to compare code changes against sequence diagrams or design documents and flag outdated artifacts.
- Human review is still required before accepting diagram/document changes because AI can miss context.

## Action Items

| Action | Owner | Target |
|---|---|---|
| Update UC1/UC3 sequence diagrams so email flows acknowledge the user through our system, not direct Email Server-to-User communication. | Design/docs team | Before next report/demo refresh |
| Add timeout alternative paths for OTP/reset flows; do not add Timer/Clock as an actor. | Use case + sequence diagram owners | PM3 docs |
| Keep nested `alt` frames only where they improve readability. | Diagram owners | Ongoing |
| Decide sprite reuse/cache rule for same species / same user / generated variants. | Backend + design team | PM3 planning |
| Use adapters/interfaces for storage and external services; keep DB as internal. | Architecture/backend team | PM3 implementation |
| After code changes, ask AI/tooling to flag diagram mismatches, then manually review. | All implementers | Ongoing |

## Related

[[Checkoff 2 Plan]] · [[Sequence Diagram Plan]] · [[Use Case Model]] · [[Domain Model]] · [[QA Sprite Storage and Web Cache]] · [[Open Questions and Inconsistencies]]
