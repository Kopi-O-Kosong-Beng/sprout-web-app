---
tags: [requirements, use-cases, checkoff3]
source: C3T2_UseCaseDescription_1D.docx, Checkoff feedback, team decisions 2026-07-20
---

# Use Case Model

## Actors

| Actor | Type | Notes |
|---|---|---|
| Visitor | Primary | Unauthenticated person who may sign up or submit a query |
| User | Primary | Authenticated player; protected gameplay additionally requires verified email |
| All | Primary composite | Visitor or User, used only for UC8 |
| Firebase Auth | Secondary | Identity, login, ID tokens, and email-verification action codes |
| Email Service | Secondary | SMTP delivery requested by Sprout |
| Plant Identification Service | Secondary | Stable species ID, taxonomy, and confidence |
| Prompt/Image Generation Service | Secondary | Versioned prompt and configured Gemini image generation |
| Background Removal Service | Secondary | Transparency before quantization |

The database, object storage, game engine, and multiplayer server are internal Sprout components, not actors. External services never bypass Sprout to complete a modeled user interaction; the system returns the delivery/result acknowledgement to the primary actor.

## Canonical use cases

| ID | Use case | Primary actor | Secondary actors | Checkoff 3 evidence |
|---|---|---|---|---|
| UC1 | [[UC1 Signup]] | Visitor | Firebase Auth, Email Service | Regression, verification completion/resend gap to close |
| UC2 | [[UC2 Login]] | User | Firebase Auth | Regression; update diagram to actual Firebase flow |
| UC3 | [[UC3 Reset Password]] | User | Email Service, Firebase Auth | Regression; real delivery and attempt cap gap |
| UC4 | [[UC4 Browse Avatar Archival]] | User | - | Integrated with UC6 collection result |
| UC5 | [[UC5 PVE Battle]] | User | - | Isolated if not fully integrated |
| UC6 | [[UC6 Upload Plant Picture]] | User | Identification, generation, background removal | Primary integrated vertical slice |
| UC7 | [[UC7 PVP Battle]] | User | - | Planned final architecture |
| UC8 | [[UC8 Submit Query Ticket]] | All | Email Service | Regression; independent admin notification gap |

## Relationship correction since Checkoff 2

Final position (2026-07-24 diagram set): **UC6 is a base use case** — `User` associates directly with both UC5 and UC6, so a user may upload and collect a plant without starting PVE — **and UC6 still `«extend»`s UC5** for the optional in-battle upload path (UC5 alternative flow 2a). The official description document `C3T2_UseCaseDescription_1D.docx` still presents UC6 only as a sub use case of UC5, so this refinement must appear in the PM3 requirement-change table and the use case diagram must show both the direct association and the `«extend»`.

## Diagram rules

1. Use the UC1-UC8 numbering above in every artifact.
2. Show internal Sprout storage inside the system boundary, never as an actor.
3. Keep each operation-flow step atomic.
4. Use explicit decision conditions such as "confidence is at or above the configured threshold."
5. Put timeouts, invalid data, and delivery failures in alternative flows.
6. Complete every flow with a Sprout response to the initiating actor.
7. Label UC7 and any unintegrated UC5 path as planned/isolated rather than implemented.
8. For the final report, add misuse cases for credential abuse, upload abuse, ticket spam, and duplicate/replayed battle actions.

The old `usecase_preview.png` is historical and must not be submitted as the current diagram.

## Delivered PM3 diagram set (2026-07-24)

The sequence diagrams (UC1–UC8, UC7 split a/b) and the domain class diagram are delivered and verified — see [[Sequence Diagram Plan]] and [[Domain Model]]. They follow the **report vocabulary** of `C3T2_UseCaseDescription_1D.docx` (secondary actors: Email Server, Plant Identification API, Google Gemma API, Image Generation API (FLUX)), not the implementation-refined actor table above (Firebase Auth, Gemini, background removal). One vocabulary must be chosen consistently for the PM3 report: keep the requirement-doc actors in diagrams and note the provider refinements (Firebase Auth as identity authority; Gemini/remove.bg as the current web pipeline target) in the requirement-change table. A **use case diagram** matching this set still needs to be updated/exported for the report (the docx contains the current image).

### Use case diagram

![Use case diagram](../_attachments/pm3-diagrams/use-case-diagram.png)

Source: `Raw dump/check_off 3/Latest Diagrams 27_Jully/UseCaseDiagram.mmd` (rendered 2026-07-25). Primary actors sit left of the system boundary, secondary actors right; UC6 is drawn as a base use case the `User` reaches directly **and** as an `«extend»` of UC5, which is the requirement change recorded in [[Checkoff 3 Requirement Changes]] row R1.

The UC1 alternative-flow numbering was reconciled with the diagram on 2026-07-25 — see [[UC1 Signup]].

## Related

[[Checkoff 3 Readiness and Development Plan]] · [[Sequence Diagram Plan]] · [[Domain Model]] · [[Testing Strategy]]
