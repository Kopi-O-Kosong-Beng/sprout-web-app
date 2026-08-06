---
tags: [design, api, checkoff3]
source: current web repository, approved design 2026-07-20
---

# API Contract

Development base URL: `http://localhost:3001`. All protected routes use `Authorization: Bearer <Firebase ID token>`. Sprout does not issue a custom login JWT.

Status labels below reflect remote commit `8e1077d`.

## Health

| Method | Path | Auth | Status | Result |
|---|---|---|---|---|
| GET | `/api/health` | No | Implemented | `{status:"ok", timestamp}` |

## Auth

| Method | Path/client action | Auth | Status | Contract |
|---|---|---|---|---|
| POST | `/api/auth/signup` | No | Implemented, email incomplete | `{email,password,displayName}` -> 201 pending account; 400/409/429 |
| Client | Firebase `applyActionCode(oobCode)` at `/verify-email` | Action code | Target | Verify through Sprout page, refresh ID token |
| POST | `/api/auth/resend-verification` | Unverified ID token | Target | Fresh Firebase link; max 3/15 min/account/IP; 200 generic, 429 |
| GET | `/api/auth/me` | Verified ID token | Implemented | Verify token, synchronize local profile, return current user |
| POST | `/api/auth/session/login` | Unverified ID token allowed | Implemented | Record client-side Firebase login audit |
| POST | `/api/auth/session/logout` | Unverified ID token allowed | Implemented | Record logout audit; client signs out of Firebase |
| POST | `/api/auth/request-reset` | No | Implemented, email incomplete | `{email}` -> generic 200 for known/unknown; 400/429 |
| POST | `/api/auth/verify-reset` | No | Implemented, attempt cap target | `{email,otp,newPassword}` -> 200 or stable 400; 429 |

There is intentionally no custom backend `/verify-email?token=...` endpoint. Firebase action codes are applied by the Sprout client, and `/api/auth/me` synchronizes the application profile. This is the answer to the outstanding "Signup Verification API" item.

## Collection/archive

| Method | Path | Status | Contract |
|---|---|---|---|
| GET | `/api/avatar?page=&pageSize=` | Implemented legacy records | Only caller-owned paginated records |
| GET | `/api/avatar/:id` | Implemented legacy records | Caller-owned record or 404 |

The Checkoff 3 implementation should preserve these paths for frontend compatibility while changing the returned domain view to `UserSpeciesCollection + Species + SpriteAsset`. A later version may alias them under `/api/collection`.

## Upload

| Method | Path | Auth | Status | Contract |
|---|---|---|---|---|
| POST | `/api/upload/plant` | Verified | Target primary slice | Multipart `plantImage`; JPEG/PNG/WEBP <=5 MB; returns species, canonical sprite, `VISITED` collection entry |

Stable upload error codes:

`INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `LOW_CONFIDENCE`, `RATE_LIMITED`, `IDENTIFICATION_UNAVAILABLE`, `GENERATION_FAILED`, `POSTPROCESS_FAILED`, `STORAGE_FAILED`.

Suggested response shape for this new route:

```json
{
  "error": {
    "code": "LOW_CONFIDENCE",
    "message": "The plant could not be identified confidently. Try a clearer image."
  }
}
```

Do not return raw provider payloads, prompts, stack traces, or secrets.

## PVE

| Method | Path | Auth | Status | Contract |
|---|---|---|---|---|
| POST | `/api/battle/pve/start` | Verified | Target isolated/integrated | `{collectionId}` -> server session, NPC preset, state, turn number |
| POST | `/api/battle/pve/action` | Verified | Target isolated/integrated | `{sessionId,moveId,expectedTurn}` -> resolved state; stale request cannot reapply |
| GET | `/api/battle/pve/:sessionId` | Verified | Target isolated/integrated | Caller-owned authoritative state |
| POST | `/api/battle/pve/:sessionId/abandon` | Verified | Target isolated/integrated | Mark abandoned, no XP |

## Query tickets

| Method | Path | Auth | Status | Contract |
|---|---|---|---|---|
| POST | `/api/query/submit` | No | Implemented, email reliability incomplete | `{name,email,category,message}` -> 201 `{refNumber}`; ticket success independent from email |

Categories are `general`, `bug`, `billing`, `partnership`, and `other`. Message length is 1-2000 characters. The implementation must attempt submitter and admin emails independently after persistence.

## Middleware and security

- Production CORS allows only the deployed frontend origin.
- Global and feature-specific rate limits return 429.
- File limits and magic-byte validation occur before external calls.
- Backend Firebase middleware rejects missing/invalid tokens with 401 and unverified protected access with 403.
- Central error middleware maps internal failures to stable public responses.
- Test/demo bypass flags remain false in production.

## Related

[[System Architecture]] · [[Database Schema]] · [[UC1 Signup]] · [[UC6 Upload Plant Picture]] · [[UC5 PVE Battle]]
