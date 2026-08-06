---
tags: [guide, onboarding, meta]
---

# 📖 How To Use This Knowledge Base

A complete guide for the Sprout team on working with this Obsidian vault while developing the project — reading it, searching it, using Claude Code with it, and keeping it up to date. If you've never touched Obsidian before, start at the top; if you just need a specific workflow, jump to the section you need.

> New here? The 30-second version: **install Obsidian → open this folder as a vault → open [[Home]] → click links to explore.** Everything below is the detailed version.

---

## 1. What this knowledge base *is* (and isn't)

**It is:** the team's shared long-term memory — the *why* behind the project. Requirements, design decisions, the professor's feedback, testing plans, answered questions, and the reasoning behind choices we've made. When you're about to ask "why did we decide X?" or "what exactly is the upload flow supposed to do?", the answer usually lives here.

**It isn't:** the code (that's the [sprout-web-app](https://github.com/Kopi-O-Kosong-Beng/sprout-web-app) repo), and it isn't a chat replacement. Decisions still happen in the group chat and meetings — this vault is where we *write them down* so they don't get lost in scrollback.

**Why we bother:** ESC is graded heavily on requirements, design, and testing documentation. Keeping this current isn't busywork — it directly feeds the reports and checkoffs. A note you write today is a paragraph you don't have to reconstruct from memory at 2am before the final report.

---

## 2. What is Obsidian, exactly

[Obsidian](https://obsidian.md) is a free app for reading and writing a folder of Markdown (`.md`) text files. Think "personal Wikipedia that lives on your laptop." Key ideas:

- A **vault** is just a folder. This repo *is* the vault — no import, no database, no cloud account. Obsidian reads the files directly.
- Notes link to each other with **`[[double brackets]]`**. Click a link, jump to that note. This is what turns a pile of files into a connected web.
- There's a **graph view** that visually shows how notes connect (fun, occasionally useful for spotting orphaned topics).
- Because it's just Markdown files in a Git repo, **you don't strictly need Obsidian at all** — you can read every note on GitHub, or edit them in VS Code. Obsidian just makes the links clickable and the reading nicer.

> **Markdown in 20 seconds:** `# Heading`, `**bold**`, `- bullet`, `` `code` ``, `[link](url)`, and tables with `|`. That's 95% of what we use. You'll pick up the rest by copying existing notes.

---

## 3. First-time setup

1. **Install Git** if you don't have it — https://git-scm.com/downloads (test: run `git --version` in a terminal).
2. **Clone the knowledge base:**
   ```bash
   git clone https://github.com/Kopi-O-Kosong-Beng/sprout-knowledge-base.git
   ```
3. **Install Obsidian** — https://obsidian.md (Windows/Mac/Linux, free).
4. Open Obsidian → **"Open folder as vault"** → pick the `sprout-knowledge-base` folder you cloned.
5. If prompted about trusting the vault / plugins — accept defaults. We use **no community plugins**, so there's nothing risky to enable.
6. Open **[[Home]]** — the front page and map of everything.

That's it. The vault is now on your machine and you can read/edit offline.

---

## 4. Finding your way around

### The two entry points
- **[[Home]]** — hand-curated map, grouped by topic with a "where we are right now" section at the top.
- **[[README]]** — the onboarding version (what you're reading is linked from there too).

### The folders
| Folder | What lives here | Come here when… |
|---|---|---|
| `01 Project` | Overview, team roles, **grading rubrics**, timeline | "What's due next and how is it graded?" |
| `02 Requirements` | Use cases **UC1–UC8**, feature priorities, non-functional reqs | "What is feature X actually supposed to do?" |
| `03 Design` | Architecture, domain model, **DB schema, API contract**, GenAI pipeline, UI design system | "What endpoint / data shape do I build against?" |
| `04 Tech Stack` | Stack decision, external API references | "Which tools/APIs are we using and why?" |
| `05 Testing` | Testing strategy, test matrix, fuzzing plan | "What tests do I owe, and how?" |
| `06 Meetings and Feedback` | **Checkoff feedback**, meeting plans | "What did the prof tell us to change?" |
| `07 Decisions and QA` | Answered questions, open inconsistencies between docs | "Did we already decide this?" |
| `99 Sources` | Which original doc each note came from | "Where's the source for this claim?" |

### Search shortcuts (Obsidian)
- `Ctrl/Cmd + O` — **quick-open** any note by typing its name. Fastest way to jump around.
- `Ctrl/Cmd + Shift + F` — **search all text** across every note.
- `Ctrl/Cmd + G` — open the **graph view**.
- Click any `[[link]]` to follow it; use the back arrow (top-left) to return.

---

## 5. The golden rule: which document wins

Notes describe decisions, and decisions change. When two things disagree, follow this authority order (highest wins):

1. **Group chat decisions + professor's checkoff feedback** — the living source of truth.
2. **Master tech-stack doc (Zhi Feng)** — the finalized architecture (TypeScript, Firestore, Firebase Auth).
3. **These vault notes** — kept current, but if one contradicts #1 or #2, trust #1/#2 and fix the note (see §7).
4. **The spec files in the code repo** (`requirements.md`, etc.) — living drafts being aligned to the above.

Known contradictions between documents are tracked in **[[Open Questions and Inconsistencies]]** — check there before assuming a note is gospel.

---

## 6. Using Claude Code with the knowledge base

This is the part that makes the vault genuinely powerful. **Claude Code** (the AI coding assistant in your terminal / VS Code) can *read this whole vault* and answer questions from it, so you don't have to hunt through notes manually.

### Setup
- Install Claude Code (see https://claude.com/claude-code), then open a terminal **inside the `sprout-knowledge-base` folder** (or a parent folder that contains both this vault and the code repo).
- Claude Code reads the files in whatever folder you launch it from, so being in the right directory is what "connects" it to the knowledge base — nothing else to configure.

### Ask it questions (instead of digging manually)
Just type natural questions. Examples that work well against our vault:
- *"Summarise what the professor asked us to change after Checkoff 1."*
- *"What are the exact fields and validation rules for the query ticket?"*
- *"Which use cases involve the Email Server, and what for?"*
- *"What's our confidence threshold for plant ID, and where is it documented?"*
- *"I'm building the avatar archive page — pull the API contract and data shape from the notes."*

It reads the relevant notes and answers with citations to the files, so you can verify.

### Have it help you *write* notes
You can also ask Claude Code to update the vault for you:
- *"We decided in today's meeting to drop PVP for the final demo — add a note in `07 Decisions and QA` and link it from Home."*
- *"Turn my rough meeting notes below into a clean note following the style of the existing ones."*
- *"Check the vault for anything that still says we're using SQLite and flag it."*

It follows the existing note style (small, linked, "why" included). **Always skim what it wrote before committing** — you're the reviewer; treat it like a teammate's draft, not gospel.

### The `/graphify` option (advanced, optional)
There's a `graphify` skill that turns the whole vault into a queryable knowledge graph for deeper "how does everything connect" questions. You don't need it for day-to-day use — plain questions work fine — but it's there if you want to explore relationships across many notes at once.

> **A note on trust:** Claude Code is great at *finding* and *drafting*, but it can be confidently wrong. For anything load-bearing (a grade-critical requirement, an exact API contract), open the actual note and confirm. The vault is the source of truth; the AI is the fast index on top of it.

---

## 7. Contributing back (please do!)

The vault only stays useful if it stays current — and it's a team effort, not just Zhi Feng's job. You don't need permission to add or fix a note.

### The workflow
1. **Pull first** so you're not editing a stale copy:
   ```bash
   git pull
   ```
2. **Edit or add** a note — in Obsidian, VS Code, or by asking Claude Code (§6).
3. **Commit and push:**
   ```bash
   git add -A
   git commit -m "docs: <what you changed, e.g. add decision to drop PVP from final demo>"
   git push
   ```

### What's worth writing down
- A decision made in a meeting or the chat (**especially** the *why*).
- An answer to a question that's likely to come up again.
- Feedback from the professor.
- A gotcha or inconsistency you discovered.

### Style conventions (copy an existing note if unsure)
- **Keep notes small and specific** — one topic per note. Easier to link and find than a giant page.
- **Link generously** with `[[Note Name]]`. A link to a note that doesn't exist yet is fine — it's a marker that the note is worth writing later.
- **Explain the *why*, not just the *what*.** "We chose Firestore" is weak; "We chose Firestore because it's the real cross-platform DB the mobile app shares" is useful.
- Put new notes in the folder that matches their topic (§4), and add a link to them from **[[Home]]** so people can find them.

### Don't worry about breaking anything
It's plain text under Git. If something goes wrong, we can always look at history and undo it. The worst case is a merge conflict, which just means two people edited the same lines — Git will show you both and you pick. Ask in the chat if you hit one.

---

## 8. Quick reference card

| I want to… | Do this |
|---|---|
| Read the notes nicely | Open the folder as a vault in Obsidian, start at [[Home]] |
| Read without installing anything | Browse the files on GitHub |
| Find a note fast | `Ctrl/Cmd + O`, type its name |
| Search all text | `Ctrl/Cmd + Shift + F` |
| Ask a question about the project | Run Claude Code in the vault folder and just ask |
| Add/fix a note | Edit → `git pull` → `git commit` → `git push` |
| Know which doc wins in a conflict | §5 — chat/prof > Master doc > vault > spec drafts |
| Find the code | The [sprout-web-app](https://github.com/Kopi-O-Kosong-Beng/sprout-web-app) repo |

---

**Related:** [[Home]] · [[Source Index]] · [[Open Questions and Inconsistencies]]
