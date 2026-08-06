---
tags: [use-case, auth, checkoff3]
id: UC3
source: C3T2_UseCaseDescription_1D.docx, current web code
---

# UC3 - Reset Password via OTP

UC3 is a separate base use case, not an extension of UC2.

**Checkoff 3 evidence:** regression flow with production-email and attempt-limit gaps to close.  
**Description:** A person who may own an account requests an email OTP and sets a new password without revealing account existence.  
**Actors:** Primary - User. Secondary - Email Service, Firebase Auth.  
**Trigger:** User requests password reset.  
**Precondition:** None.  
**Postcondition:** For a valid account and OTP, Firebase password and password history are updated and the OTP is invalidated.  
**Error states:** Invalid input, delivery failure, incorrect/expired OTP, attempt limit, weak/reused password, identity/database failure.

## Operation flow

1. User enters an email address.
2. Sprout accepts a syntactically valid request.
3. If the account exists, Sprout generates a six-digit OTP with `crypto.randomInt`.
4. Sprout bcrypt-hashes the OTP and stores its 15-minute expiry and zero failed attempts.
5. Sprout requests the Email Service to deliver the plaintext OTP.
6. Sprout returns the same generic acknowledgement for known and unknown emails.
7. User enters the OTP and a new password.
8. Sprout validates the OTP hash, expiry, and failed-attempt count.
9. Sprout validates password strength and recent-password history.
10. Sprout updates the Firebase password and application password history as one controlled operation.
11. Sprout clears the OTP data and confirms reset success.

## Alternative flows

- **3a Unknown email:** perform no account mutation and return the same acknowledgement as the main flow.
- **5a Email delivery failure for a known account:** retain a clear internal failure state; log securely and allow a fresh request. The public response must not reveal account existence.
- **8a Wrong OTP:** increment the failed-attempt counter and return a generic invalid-OTP error.
- **8b Five failed attempts:** invalidate the issued OTP and require a new request.
- **8c Expired OTP:** invalidate it and require a new request.
- **9a Weak or recently used password:** reject without consuming a valid OTP unless the security policy explicitly chooses otherwise.
- **10a Firebase/database update fails:** do not report success; retain enough internal state for controlled retry without partial password-history corruption.

## Rules

- OTP plaintext exists only in the outgoing email payload.
- Reset-request responses do not disclose whether an account exists.
- Successful reset invalidates the OTP and prevents reuse.
- Password history comparisons use production bcrypt cost; tests must allow the expected cryptographic runtime or use a controlled test cost at the adapter boundary.

## Current implementation gap (commit `8e1077d`)

Request/reset endpoints and UI exist, including hashed OTP, 15-minute TTL, Firebase password update, and password history. Deployment remains console-email mode, no five-attempt invalidation exists, and two Jest cases exceed the default five-second timeout due to multiple bcrypt cost-12 operations.

## Related

[[UC2 Login]] · [[Database Schema]] · [[Testing Strategy]] · [[Checkoff 3 Readiness and Development Plan]]
