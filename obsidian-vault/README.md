# Sprout Project Vault

An [Obsidian](https://obsidian.md) vault holding the **decision record** for
Sprout — the reasoning behind the code, kept alongside it.

Open the folder in Obsidian for the linked graph view, or read any file as plain
Markdown. The `[[double bracket]]` links are wiki-links between notes.

---

## Why this is in the repository

Three reasons, and the third is the honest one.

**1. The reasoning is the part that gets lost.** Code records *what* was built.
Git records *when*. Neither records why the battle engine re-simulates from a
log instead of trusting stored state, or why the operator allowlist fails closed,
or why we rejected Alpine for the container base. Those decisions were argued
once and would otherwise survive only in someone's memory.

**2. It is graded.** "Feature progress records to show workload distribution" is
a rubric line. This vault is the primary evidence for it — who decided what, when,
and on what basis.

**3. It gives an AI assistant the project's memory.** We use LLM assistance
throughout, and an assistant with no context re-derives — or worse, invents —
things the team settled weeks ago. Pointing it at this vault is what makes it
answer from our decisions instead of plausible guesses. That is also why the
notes are written to be *falsifiable*: claims carry dates and evidence labels, so
a stale one can be caught rather than confidently repeated.

## Reading it honestly

**These notes are point-in-time.** Each records what was true when written. A
note dated 25 July describing something as "not yet merged" is not a claim about
today — it is a record of that day. Where a note has been overtaken, the newer
note says so and links back.

**Evidence labels are load-bearing.** The vault deliberately distinguishes:

| Label | Meaning |
|---|---|
| **PASS** | Ran, observed, dated |
| **CI** | Proven by a linked CI run |
| **PLANNED / NOT RUN** | Designed but never executed |
| **UNCONFIRMED** | Believed true, not yet checked |
| **NOT DONE** | Explicitly not claimed |

A claim without a label is a claim that has not earned one. This applies to the
uncomfortable entries too: where the meeting notes and reality disagree, both
are recorded and the conflict is named, rather than the record being quietly
tidied.

## Layout

| Folder | Contents |
|---|---|
| `01 Project` | Scope, rubrics, timeline, team roles, the Dell competition track |
| `02 Requirements` | Use cases UC1–UC8, requirement changes |
| `03 Design` | Domain model, sequence diagram plans |
| `04 Tech Stack` | Architecture decisions, cloud-native and containerisation log |
| `05 Testing` | Strategy, inventory, robustness and fuzzing scope |
| `06 Meetings and Feedback` | Meeting records, deliverables plan, per-member task lists |
| `07 Decisions and QA` | Open questions, resolved inconsistencies, contradictions |
| `99 Sources` | Source material |
| `_attachments` | Rendered diagrams |

Start at [`Home.md`](Home.md).

## Relationship to the code documentation

This vault holds **decisions and their reasoning**. The repository's own docs
hold **instructions**:

- `README.md` — what the project is
- `docs/DEVELOPMENT.md` — how to run it
- `docs/COMMANDS.md` — every command
- `md/CONTAINERIZATION.md`, `md/FUZZ_TESTING.md` — how a subsystem works

Where they overlap, the code documentation wins on *how* and this vault wins on
*why*.

---

*50.003 Elements of Software Construction — SUTD, Cohort 3 Team 2, 2026.*
