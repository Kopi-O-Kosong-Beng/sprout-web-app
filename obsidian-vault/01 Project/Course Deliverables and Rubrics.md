---
tags: [project, grading, checkoff3]
source: 50.003 Project Brief.pdf, Requirement_highest_score_is_the_most_right_column.jpg, Week10A_2.pdf, final-report rubric pages via Justin's Telegram (6 Aug 2026)
updated: 2026-08-06
---

# Course Deliverables and Rubrics (50.003)

The project contributes 40% of the module: PM1 5%, PM2 5%, PM3 5%, and final deliverables capped at 25%.

## Project Meeting 3 - 5%

| Item | Weight | Highest-score evidence |
|---|---:|---|
| Requirement changes since PM2 | 0.5% | Explicitly identify and justify changes, including canonical species sprites, `VISITED`/`CAUGHT`, Gemini/remove.bg, Firebase auth reality, and revised PVE scope |
| Complete design | 0.5% | Current use-case, class/domain, and sequence diagrams covering all features with consistent terminology |
| Additional feature demo | 1% | Well-prepared coded demo; promised functionality works or remaining work has a clear plan; isolated features are acceptable when labeled; human supervision/control is evident |
| Test plan | 1% | Unit and integration cases in table form, strategy named and justified, tools identified, optional E2E, and a detailed completed/future timeline |
| Implemented tests | 1% | Proper frameworks such as Jest/Vitest; well-written, running tests consistent with project use cases; include black-box and white-box techniques |
| Workload records | 1% | Clear member ownership with direct evidence in documents, commits, tests, and demo sections |

## Testing interpretation

The implementation rubric wording about "coding user study or crowdsourcing" describes alternative routes to evidence. Framework-based coded tests satisfy the coding route. A user study/crowdsourcing activity is useful UI evidence but is not mandatory in addition to Jest/Vitest.

Course terminology to use accurately:

- **Decomposition top-down:** test roots first and mock children; high fault separation, more mocks.
- **Decomposition bottom-up:** test leaf modules upward; fewer mocks, lower fault separation.
- **Call-graph top-down/bottom-up:** derive integration order from runtime calls/sequence diagrams.
- **Call-graph pairwise:** test every caller-callee edge, usually with mocks.
- **System tests:** derive from use-case documents, sequences, and state machines.
- **Iterative/agile testing:** add progression tests for the current iteration and regression tests for earlier iterations.

Sprout's primary choice is call-graph bottom-up integration with selective pairwise provider-contract tests. See [[Testing Strategy]].

## Final deliverables

Capped at 25% total. Exact weights (rubric pages shared 6 Aug):

| Component | Weight |
|---|---:|
| **Group report + code repo** | **15% + 1% bonus** |
| — Requirement | 2% |
| — Design | 3% |
| — Implementation challenges | 2% |
| — Unit testing (backend and frontend) | 3% |
| — Integration testing | 2% |
| — System end-to-end testing | 1% |
| — Robustness testing | 1% |
| — Feature progress records (workload distribution) | 1% |
| — Sustainability + D&I / UN SDG discussion | 1% bonus |
| **Individual report + peer review** | **5%** |
| **Final presentation** | **5%** |

Note where Zhi Feng's assigned work sits: testing documentation alone is 7%
of the module, more than double any other single row. Implementation
challenges (2%) scores full marks only with resolutions stated.

| Area | Highest-score direction |
|---|---|
| Requirements | Complete use-case diagram including misuse cases |
| Design | Class diagram with operations and multiplicities plus comprehensive, consistent sequence diagrams |
| Implementation challenges | Concrete algorithmic, engineering, cloud, and testing challenges with decisions/evidence |
| Unit testing | Backend and frontend; positive, negative, and boundary cases |
| Integration testing | Core cross-module/backend-frontend flows with strategy explained |
| System E2E | Use-case-derived browser/API journeys |
| Robustness | Fuzzing target and runnable fuzzer, ideally long-running by final presentation |
| Workload | Individual contribution linked to artifacts |
| Bonus | Sustainability and D&I/UN SDG discussion |

### Implementation challenges section

The rubric splits this into three subsections and scores 2 only when each
challenge is described **with how it was addressed or what alternative measure
was taken**. Listing a challenge without its resolution scores 1.

1. Algorithmic challenges - may be specific to a few projects, e.g. games
2. Engineering challenges - tool usage, integration issues
3. Testing challenges

Every project is expected to have at least engineering and testing challenges.

### Individual report and peer review - 5%

Max 3 pages. Sections:

1. Contribution to requirement formulation and refinement
2. Contribution to the design
3. Contribution to the implementation - clearly articulate **which subsystems**
   you implemented
4. Contribution to testing - clearly articulate **which types of tests** you
   designed and developed
5. An AI hallucination diary
6. Reflection: if the project was not successful in your opinion, what is the
   main reason behind the failure

Peer review is mandatory: not submitting it scores the individual report 0. Peer
evaluation results moderate individual report marks, and a result showing no
contribution allows the instructors to investigate and moderate group marks.

### Final presentation

**11 Aug 2026, 12:30pm, TT6 (1.416)**, in front of the class, no external
audience. The rubric text says "15 minutes presentation that includes a demo"
plus a ≤3-min backup video; Justin's prof-confirmed outline (6 Aug) runs
~17 min of talk + 3-min demo + 10 min Q&A — **follow Justin's outline**, it
is the agreed one (see [[Final Deliverables Plan#Presentation outline —
CONFIRMED with prof, 6 Aug (no more changes)]]). The video (≤3 min demo
inside a 7-min pitch video, due 16 Aug) is backup material in case of
technical problems; narration materially improves evaluation. The final
assessment focuses on architecture and strategy rather than deep coding.

### Submission deadlines (confirmed 4-6 Aug)

| Date | Item |
|---|---|
| 11 Aug 12:30pm | Final presentation |
| 15 Aug 2359 | Peer evaluation |
| 16 Aug 2359 | Final report, individual reports, slides, 7-min pitch video (incl. 3-min demo), code |

## Evidence rules

- Do not present screenshots or diagrams as substitutes for a coded demo.
- Do not claim planned PVE/PVP paths as implemented.
- Keep provider mocks deterministic and disclose them during the demo.
- Show human decisions: prompt/palette versions, code review, test oracles, failure handling, and acceptance decisions.
- Preserve exact test output, commit links, and video timestamps.

## Related

[[Final Deliverables Plan]] · [[Checkoff 3 Readiness and Development Plan]] · [[Timeline and Milestones]] · [[Testing Strategy]] · [[Test Matrix]]
