# Final submission package — 50.003 Elements of Software Construction

Team Sprout (CH03, Team 02) · 2026 May Term · due **16 August 2026, 2359**.

This folder holds the graded documents for the final submission. It is a record
of what was handed in, not a working area — the engineering documentation the
reports point at lives elsewhere in the repository and is listed below.

## Contents

| File | What it is | Weight |
|---|---|---:|
| `C3T2_Final_Report.docx` | Group report, twelve sections plus five appendices. Compiled by Andrina from the whole team's sections. | 15% + 1% bonus |
| `individual-report-zhifeng.md` | Individual report — Chia Zhi Feng (1009327). | 5% |

The presentation slides, the pitch video and the peer evaluation are submitted
outside the repository. Their links are in the group report's *Auxiliary
Resources* page.

## Where the report's evidence lives

The group report is marked against artefacts in this repository. These are the
ones a reader is most likely to want to open directly.

| Report section | Claim | Evidence in this repository |
|---|---|---|
| §4 Cloud native | Twelve-factor audit, drain on `SIGTERM`, liveness/readiness split | `server/lifecycle.ts`, `server/services/readiness.service.ts`, `server/Dockerfile`, `docker-compose.yml` |
| §4.4 Measured evidence | Shutdown, readiness and cold-start figures | [`docs/DELL_METRICS.md`](../DELL_METRICS.md) |
| §6.4 Traceability | Every use case mapped to its sequence diagram and to the suites verifying it | [`docs/TEST_TRACEABILITY.md`](../TEST_TRACEABILITY.md) |
| §6.8 Robustness | Image ingest gate and the mutation fuzzer that attacks it | [`md/FUZZ_TESTING.md`](../../md/FUZZ_TESTING.md), `server/pipeline/ingest/` |
| §6.9.1 End-to-end | 6 Playwright specs, 13 journeys against the real stack | [`e2e/`](../../e2e) |
| §7.2 Pull request tracking | Workload distribution, one feature per pull request | Repository pull request history, PR #1–#34 |
| Appendix 5 | CI command groups | [`docs/COMMANDS.md`](../COMMANDS.md), `.github/workflows/` |

Test counts quoted in §6.4 (server 624, client 309, pipeline 155, end-to-end 13)
were measured at commit `b184b62`, the tip of `main` on 9 August 2026.

## Related

- [`obsidian-vault/01 Project/Final Report Grading Rubric.md`](../../obsidian-vault/01%20Project/Final%20Report%20Grading%20Rubric.md) — the brief's rubric, transcribed, with the weight of each row.
- [`obsidian-vault/06 Meetings and Feedback/Final Deliverables Plan.md`](../../obsidian-vault/06%20Meetings%20and%20Feedback/Final%20Deliverables%20Plan.md) — owners, dates and the submission package.
- [`obsidian-vault/06 Meetings and Feedback/Checkoff 3 Report.md`](../../obsidian-vault/06%20Meetings%20and%20Feedback/Checkoff%203%20Report.md) — the PM3 report this one supersedes.
