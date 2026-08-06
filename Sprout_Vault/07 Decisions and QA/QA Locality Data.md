---
tags: [qa, decision, privacy]
question-from: team chat (pre-Checkoff 2)
---

# Q&A — "Do we need country/city since it's a locality-based game?"

**Short answer: not for the web app's P0 scope — don't add it to `users` now. If we store locality at all, hang it on the *avatar discovery event*, not the person, and keep it coarse.**

## Reasoning

1. **Where locality actually lives:** the locality-based part of Sprout is *mobile field discovery* (scan a real plant somewhere). The web app's P0 features — browse, upload-for-PVE, battle, tickets — never branch on user location. No requirement in `requirements.md` references location.
2. **Right entity:** "where was this plant found" is a property of the **discovery/capture**, not of the user. A traveller scanning in Gardens by the Bay and in Chiang Mai shouldn't have one profile city. So: optional `locality` inside `avatar_records.metadata` (e.g. `{ city, country }` or a park/venue ID), written by the mobile app when it has GPS context; null for web uploads.
3. **Cheap now, useful later:** the `metadata JSON` column already exists in the schema — zero migration cost to include locality when available. Future B2B analytics ("engagement at *your* garden", P2 client dashboard) then aggregates from real discovery data instead of self-declared profile fields.
4. **Privacy/PDPA angle (good for the report's sustainability/D&I section):** don't collect what no feature uses. If added later: coarse granularity only (city/venue, never raw GPS), disclosed in the privacy notes. Location data is sensitive; minimisation is the defensible default — and mentioning this reasoning in the final report is easy marks for responsible design.

## Decision to propose to team

- ❌ No `country`/`city` on `users` for now
- ✅ Reserve `avatar_records.metadata.locality` (nullable) — mobile fills it when known
- 🔁 Revisit at P2 (B2B dashboard) with an explicit aggregation need

## Related

[[QA Database Schema]] · [[Database Schema]] · [[Feature Priorities]]
