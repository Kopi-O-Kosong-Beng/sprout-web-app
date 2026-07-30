import { PipelineTier } from "../config";
import {
  Deadline,
  GEMINI_TIMEOUT_MS,
  VISION_TIMEOUT_MS,
} from "../deadline";
import { serverEnv } from "../../platform/env";

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Art direction for the sprite prompt — plantemon-web's wording, verbatim.
 *
 * The distinction that matters: the sprite is an original creature *derived*
 * from the plant, not the literal plant with eyes added.
 *
 * This text has been walked away from twice and walked back both times, so the
 * failure modes are worth recording rather than rediscovering:
 *
 *   • "facial features grow out of the plant's own structures" (the original
 *     wording in this repo) gave a blob with a face stuck on.
 *   • Prescribing non-human anatomy — fused head-body, root-claws, heavy tail,
 *     petal maw, "squat chunky beast" — removed the humanoid but overshot into
 *     something too animal, and an earlier pass of it overshot the other way
 *     into botanical illustration.
 *
 * The reference wording sits between those: soft, round, cute, plant-first.
 * Prefer tuning a single clause over reaching for a new body plan.
 *
 * Two things in the reference look are deliberately dropped, because they'd
 * break the rest of the pipeline: the graph-paper backdrop (withoutBG needs a
 * flat white field to cut against) and the 2x2 grid (one plant, one sprite).
 *
 * One clause is added: the margin requirement. Without it Flux composes to the
 * frame edge and the finisher clips leaf crowns and plumes.
 */
export function buildInstruction(plantName: string): string {
  return (
    `This is a photo of ${plantName}. Write an image-generation prompt for an original ` +
    "pixel-art creature design in the style of a retro monster-collecting video game: a " +
    "chubby, big-eyed plant/nature-themed monster drawn from this exact plant. Carry the " +
    "real plant's colours, leaf shapes, and flowers into the creature — its leaves sprout " +
    "from the sides like wings or curl up like horns, its flowers cluster on its head and " +
    "body, its stems trail into a curling vine tail — on a round, soft-proportioned body " +
    "with large expressive eyes, a small friendly face, and tiny clawed or root-like feet. " +
    "Style: clean bold black outlines, flat cel-shaded colouring, retro 16-bit pixel art, " +
    "grid-aligned pixels, even lighting, no shadows. Describe only the creature's own " +
    "design — never name or reference any existing game, brand, or character. " +
    "One single creature, front-facing and centered, shown whole with a clear margin of " +
    "empty space on every side so no part of it touches or is clipped by the frame edge, " +
    "fully isolated on a solid flat " +
    "pure-white background — no scenery, pot, ground, graph paper or grid backdrop, " +
    "gradient, shadow, or reflection, so it cuts out cleanly. " +
    "Keep it to 2-3 sentences and output only the prompt, with no preamble."
  );
}

/**
 * Species feature dictionary for the tier 3 fallback, which has no photo to look
 * at and so needs the distinguishing traits supplied.
 */
const SPECIES_BOTANICAL_TRAITS: Record<string, string> = {
  // --- Golden set species (see pipeline/goldenset/manifest.json) -----------
  // These describe the *plant* — colours, petal counts, leaf shapes — and
  // nothing else. Creature anatomy is the surrounding instruction's job, and
  // duplicating it here is what pulled tier-3 sprites off-model twice: first
  // toward a humanoid ("skirt", "hair", "posture"), then toward an animal
  // ("root-claws", "heavy tail", "maw"). Keep this dictionary botanical.
  "melastoma": "five broad purple-pink petals, curly golden spiralling stamens, hairy leaves with three deep longitudinal veins",
  "melastoma malabathricum": "five large magenta petals, curly golden spiralling stamens, hairy three-veined green leaves",
  "papilionanthe miss joaquim": "pale lilac orchid petals, a broad magenta lip with an orange-gold speckled throat, slender cylindrical green reed stems",
  "vanda miss joaquim": "flat lilac orchid bloom, magenta and orange speckled lip, cylindrical green reed stems",
  "fritillaria imperialis": "a ring of downward-hanging burnt-orange bell flowers below a spiky green leaf tuft, thick upright stem",
  "crown imperial": "orange pendant bell flowers beneath a spiky green leaf tuft, sturdy stem",
  "albizia julibrissin": "soft pink powderpuff flowers of fine filaments, feathery bipinnate fern-like foliage",
  "mimosa tree": "candy-pink powderpuff blooms, delicate fern-like compound leaves",
  "sedum rupestre": "needle-like succulent rosettes, coral-red tips fading into chartreuse green",
  "angelina stonecrop": "spiky chartreuse succulent rosettes with coral-orange needle tips",
  "ilex meserveae": "glossy spined blue-green leaves studded with scarlet berries",
  "blue princess holly": "spined blue-green glossy leaves, scarlet berry clusters",
  "pennisetum setaceum": "arching burgundy blades and fluffy pink bottlebrush plumes",
  "purple fountain grass": "deep burgundy arching blades, soft pink feathery plumes",
  "hydrangea macrophylla": "a dense globe of small four-petal florets in a blue-to-lilac gradient, broad serrated green leaves",
  "hydrangea": "rounded pom-pom clusters of blue and lilac florets, wide toothed green leaves",

  // --- General species kept for ad-hoc uploads ----------------------------
  "venus flytrap": "hinged snap traps with red inner lining and fringed teeth, low ground rosette",
  "sunflower": "massive golden-yellow ray petals around a dark brown seed disk, thick hairy green stem",
  "rose": "layered crimson spiralling petals, thorny green stem, jagged glossy leaves",
  "cactus": "plump segmented emerald green body with star clusters of white spines, bright pink top flower",
};

/**
 * Strips conversational refusal preambles, meta-text headers, quotes, and
 * markdown from VLM outputs so the image model receives a clean prompt.
 *
 * Kept from this project rather than the reference: the fallback vision model
 * regularly prefixes its answer with a refusal it then contradicts, and that
 * preamble otherwise ends up rendered into the sprite.
 */
export function cleanVlmPromptText(rawText: string): string {
  if (!rawText) return "";

  let cleaned = rawText.trim();

  // Strip markdown codeblocks
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

  // Strip common outer quotes
  cleaned = cleaned.replace(/^["'“`]+|["'”`]+$/g, "").trim();

  // Strip conversational preambles
  const refusalPatterns = [
    /^(I am|I'm|As an AI|I cannot|I am unable to|I'm unable to)[^.:\n]*[.:\n]?\s*/i,
    /^(However,\s*)?(here is|below is|translated into)[^.:\n]*(prompt|instruction)[^.:\n]*[:\n]?\s*/i,
    /^(Sure|Certainly|Of course|Okay|Ok)[,!]?\s*/i,
    /^(Prompt|Image prompt|Image generation prompt)\s*[:\-]\s*/i,
  ];

  let previous: string;
  do {
    previous = cleaned;
    for (const pattern of refusalPatterns) {
      cleaned = cleaned.replace(pattern, "").trim();
    }
    cleaned = cleaned.replace(/^["'“`]+/, "").trim();
  } while (cleaned !== previous);

  // Strip markdown headers
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "").trim();

  return cleaned;
}

/**
 * Tier 3: no photo available, so the species dictionary supplies the traits the
 * vision models would otherwise have read off the image.
 */
export function nameOnlyPrompt(plantName: string): string {
  const normalized = plantName.toLowerCase().trim();
  let traits = SPECIES_BOTANICAL_TRAITS[normalized];

  if (!traits) {
    for (const [key, val] of Object.entries(SPECIES_BOTANICAL_TRAITS)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        traits = val;
        break;
      }
    }
  }

  const traitsString = traits ? `${traits}, ` : "";

  // Mirrors buildInstruction so the tier-3 sprite matches the tier-1 look. The
  // only difference is that the traits string stands in for the photo the
  // vision models would otherwise have read.
  return (
    `An original pixel-art creature design in the style of a retro monster-collecting ` +
    `video game: a chubby, big-eyed plant/nature-themed monster drawn from ${plantName} — ` +
    `${traitsString}its leaves sprouting from the sides like wings or curling up like ` +
    `horns, its flowers clustered on its head and body, its stems trailing into a curling ` +
    `vine tail, on a round, soft-proportioned body with large expressive eyes, a small ` +
    `friendly face, and tiny clawed or root-like feet. Clean bold black outlines, flat ` +
    `cel-shaded colouring, retro 16-bit pixel art, grid-aligned pixels, even lighting, ` +
    `no shadows. One single creature, front-facing and centered, shown whole with a clear ` +
    `margin on every side, fully isolated on a solid flat pure-white background — no ` +
    `scenery, pot, ground, gradient, shadow or reflection, so it cuts out cleanly.`
  );
}

/** Timeout helper used to bound an injected caller that has no abort signal. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("vision timeout")), ms);
  });

  return Promise.race([p, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const stripDataUrl = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, "");

/**
 * Tier 1: Google AI Studio. The fast path.
 *
 * Benchmarked in plantemon-web on one photo, interleaved rounds so every
 * contender shared queue conditions:
 *
 *   gemini-3.5-flash-lite   20/20 ok   1.2 / 1.5 / 2.2s   (min/med/max)
 *   gemini-3.6-flash         5/5  ok   3.9 / 4.3 / 4.7s
 *   nemotron-nano-12b-v2-vl  5/5  ok   6.7 / 8.1 / 10.0s
 *   gemma-4-31b-it           1/5  ok   68.9s, rest timed out past 90s
 *
 * flash-lite wins on both ends: fastest median and, more importantly, no tail at
 * all — it is the tail that was timing the route out. Avoid thinking models
 * here: reasoning tokens draw from maxOutputTokens and truncate the prompt.
 */
export async function craftPromptGemini(
  photoBase64: string,
  plantName: string,
  geminiApiKey: string,
  deadline?: Deadline,
): Promise<string> {
  if (!geminiApiKey || geminiApiKey === "MOCK_KEY") {
    throw new Error("Gemini API key not set");
  }

  const model = serverEnv.geminiVisionModel;
  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildInstruction(plantName) },
              { inline_data: { mime_type: "image/jpeg", data: stripDataUrl(photoBase64) } },
            ],
          },
        ],
        // Measured output is 106-173 tokens; 512 leaves room without inviting
        // an essay. This ceiling also covers reasoning tokens on models that
        // think — the reason a thinking model can't simply be dropped in.
        generationConfig: { maxOutputTokens: 512 },
      }),
      signal: deadline?.signal(GEMINI_TIMEOUT_MS, "the vision step"),
    },
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${raw.slice(0, 300)}`);
  }

  const candidate = JSON.parse(raw)?.candidates?.[0];
  const text: string = (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (text.length === 0) {
    // Covers a safety block, which returns a candidate with no parts at all.
    throw new Error(`Gemini returned no description (finishReason=${candidate?.finishReason}).`);
  }
  return cleanVlmPromptText(text);
}

/**
 * Tier 2: NVIDIA NIM. The fallback.
 *
 * Worth its complexity: Gemini is the fast path but it is also the one with a
 * prepaid balance that can hit zero mid-session, and a 429 there would otherwise
 * cost the whole scan. Losing Gemini should mean a slow sprite, not no sprite.
 */
export async function craftPromptGemma(
  photoBase64: string,
  plantName: string,
  nvidiaApiKey: string,
  deadline?: Deadline,
): Promise<string> {
  if (!nvidiaApiKey || nvidiaApiKey === "MOCK_KEY") {
    throw new Error("NVIDIA API key not set");
  }

  const response = await fetch(NVIDIA_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${nvidiaApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: serverEnv.nvidiaVisionModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildInstruction(plantName) },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${stripDataUrl(photoBase64)}` },
            },
          ],
        },
      ],
      max_tokens: 256,
    }),
    signal: deadline?.signal(VISION_TIMEOUT_MS, "the vision step"),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`NVIDIA API error ${response.status}: ${raw.slice(0, 300)}`);
  }

  const content = JSON.parse(raw)?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("NVIDIA returned no description.");
  }
  return cleanVlmPromptText(content.trim());
}

/**
 * Tiered prompt-craft orchestrator.
 *
 * Gemini leads and NVIDIA follows — the reverse of this project's original
 * order. gemma-4-31b-it was primary here, and its 69s-or-timeout tail is what
 * pushed runs past the route deadline and silently degraded them.
 */
export async function craftPromptTiered(
  photoBase64: string,
  plantName: string,
  nvidiaKey?: string,
  geminiKey?: string,
  callers = {
    gemini: craftPromptGemini,
    gemma: craftPromptGemma,
    nameOnly: nameOnlyPrompt,
  },
  deadline?: Deadline,
): Promise<{ prompt: string; tier: PipelineTier }> {
  // Tier 1: Gemini, bounded tightly so a broken call hands budget to the fallback.
  if (geminiKey && geminiKey !== "MOCK_KEY") {
    try {
      const prompt = await withTimeout(
        callers.gemini(photoBase64, plantName, geminiKey, deadline),
        GEMINI_TIMEOUT_MS,
      );
      return { prompt, tier: "gemini" };
    } catch (err: any) {
      console.warn(`Gemini vision failed, falling back to NVIDIA: ${err.message}`);
    }
  }

  // Tier 2: NVIDIA vision.
  if (nvidiaKey && nvidiaKey !== "MOCK_KEY") {
    try {
      const prompt = await withTimeout(
        callers.gemma(photoBase64, plantName, nvidiaKey, deadline),
        VISION_TIMEOUT_MS,
      );
      return { prompt, tier: "gemma" };
    } catch (err: any) {
      console.warn(`NVIDIA vision failed, dropping to name-only prompt: ${err.message}`);
    }
  }

  // Tier 3: species-aware prompt built without a photo.
  return { prompt: callers.nameOnly(plantName), tier: "nameOnly" };
}
