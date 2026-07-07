# Sprout PRAFQ & Portfolio Steering Document

**Project:** Sprout — Scan. Grow. Battle.  
**Team:** Cohort 3 Team 2  
**Context:** 50.003 Elements of Software Construction (ESC) academic software development project  
**Portfolio framing:** Full-stack web platform and B2B showcase for nature-based gamification  
**Tech Stack:** React frontend, Node.js + Express backend, hosted on Vercel  
**Project status tone:** Written as if announcing the finished product  

---

## 0. One-Line Product Positioning

**Sprout is a gamified web platform that turns plant discovery into a sticky nature-learning experience, helping visitors scan, grow, collect, and battle plant-inspired avatars while giving organisations a showcase-ready digital engagement layer.**

---

## 1. Product Overview

Sprout is a web-based companion platform for nature-based gamification. It was designed around a simple idea: high-footfall nature spaces should create lasting environmental awareness, not just short-lived “Instagram-able moments.”

The platform brings together plant discovery, avatar collection, GenAI sprite creation, and lightweight battle mechanics. Users can sign up, log in, browse their plant avatar collection, upload plant pictures for a temporary GenAI-generated sprite, play PVE battles, and potentially enter PVP battles in later-stage implementation. For institutions and public-facing nature attractions, Sprout also acts as a B2B-ready showcase for interactive biodiversity engagement.

The academic implementation focuses strongly on software development principles, architectural clarity, use-case modelling, technical feasibility, scope control, and testability.

---

# 2. PRAFQ Document

PRAFQ is used here as a structured **Product Requirements and Frequently Asked Questions** document. It combines product positioning, user-facing questions, engineering feasibility, system architecture, risk planning, and delivery steering.

---

## 2.1 Who Is It For?

### Primary Users

#### 1. Public visitors and tourists
Sprout is for visitors exploring gardens, biodiversity spaces, nature trails, or public attractions. These users may be curious but not deeply engaged with plant education yet. The platform gives them an accessible entry point through scanning, collecting, growing, and battling plant avatars.

#### 2. Existing Sprout mobile users
The web platform is designed as a companion to a mobile-first product. Authenticated users can access synchronised plant avatar records and game stats from a cross-platform database, browse their collection, and continue interacting with their Sprout identity on the web.

#### 3. Students and younger audiences
The game-like framing makes plant learning more familiar to users who already understand collection systems, avatars, PVE battles, and progression loops from digital games.

#### 4. B2B stakeholders
Potential institutional users include gardens, parks, schools, museums, sustainability outreach programmes, tourism boards, and event organisers. For these stakeholders, Sprout functions as a digital engagement showcase and possible partnership platform.

---

## 2.2 What Problem Does It Solve?

Sprout addresses two linked problems:

### Problem 1: Environmental apathy
Many visitors pass through nature spaces without developing deeper environmental awareness. A visit may become a photo opportunity rather than a learning experience.

### Problem 2: Gap in entertainment technology
There is an opportunity to use interactive digital experiences to make biodiversity education feel more playful, persistent, and memorable.

The core challenge is captured in the project statement:

> How might we shift high foot traffic into lasting environmental awareness, rather than just Instagram-able moments?

Sprout solves this by converting nature interaction into a game loop: discover a plant, generate or collect an avatar, learn about the species, and use the avatar in battle experiences.

---

## 2.3 What Is the Key Benefit?

### For users
Sprout makes plant learning feel playful, memorable, and personally owned. Instead of passively reading plant labels, users build a collection and interact with plant-inspired avatars.

### For organisations
Sprout gives public-facing nature or education organisations a more engaging digital layer for biodiversity outreach. It can help convert visitor attention into measurable engagement.

### For the academic project
Sprout provides a strong software engineering case study because it includes authentication, database synchronisation, user flows, external API integration, image upload, GenAI processing, game logic, optional real-time multiplayer, query ticketing, testing, and deployment planning.

---

## 2.4 What Would Users Ask?

### “What is Sprout?”
Sprout is a web platform where users can learn about plants through gamified avatar collection and plant-inspired battles.

### “Do I need an account?”
Yes, most game features require an account. Visitors can browse the landing page and submit queries, but avatar collection and battles require login.

### “Can I use my mobile app account?”
Yes. The web platform is designed to synchronise with a cross-platform account database so existing mobile users can access their plant avatar records and game stats.

### “What can I do after logging in?”
Users can browse their plant avatar collection, view plant species details, join PVE battles, upload a new plant picture for a temporary GenAI-generated avatar, and potentially participate in PVP battles if the optional feature is implemented.

### “Can I upload any plant picture?”
Users can upload a plant photograph during the PVE flow. The platform validates the image, identifies the plant species, processes the result through an AI prompt pipeline, and generates a temporary pixel-art avatar.

### “Will uploaded plant avatars be saved permanently?”
Uploaded avatars can be used for a web session and may be saved to a web-only archival field for reuse on the web. However, they are not treated as mobile-field-discovered avatars to avoid abuse of obtaining plant avatars without real-world mobile exploration.

### “Can I battle other players?”
PVP is planned as an optional or lower-priority feature. The core implementation prioritises login, landing page, avatar browsing, plant upload, PVE battle, and query ticketing.

### “What happens if the AI cannot identify my plant?”
The system displays an error message and suggests retaking the photo with better lighting or angle.

### “What happens if avatar generation fails?”
The system offers a retry path, potentially with adjusted generation parameters.

---

## 2.5 How Does It Work?

Sprout works through a web platform supported by a React frontend, Node.js + Express backend, and external services for plant identification, semantic processing, image generation, email, and optional advertising or B2B workflows.

### Core workflow

1. A visitor signs up or an existing user logs in.
2. The system authenticates the user and synchronises plant avatar records from the cross-platform database.
3. The user lands on the dashboard.
4. The user may browse their avatar archival.
5. The user may enter PVE mode.
6. In PVE, the user can either select an existing avatar or upload a new plant image.
7. If uploading, the image passes through image validation, plant identification, semantic processing / prompt refinement, image generation, and temporary avatar display.
8. The user battles against a system-controlled bot.
9. The result is displayed, and selected data may be persisted.
10. Visitors or users may submit a query ticket through the Contact Us page.

---

## 2.6 What Does It Cost?

For the academic project, Sprout is positioned as a student-built software prototype hosted without a custom domain.

### Development cost
The main costs are team time, software development effort, testing, documentation, and integration work.

### Hosting cost
The planned hosting stack uses **Vercel** without a custom domain. For an academic prototype, the hosting cost can remain free or low depending on usage and account limits.

### API cost
Potential cost drivers include:

- Plant Identification API usage
- Google Gemma API usage
- Image Generation API / FLUX usage
- Email service usage
- Optional B2B advertisement API usage

For portfolio presentation, state:

**Sprout is designed as a low-cost academic prototype, but production-scale deployment would require budgeting for API usage, storage, authentication, analytics, monitoring, and usage-based hosting limits.**

---

## 2.7 How Is It Different From What Exists Today?

Sprout is different because it combines biodiversity education with a game-like avatar loop and GenAI sprite creation.

### Compared with static nature signboards
Sprout is interactive, personalised, and persistent.

### Compared with plant identification apps
Sprout does not stop at identification. It turns the plant into an avatar and connects it to a game experience.

### Compared with generic game apps
Sprout is grounded in real-world nature interaction and environmental awareness.

### Compared with a pure marketing website
Sprout is both a product showcase and a working interactive platform.

### Compared with conventional educational tools
Sprout uses collection, battle mechanics, avatar identity, and playful discovery to make learning feel less instructional and more self-driven.

---

# 3. Product Requirements

## 3.1 Feature Priority

### P0: Core features

- Signup
- Login
- Landing page
- Browse account’s plant avatars
- Upload plant picture
- GenAI image-to-sprite pipeline
- Cross-platform account database
- PVE game
- Submit query ticket

### P1: Important but secondary

- Business client dashboard
- Query ticket workflow enhancement
- PVE game expansion
- Additional database-backed profile/game stats

### P2: Optional / future enhancement

- PVP game
- B2B advertisement API
- Advanced multiplayer matching
- Expanded business analytics

---

## 3.2 Functional Requirements

### FR1: Signup
Visitors must be able to create a Sprout web account using email registration. The system should verify the email and create a user record in the cross-platform database.

### FR2: Login
Registered users must be able to log in using credentials. The system should authenticate them and synchronise avatar records and game stats.

### FR3: Reset Password
Users who forget their password must be able to request an OTP-based password reset through registered email.

### FR4: Browse Plant Avatar Archival
Users must be able to browse their plant avatar collection in a grid or Pokédex-style interface. Each avatar should display species name, image, discovery date, and detailed information.

### FR5: Join PVE Battle
Users must be able to join a PVE battle against a system-controlled opponent using either an archival avatar or a temporary generated avatar.

### FR6: Upload Plant Picture
Users must be able to upload a plant image during the PVE flow. The system must validate the image, identify the plant, process the plant data, and generate a temporary pixel-art avatar.

### FR7: Join PVP Battle
Users may join a real-time PVP battle against another player if the optional feature is implemented. The system must support matchmaking, WebSocket connection, turn actions, win/loss recording, and disconnection handling.

### FR8: Submit Query Ticket
Visitors and users must be able to submit a query through a Contact Us page. The system should validate form fields, create a reference number, send confirmation email, and notify the Sprout team.

---

## 3.3 Non-Functional Requirements

### NFR1: Testability
The codebase must support unit testing and stress testing across authentication, form validation, image upload handling, API error paths, game logic, and backend routes.

### NFR2: Maintainability
The code should be modular, readable, and organised by feature domains such as authentication, avatar archival, upload pipeline, battle logic, and query ticketing.

### NFR3: Reliability
The system should fail gracefully when external APIs time out or return errors.

### NFR4: Security
The system should protect authentication flows, validate inputs, limit image upload size and format, avoid storing sensitive data in plaintext, and prevent API abuse.

### NFR5: Performance
Frontend views should remain responsive, and backend endpoints should avoid blocking operations where possible.

### NFR6: Scalability
The prototype should be structured so that PVP, B2B dashboard, and advertising integrations can be added later without rewriting the core system.

### NFR7: Usability
User flows should be simple enough for non-technical users, especially signup, login, avatar browsing, upload, and PVE battle entry.

---

# 4. Technical Feasibility

## 4.1 Overall Feasibility

Sprout is technically feasible as a student academic project if the scope is controlled. The most feasible version prioritises account flows, landing page, avatar browsing, plant upload, GenAI sprite pipeline, PVE battle, and query ticketing.

PVP multiplayer and advanced B2B advertisement integration should remain optional because they add substantial complexity in real-time state management, WebSocket reliability, matchmaking, and additional backend logic.

---

## 4.2 Frontend Feasibility

React is suitable because Sprout has multiple interactive screens, reusable UI components, stateful flows, and dynamic data display.

Feasible React components include:

- Landing page
- Signup form
- Login form
- Reset password form
- Dashboard
- Avatar collection grid
- Avatar detail modal
- Upload plant picture page
- GenAI processing status component
- PVE battle screen
- Query ticket form
- Optional PVP lobby
- Optional B2B dashboard

---

## 4.3 Backend Feasibility

Node.js + Express is suitable for:

- API routing
- Authentication endpoints
- Form validation
- Image upload handling
- External API orchestration
- Email service integration
- Battle logic endpoints
- Query ticket creation
- Database connection and persistence

The backend should be structured as a set of modular routes and services rather than a single monolithic file.

---

## 4.4 Hosting Feasibility

Vercel is suitable for a student prototype because it supports frontend deployment and serverless backend routes. However, the backend architecture should be checked against Vercel’s runtime constraints.

If using a separate Express server, the team should confirm whether the intended deployment is:

1. a Vercel-hosted React frontend with serverless API routes, or  
2. a separate Node/Express backend hosted elsewhere.

For the portfolio writeup, state:

**The intended academic deployment uses Vercel for hosting without a custom domain, with the final backend structure adjusted to fit the selected Vercel deployment model.**

---

# 5. System Architecture

## 5.1 High-Level Architecture

Sprout uses a full-stack web architecture:

```text
React Frontend
    ↓ HTTP / Fetch / Axios
Node.js + Express Backend
    ↓
Database Layer
    ↓
External Services
```

### Core modules

```text
Frontend
├── Authentication UI
├── Landing Page
├── Dashboard
├── Avatar Archival UI
├── Upload Plant Picture UI
├── PVE Battle UI
├── Contact Us / Query Ticket UI
└── Optional PVP / B2B UI

Backend
├── Auth Routes
├── User Routes
├── Avatar Routes
├── Upload Pipeline Routes
├── Battle Routes
├── Query Ticket Routes
├── Email Service
├── External API Service Layer
└── Database Access Layer
```

---

## 5.2 Suggested Frontend Architecture

```text
src/
├── components/
│   ├── common/
│   ├── auth/
│   ├── avatar/
│   ├── battle/
│   ├── upload/
│   └── query/
├── pages/
│   ├── LandingPage.tsx
│   ├── LoginPage.tsx
│   ├── SignupPage.tsx
│   ├── DashboardPage.tsx
│   ├── AvatarArchivePage.tsx
│   ├── UploadPlantPage.tsx
│   ├── PVEBattlePage.tsx
│   └── ContactPage.tsx
├── services/
│   ├── authApi.ts
│   ├── avatarApi.ts
│   ├── battleApi.ts
│   └── queryApi.ts
├── hooks/
├── utils/
└── tests/
```

---

## 5.3 Suggested Backend Architecture

```text
server/
├── app.ts
├── routes/
│   ├── auth.routes.ts
│   ├── avatar.routes.ts
│   ├── upload.routes.ts
│   ├── battle.routes.ts
│   └── query.routes.ts
├── controllers/
│   ├── auth.controller.ts
│   ├── avatar.controller.ts
│   ├── upload.controller.ts
│   ├── battle.controller.ts
│   └── query.controller.ts
├── services/
│   ├── email.service.ts
│   ├── plantId.service.ts
│   ├── gemma.service.ts
│   ├── flux.service.ts
│   ├── battle.service.ts
│   └── ticket.service.ts
├── middleware/
│   ├── auth.middleware.ts
│   ├── upload.middleware.ts
│   ├── validation.middleware.ts
│   └── error.middleware.ts
├── models/
├── database/
├── utils/
└── tests/
```

---

## 5.4 External Services

### Email Server
Used for signup confirmation, password reset OTP, query ticket confirmation, and team notification.

### Plant Identification API
Used for plant species classification from uploaded image and plant taxonomy/confidence results.

### Google Gemma API
Used for semantic processing of plant data and prompt engineering for avatar generation.

### Image Generation API / FLUX
Used for pixel-art monster avatar generation.

### Optional Advertising Placement API
Used for B2B advertising or sponsorship placement in later implementation.

---

# 6. Testing and Stress Testing Strategy

Because this is an ESC software construction project, testing should be treated as a major portfolio strength.

## 6.1 Unit Testing Priorities

### Authentication unit tests

- valid signup
- duplicate email rejection
- invalid email rejection
- login with valid credentials
- login with invalid credentials
- reset password OTP generation
- expired OTP rejection
- weak password rejection
- reused password rejection

### Upload pipeline unit tests

- accepts valid image format
- rejects invalid image format
- rejects oversized image
- handles plant identification success
- handles low-confidence plant identification
- handles Gemma timeout
- handles FLUX generation failure
- returns temporary avatar on success

### Avatar archival unit tests

- retrieves avatar list
- handles empty avatar collection
- displays avatar details
- handles database sync failure

### PVE battle unit tests

- loads user avatar
- generates NPC opponent
- calculates attack outcome
- calculates defence effect
- applies special ability
- determines winner correctly
- handles invalid battle action

### Query ticket unit tests

- validates required fields
- validates email format
- creates reference number
- sends confirmation
- logs email failure for retry

---

## 6.2 Integration Testing

Integration tests should verify complete user flows:

1. Signup → email verification → login
2. Login → sync data → browse avatar archival
3. PVE → select archival avatar → complete battle
4. PVE → upload plant → generate avatar → complete battle
5. Contact form → ticket created → confirmation sent
6. Reset password → OTP → password update → login with new password

---

## 6.3 Stress Testing

### Upload stress test
Test many concurrent plant image uploads to evaluate image validation performance, API request queueing, timeout behaviour, memory usage, and rate limit handling.

### PVE stress test
Test many concurrent PVE battle sessions to evaluate battle state isolation, backend response consistency, CPU usage, and database write reliability.

### Authentication stress test
Test repeated login and signup requests to evaluate rate limiting, duplicate account handling, session token generation, and backend stability.

### Query ticket stress test
Test many form submissions to evaluate validation reliability, email queue handling, duplicate spam prevention, and reference number uniqueness.

### Optional PVP stress test
If PVP is implemented, test WebSocket connection stability, matchmaking queue performance, reconnection logic, heartbeat timeout behaviour, and concurrent battle state consistency.

---

## 6.4 Recommended Testing Tools

### Frontend

- Jest
- React Testing Library
- Playwright or Cypress for end-to-end flows

### Backend

- Jest
- Supertest
- Artillery or k6 for stress testing
- Postman for manual API testing

### Quality checks

- ESLint
- Prettier
- GitHub pull request review
- Manual mobile and browser testing

---

# 7. Risks

## 7.1 Scope Creep

### Risk
The project includes many features: authentication, avatar archive, GenAI pipeline, PVE, PVP, B2B dashboard, advertisement API, and query ticketing.

### Mitigation
Prioritise P0 features. Keep PVP and B2B advertisement API as optional or future enhancements unless P0 is stable.

---

## 7.2 External API Failure

### Risk
Plant Identification API, Google Gemma API, or FLUX may fail, timeout, return low-confidence output, or exceed usage limits.

### Mitigation
Implement retry logic, clear user error messages, fallback states, and mock API responses for testing.

---

## 7.3 Image Upload Abuse

### Risk
Users may upload unsupported files, oversized images, or non-plant images.

### Mitigation
Validate file type and file size. Use Multer/Sharp or equivalent processing. Reject invalid images early.

---

## 7.4 Avatar Abuse

### Risk
Users may use web upload to generate many avatars without physically exploring plants through the mobile app.

### Mitigation
Keep uploaded avatars temporary or web-only. Do not include them in the main mobile archival by default.

---

## 7.5 PVP Complexity

### Risk
PVP requires real-time matchmaking, WebSocket reliability, battle state synchronisation, disconnection handling, and database writes.

### Mitigation
Treat PVP as P2 or optional. Build stable PVE first.

---

## 7.6 Vercel Backend Constraints

### Risk
A traditional persistent Express backend may not map perfectly to Vercel’s serverless deployment model.

### Mitigation
Either adapt backend endpoints to Vercel serverless functions or host the backend separately. Confirm deployment model early.

---

## 7.7 Testing Time

### Risk
Thorough unit and stress testing can take significant time, especially for asynchronous API and upload flows.

### Mitigation
Write tests as features are implemented. Use mocked external APIs. Reserve a dedicated testing phase.

---

# 8. Dependencies and Timeline

## 8.1 Dependencies

### Technical dependencies

- React
- Node.js
- Express
- Database service
- Email service
- Plant Identification API
- Google Gemma API
- Image Generation API / FLUX
- Vercel hosting
- Testing frameworks

### Project dependencies

- Team availability
- API access
- Working database schema
- UI wireframes
- Use case agreement
- Defined P0/P1/P2 scope
- Testing dataset or mock assets
- Stable deployment plan

---

## 8.2 Suggested Timeline

The project plan is aligned with a 10-week ESC development window and 6 sprint structure.

### Sprint 0: Team Sync and Setup

- Confirm scope
- Finalise feature priorities
- Set up Git repository
- Set up React frontend
- Set up Node + Express backend
- Agree code standards
- Define testing strategy

### Sprint 1: P0 Authentication and Landing

- Build landing page
- Build signup
- Build login
- Build reset password flow
- Add email service mock or integration
- Write unit tests for authentication

### Sprint 2: Database and Avatar Archival

- Design database schema
- Implement user profile and avatar records
- Build avatar archival page
- Add avatar detail view
- Write database and archival tests

### Sprint 3: Upload Plant Picture and GenAI Pipeline

- Implement upload validation
- Integrate or mock Plant Identification API
- Integrate or mock Gemma prompt processing
- Integrate or mock FLUX avatar generation
- Add processing states and error handling
- Write upload pipeline tests

### Sprint 4: PVE Battle

- Build PVE battle interface
- Implement native game decision logic
- Add NPC opponent generation
- Add battle outcome summary
- Write game logic unit tests

### Sprint 5: Query Ticket and Optional Enhancements

- Build Contact Us page
- Implement query ticket creation
- Add confirmation email flow
- Add optional web-only avatar save
- Begin optional B2B dashboard if scope allows

### Sprint 6: Testing, Stress Testing, Tightening and Report

- Run unit tests
- Run integration tests
- Run stress tests
- Fix bugs
- Improve UX
- Prepare report
- Deploy to Vercel
- Prepare final portfolio documentation

---

# 9. Steering File: Product Steering

```markdown
# Product Steering — Sprout

## Product Vision

Sprout turns real-world plant discovery into a sticky digital experience. It helps users learn about biodiversity through plant scanning, avatar generation, collection, and battle mechanics.

## Target Users

- Public garden visitors
- Tourists
- Students
- Existing Sprout mobile users
- Nature attractions and B2B partners

## Core Problem

High visitor footfall in nature spaces often becomes short-lived attention rather than lasting environmental awareness.

## Value Proposition

Sprout creates a gamified and sticky experience for tourists and visitors to learn about plants.

## Product Promise

Scan. Grow. Battle.

## P0 Features

- Signup
- Login
- Landing page
- Browse account avatar archival
- Upload plant picture
- GenAI image-to-sprite pipeline
- Cross-platform account database
- PVE game
- Submit query ticket

## P1 Features

- Business client dashboard
- Enhanced query ticket workflow
- Expanded PVE mechanics

## P2 Features

- PVP game
- B2B advertisement API
- Advanced multiplayer matchmaking

## Scope Rule

If time is limited, protect P0 first. PVP and advanced B2B features should not compromise core stability.

## Portfolio Emphasis

Present Sprout as a software construction project demonstrating full-stack architecture, use-case modelling, API orchestration, testing, stress testing, and scope control.
```

---

# 10. Steering File: Engineering Steering

```markdown
# Engineering Steering — Sprout

## Tech Stack

Frontend: React  
Backend: Node.js + Express  
Hosting: Vercel  
Database: Cross-platform account database  
Testing: Unit, integration, and stress testing required

## Architecture Principle

Use modular feature-based architecture. Avoid building a single monolithic frontend or backend file.

## Frontend Modules

- Authentication
- Landing page
- Dashboard
- Avatar archival
- Upload plant picture
- PVE battle
- Contact/query ticket
- Optional PVP
- Optional B2B dashboard

## Backend Modules

- Auth routes
- Avatar routes
- Upload pipeline routes
- Battle routes
- Query ticket routes
- Email service
- External API services
- Database access layer
- Error handling middleware

## External APIs

- Email Server
- Plant Identification API
- Google Gemma API
- Image Generation API / FLUX
- Optional Advertising Placement API

## Testing Priority

Every P0 feature must have unit tests.

High-priority test areas:

- Authentication
- Password reset
- Image upload validation
- API timeout handling
- Avatar archival retrieval
- PVE battle logic
- Query ticket validation

## Stress Testing Priority

Stress test:

- Concurrent logins
- Concurrent uploads
- Concurrent PVE sessions
- Query ticket submissions
- Optional PVP WebSocket sessions

## Error Handling Rule

Every external API call must have:

- timeout handling
- retry or fallback path
- user-facing error message
- internal logging

## Deployment Rule

Confirm whether the Express backend will be adapted to Vercel serverless functions or hosted separately. Do not leave deployment architecture ambiguous at final submission.
```

---

# 11. Steering File: Portfolio Writeup Steering

```markdown
# Portfolio Writeup Steering — Sprout

## Recommended Portfolio Title

Sprout — Web Platform & B2B Showcase for Nature-Based Gamification

## Short Description

Sprout is a full-stack web platform that turns plant discovery into a gamified learning experience. Users can browse plant avatars, upload plant pictures for AI-generated sprites, and battle with plant-inspired characters while organisations gain a showcase-ready digital engagement layer.

## Problem

High-footfall nature spaces often generate short attention but limited long-term environmental awareness. Sprout explores how gamification and software design can convert visitor curiosity into repeated learning and interaction.

## Role

Contributed to software planning, project architecture, feature scoping, use-case modelling, and implementation planning within an ESC academic software construction project.

## Tech Stack

React, Node.js, Express, Vercel, database integration, email service, external plant identification and image-generation APIs.

## Key Features

- Signup and login
- Password reset
- Avatar archival
- Plant image upload
- GenAI sprite pipeline
- PVE battle
- Query ticket submission
- Optional PVP and B2B dashboard

## Engineering Focus

The project emphasised software construction principles, modular architecture, use-case modelling, scope prioritisation, unit testing, integration testing, and stress testing.

## Outcome

Produced a scoped full-stack web platform plan and implementation direction for a nature-based gamification product, balancing product ambition with realistic academic delivery constraints.

## What This Demonstrates

This project demonstrates full-stack software planning, system decomposition, external API orchestration, user flow design, test-driven thinking, and the ability to manage software scope under time constraints.
```

---

# 12. Steering File: Testing Steering

```markdown
# Testing Steering — Sprout

## Testing Goal

Sprout must be tested as a software construction project, not just demonstrated as a UI prototype.

The testing strategy should prove that the system handles normal flows, error paths, invalid inputs, API failures, and high-load scenarios.

## Unit Testing

Required unit tests:

- Signup validation
- Login validation
- Reset password OTP flow
- Password strength validation
- Avatar archival retrieval
- Image format validation
- Image size validation
- Plant API success and failure
- Gemma API timeout
- FLUX generation failure
- PVE battle calculation
- Query ticket validation

## Integration Testing

Required integration flows:

- Signup to login
- Login to avatar archival
- PVE with archival avatar
- Upload plant to temporary avatar
- Temporary avatar to PVE battle
- Contact form to query ticket confirmation
- Reset password to successful login

## Stress Testing

Stress test:

- Many concurrent login attempts
- Many concurrent image uploads
- Many concurrent PVE battles
- Many query ticket submissions
- Optional WebSocket PVP sessions

## Mocking Strategy

External APIs should be mocked during testing to avoid cost, rate limits, and unreliable test results.

Mock:

- Plant Identification API
- Google Gemma API
- Image Generation API / FLUX
- Email Server

## Acceptance Criteria

A feature is not considered complete until:

- the happy path works,
- main error paths are handled,
- unit tests pass,
- integration impact is checked,
- user-facing errors are readable,
- no critical console/server errors remain.
```

---

# 13. Portfolio-Ready Short Version

## Sprout — Scan. Grow. Battle.

Sprout is a full-stack web platform and B2B showcase for nature-based gamification. It turns plant discovery into a sticky learning experience where users can browse plant avatars, upload plant pictures for AI-generated sprites, and battle with plant-inspired characters.

The project addresses a core challenge: high-footfall nature spaces often create short-lived attention rather than lasting environmental awareness. Sprout uses gamification, avatar identity, plant identification, and GenAI sprite generation to make biodiversity learning more interactive and memorable.

Built as an ESC academic software construction project, Sprout uses a React frontend, Node.js + Express backend, and Vercel hosting. The system is designed around modular use cases including signup, login, password reset, avatar archival, plant image upload, GenAI sprite pipeline, PVE battle, optional PVP, and query ticket submission.

The engineering focus is not only on features, but also on software development principles: clear architecture, use-case modelling, scope prioritisation, external API orchestration, unit testing, integration testing, stress testing, and realistic risk management.

---

# 14. Post-Checkoff-1 Alignment Notes (added 8 Jul 2026)

Decisions agreed after Checkoff 1 feedback. These override anything inconsistent earlier in this document; the machine-checkable versions live in `requirements.md` Appendix B.

1. **Use case writing rules:** keep text generic (no UI/landing-page specifics); generalise preconditions; anything an alternative flow handles must not appear as a precondition; preconditions must be consistent with error states; weaken preconditions so flows are accessible to anyone and handle invalid actors in alternative flows; one atomic action per operation-flow step.
2. **Reset Password (UC3) is a separate base use case** — not `<<extends>>` Login — with no "registered account" precondition.
3. **The cross-platform database, game engine, and multiplayer server are internal system components**, never secondary actors.
4. **Sequence diagrams** must distinguish Web Client and Mobile App endpoints hitting the same backend API; clients never interact with the database directly — cross-platform sync is a backend API call.
5. **Plant-ID confidence:** decision phrased as "confidence greater than threshold"; `MIN_CONFIDENCE_THRESHOLD` = 0.70 (configurable).
6. **Hosting:** Vercel is sufficient — no custom domain, no CI/CD pipeline required for grading ("ESC doesn't care about hosting").
7. **Testing framing:** discuss uptime and limits; client-side unit tests around React component lifecycle; server-side per-class tests; prefer moving logic from client to server.
8. **Canonical use case numbering** (from the formal UC document): UC1 Signup, UC2 Login, UC3 Reset Password, UC4 Browse Avatar Archival, UC5 PVE Battle (`extended by` UC6), UC6 Upload Plant Picture, UC7 PVP Battle, UC8 Submit Query Ticket.
