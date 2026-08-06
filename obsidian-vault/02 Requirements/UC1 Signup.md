---
tags: [use-case, auth, checkoff3]
id: UC1
source: C3T2_UseCaseDescription_1D.docx, current web code, team decision 2026-07-20
---

# UC1 - Signup and Verify Email

**Checkoff 3 evidence:** regression flow with missing production pieces to close.  
**Description:** A visitor creates a Sprout account and verifies the email through a Sprout-hosted completion page.  
**Actors:** Primary - Visitor. Secondary - Firebase Auth, Email Service.  
**Trigger:** Visitor requests account creation.  
**Precondition:** None; duplicate identity is an alternative flow.  
**Postcondition:** Firebase identity and Sprout profile exist; after action-code completion the profile is verified.  
**Error states:** Invalid input, duplicate account, identity/profile failure, email delivery failure, invalid/expired action code, resend rate limit.

> [!note] Reconciled with the 2026-07-24 diagram set
> The UC1 sequence diagram branches on four validation outcomes (`3a` invalid/unreachable email, `3b` invalid username, `3c` invalid password, `3d` already registered). The original `C3T2_UseCaseDescription_1D.docx` collected only email and password and listed just `3a`/`3b`/`5a`. The implemented signup already validates display name, email, password policy, and duplicates, so the diagram is correct and this description has been updated to match it. Record this in the PM3 requirement-change table — see [[Checkoff 3 Requirement Changes]].

## Operation flow

1. Visitor enters email, password, and display name (username).
2. Sprout validates the input, username, and password policy.
3. Sprout requests Firebase Auth to create an unverified identity.
4. Sprout creates the corresponding application profile.
5. Sprout requests a Firebase email-verification action link whose continue URL is Sprout `/verify-email`.
6. Sprout requests the Email Service to deliver the link.
7. Sprout confirms that the account is pending verification and provides a resend action.
8. Visitor follows the link to Sprout `/verify-email`.
9. Sprout's web boundary applies the Firebase action code.
10. Sprout refreshes the Firebase ID token and calls `/api/auth/me`.
11. The backend verifies the token, synchronizes the local `isVerified` state, and confirms success.

## Alternative flows

Numbering follows the UC1 sequence diagram so every diagram branch has a matching description entry.

- **3a Invalid or unreachable email:** return a field-specific error and return the visitor to the form; create no identity.
- **3b Invalid username:** display name is empty, too long, already taken, or uses disallowed characters; return a field-specific error.
- **3c Invalid password:** password fails the policy below; return the unmet criteria.
- **3d Email already registered:** return conflict and offer login/resend without creating another profile.
- **5a Authentication error or consent denied:** the ownership/action-code step does not complete; report failure and offer a retry from the start.
- **2a Invalid input (general):** return field-specific validation and preserve non-secret input.
- **3b Identity creation fails:** return service error; no local profile is created.
- **4a Profile creation fails:** compensate or record a recoverable provisioning state; do not report a complete signup.
- **6a Email delivery fails:** retain the pending account, report a recoverable unsent state, and offer resend; retry must not create a duplicate identity.
- **9a Invalid/expired action code:** report failure and offer resend.
- **Resend limit:** no more than three resend requests per 15 minutes per account/IP; return 429 when exceeded.

## Validation and security rules

- Email must be syntactically valid and normalized.
- Password must contain at least eight characters, uppercase, lowercase, number, and symbol.
- Display name is trimmed, 1-50 characters, and limited to letters, numbers, spaces, hyphens, and underscores.
- Protected gameplay routes reject users whose Firebase token is valid but `emailVerified` is false.
- Firebase action codes are the verification authority. Sprout does not create a second signup-token table or signup OTP.
- Email links and credentials are never logged in deployed mode.

## Current implementation gap (commit `8e1077d`)

The backend already creates the Firebase identity/profile, generates the Firebase link, and calls the shared email service. Deployment still uses console email; there is no complete Sprout `/verify-email` page or resend endpoint; and an email failure can leave an account that cannot be retried cleanly.

## Related

[[UC2 Login]] · [[System Architecture]] · [[API Contract]] · [[Testing Strategy]] · [[Checkoff 3 Readiness and Development Plan]]
