import { EvalScores } from "../config";
import { serverEnv } from "../../platform/env";

/**
 * Layer 2: Gemini VLM LLM-as-judge scoring
 */
export async function geminiJudgeEval(
  spritePng: Buffer,
  plantName: string,
  geminiApiKey: string
): Promise<Partial<EvalScores>> {
  if (!geminiApiKey || geminiApiKey === "MOCK_KEY") {
    // No key: report "not scored" rather than inventing a passing grade.
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
    });

    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 200);
      console.warn(`Gemini judge (${serverEnv.judgeModel}) HTTP ${response.status}: ${detail}`);
      return {};
    }

    const json = (await response.json()) as any;
    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: any) => p.text || "").join("");
    
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("Gemini judge returned no JSON object; treating as not scored.");
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
