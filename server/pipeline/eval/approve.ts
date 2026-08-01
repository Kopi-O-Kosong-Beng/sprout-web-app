import { EvalScores, AUTO_APPROVE_JUDGE_MIN } from "../config";

/**
 * §6.2 Auto-approval gate
 * Promotes a pending Dex doc to approved if it satisfies all programmatic checks
 * and meets the judge cute threshold.
 */
export function shouldAutoApprove(scores: EvalScores, removeBgOk: boolean = true): boolean {
  // If remove.bg degraded (white background remaining), do NOT cache as approved
  if (!removeBgOk) return false;

  if (scores.paletteValid !== true || scores.dimsOk !== true || scores.notBlank !== true) {
    return false;
  }

  /*
   * Fails closed on a missing score. This previously read
   * `scores.judgeCute ?? AUTO_APPROVE_JUDGE_MIN`, which substituted the passing
   * threshold whenever the judge hadn't scored — and the judge silently
   * returned nothing on every error path, so an unscored sprite auto-approved.
   * An absent judgement is not a passing judgement; it means review by hand.
   */
  if (typeof scores.judgeCute !== "number") return false;

  return scores.judgeCute >= AUTO_APPROVE_JUDGE_MIN;
}
