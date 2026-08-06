---
tags: [project, checkoff3]
source: Sprout_Proposition.pdf, ESC_C3T2_MP1_markdown.md, Sprout_Features.md, Sprout_Storage_IP.md
updated: 2026-07-20
---

# Project Overview

Sprout is a gamified biodiversity-exploration product. Players identify real plants, obtain standardized pixel-art creatures, build a persistent collection, learn species facts, and use collected plants in battles.

## ESC web expansion

The startup already has an Android prototype from 50.001. The ESC project adds:

1. A full-stack React/Express application for account management, plant upload/identification, persistent collection, canonical sprite assets, PVE, and Contact Us.
2. A B2B showcase/contact experience for nature attractions, parks, schools, museums, and tourism partners.

The web application supports rather than replaces the mobile product. Both clients use a shared backend/domain contract so one account and collection can become visible across platforms.

## Product loop

> **Scan. Grow. Battle.**

```text
identify a plant -> collect its canonical creature -> learn/progress -> battle
```

## Canonical art and provenance

The Checkoff 3 decision replaces unique per-upload art and 24-hour web-only avatars:

- One versioned canonical sprite is generated per stable species ID and recipe.
- Repeated scans reuse the same shared art.
- A web upload creates/updates a persistent `VISITED` collection entry.
- A trusted mobile encounter may promote `VISITED` to `CAUGHT`; it never demotes.
- Personalization lives in nickname, source photo, dates, XP, battle record, and future curated variants.

`VISITED` versus `CAUGHT` is a provenance/trust signal, not a tamper-proof security guarantee.

## Current Checkoff 3 focus

The primary integrated evidence is verified login -> upload -> canonical sprite -> `VISITED` collection -> archive. Auth/Contact Us are regression-tested, PVE may be isolated, and PVP remains planned. See [[Checkoff 3 Readiness and Development Plan]].

## Related

[[Problem and Value Proposition]] · [[Feature Priorities]] · [[System Architecture]] · [[Timeline and Milestones]]
