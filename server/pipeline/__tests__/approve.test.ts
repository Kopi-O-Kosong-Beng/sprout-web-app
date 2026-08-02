import { describe, it, expect } from "vitest";
import { shouldAutoApprove } from "../eval/approve";
import { AUTO_APPROVE_JUDGE_MIN, EvalScores } from "../config";

const passing: EvalScores = {
  paletteValid: true,
  dimsOk: true,
  notBlank: true,
  hasAlpha: true,
  judgeCute: AUTO_APPROVE_JUDGE_MIN,
};

describe("shouldAutoApprove", () => {
  it("[black-box: decision-table] approves when every programmatic check passes and the judge meets the threshold", () => {
    expect(shouldAutoApprove(passing)).toBe(true);
  });

  /*
   * The regression that mattered: the gate read
   * `scores.judgeCute ?? AUTO_APPROVE_JUDGE_MIN`, so an unscored sprite
   * inherited the passing threshold. The judge returned nothing on every error
   * path — including the 404 from its retired model — so effectively everything
   * auto-approved without ever being judged.
   */
  it("[white-box: branch] refuses to approve when the judge did not score at all", () => {
    const { judgeCute, ...unscored } = passing;
    expect(shouldAutoApprove(unscored as EvalScores)).toBe(false);
  });

  it("[black-box: boundary] refuses to approve on a judge score below the threshold", () => {
    expect(shouldAutoApprove({ ...passing, judgeCute: AUTO_APPROVE_JUDGE_MIN - 1 })).toBe(false);
  });

  it("[white-box: branch] treats a zero score as a fail rather than a missing value", () => {
    expect(shouldAutoApprove({ ...passing, judgeCute: 0 })).toBe(false);
  });

  it("[black-box: decision-table] refuses to approve when background removal degraded", () => {
    expect(shouldAutoApprove(passing, false)).toBe(false);
  });

  /**
   * MC/DC over the three-term guard
   * `paletteValid !== true || dimsOk !== true || notBlank !== true`.
   *
   * Branch coverage is satisfied by any single failing flag — which is exactly
   * the gap vite.config.ts warns about, since one row would leave the other two
   * terms never shown to matter. Together with the all-pass case at the top of
   * this block (every term false, result true), each row here flips exactly one
   * term and flips the outcome, which is what demonstrates each condition
   * independently affects the result.
   */
  it.each(["paletteValid", "dimsOk", "notBlank"] as const)(
    "[white-box: MC/DC] refuses to approve when %s fails",
    (key) => {
      expect(shouldAutoApprove({ ...passing, [key]: false })).toBe(false);
    },
  );
});
