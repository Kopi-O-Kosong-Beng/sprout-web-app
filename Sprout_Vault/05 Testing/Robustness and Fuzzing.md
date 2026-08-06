---
tags: [testing, robustness, fuzzing, final]
source: 50.003 Project Brief.pdf, Timeline.xlsx, meeting 2026-07-30, team Telegram 2026-07-30
updated: 2026-08-01
---

# Robustness Testing and Fuzzing

Robustness/fuzzing is primarily a final-deliverable target. Checkoff 3 should identify targets and establish property tests without sacrificing the integrated slice.

## Scope agreed on 2026-07-30

| Item | Decision |
|---|---|
| Technique | **Mutation-based fuzzing is sufficient** for the grade. Image-based fuzzing is a stretch goal - Nat assessed feasibility over the weekend |
| Targets | Image inputs and text inputs |
| Required report artefact | An **overview diagram of the valid/invalid input taxonomy**, showing the classes of input the system accepts and rejects |
| Bar | Demonstrating understanding of the technique counts even if the implementation is foundational. Basic validation checks are already in place |
| Owner | Nat, Zhi Feng; due 5 Aug with the rest of the test documentation |

The taxonomy diagram is the highest-value deliverable here: it is what shows the
reader that valid and invalid input classes were reasoned about systematically,
independent of how long the fuzzer actually ran.

## Fuzz/property targets

1. **Upload boundary:** filenames, MIME/header disagreements, truncated/corrupt bytes, decompression bombs, and sizes around 5 MB.
2. **Provider parsing:** missing/extra fields, malformed JSON, invalid confidence/species IDs, corrupt image bytes, and timeout/rate-limit responses from identification, Gemini, and background removal adapters.
3. **Quantizer:** arbitrary dimensions/RGBA values; assert no crash, 56x56 output, palette closure, and valid alpha.
4. **Contact/auth inputs:** Unicode/control characters, length boundaries, invalid categories/emails, null bytes, and large payloads.
5. **Firebase tokens/action codes:** missing, malformed, expired, unverified, and replayed inputs.
6. **Battle actions:** invalid move IDs, foreign sessions, stale/duplicate turns, long action sequences, and reward retries.
7. **Reference/recipe keys:** high-concurrency uniqueness and idempotency.

## Approach

- Use `fast-check` arbitraries against pure functions and Supertest boundaries.
- Shrink failures to a minimal reproducible input.
- Record random seeds so failures can be replayed.
- Long-run mode logs seed/input/result and caps memory/log growth.
- Regular provider tests use deterministic mocks and sanitized fixtures.

## Invariants

- No process crash or leaked stack trace/secret.
- Invalid public input produces a controlled response and no partial authoritative write.
- Nontransparent sprite pixels belong to FLORENTINE24.
- HP never drops below zero.
- One expected turn causes at most one action effect.
- One completed battle applies at most one reward.
- Daily ticket references and sprite recipe keys remain unique.
- `VISITED` never becomes `CAUGHT` through a web-only path.

## Related

[[Final Deliverables Plan]] · [[Testing Strategy]] · [[Non-Functional Requirements]] · [[Test Matrix]] · [[Course Deliverables and Rubrics]]
