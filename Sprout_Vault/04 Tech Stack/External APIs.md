---
tags: [tech-stack, api, external, checkoff3]
source: Sprout_Features.md, Sprout_Storage_IP.md, current repository
updated: 2026-07-20
---

# External APIs and Services

| Service/adapter | Purpose | Checkoff 3 rule |
|---|---|---|
| Firebase Auth | Identity, client login, ID-token verification, email action codes | Authentication authority; no second Sprout login JWT |
| Firestore | Production application records | Access only through repositories |
| Firebase Storage | Canonical sprites and private source photos | Object paths in DB; shared and private paths separated |
| Plant.id v3 | Stable `result.classification.suggestions[].id`, taxonomy, confidence | Use provider ID as canonical species identity; raw response normalized by adapter |
| Prompt service | Turn species/design data into versioned structured prompt | Provider can change behind interface |
| Configured Gemini image model | Canonical source-image generation | Replaces the old FLUX target for Checkoff 3 |
| remove.bg or equivalent adapter | Background transparency | Runs before quantization |
| FLORENTINE24 quantizer | Internal deterministic color/design lock | Version `florentine24-v1`; 56x56; preserve alpha |
| SMTP/Nodemailer | Signup link, reset OTP, ticket notifications | Real deployed delivery; console/fake in tests |

The raw Android pipeline used plant identification, Gemma prompt generation, and FLUX with a local cache keyed by normalized scientific name. It did not implement canonical cross-user storage, background removal, 56x56 normalization, FLORENTINE24, generation locking, or persistent collections. Treat it as a behavior/reference source rather than code to port directly.

## Adapter contract rules

- Provider-specific request/response types stop at the adapter.
- Timeout, retry, and rate-limit behavior is configurable per provider.
- Every provider failure maps to a stable Sprout error.
- Credentials live in backend deployment environment variables only.
- Regular automated tests and backup demos make no paid live calls.
- Contract fixtures contain sanitized representative responses.
- Provider/model/prompt/palette versions are persisted with each sprite asset.

## Email modes

| Mode | Environment | Behavior |
|---|---|---|
| `console` | Local development | Log sanitized delivery output for development |
| fake/injected adapter | Automated tests | Deterministic success/failure without network |
| `smtp` | Deployed backend | Nodemailer SMTP using secret environment variables |

At remote commit `8e1077d`, `render.yaml` still configures console email, so no user/admin notification is actually delivered in production. That is a deployment gap, not completed behavior.

## Storage fallback

Current Firebase documentation indicates Cloud Storage use may require the Blaze plan. If billing/credentials are unavailable at the PM3 freeze, use seeded canonical assets through the same storage interface and demonstrate the Firebase adapter/rules separately. Do not change the domain/API contract for the fallback.

Activation and evidence steps are in [[Firebase Storage Activation]].

## Provider readiness audit

| Provider | Required variable | 2026-07-20 local state | Consequence |
|---|---|---|---|
| Plant.id v3 | `PLANTID_API_KEY` | Missing | Live identification cannot be tested; use sanitized fixture/fake |
| Gemini image | `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` | Missing | Live generation cannot be tested; use deterministic fake |
| remove.bg | `REMOVE_BG_API_KEY` | Missing | Live transparency cannot be tested; use deterministic fake |
| Gmail SMTP | `SMTP_USER`, `SMTP_PASS` with `EMAIL_MODE=smtp` | Missing; current mode is console | No real signup/reset/ticket delivery yet |
| Firebase Storage | `FIREBASE_STORAGE_BUCKET` and activated bucket | Waiting on billing | Keep `STORAGE_MODE=local` until preflight passes |

Never infer live readiness from a mock-backed pass. Each live provider needs a separate secret-safe preflight result.

## IP and design notes

- Verify FLORENTINE24 permission and attribution before commercial release.
- Avoid provider prompts that imitate a named franchise's protected trade dress.
- Document human prompt design, palette selection, algorithm implementation, curation, and versioning.
- Do not make categorical legal-ownership claims about fully generated art in the course report.

## Related

[[GenAI Sprite Pipeline]] · [[Firebase Storage Activation]] · [[System Architecture]] · [[QA Sprite Storage and Web Cache]] · [[Testing Strategy]]
