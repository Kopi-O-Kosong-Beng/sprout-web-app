---
tags: [use-case, auth, checkoff3]
id: UC2
source: C3T2_UseCaseDescription_1D.docx, current web code
---

# UC2 - Login

**Checkoff 3 evidence:** regression flow; documentation corrected to current Firebase implementation.  
**Description:** An existing user authenticates with Firebase and opens the Sprout workspace with current profile and collection data.  
**Actors:** Primary - User. Secondary - Firebase Auth.  
**Trigger:** User requests login.  
**Precondition:** None; invalid credentials and unverified status are alternative flows.  
**Postcondition:** A verified Firebase session is active and Sprout data is synchronized.  
**Error states:** Invalid credentials, rate limit, unverified email, token verification failure, profile/data failure.

## Operation flow

1. User enters email and password.
2. React requests Firebase `signInWithEmailAndPassword`.
3. Firebase returns an authenticated user and ID token.
4. React sends the Firebase ID token to `/api/auth/me`.
5. Express verifies the token with Firebase Admin.
6. The backend synchronizes the local profile verification state.
7. The backend fetches current profile, collection, and game metadata.
8. Sprout grants the verified user access to the workspace.

## Alternative flows

- **2a Invalid credentials/unknown email:** show one generic authentication error; never reveal which field was wrong.
- **2b Excess attempts:** apply configured Firebase/backend rate limiting and require retry later.
- **5a Invalid, expired, or tampered token:** return 401 and clear the local session.
- **6a Email unverified:** keep the authenticated Firebase session only long enough to show verification/resend UI; protected gameplay remains blocked.
- **7a Application data unavailable:** show a retriable error; do not fabricate an empty archive as successful synchronization.

## Security rules

- Express accepts Firebase ID tokens in `Authorization: Bearer <id-token>`.
- Sprout does not issue a second custom login JWT.
- Frontend `ProtectedRoute` and backend authorization middleware enforce the same verified-user rule.
- Authentication errors remain generic.

## Current implementation gap (commit `8e1077d`)

Firebase client login and backend token verification exist. The old use-case/sequence text incorrectly described backend password validation and a Sprout JWT. Frontend protected routes currently admit an `unverified` state even though protected APIs reject it, and the archive is not yet populated from the shared collection.

## Related

[[UC1 Signup]] · [[UC3 Reset Password]] · [[UC4 Browse Avatar Archival]] · [[API Contract]]
