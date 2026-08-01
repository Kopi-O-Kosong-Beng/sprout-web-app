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
  it("approves when every programmatic check passes and the judge meets the threshold", () => {
    expect(shouldAutoApprove(passing)).toBe(true);
  });

  /*
   * The regression that mattered: the gate read
   * `scores.judgeCute ?? AUTO_APPROVE_JUDGE_MIN`, so an unscored sprite
   * inherited the passing threshold. The judge returned nothing on every error
   * path — including the 404 from its retired model — so effectively everything
   * auto-approved without ever being judged.
   */
  it("refuses to approve when the judge did not score at all", () => {
    const { judgeCute, ...unscored } = passing;
    expect(shouldAutoApprove(unscored as EvalScores)).toBe(false);
  });

  it("refuses to approve on a judge score below the threshold", () => {
    expect(shouldAutoApprove({ ...passing, judgeCute: AUTO_APPROVE_JUDGE_MIN - 1 })).toBe(false);
  });

  it("treats a zero score as a fail rather than a missing value", () => {
    expect(shouldAutoApprove({ ...passing, judgeCute: 0 })).toBe(false);
  });

  it("refuses to approve when background removal degraded", () => {
    expect(shouldAutoApprove(passing, false)).toBe(false);
  });

  it.each(["paletteValid", "dimsOk", "notBlank"] as const)(
    "refuses to approve when %s fails",
    (key) => {
      expect(shouldAutoApprove({ ...passing, [key]: false })).toBe(false);
    },
  );
});
