# Agent Hooks — Setup & Behaviour Playbook

Two things live in this document:

1. **The hook installation** — what runs automatically, what runs manually, how to disable each piece.
2. **A behaviour playbook** — every hook is written as five gates (Scoping & Planning, Information Retrieval, Adversarial Attack, Verification, Final Reporting). A capable agent already works this way; a smaller model can follow the gates literally and land on the same behavior. The hooks are the enforcement; the gates are the reasoning they enforce.

## Mechanism (and why)

- **Scripts**: plain Node ESM under [scripts/agent-hooks/](scripts/agent-hooks/) — Windows-compatible (this workspace is Windows), zero new dependencies, deterministic, each runnable manually from a terminal. Shared helpers live in `hook-lib.mjs`.
- **Automatic wiring**: Claude Code hooks in [.claude/settings.json](.claude/settings.json) (this repo) and `ESC1D/.claude/settings.json` (the parent workspace, same hooks with adjusted paths, since Claude Code sessions currently run from there). The pre-existing `ESC1D/.claude/settings.local.json` (npm permissions) was left untouched.
- **Codex**: `.codex/` in the workspace is an empty specs scaffold with no hook/plugin convention, so nothing was registered there — Codex-style agents should invoke the scripts manually (every script works standalone).
- **Slow things are never automatic.** Automatic hooks are the fast subset (lint/typecheck/reminders, ≤ a few seconds). Builds, test suites, dev servers, and browser smoke tests are `--full`/manual by design.

## Quick reference

| # | Hook | Script | Automatic trigger | Manual command |
|---|---|---|---|---|
| 1 | Pre-task context | `context.mjs` | SessionStart | `node scripts/agent-hooks/context.mjs` |
| 2 | Design phase | `design-reminder.mjs` | UserPromptSubmit (design-word match only) | `node scripts/agent-hooks/design-reminder.mjs "restyle the archive page"` |
| 3 | Frontend validation | `frontend-check.mjs` | PostToolUse Edit/Write on `client/**` | `node scripts/agent-hooks/frontend-check.mjs --full` |
| 4 | Backend validation | `backend-check.mjs` | PostToolUse Edit/Write on `server/**` | `node scripts/agent-hooks/backend-check.mjs --full` |
| 5 | Secret safety | `secret-scan.mjs` | PreToolUse Bash (`git commit`/`push` only) | `node scripts/agent-hooks/secret-scan.mjs --scan` |
| 6 | API contract drift | `contract-drift.mjs` | PostToolUse on services/routes/controllers | (same, pipe hook JSON) |
| 7 | Test-plan discipline | `test-plan.mjs` | — manual by design | `node scripts/agent-hooks/test-plan.mjs` |
| 8 | Documentation sync | `docs-sync.mjs` | PostToolUse on setup-shaping files | (same, pipe hook JSON) |
| 9 | Dev server | `dev-server.mjs` | — manual by design | `node scripts/agent-hooks/dev-server.mjs` |
| 10 | Visual smoke test | `smoke-checklist.mjs` | — manual/optional | `node scripts/agent-hooks/smoke-checklist.mjs` |

**To disable one hook**: delete its entry from `.claude/settings.json` (`/hooks` menu in Claude Code shows what's active). **To disable everything**: remove the `hooks` key. Scripts are inert when not invoked — there is nothing else to uninstall. Hook config changes require a session restart to take effect.

**Exit-code contract** (all hooks): `0` + silence = pass or not-my-file; `0` + stdout = advisory context; `2` + stderr = actionable failure fed back to the agent (blocks the tool call for PreToolUse). No hook ever edits files, commits, pushes, deletes, or touches secrets.

---

## Hook 1 — Pre-task context (`context.mjs`)

Runs at session start; prints the authoritative doc list (README, FRONTEND_HANDOFF, requirements, DESIGN, tasks, IMPLEMENTATION_PLAN, checkoff), flags missing ones, lists live package scripts read from the three package.json files, and tells the agent to classify the task before acting.

1. **Scoping & Planning** — Classify the task (frontend / backend / design / testing / docs) before the first file edit, and bound work to that lane: a "fix the login error" task does not license an auth refactor. State the lane in one sentence, then act only within it.
2. **Information Retrieval** — Never assume scripts or docs exist: the hook reads package.json live rather than hardcoding script names, and marks missing docs `(MISSING)`. Imitate that — verify a command exists before recommending it; verify a doc exists before citing it.
3. **Adversarial Attack** — Ask "which of these docs could be stale for my task?" The repo's own precedence answers conflicts: actual backend code > SPECS/requirements.md > knowledge base. When two sources disagree, say so instead of silently picking one.
4. **Verification** — The hook is self-verifying (it reports only what it read from disk this session). The agent equivalent: quote file contents you opened this session, not remembered ones.
5. **Final Reporting** — Guidance is 15 lines, grouped, no prose padding. Copy that register: dense, scannable, zero filler.

## Hook 2 — Design phase (`design-reminder.mjs`)

Fires only when the prompt contains design vocabulary (ui, page, styling, tailwind, css, screenshot, responsive, …). Checks DESIGN.md's existence and age; injects the design checklist as context. Silent on every other prompt.

1. **Scoping & Planning** — Design work starts from a reference, not from taste. If DESIGN.md exists, it is the styling source of truth; plan the change as "match the reference," not "make it nicer."
2. **Information Retrieval** — The hook reads DESIGN.md's mtime and flags >14 days as possibly stale. Verify the reference is current before building against it; if DESIGN.md is missing, ask for a screenshot/mockup/Pencil file — do not invent a visual language.
3. **Adversarial Attack** — The two failure modes it guards: building desktop-only (so: plan 320–1440px explicitly), and shipping inaccessible UI (labels, single h1, keyboard path, focus, AA contrast). Challenge your layout at 320px *before* writing CSS, not after.
4. **Verification** — A visual change isn't done until viewed: run the dev server (hook 9) and the smoke checklist (hook 10) at two viewports minimum.
5. **Final Reporting** — Name what was visually changed and at which viewports it was checked; a CSS diff summary is not evidence of how it renders.

## Hook 3 — Post-edit frontend validation (`frontend-check.mjs`)

After any edit under `client/src/**` (ts/tsx/css), `client/index.html`, or `client/vite.config.ts`: runs incremental `tsc -b client` as the hard gate, plus oxlint filtered to **the edited file only**. `--full` adds build + client tests (when a `test` script exists — currently planned, not yet defined; the hook reports "skipped" rather than failing). Discovered while building this hook and worth knowing: **oxlint exits 0 even when it finds problems**, so its raw exit code can't gate anything — the hook greps its report instead, and ignores the repo's 3 pre-existing warnings that no current edit caused.

1. **Scoping & Planning** — Validation cost must match edit cost: per-edit checks are seconds (incremental tsc, one lint grep); minutes-long builds are reserved for `--full` at milestones. Don't run the world after every keystroke, and don't skip the fast gate ever.
2. **Information Retrieval** — The hook checks `client/package.json` for each script before running it and says "skipped — script not defined" instead of erroring. Imitate: discover capabilities, don't presume them.
3. **Adversarial Attack** — The oxlint discovery above is the model behavior: when a checker passes suspiciously easily, test the checker — feed it a known-bad input and confirm it actually fails (that exact probe found two bugs in this hook during setup: a path-mangling issue and the exit-0 lint gotcha).
4. **Verification** — Green means: `tsc -b` exit 0 **and** zero lint findings in the edited file. On failure the agent gets the last 25 lines and must fix before proceeding — not suppress, not defer.
5. **Final Reporting** — Report the literal result ("typecheck passed, lint clean" / the actual error text), never "should compile now." If `--full` was skipped, say it was skipped.

## Hook 4 — Post-edit backend validation (`backend-check.mjs`)

After any edit to `server/**/*.ts`, `server/package.json`, or `server/tsconfig.json`: runs `npm run typecheck -w server`. Editing a file under `server/tests/` also runs the Jest suite automatically (an edited test that was never run is a half-done edit). `--full` always runs the suite. Never starts servers; never needs Firebase credentials — the suite runs on SQLite with a mocked Firebase admin.

1. **Scoping & Planning** — Backend edits are gated by types per-edit and by the full suite per-feature. Plan which suite proves your change *before* making it (new email behavior → `tests/email.test.ts` exists because of this question).
2. **Information Retrieval** — Tests must not depend on developer machines having credentials: this repo's pattern is `EMAIL_MODE=console`, `DATASTORE=sqlite`, `jest.mock('../firebase')`. Before writing a test, read an existing suite (`tests/auth.test.ts`) and copy its seams rather than inventing new ones.
3. **Adversarial Attack** — For every happy-path test ask "what does the error path return?" This repo tests 400/401/403/404/409/429 *and* the 500-on-SMTP-failure path, plus resilience (ticket persists when email dies). New endpoints inherit that bar.
4. **Verification** — "Backend works" = `npm run typecheck -w server` exit 0 and `npm test -w server` showing all suites green, run this session. Currently: 3 suites, 31 tests.
5. **Final Reporting** — Paste the counts ("3 passed, 31 passed"), name any test intentionally not written, and state the untested risk explicitly.

## Hook 5 — Secret safety (`secret-scan.mjs`)

Before any Bash call: passes everything through untouched **except** `git commit` / `git push`, where it scans staged file names (.env variants, serviceAccountKey*.json, firebase-adminsdk, .pem, id_rsa, credentials.json — `.env.example` is allowed) and staged content (private-key blocks, Google API keys, service-account `private_key` fields). A hit blocks the command with file names only. `--scan` prints a full working-tree report. It never prints values and never deletes anything.

1. **Scoping & Planning** — Secret handling is planned before secrets exist: real values go in `server/.env` (gitignored), placeholders in `.env.example`, and nothing else. Any task touching credentials states where the secret will live before creating it.
2. **Information Retrieval** — Trust `git diff --cached` over memory: the hook checks what is *actually staged*, not what .gitignore *should* have excluded (`git add -f` defeats .gitignore silently — that exact bypass is what the block test used).
3. **Adversarial Attack** — Think like the leak: secrets escape via commits, but also via `.env.example` "just this once," log output, screenshots, and archives. Known standing risk it reports: a `serviceAccountKey.json` exists one directory **above** this repo — outside git, but inside any zip of the parent folder.
4. **Verification** — The block path was proven live during setup: a staged fake `.env` produced exit 2 naming the file, then was unstaged and deleted. Re-verify anytime with `--scan`.
5. **Final Reporting** — Report findings as *names and pattern types only* — printing a secret value in a "warning" is itself the leak. If something sensitive was ever committed, the report says "revoke and rotate," not just "remove."

## Hook 6 — API contract drift (`contract-drift.mjs`)

After edits to `client/src/services/*.ts` or `server/{routes,controllers}/*.ts`: injects a five-line checklist as context (methods match routes; fields match requirements.md and the Supertest assertions; UI error strings match backend strings verbatim; auth requirements stated; FRONTEND_HANDOFF.md updated if the contract truly changed). Advisory only — it never rewrites anything.

1. **Scoping & Planning** — A contract has two ends; an edit to one end is only half a task. Plan every route/service change as a pair: the change + the check of the opposite side.
2. **Information Retrieval** — The contract's source of truth is the Supertest assertions (they assert exact keys and error strings against the running app), then requirements.md — not the TypeScript interfaces, which can drift silently.
3. **Adversarial Attack** — Hunt the silent killers: renamed response field (UI shows `undefined`), reworded error string (client's verbatim match breaks — this client matches strings like `"An account with this email already exists."` exactly), auth added to a route the client calls anonymously.
4. **Verification** — Grep the other side for the changed path/field/string; run the backend suite (contract tests live there). A drift caught by grep costs seconds; caught in the browser it costs an evening.
5. **Final Reporting** — State the contract impact in one line, even when it's "no contract change — internal only." Silence about the contract is what lets drift compound.

## Hook 7 — Test-plan discipline (`test-plan.mjs`)

Manual by design (a Stop hook firing on every reply would be noise). Run when declaring work complete; prints the five-question template the final answer must fill in: unit tests, integration tests, manual QA, untested risk, commands + literal results.

1. **Scoping & Planning** — "Done" is defined before coding: which tests will prove this feature? If the answer is "none possible," that's a risk to declare, not a step to skip.
2. **Information Retrieval** — Only claim what this session observed. "Tests pass" requires having run them now — not last week, not "they should."
3. **Adversarial Attack** — The template's sharpest question is #4 (untested risk): every honest completion names what could still break. An answer with no untested risk is either exhaustive or dishonest — usually the latter.
4. **Verification** — Commands with literal outputs ("npm test -w server → 3 suites, 31 passed") are the only accepted evidence. Paraphrase is not evidence.
5. **Final Reporting** — Conclusion first ("Done: X works, verified by Y"), then the five answers, then caveats. A skipped step is reported as skipped — omission is the one unforgivable format error.

## Hook 8 — Documentation sync (`docs-sync.mjs`)

After edits to setup-shaping files (any package.json, .env.example, vite.config.ts, server/routes/**, deployment files, App.css): injects a reminder naming which docs may now be stale (README, FRONTEND_HANDOFF, DEPLOYMENT, DESIGN, tasks.md). It suggests; it never edits — and requirements.md is only ever changed when the *formal requirement* changed, never to paper over a bug.

1. **Scoping & Planning** — A feature's scope includes the docs that describe it; plan the doc touch with the code touch, not as a someday-cleanup.
2. **Information Retrieval** — Before updating a doc, read it — the correct fix is sometimes "the doc was already right and the code was wrong."
3. **Adversarial Attack** — The classic failure: onboarding docs that lie (a renamed script in package.json breaks README's setup section invisibly). Ask "who follows this doc next, and where do they now get stuck?"
4. **Verification** — Run the commands the doc tells a newcomer to run, as written, after updating them.
5. **Final Reporting** — Name updated docs alongside code changes; explicitly note docs deliberately *not* updated and why (especially requirements.md).

## Hook 9 — Dev server (`dev-server.mjs`)

Manual, after frontend tasks: probes ports 3001 (Express) and 5173 (Vite) and prints exactly what to run. Deliberately never spawns servers (hooks must not leave processes behind). Hard rule it encodes: the client must be on **5173 exactly** — backend CORS rejects everything else, so a Vite fallback to 5174 produces baffling browser-only failures.

1. **Scoping & Planning** — Demo-readiness is a state to check, not assume: two servers, correct ports, seeded data.
2. **Information Retrieval** — Probe the port; don't trust a memory of having started something. "In use" ≠ "is our server," and the hook says so.
3. **Adversarial Attack** — The trap is the silent fallback: occupied 5173 → Vite moves to 5174 → every API call dies on CORS. If 5173 is taken by something else, free it or get explicit approval — never silently accept another port, never start a duplicate server.
4. **Verification** — Server up = HTTP responds (`/api/health` for the backend), not "the command didn't error."
5. **Final Reporting** — End with the URL and the demo login (`demo@sprout.app` / `Password123!`), plus one line on what to click first.

## Hook 10 — Visual smoke test (`smoke-checklist.mjs`)

Manual/optional: prints the nine-point browser checklist (landing renders, nav gating for visitors, login round-trip, reset reaches OTP, archive grid + selection, battle state transitions, contact form returns an SPR ref, zero console errors, 375px + 1440px viewport pass). If browser tooling is available to the agent, walk it for real; otherwise hand it to the human. Screenshots only where they add signal; pixel-perfection only when the task *is* visual polish.

1. **Scoping & Planning** — Scope the smoke test to observable behavior: does each page render and each flow complete? Not "is it beautiful" — unless beauty was the task.
2. **Information Retrieval** — The checklist encodes app-specific knowledge (which flows exist, what the demo login is, what "working" looks like per page) so the tester doesn't rediscover it each time.
3. **Adversarial Attack** — The console-errors line exists because pages can *look* fine while React logs key warnings, failed fetches, or hydration errors underneath. An empty console is part of "renders correctly."
4. **Verification** — Two viewports minimum (375px, 1440px); a checklist row is pass, fail, or skipped — never blank.
5. **Final Reporting** — Report the checklist with per-row results. "Smoke test done" without rows is not a report.

---

## Limitations & honest edges

- **Hook config loads at session start** — editing `.claude/settings.json` mid-session does nothing until restart.
- **PostToolUse validation adds seconds per edit** (incremental tsc ~2-4s; server typecheck ~3-8s). If that's too chatty during a heavy refactor, temporarily remove those two entries and run `--full` manually at the end.
- **The secret scan is pattern-based** — it catches the common leaks (key files, private-key blocks, Google API keys), not every possible token format. It reduces risk; it is not a vault.
- **`npm run test -w client` doesn't exist yet** (planned in IMPLEMENTATION_PLAN.md); hooks report it as "skipped" until someone adds Vitest.
- **The smoke test can't self-drive** without browser tooling — it degrades to a human checklist by design.
- **Two settings files must stay in sync** (this repo's `.claude/settings.json` and the parent workspace's) until sessions run from this repo directly.
