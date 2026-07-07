# Requirements Document

## Introduction

Sprout is a gamified web platform that turns plant discovery into a nature-learning experience. Users
authenticate with a Sprout account, browse a Pokédex-style plant avatar archival, upload plant photos
for AI-generated pixel-art sprites, battle with their avatars in PVE matches, and contact the team via
a query ticket form. The backend is a Node.js/Express REST API; the frontend is a React SPA; both are
hosted on Vercel. The platform synchronises with a cross-platform account database shared with the
Sprout mobile app.

This document derives formal, EARS-compliant requirements from the approved design document. All P0
features are fully specified. P1 and P2 features are noted where they affect the architecture but are
not the primary scope of this requirements document.

---

## Glossary

- **System**: The Sprout Web Platform (React frontend + Node.js/Express backend together).
- **Backend**: The Node.js/Express server responsible for API routing, business logic, data persistence, and external service orchestration.
- **Frontend**: The React single-page application served to the user's browser.
- **Auth_Controller**: The backend module (`auth.controller.js`) that handles all authentication-related requests.
- **Upload_Controller**: The backend module (`upload.controller.js`) that handles plant image upload requests and orchestrates the GenAI pipeline.
- **Battle_Service**: The backend service (`battle.service.js`) that encapsulates PVE battle logic including damage calculation and NPC action selection.
- **Ticket_Service**: The backend service (`ticket.service.js`) that creates query tickets and dispatches confirmation emails.
- **Email_Service**: The backend service (`email.service.js`) that delivers transactional email via SMTP/SendGrid.
- **PlantID_Service**: The backend service wrapper for the external Plant Identification API.
- **Gemma_Service**: The backend service wrapper for the Google Gemma API.
- **Flux_Service**: The backend service wrapper for the FLUX image generation API.
- **Avatar_Stats_Deriver**: The pure function `deriveAvatarStats` inside `battle.service.js` that deterministically maps species and taxonomy data to `AvatarStats`.
- **Multer**: The Node.js multipart upload middleware used to receive and validate plant images.
- **JWT**: JSON Web Token used as the bearer token for authenticated API requests.
- **OTP**: One-time password — a 6-digit numeric code used for password reset verification.
- **PasswordHistory**: A persisted record of a user's previous bcrypt password hashes, used to reject recently reused passwords during reset (retention: last 3 hashes per user).
- **TempAvatar**: A temporary `AvatarRecord` created from a web upload, marked `isTemporary: true`, with a 24-hour TTL.
- **AvatarRecord**: A persisted record of a plant avatar including sprite URL, species data, and `AvatarStats`.
- **BattleSession**: A persisted record of an active or completed PVE battle between a user avatar and an NPC.
- **QueryTicket**: A persisted support request record with a unique reference number.
- **RefNumber**: The unique ticket identifier in the format `SPR-YYYYMMDD-NNNN`.
- **NPC**: A system-generated opponent in a PVE battle.
- **MIN_CONFIDENCE_THRESHOLD**: The minimum plant identification confidence score (default: 0.70) required to proceed with avatar generation.
- **MAX_UPLOAD_BYTES**: The maximum permitted file size for plant image uploads (5 MB).

---

## Requirements

### Requirement 1: User Signup

**User Story:** As a visitor, I want to create a Sprout web account using my email address, so that I can access avatar collection and battle features.

#### Acceptance Criteria

1. WHEN a visitor submits a signup request with a valid email and a strong password, THE Auth_Controller SHALL create a new `User` record in the database with `isVerified` set to `false` and respond with HTTP 201.
2. WHEN a visitor submits a signup request, THE Auth_Controller SHALL hash the password using bcrypt before storing it and SHALL NOT persist any plaintext password.
3. WHEN a visitor submits a signup request with a valid new email, THE Email_Service SHALL send a verification email containing a unique verification token to that address.
4. IF a visitor submits a signup request with an email that is already registered, THEN THE Auth_Controller SHALL respond with HTTP 409 and the error `"An account with this email already exists."` without creating a duplicate record.
5. IF a visitor submits a signup request with a password that does not meet strength requirements, THEN THE Auth_Controller SHALL respond with HTTP 400 and a descriptive error message without creating a user record.
6. IF a visitor submits a signup request with a malformed email address, THEN THE Auth_Controller SHALL respond with HTTP 400 without creating a user record.
7. WHEN a visitor clicks the verification link in the email, THE Auth_Controller SHALL mark the corresponding `User` record `isVerified` to `true` and respond with HTTP 200.
8. IF an unverified user attempts to access authenticated routes, THEN THE Backend SHALL respond with HTTP 403.

---

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my avatar collection and game features.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE Auth_Controller SHALL authenticate the user and respond with HTTP 200 containing a signed JWT access token.
2. WHEN a user submits valid credentials, THE Auth_Controller SHALL include the user's `displayName` and `isVerified` status in the response payload.
3. IF a user submits an incorrect password or an email that does not exist, THEN THE Auth_Controller SHALL respond with HTTP 401 and the message `"Invalid email or password."` without revealing which field is incorrect.
4. IF a user submits login credentials more than 10 times within a 15-minute window from the same IP address, THEN THE Backend SHALL respond with HTTP 429 and block further login attempts until the window expires.
5. WHEN a user logs out, THE Auth_Controller SHALL invalidate the current JWT so it cannot be reused.
6. WHILE a user holds a valid JWT, THE Backend SHALL accept it as authentication proof for protected routes.
7. IF a request to a protected route carries an expired, missing, or tampered JWT, THEN THE Backend SHALL respond with HTTP 401 and the message `"Unauthorised."`.

---

### Requirement 3: Password Reset via OTP

**User Story:** As a registered user who has forgotten my password, I want to receive a one-time password by email and use it to set a new password, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user submits a password reset request with a registered email address, THE Auth_Controller SHALL generate a cryptographically random 6-digit OTP, hash it with bcrypt, store the hash with a 15-minute TTL, and respond with HTTP 200.
2. WHEN a password reset is requested, THE Email_Service SHALL send the plaintext OTP to the registered email address within the TTL window.
3. WHEN a user submits a valid OTP and a new strong password before the TTL expires, THE Auth_Controller SHALL update the `User` record with the new bcrypt-hashed password, invalidate the OTP, and respond with HTTP 200.
4. IF a user submits an OTP after the 15-minute TTL has expired, THEN THE Auth_Controller SHALL respond with HTTP 400 and the message `"OTP has expired. Request a new one."` and SHALL NOT update the password.
5. IF a user submits an incorrect OTP value, THEN THE Auth_Controller SHALL respond with HTTP 400 and the message `"Invalid OTP."` and SHALL NOT update the password.
6. IF a user submits a new password that does not meet strength requirements during OTP verification, THEN THE Auth_Controller SHALL respond with HTTP 400 and SHALL NOT update the password.
7. WHEN a user successfully resets their password, THE Auth_Controller SHALL set `resetOtpHash` and `resetOtpExpiresAt` to `null` on the `User` record so the OTP cannot be reused.
8. IF a password reset is requested for an email address that is not registered, THEN THE Auth_Controller SHALL respond with HTTP 200 without revealing whether the account exists.
9. IF a user submits a new password during OTP verification that matches any hash in their PasswordHistory (last 3), THEN THE Auth_Controller SHALL respond with HTTP 400 and the message `"This password was used recently. Choose a different password."` and SHALL NOT update the password.
10. WHEN a user successfully resets their password, THE Auth_Controller SHALL archive the previous password hash into PasswordHistory before overwriting it, retaining at most the 3 most recent entries per user.

---

### Requirement 4: Landing Page

**User Story:** As a visitor, I want to view an informative and visually engaging landing page, so that I can understand the Sprout platform and navigate to key actions.

#### Acceptance Criteria

1. THE Frontend SHALL render the landing page at the root URL (`/`) for all visitors, including unauthenticated users.
2. THE Frontend SHALL display a call-to-action that navigates to the signup page.
3. THE Frontend SHALL display a navigation element that navigates to the login page.
4. THE Frontend SHALL display a navigation element that navigates to the query ticket (Contact Us) page.
5. WHEN an authenticated user visits the landing page, THE Frontend SHALL display a navigation element that links to the user's dashboard.
6. THE Frontend SHALL render the landing page fully within 3 seconds on a standard broadband connection.

---

### Requirement 5: Browse Plant Avatar Archival

**User Story:** As a logged-in user, I want to browse my plant avatar collection in a grid view, so that I can explore my discovered plants and their stats.

#### Acceptance Criteria

1. WHEN an authenticated user requests their avatar list, THE Backend SHALL return a paginated list of `AvatarRecord` objects belonging to that user, with a default page size of 20.
2. THE Frontend SHALL render the avatar collection as a responsive grid of `AvatarCard` tiles, each showing the sprite image, species name, and discovery date.
3. WHEN a user selects an avatar tile, THE Frontend SHALL display detailed information including the avatar's `AvatarStats` (HP, ATK, DEF, SPD) and species family.
4. IF the authenticated user has no avatars, THEN THE Frontend SHALL display an appropriate empty-state message.
5. WHEN the Backend returns avatar data, THE Backend SHALL only return `AvatarRecord` objects whose `userId` matches the authenticated requester's ID.
6. IF a request to the avatar archive endpoint is made without a valid JWT, THEN THE Backend SHALL respond with HTTP 401.
7. THE Backend SHALL support pagination via `page` and `pageSize` query parameters on `GET /api/avatar`.

---

### Requirement 6: Upload Plant Picture

**User Story:** As a logged-in user, I want to upload a plant photograph, so that the system can identify the species and generate a pixel-art avatar for me to use in battle.

#### Acceptance Criteria

1. THE Frontend SHALL accept image files in JPEG, PNG, and WEBP formats only, and SHALL reject files with other formats before upload.
2. THE Frontend SHALL reject files larger than 5 MB before upload and SHALL display an error message to the user.
3. THE Frontend SHALL display a preview thumbnail of the selected image before the user submits the upload.
4. WHEN a user submits a valid image, THE Frontend SHALL display a processing indicator showing pipeline progress until a result is received.
5. WHEN an authenticated user submits a valid plant image, THE Upload_Controller SHALL validate the file type using magic bytes (not only the MIME header) and the file size.
6. IF the uploaded file fails backend validation (invalid type or exceeds MAX_UPLOAD_BYTES), THEN THE Upload_Controller SHALL respond with HTTP 400 and the message `"Invalid file. Upload a JPEG, PNG, or WEBP image under 5 MB."` without invoking any external API.
7. WHEN the image passes validation, THE Upload_Controller SHALL submit the image to the PlantID_Service for species identification.
8. IF the PlantID_Service returns a confidence score below MIN_CONFIDENCE_THRESHOLD, THEN THE Upload_Controller SHALL respond with HTTP 422 and the message `"Cannot identify plant with sufficient confidence. Try retaking the photo in better lighting."` without proceeding to avatar generation.
9. WHEN plant identification succeeds with sufficient confidence, THE Upload_Controller SHALL submit the plant species and taxonomy data to the Gemma_Service to generate a pixel-art sprite prompt.
10. WHEN Gemma_Service returns a prompt, THE Upload_Controller SHALL submit the prompt to the Flux_Service to generate a pixel-art sprite image.
11. WHEN the Flux_Service returns a sprite URL, THE Upload_Controller SHALL invoke the Avatar_Stats_Deriver to deterministically compute `AvatarStats` from the species name and taxonomy.
12. WHEN all pipeline steps succeed, THE Upload_Controller SHALL persist a `TempAvatar` record with `isTemporary: true` and `expiresAt` set to 24 hours after the current time, and respond with HTTP 200 containing a `TempAvatarResult`.
13. IF any external service (PlantID, Gemma, or FLUX) fails or times out after exhausting retries, THEN THE Upload_Controller SHALL respond with HTTP 503 and a user-readable error message, and SHALL NOT persist any partial `AvatarRecord`.
14. THE Backend SHALL enforce a rate limit of 5 plant uploads per user per hour, responding with HTTP 429 when exceeded.

---

### Requirement 7: GenAI Image-to-Sprite Pipeline

**User Story:** As a developer, I want the plant identification and sprite generation pipeline to be reliable and fault-tolerant, so that transient external API failures do not cause permanent data corruption.

#### Acceptance Criteria

1. THE PlantID_Service SHALL set a request timeout of 10 seconds per attempt and retry up to 2 times on transient failures before propagating an error.
2. THE Gemma_Service SHALL set a request timeout of 15 seconds per attempt and retry up to 1 time on transient failure before propagating an error.
3. THE Flux_Service SHALL set a request timeout of 30 seconds per attempt and retry up to 1 time on transient failure before propagating an error.
4. THE Avatar_Stats_Deriver SHALL produce deterministic output such that the same `speciesName` and `taxonomy` inputs always yield the same `AvatarStats` values.
5. THE Avatar_Stats_Deriver SHALL produce `AvatarStats` where `hp` is in the range [1, 200], `attack` is in the range [1, 100], `defense` is in the range [1, 100], and `speed` is in the range [1, 100] for all valid inputs.
6. WHEN the taxonomy indicates the species is a tree, THE Avatar_Stats_Deriver SHALL apply the tree HP and defense bonus modifiers defined in the design algorithm, subject to their respective caps.
7. WHEN the taxonomy indicates the species is a flower, THE Avatar_Stats_Deriver SHALL apply the flower attack and speed bonus modifiers, subject to their respective caps.
8. WHEN the taxonomy indicates the species is a fungus, THE Avatar_Stats_Deriver SHALL apply the fungus attack bonus and defense penalty modifiers, subject to their respective bounds.
9. IF the pipeline fails at any step after image validation, THEN THE Backend SHALL roll back any partial database writes so that no incomplete `AvatarRecord` persists.

---

### Requirement 8: PVE Battle

**User Story:** As a logged-in user, I want to battle a system-controlled opponent using one of my plant avatars or a temporary upload avatar, so that I can experience the game and earn rewards.

#### Acceptance Criteria

1. WHEN an authenticated user starts a PVE battle with a valid `avatarId`, THE Backend SHALL load the corresponding `AvatarRecord`, generate an NPC opponent via the Battle_Service, create a `BattleSession` record with `status: "active"`, and respond with the session state including both avatars and `turn: "user"`.
2. WHEN an authenticated user starts a PVE battle with a valid `tempAvatarId`, THE Backend SHALL accept the temporary avatar as the user's combatant for that session.
3. WHEN a user submits a turn action (`"attack"`, `"special"`, or `"defend"`), THE Battle_Service SHALL calculate the user's damage output, apply it to the NPC's current HP (floored at 0), then select and resolve the NPC's counter-action before responding.
4. WHEN the user action is `"defend"`, THE Battle_Service SHALL reduce the NPC's damage for that turn by multiplying it by `DEFEND_MULTIPLIER` (0.5) before applying it to the user's HP.
5. WHEN the user action is `"special"`, THE Battle_Service SHALL calculate damage as 1.5× base damage rounded down.
6. WHEN the user action is `"attack"` or `"special"`, THE Battle_Service SHALL return a damage value of at least 1.
7. WHILE a `BattleSession` is active, THE Battle_Service SHALL ensure that `userCurrentHp` and `npcCurrentHp` never fall below 0 at any point during turn resolution.
8. WHEN the NPC's HP reaches 0, THE Battle_Service SHALL set `session.status` to `"won"` and `session.endedAt` to the current timestamp.
9. WHEN the user's HP reaches 0, THE Battle_Service SHALL set `session.status` to `"lost"` and `session.endedAt` to the current timestamp.
10. WHEN a battle concludes, THE Backend SHALL persist the final `BattleSession` record to the database and respond with the result and any rewards.
11. WHEN a turn is resolved, THE Battle_Service SHALL append exactly 1–2 `BattleTurnLog` entries to `session.log` reflecting the actors and outcomes of that turn.
12. THE Battle_Service SHALL produce deterministic damage output such that the same `attacker`, `defender`, and `action` inputs always yield the same damage value.
13. IF a user submits a battle action for a session that is not `"active"` or does not belong to the authenticated user, THEN THE Backend SHALL respond with HTTP 400 and the message `"Invalid or expired battle session."`.

---

### Requirement 9: Submit Query Ticket

**User Story:** As a visitor or user, I want to submit a support query through a Contact Us page, so that I can get help from the Sprout team and receive a reference number for my request.

#### Acceptance Criteria

1. THE Frontend SHALL render a query ticket form accessible to both authenticated and unauthenticated users.
2. THE QueryTicketForm SHALL collect `name`, `email`, `category`, and `message` fields, and SHALL validate all fields client-side before submission.
3. IF a user submits the form with any required field missing, THEN THE Frontend SHALL display a validation error and prevent submission.
4. IF a user submits the form with a malformed email address, THEN THE Frontend SHALL display an error and prevent submission.
5. WHEN valid form data is submitted, THE Ticket_Service SHALL create a `QueryTicket` record with `status: "open"` and a unique `RefNumber` in the format `SPR-YYYYMMDD-NNNN`.
6. WHEN a ticket is created, THE Email_Service SHALL send a confirmation email to the submitter's address containing the `RefNumber`.
7. WHEN a ticket is created, THE Email_Service SHALL send a team notification email to the Sprout admin address.
8. IF the Email_Service fails to deliver the confirmation or notification email, THEN THE Ticket_Service SHALL still persist the `QueryTicket` and return the `RefNumber` to the caller, and SHALL log the email failure for manual retry.
9. THE Backend SHALL respond with HTTP 201 and `{ refNumber }` on successful ticket creation.
10. FOR ALL `QueryTicket` records created within the same calendar day, THE Ticket_Service SHALL generate `RefNumber` values that are unique and use a zero-padded daily sequence counter.
11. IF the submitted `message` exceeds 2000 characters, THEN THE Backend SHALL respond with HTTP 400 without creating a ticket.
12. IF the submitted `category` is not one of `"general"`, `"bug"`, `"billing"`, `"partnership"`, or `"other"`, THEN THE Backend SHALL respond with HTTP 400 without creating a ticket.

---

### Requirement 10: Cross-Platform Account Database

**User Story:** As a returning Sprout mobile user, I want my plant avatar records to be accessible on the web platform, so that I can view my collection without re-scanning plants.

#### Acceptance Criteria

1. THE Backend SHALL store all `User`, `AvatarRecord`, `BattleSession`, and `QueryTicket` records in the shared cross-platform database.
2. WHEN an authenticated user requests their avatar list, THE Backend SHALL return all `AvatarRecord` entries — including those created on the mobile platform — that are associated with the user's account ID.
3. THE Backend SHALL use parameterised queries or ORM-level sanitisation for all database operations to prevent SQL/NoSQL injection.
4. IF a database operation fails during a critical write (e.g., user creation, ticket creation), THEN THE Backend SHALL return an appropriate HTTP 5xx error and SHALL NOT return a success response to the caller.

---

### Requirement 11: Security and Input Validation

**User Story:** As a system administrator, I want all user inputs and API calls to be validated and sanitised, so that the platform is protected from abuse and data corruption.

#### Acceptance Criteria

1. THE Backend SHALL validate all request bodies against defined schemas (using `joi` or `zod`) at the controller layer before passing data to any service.
2. THE Backend SHALL never log or store a plaintext password at any point in any code path.
3. THE Backend SHALL validate uploaded image files by magic bytes in addition to the declared MIME type header.
4. THE Backend SHALL enforce CORS to permit API requests only from the deployed Vercel frontend origin in production.
5. THE Backend SHALL store all API keys for PlantID, Gemma, FLUX, and email services as environment variables and SHALL NOT commit them to source control.
6. WHEN a JWT is issued, THE Auth_Controller SHALL sign it with a secret stored in an environment variable and set an expiry of 1 hour.
7. THE Backend SHALL apply `express-rate-limit` to all authentication endpoints (login: 10 attempts per 15 min per IP) and upload endpoints (5 uploads per hour per user).
8. THE Backend SHALL use bcrypt with a cost factor of at least 12 for all password hashing operations.

---

### Requirement 12: Performance and Reliability

**User Story:** As a platform operator, I want the backend to handle concurrent users reliably and respond within acceptable latency bounds, so that the user experience remains consistent under load.

#### Acceptance Criteria

1. THE Backend SHALL handle concurrent login requests at a rate of 100 req/s for 60 seconds with a p95 latency below 500 ms and zero authentication errors.
2. THE Backend SHALL handle concurrent plant upload requests at a rate of 20 req/s for 60 seconds with a p95 latency below 10 seconds and no memory leaks.
3. THE Backend SHALL support 50 simultaneous active PVE battle sessions with correct isolated state per session and no cross-session data leakage.
4. THE Backend SHALL handle concurrent query ticket submissions at a rate of 200 req/s for 30 seconds, producing zero duplicate `RefNumber` values.
5. THE Backend SHALL paginate `GET /api/avatar` responses to avoid response payloads exceeding reasonable size limits for users with large collections.
6. THE Backend SHALL validate and reject oversized file uploads at the Multer middleware layer before any business logic or external API call is made.
7. WHEN the Frontend makes a plant upload request, THE Frontend SHALL display a processing spinner with progress stage labels until the pipeline responds, given that end-to-end pipeline latency may reach 60 seconds.

---

### Requirement 13: Testability and Modularity

**User Story:** As a developer on the ESC project team, I want the codebase to be structured for comprehensive unit, integration, and stress testing, so that correctness can be verified independently per module.

#### Acceptance Criteria

1. THE System SHALL organise backend code into separate route, controller, service, and middleware modules per the directory structure defined in the design document.
2. THE System SHALL organise frontend code into separate `pages`, `components`, `services`, `hooks`, and `utils` directories per the design document structure.
3. THE Battle_Service `calculateDamage` function SHALL be a pure function with no side effects, enabling deterministic unit testing without mocks.
4. THE Avatar_Stats_Deriver SHALL be a pure function with no side effects, enabling deterministic unit testing without mocks.
5. THE Backend SHALL provide mockable service interfaces for PlantID_Service, Gemma_Service, Flux_Service, and Email_Service so that unit tests can substitute mocks without modifying production code.
6. THE System SHALL include property-based tests using `fast-check` covering at minimum: avatar stats range bounds, battle damage determinism, HP non-negativity across action sequences, and query ticket reference number uniqueness.

---

## Appendix A: Use Case ↔ Requirement Traceability

Canonical use case numbering follows the formal Use Case Description document (C3T2). Use this table to move between the use-case doc and this spec.

| Use Case | Requirement(s) | Primary backend module |
|---|---|---|
| UC1 Signup | Req 1, 10, 11 | `auth.controller.js` |
| UC2 Login | Req 2, 10, 11 | `auth.controller.js` |
| UC3 Reset Password (base case — not an extension of UC2) | Req 3, 11 | `auth.controller.js` |
| UC4 Browse Plant Avatar Archival | Req 5, 10 | `avatar.controller.js` |
| UC5 Join PVE Battle | Req 8 | `battle.service.js` |
| UC6 Upload Plant Picture (`extends` UC5) | Req 6, 7 | `upload.controller.js` |
| UC7 Join PVP Battle (P2 / optional) | FR7 only — intentionally not fully specified | — |
| UC8 Submit Query Ticket | Req 9 | `ticket.service.js` |
| Landing page (UI concern, not a use case) | Req 4 | frontend only |
| Cross-cutting (database, security, performance, testability) | Req 10, 11, 12, 13 | all modules |

## Appendix B: Canonical Decisions (post-Checkoff 1)

Where older documents disagree, **this file wins**:

1. `MIN_CONFIDENCE_THRESHOLD` = **0.70** (configurable env value). The Use Case document's 0.85 is superseded. Use-case text phrases the decision as "confidence greater than threshold" per prof feedback.
2. Query ticket fields = `name`, `email`, `category`, `message`, with category ∈ {general, bug, billing, partnership, other}. The UC document's organisation/subject/inquiryType field set is superseded.
3. Reset-password anti-enumeration (Req 3.8 — HTTP 200 for unknown emails) supersedes the UC document's visible "No account found" error.
4. The cross-platform database is **internal to the system** — never a secondary actor in any diagram.
5. Reset Password is a separate base use case; database/game-engine/multiplayer-server are internal components; sequence diagrams must show Web Client and Mobile App as distinct endpoints calling the same backend API (clients never touch the database directly).
