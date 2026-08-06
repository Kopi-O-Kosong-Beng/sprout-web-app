---
tags: [sources, index]
updated: 2026-07-07
---

# Source Index

Where every piece of project knowledge came from, and where files live now.

## Folder layout (after 2026-07-07 reorganisation)

```
Sprout_WebApp/
├── Raw dump/          ← original source documents (unchanged)
├── Sprout_Vault/      ← this Obsidian knowledge bank
└── sprout-app/        ← the web app workspace (build here)
    ├── requirements.md   (moved from root — EARS requirements, 13 reqs)
    ├── process.md        (moved from root — PRAFQ + steering doc)
    └── tasks.md          (moved from root — 22 implementation tasks)
```

## Raw dump inventory

| File | What it is | Distilled into |
|---|---|---|
| `50.003 Project Brief.pdf` | Course handout: PM1–3 + final rubrics, robustness/fuzzing guidance | [[Course Deliverables and Rubrics]] |
| `Sprout_Proposition.pdf` | Approved self-proposed project description; API links; deliverables | [[Project Overview]] · [[External APIs]] |
| `ESC_C3T2_MP1_markdown.md` | PM1 slide deck content (18 slides) | [[Problem and Value Proposition]] · [[Feature Priorities]] |
| `C3T2_UseCaseDescription_1D.docx` | Formal UC1–UC8 descriptions (pre-CO1-feedback state) | [[Use Case Model]] + UC1–UC8 notes |
| `Master.docx` | Zhi Feng's tech stack proposal (Firebase variant) w/ reasoning + link library | [[Tech Stack Decision]] |
| `Timeline.xlsx` | Gantt/WBS tracker: milestones w/ dates, tasks 1.1–4.18, roles, test matrix T01–T12, risks R01–R08 | [[Timeline and Milestones]] · [[Test Matrix]] |
| `Sprout_DomainClassDiagram.png` | UML domain class diagram | [[Domain Model]] (copy in `_attachments`) |
| `frontendv1.pdf` | Design system + hi-fi mockups (landing, signup, login, dashboard, OTP reset) | [[UI Design System]] |
| `sprout_user_flow_1.png` / `_2.png` | User flow diagrams (v2 adds admin/B2B branch) | [[UI Design System]] (copies in `_attachments`) |
| `usecase_preview.png` | Old use case diagram (DB still drawn as actor — superseded) | [[Use Case Model]] (copy in `_attachments`) |
| `check_off 3/Latest Diagrams 27_Jully/` (2026-07-24) | **Current PM3 diagram set**: `UC1.mmd`–`UC8.mmd` + `UC7a/UC7b` sequence diagrams and the domain class diagram (file misleadingly named `Plant Identification User-2026-07-20-100719.mmd`) | [[Sequence Diagram Plan]] · [[Domain Model]] (rendered PNGs in `_attachments/pm3-diagrams/`) |
| `check_off 3/Latest Diagrams/` (2026-07-20) | Superseded UC5–UC8 Router/Adapter drafts + `Sprout_SequenceDiagrams_Handoff_plaintext.md` handoff notes | Historical — replaced by the 27_Jully set |
| `check_off 3/Sprout_Features.md`, `Sprout_Storage_IP.md` | Feature and storage/IP raw notes for Checkoff 3 | [[Feature Priorities]] · [[Database Schema]] |
| `check_off 3/Testing SUTD course content/` | Course testing PDFs (black-box, software testing, extras) | [[Testing Strategy]] |
| `check_off 3/Requirement_highest_score_is_the_most_right_column.jpg` | PM3 rubric snapshot | [[Course Deliverables and Rubrics]] |

## Spec docs in `sprout-app/` (the build contract)

| File | Role | Key content |
|---|---|---|
| `requirements.md` | **What** to build | 13 EARS requirement sets, glossary (JWT/OTP/TempAvatar/RefNumber…), acceptance criteria incl. perf targets |
| `process.md` | **Why/how** framed | PRAFQ, P0–P2, architecture, testing strategy, risks, sprint timeline, steering files |
| `tasks.md` | **Order** of work | Tasks 1–22 with checkboxes; T1 scaffold ✅, T2 database in progress → next per [[Checkoff 2 Plan]] |

## Other references

- Android prototype repo: https://github.com/gxy812/katsu-an-g4ng
- Checkoff 1 feedback (chat notes, 2026-06) → [[Checkoff 1 Feedback]]
- Teammate questions (chat, Jul 2026) → [[QA Database Schema]] · [[QA Sprite Storage and Web Cache]] · [[QA Locality Data]]
