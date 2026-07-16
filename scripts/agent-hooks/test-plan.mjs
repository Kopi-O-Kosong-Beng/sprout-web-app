/**
 * test-plan.mjs — Test-plan / final-answer discipline hook.
 * Trigger: MANUAL (not wired automatically — a Stop hook firing on every
 * response would be noise). Run when declaring a feature complete:
 *   node scripts/agent-hooks/test-plan.mjs
 * Prints the report template the final answer must fill in. No file mutation.
 */
console.log(`[test-plan hook] A "done" claim must answer all five, with evidence:

1. Unit tests added/updated .......... which files, which cases
2. Integration tests added/updated ... which files, which cases
3. Manual QA performed ............... which flows were clicked through, at which viewport(s)
4. Untested risk ..................... what could still break that no test covers
5. Commands run + literal result ..... e.g. "npm test -w server → 3 suites, 31 passed"

Rules: never claim "tests pass" without having run them this session;
paste the actual pass/fail counts, not a paraphrase; a skipped step is
reported as skipped, not omitted.`);
