---
tags: [design, ui, frontend]
source: frontendv1.pdf, sprout_user_flow_1.png, sprout_user_flow_2.png
---

# UI Design System — "Forest Sage"

From `frontendv1.pdf`: **Forest Sage palette · Anton headings · Funnel Sans body · Illustrated Warm style.**

## Color tokens (CSS custom properties)

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| `--background` | #F5F3EE | | `--primary` | #2D5E3A |
| `--surface` | #FFFFFF | | `--secondary` | #4A8C5E |
| `--surface-secondary` | #C8DBBC | | `--accent` | #C8DBBC |
| `--foreground` | #1B3A28 | | `--card` | #FFFFFF |
| `--foreground-secondary` | #4A6B52 | | `--destructive` | #C0392B |
| `--foreground-muted` | #7A9A80 | | `--border` | #D6DDD0 |

Spacing scale: 4/8/12/16/24/32/48/64 px · Radii: sm 4, md 8, lg 12, xl 16, pill 9999
Buttons: primary (Start Battle) · secondary (View Archive) · outline (Upload Plant) · ghost (Cancel) · destructive (Delete Account)
Status badges: Verified · Temporary · Web Upload · Open · Resolved · Low Confidence · Error

## Mockups available (pages designed)

1. **Landing** — hero "Scan. Grow. Battle.", CTA Get Started, sample avatar cards (Helianthus/Quercus/Amanita), feature strip, 3-step how-it-works, footer
2. **Signup** — split layout, first/last/display name, email, password + confirm, validation hints, "verification link" notice
3. **Login** — split layout with avatar preview list, error state "Invalid email or password."
4. **Reset password** — 3-step progress (Request OTP → Enter OTP → New Password), 6-digit OTP boxes, resend cooldown, 15-min expiry note
5. **Dashboard** — sidebar nav (Dashboard/Avatar Archive/Upload Plant/PVE Battle/Contact Us), stat tiles (Avatars Collected, Battles Won, Species Discovered, Tickets Open), recent avatars, quick actions, recent battles

## User flow

![[sprout_user_flow_1.png]]

Flow 2 (`sprout_user_flow_2.png`) adds an **admin-restricted "View client dashboard"** branch (B2B metrics) — P1/P2 scope.

Key annotation on both: *uploads are allowed inside PVE because users can battle with sprites they don't own; arbitrary-upload sprites are not saved to the account archive (data-pool limit of early development, plus anti-abuse).*

> [!note] Checkoff 1: keep UI specifics OUT of use case documents. This note is for implementation only (Tasks 10–17 in tasks.md).

## Related

[[System Architecture]] · [[Feature Priorities]] · [[UC4 Browse Avatar Archival]]
