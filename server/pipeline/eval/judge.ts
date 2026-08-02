import { EvalScores } from "../config";
import { serverEnv } from "../../platform/env";
import { Deadline, JUDGE_TIMEOUT_MS } from "../deadline";

/**
 * Layer 2: Gemini VLM LLM-as-judge scoring.
 *
 * Every failure here returns {} — "not scored" — rather than a grade. Scoring is
 * the last hop and the sprite is already finished by the time it runs, so a
 * judge problem must never be able to cost the sprite.
 */
export async function geminiJudgeEval(
  spritePng: Buffer,
  plantName: string,
  geminiApiKey: string,
  deadline?: Deadline
): Promise<Partial<EvalScores>> {
  if (!geminiApiKey || geminiApiKey === "MOCK_KEY") {
    // No key: report "not scored" rather than inventing a passing grade.
    return {};
  }

  // Don't start a call the budget can't cover. deadline.signal() would throw
  // here anyway, but the catch below turns any throw into a silent {}, and
  // "skipped, no budget" and "Gemini refused" deserve different log lines.
  if (deadline && deadline.remainingMs() <= 0) {
    console.warn("No budget left for the judge; sprite returned unscored.");
    return {};
  }

  const cleanB64 = spritePng.toString("base64");
  const prompt = `Score this plant-monster game sprite 1–5 on each: cuteness, resemblance to a ${plantName}, clean cut-out edges, consistent pixel-art style. Reply only as JSON {"cute": 1-5, "resemblance": 1-5, "edges": 1-5, "style": 1-5}.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${serverEnv.judgeModel}:generateContent`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/png",
                  data: cleanB64,
                },
              },
            ],
          },
        ],
      }),
      signal: deadline?.signal(JUDGE_TIMEOUT_MS, "the judge"),
    });

    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 200);
      console.warn(`Gemini judge (${serverEnv.judgeModel}) HTTP ${response.status}: ${detail}`);
      return {};
    }

    const json = (await response.json()) as any;
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts.map((p: any) => p.text || "").join("");

    /*
     * A 200 from Gemini does not mean an answer. A safety block returns a
     * candidate with finishReason set and no parts at all, and a prompt-level
     * block returns promptFeedback.blockReason with no candidate whatsoever.
     * Both used to land on "returned no JSON object", which reads as a
     * formatting quirk and sent you looking at the prompt's JSON instruction
     * instead of at the block. promptCraft.ts already reports finishReason on
     * its own Gemini call; this is the same check its sibling was missing.
     */
    if (text.trim().length === 0) {
      const blocked = json.promptFeedback?.blockReason;
      const reason = blocked
        ? `prompt blocked (${blocked})`
        : `finishReason=${candidate?.finishReason ?? "absent"}`;
      console.warn(`Gemini judge returned no text — ${reason}. Sprite returned unscored.`);
      return {};
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(
        `Gemini judge returned prose rather than JSON; treating as not scored. Got: ${text.replace(/\s+/g, " ").slice(0, 120)}`,
      );
      return {};
    }

    const parsed = JSON.parse(match[0]);
    // `|| 4` would turn an explicit 0 — or a missing axis — into a pass.
    const axis = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    return {
      judgeCute: axis(parsed.cute),
      judgeResemblance: axis(parsed.resemblance),
      judgeEdges: axis(parsed.edges),
      judgeStyle: axis(parsed.style),
    };
  } catch (err: any) {
    console.warn("Gemini judge evaluation exception:", err.message);
    return {};
  }
}
