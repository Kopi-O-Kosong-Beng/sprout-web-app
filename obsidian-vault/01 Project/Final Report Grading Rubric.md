---
tags: [project, grading, rubric, final]
source: "50.003 Project Brief.pdf, pp. 13–17 (Raw dump/)"
transcribed: 2026-08-10
status: reference
---

# Final Report Grading Rubric

Transcribed from the project brief. **Sections 1–5 are the brief's own wording**
— treat them as the source. Section 6 is our reading of what each row demands
and where our evidence sits; it is commentary and is marked as such.

Related: [[Course Deliverables and Rubrics]] (the wider module picture, PM1–PM3),
[[Final Deliverables Plan]] (owners and dates).

---

## 1. Weights

**Final Project Presentation and Reports — capped at 25%.**

| Component | Weight |
|---|---:|
| **Group report and code repo** | **15% + 1% bonus** |
| — Requirement | 2% |
| — Design | 3% |
| — Implementation challenges | 2% |
| — Unit testing, backend and frontend | 3% |
| — Integration testing | 2% |
| — System end-to-end testing | 1% |
| — Robustness testing | 1% |
| — Feature progress records showing workload distribution | 1% |
| — Sustainability, diversity and inclusion / UN SDG | +1% bonus |
| **Individual report and peer review** | **5%** |
| **Final presentation** | **5%** |

The rubric table's point values are the percentages: 2 + 3 + 2 + 3 + 2 + 1 + 1 +
1 = 15.

## 2. The rubric table

Columns are the brief's: Poor / Fair / Excellent, with the marks it awards.

### Requirement — detailed description via use case diagram

| Poor (0) | Fair (1) | Excellent (2) |
|---|---|---|
| No use case diagram. | Some use case diagram, yet it is incomplete (does not cover all features) or incomprehensive or **no misuse cases were modelled**. | Complete and comprehensive use case diagram clearly showing the different features of the product. **Comprehensively model misuse cases.** |

### Design — design of different subsystems via UML diagrams

| Poor (0) | Fair (1) | Fair (2) | Excellent (3) |
|---|---|---|---|
| No class diagram nor sequence diagram. | Class diagram is present. However, it is incomplete, does not show all the associations or multiplicities, does not show (comprehensively) what are the different operations in the class, or it is inconsistent with the use case diagram. | Class diagram is complete and consistent with use case diagram, but does not comprehensively model sequence diagrams to reflect product workflow. | Complete, comprehensive and consistent class diagram with respect to its use case diagram. Sequence diagrams are **as comprehensive as possible** to reflect the detailed usage scenarios of the product. |

### Implementation challenges

Divided into subsections: **1) Algorithmic, 2) Engineering** (e.g. usage of
certain tools, integration issues etc.), **3) Testing** challenges. "Every
project should have at least engineering and testing challenges. Algorithmic
challenges might be specific to a few projects only (e.g. for Games)."

| Poor (0) | Fair (1) | Excellent (2) |
|---|---|---|
| No discussion on challenges. | Challenges are outlined, yet there is no comprehensive descriptions on **what measures were taken** to overcome these challenges, or these challenges were not even addressed in the project. | Clearly outlines the challenges and comprehensively describe **how they were addressed or what alternative measures were taken**. |

### Unit testing

"Implementation of unit tests and demonstration of tests. **Walking through the
software is not considered a test.** Test cases must be written and implemented
using testing framework such as Jest, RSpec or equivalent."

| Poor (0) | Fair (1) | Excellent (3) |
|---|---|---|
| No test or no progress made compared to meeting 3. There are some additional unit testing, but no coding was involved. | The frontend or backend unit testing is/are missing. Testing was done only based on the user stories, and **alternative and error scenarios are not covered**. Demonstration of test execution crashes or the tests are not aligned with the project objectives / use cases. | Extensive unit testing. They run properly and are consistent with the use cases of the project. **Boundary tests and negative cases tests are included.** |

### Integration testing

"Implementation of integration tests and demonstration of tests. Walking
through the software is not considered a test. Test cases must be written and
implemented using testing framework such as Jest or JUnit."

| Poor (0) | Fair (1) | Excellent (2) |
|---|---|---|
| No test or no progress made compared to meeting 3. No integration testing plan. There are some additional integration testings, but no coding was involved. | The frontend or backend integration testing is/are missing. Demonstration of test execution crashes or the tests are not aligned with the project objectives / **sequence diagram** / use cases. | Extensive integration testing. They are **reflecting faithfully the integration test plan**. They run properly and are consistent with the use cases **and sequence diagram** of the project. |

### System testing and robustness testing

"How was the product tested? Clearly articulate **what features were tested,
what was the process followed for testing, what tools were used and what were
the findings.** You are encouraged to use automated end-to-end testing tools
such as Cypress." The brief also suggests augmenting the suites "with other
frameworks such as Postman, Cypress, Selenium and Cucumber."

| Poor (0) | Fair (1) | Excellent (2) |
|---|---|---|
| No proper testing, or code-a-bit-test-a-bit type of testing. | Only system testing but not testing to check the robustness. For games, both system and robustness testing can be done by game players. | System **and** robustness testing is performed comprehensively and **described in the report in detail**. |

### Feature progress records to show workload distribution

| Poor (0) | Fair (0.5) | Excellent (1) |
|---|---|---|
| No record shown. | There are records showing the workload distribution with appropriate breakdown. | Clear and detailed records showing the workload distribution with appropriate breakdown. **The progress of the project reflects there are clear project management work done in rescheduling and balancing workload.** |

The brief adds, in the same cell:

> Recommended to highlight deliverables via explicit reference to documentation
> in submission or source code module to highlight your feature progress. Be
> prepared that mini in person individual interviews might be conducted to
> verify the contribution. **If the feature is not implemented by the member (or
> without artefact proving the accountability), we have to right to award 0 for
> this component.** Everyone must contribute. Individual penalty for those who
> don't.

### Bonus — sustainability, diversity and inclusion

"Please discuss impact of your project on sustainability, as well as any
consideration for diversity and inclusion (e.g., different cultures, demographic
groups, etc.). You may discuss how your project contributes to the United Nation
SDG: <https://sdgs.un.org/goals>" — **bonus mark 1%**.

## 3. What robustness testing should I plan?

The brief's own section, quoted in full because it is the most checkable list in
the document:

- Find fuzzing targets in your project.
- Use any language/platform to implement a fuzzer.
- **Ideally this fuzzer should be able to run and generate tests over a very
  long period (e.g., 24 hours).**
- The final version of the fuzzer may not be ready by Project Meeting 3, but
  **it should be ready by the final presentation**.
- If time permitted, try [JMeter](https://jmeter.apache.org/),
  [Hypothesis](https://hypothesis.readthedocs.io/en/latest/),
  [fast-check](https://github.com/dubzzz/fast-check).

## 4. Individual report and peer review — 5%

Sections required, in order:

1. Contribution to requirement formulation and refinement
2. Contribution to the design
3. Contribution to the implementation — **clearly articulate which subsystems
   were implemented by you**
4. Contribution to testing — **clearly articulate which type of tests were
   designed and developed by you**
5. An AI hallucination diary
6. Reflection — if the project was not successful (in your opinion), what is the
   main reason behind such failure?

**Max 3 pages.**

Peer review evaluation must also be submitted:

- **If you do not submit, your individual report marks will be 0.**
- The peer evaluation results will be compiled and used to moderate the marks
  allocated for your individual reports.
- If your peer evaluation result shows that you do not contribute to the
  project, the instructors have the right to investigate further and would
  moderate the group marks awarded to you.

## 5. Final presentation — 5%

- 15 minutes presentation that includes a demo of the product, and a short video
  for a high-level description of the software and how it was tested.
- The video should not be longer than **3 minutes**. It serves as backup
  material in case of technical problems. The school might seek permission to
  use the videos for future events and publicity.
- "A well-planned & executed, clear and concise presentation will help the
  graders to better appreciate your reports and project contributions."

---

## 6. Our reading — where the marks actually turn

> Commentary, not the brief. Verify against sections 1–5 before relying on it.

### The requirements that are easy to read past

| Phrase | Why it matters |
|---|---|
| "Comprehensively model **misuse cases**" | Named explicitly in the Requirement row. A complete use case diagram *without* misuse cases caps that row at Fair — 1 of 2. |
| Integration tests "consistent with the use cases **and sequence diagram**" | Marks are tied to a mapping, not to test volume. This is what `docs/TEST_TRACEABILITY.md` exists to satisfy. |
| "Boundary tests and **negative cases** tests are included" | The unit row asks for these by name, so the report should label them as such rather than leave a reader to infer them. |
| "what were the **findings**" | The robustness row wants results, not just a description of the tool. |
| "or without **artefact proving the accountability**" | Every workload claim needs something linkable — a PR, a file, a commit. Interviews may verify. |
| "**rescheduling and balancing** workload" | The workload row's top mark asks for evidence of project management, not only a table of who did what. |

### Where the weight sits

Testing rows total **7% of the module** — 3 unit + 2 integration + 1 system E2E
+ 1 robustness. That is nearly half the group report and more than any other
area. Design is next at 3%.

### Standing gap

The 24-hour fuzzer run in section 3 is the one concrete, checkable ask still
unmet: the fuzzer takes an iteration count, not a duration budget. Owner: Nat.
See [[Robustness and Fuzzing]].

### Evidence map

| Rubric row | Our evidence |
|---|---|
| Unit | 603 server Jest + 309 client Vitest + 149 pipeline Vitest — [[Test Inventory 2026-08-09]] |
| Integration | Call-graph bottom-up against the Firestore emulator; mapping in `docs/TEST_TRACEABILITY.md` |
| System E2E | 13 Playwright journeys against the real stack, `e2e/` |
| Robustness | Image ingest gate + mutation fuzzer, `md/FUZZ_TESTING.md` |
| Implementation challenges | [[Cloud Native and Containerization#Implementation challenges (rubric-shaped)]] |
| Workload | This vault, plus PR-per-feature history |
