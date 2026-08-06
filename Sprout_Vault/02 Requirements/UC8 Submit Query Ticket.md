---
tags: [use-case, contact, email, checkoff3]
id: UC8
source: C3T2_UseCaseDescription_1D.docx, requirements.md, current web code
---

# UC8 - Submit Query Ticket

**Checkoff 3 evidence:** regression flow with production admin-notification reliability gap to close.  
**Description:** A visitor or user submits a Contact Us query. Sprout persists it, returns a reference number, confirms receipt, and notifies the Sprout admin.  
**Actors:** Primary - All (Visitor or User). Secondary - Email Service.  
**Trigger:** Submitter sends the Contact Us form.  
**Precondition:** None.  
**Postcondition:** Ticket is persisted with a unique reference number; notification outcomes are recorded.  
**Error states:** Invalid input, persistence failure, submitter-email failure, admin-email failure.

## Canonical form

> [!warning] Corrected 2026-07-25
> An earlier revision of this note declared the reduced `name`/`email`/`category`/`message` set canonical and asked for the diagrams to drop organisation, subject, and inquiry type. That inverted the agreed direction: the 2026-07-24 diagram set and `C3T2_UseCaseDescription_1D.docx` both specify the fuller form, so the **implementation was corrected to match the requirement** rather than the other way round. See [[Checkoff 3 Requirement Changes]] row R3.

The documented field set, now implemented:

- `name`: trimmed, 1-100 characters, required.
- `email`: valid email address, required.
- `organisation`: trimmed, up to 120 characters, **optional**.
- `subject`: trimmed, 1-150 characters, required.
- `category` (inquiry type): `general`, `partnership`, `technical_support`, or `feedback`.
- `message`: trimmed, 1-2000 characters, required.

The legacy values `bug`, `billing`, and `other` remain accepted by the API so tickets stored before the realignment still decode; the Contact Us dropdown offers only the four documented types.

## Operation flow

1. Submitter enters name, email, organisation (optional), subject, inquiry type, and message.
2. Sprout validates the fields.
3. Sprout atomically creates the ticket and daily reference number.
4. Sprout attempts the submitter confirmation email.
5. Independently, Sprout attempts the Sprout-admin notification email.
6. Sprout records each notification outcome.
7. Sprout returns HTTP 201 with the reference number.

## Alternative flows

- **2a Invalid input:** return field errors and create no ticket.
- **3a Persistence failure:** return 5xx and do not claim a reference number.
- **4a Submitter email fails:** record failure; continue to the admin attempt and return the persisted reference number.
- **5a Admin email fails:** record failure; do not roll back or hide the ticket.
- **4a and 5a both fail:** preserve the ticket and both failure states for manual/automated retry.

## Rules

- Reference format: `SPR-YYYYMMDD-NNNN`, zero-padded daily atomic sequence.
- Email is best-effort after authoritative ticket persistence.
- The two email sends are separate failure boundaries.
- In tests, use a fake/console adapter. In deployed mode, use SMTP with environment-only secrets.
- The system sequence ends with Sprout returning the reference number; do not draw Email Service -> Submitter as the system acknowledgement.

## Implementation status

Branch commit `ec01228` resolves the coupled-send defect: the ticket is created with `pending` delivery state, both emails are attempted through `Promise.allSettled`, and SQLite/Firestore persist each outcome. Focused repository/query tests pass.

The remaining gap is deployment evidence. `EMAIL_MODE` is not yet verified as SMTP with a Gmail App Password, so no claim should be made that the submitter or admin received a real message. That belongs to `SYS-E02`, not the unit/integration result.

The untracked `GOOGLE_SMTP_VERIFICATION_PLAN.md` suggests making UC8 database-only. That contradicts this use case and the team's stated outstanding admin-email requirement, so it is not the adopted Checkoff 3 behavior.

## Related

[[Database Schema]] · [[API Contract]] · [[Testing Strategy]] · [[Checkoff 3 Readiness and Development Plan]]
