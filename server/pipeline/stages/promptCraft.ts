import { PipelineTier } from "../config";
import {
  Deadline,
  GEMINI_TIMEOUT_MS,
  VISION_TIMEOUT_MS,
} from "../deadline";
import { descriptionBudgetFor } from "../promptStyle";
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
 *   • Stating the anatomy as fact ("its leaves sprout from the sides like wings
 *     ... its stems trail into a curling vine tail") made every species converge
 *     on the same body: two side wings and a tail, whether or not the plant had
 *     anything vine-like or wing-like about it. A VLM transcribes a clause like
 *     that rather than choosing from it, so the anatomy line has to be phrased
 *     as a selection with an explicit "only what the plant supports" bound, and
 *     the default features it drifts back toward have to be named and refused.
 *
 * The reference wording sits between those: soft, round, cute, plant-first.
 * Prefer tuning a single clause over reaching for a new body plan.
 *
 * The child-appeal clause is stated as design rules — oversized head on a small
 * body, thumbnail-readable silhouette, saturated palette, nothing menacing —
 * rather than by naming the genre's famous examples. Naming a franchise here is
 * a dead end in both directions: image models often refuse the request outright,
 * and when they don't they return designs close enough to the originals to be an
 * IP problem in a shipped product. The rules survive either way, which is why
 * the "never name any existing game, brand, or character" line below stays.
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
    "chubby, big-eyed plant/nature-themed monster drawn from this exact plant. It must read " +
    "instantly to a young child as a friendly collectible creature — toy-like and huggable, " +
    "never scary or menacing, with an oversized head on a small rounded body, a simple bold " +
    "silhouette that stays readable at thumbnail size, and bright saturated colours. Carry the " +
    "real plant's colours, leaf shapes, and flowers into the creature, and let this plant's " +
    "own growth habit decide its body plan: pick only the two or three features the plant " +
    "actually has — a trailing stem can become a tail, a broad opposite leaf pair can become " +
    "wings, a low rosette can become a ruff or mane, a bulb or berry cluster can become the " +
    "body itself, an upright spike or plume can become a crest, horns, or a topknot. Do not " +
    "give it wings, a tail, or any other feature this plant's form does not suggest. Build it " +
    "on a round, soft-proportioned body " +
    "with large expressive eyes, a small friendly face, and tiny clawed or root-like feet. " +
    "Style: clean bold black outlines, flat cel-shaded colouring, retro 16-bit pixel art, " +
    "grid-aligned pixels, even lighting, no shadows. Describe only the creature's own " +
    "design — never name or reference any existing game, brand, or character. " +
    "One single creature, front-facing and centered, shown whole with a clear margin of " +
    "empty space on every side so no part of it touches or is clipped by the frame edge, " +
    "fully isolated on a solid flat " +
    "pure-white background — no scenery, pot, ground, graph paper or grid backdrop, " +
    "gradient, shadow, or reflection, so it cuts out cleanly. " +
    // The word bound exists because the renderer's budget is character-shaped:
    // Flux hard-caps prompts at 800 characters and the fixed style suffix takes
    // ~300 of them, leaving ~490 for this description. 65 words lands near 430
    // characters, comfortably inside — an unbounded "2-3 sentences" routinely
    // ran to 600+ and got its tail trimmed off at render time, which is the
    // silent way to lose the last feature the model described.
    "Keep it to 2-3 sentences and at most 65 words, and output only the prompt, " +
    "with no preamble."
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
    `video game: a chubby, big-eyed plant/nature-themed monster drawn from ${plantName}, ` +
    `reading instantly to a young child as a friendly collectible creature — toy-like and ` +
    `huggable, never scary, with an oversized head on a small rounded body, a simple bold ` +
    `silhouette readable at thumbnail size, and bright saturated colours — ` +
    `${traitsString}with only the two or three creature features those traits actually ` +
    `support, and no wings, tail, or other feature the plant's form does not suggest, ` +
    `on a round, soft-proportioned body with large expressive eyes, a small ` +
    `friendly face, and tiny clawed or root-like feet. Clean bold black outlines, flat ` +
    `cel-shaded colouring, retro 16-bit pixel art, grid-aligned pixels, even lighting, ` +
    `no shadows. One single creature, front-facing and centered, shown whole with a clear ` +
    `margin on every side, fully isolated on a solid flat pure-white background — no ` +
    `scenery, pot, ground, gradient, shadow or reflection, so it cuts out cleanly.`
  );
}

/**
 * Second pass for a crafted description that overran the render budget:
 * the model rewrites it shorter instead of the render step chopping its tail.
 *
 * The trim in applyStyleScaffold stays as the backstop, but it is a dumb one —
 * it keeps whatever came first and drops whatever came last, and the last
 * sentence is where the crafting models put the isolation and background
 * requirements. A prompt that loses those doesn't fail; it renders something
 * subtly off-brief, which is the hallucination this pass exists to prevent.
 * Compression lets the model choose what to give up, feature-aware, rather
 * than position-aware.
 *
 * Gemini first, NVIDIA second, mirroring the craft tiers and reusing whichever
 * credential just worked. Any failure is non-fatal: the caller keeps the long
 * prompt and the backstop trim still runs.
 */
export async function compressPromptText(
  prompt: string,
  budget: number,
  geminiKey?: string,
  nvidiaKey?: string,
  deadline?: Deadline,
): Promise<string> {
  const instruction =
    `This image-generation prompt is ${prompt.length} characters long, but the renderer ` +
    `accepts at most ${budget}. Rewrite it in under ${budget} characters. Keep every ` +
    `plant-derived feature, colour, and anatomy choice, the friendly toy-like character, ` +
    `and the requirement of one whole centred creature isolated on a flat pure-white ` +
    `background; cut filler words and repeated style vocabulary first. ` +
    `Output only the rewritten prompt, with no preamble.\n\n${prompt}`;

  if (geminiKey && geminiKey !== "MOCK_KEY") {
    const model = serverEnv.geminiVisionModel;
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }] }],
          generationConfig: { maxOutputTokens: 256 },
        }),
        signal: deadline?.signal(GEMINI_TIMEOUT_MS, "the prompt-compression step"),
      },
    );

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini compression error ${response.status}: ${raw.slice(0, 300)}`);
    }
    const text: string = (JSON.parse(raw)?.candidates?.[0]?.content?.parts ?? [])
      .map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim();
    if (text.length > 0) return cleanVlmPromptText(text);
    // Fall through to NVIDIA rather than failing on an empty answer.
  }

  if (nvidiaKey && nvidiaKey !== "MOCK_KEY") {
    const response = await fetch(NVIDIA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nvidiaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: serverEnv.nvidiaVisionModel,
        messages: [{ role: "user", content: instruction }],
        max_tokens: 200,
      }),
      signal: deadline?.signal(VISION_TIMEOUT_MS, "the prompt-compression step"),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`NVIDIA compression error ${response.status}: ${raw.slice(0, 300)}`);
    }
    const content = JSON.parse(raw)?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      return cleanVlmPromptText(content.trim());
    }
    throw new Error("NVIDIA compression returned no text.");
  }

  throw new Error("No key available for prompt compression.");
}

/** Internal: bounds an injected caller that has no abort signal of its own. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
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

interface CraftCallers {
  gemini: typeof craftPromptGemini;
  gemma: typeof craftPromptGemma;
  nameOnly: typeof nameOnlyPrompt;
  /** Optional so injected test doubles predating compression keep working. */
  compress?: typeof compressPromptText;
}

/**
 * Holds a crafted description to the render budget, model-first.
 *
 * Only runs when the description overshoots what Flux leaves for it (the word
 * bound in buildInstruction makes that the exception, not the rule), and never
 * fails the craft: whatever goes wrong, the over-long prompt is returned and
 * applyStyleScaffold's trim remains the backstop.
 */
async function fitToRenderBudget(
  prompt: string,
  callers: CraftCallers,
  geminiKey?: string,
  nvidiaKey?: string,
  deadline?: Deadline,
): Promise<string> {
  const budget = descriptionBudgetFor("flux");
  if (budget === null || prompt.length <= budget || !callers.compress) return prompt;

  try {
    const compressed = await withTimeout(
      callers.compress(prompt, budget, geminiKey, nvidiaKey, deadline),
      GEMINI_TIMEOUT_MS,
    );
    if (compressed.length > 0 && compressed.length < prompt.length) {
      console.info(
        `Crafted description overran the ${budget}-char render budget at ` +
          `${prompt.length} chars; compressed to ${compressed.length}.`,
      );
      return compressed;
    }
    console.warn(
      `Prompt compression did not shorten the description ` +
        `(${prompt.length} -> ${compressed.length} chars); keeping the original — ` +
        `the render step will trim it instead.`,
    );
  } catch (err: any) {
    console.warn(
      `Prompt compression failed; the render step will trim instead: ${err?.message ?? err}`,
    );
  }
  return prompt;
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
  callers: CraftCallers = {
    gemini: craftPromptGemini,
    gemma: craftPromptGemma,
    nameOnly: nameOnlyPrompt,
    compress: compressPromptText,
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
      return {
        prompt: await fitToRenderBudget(prompt, callers, geminiKey, nvidiaKey, deadline),
        tier: "gemini",
      };
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
      return {
        prompt: await fitToRenderBudget(prompt, callers, geminiKey, nvidiaKey, deadline),
        tier: "gemma",
      };
    } catch (err: any) {
      console.warn(`NVIDIA vision failed, dropping to name-only prompt: ${err.message}`);
    }
  }

  // Tier 3: species-aware prompt built without a photo. Deterministic text with
  // no key to compress with — the render-time trim covers it, and its tail is
  // style vocabulary the scaffold restates anyway.
  return { prompt: callers.nameOnly(plantName), tier: "nameOnly" };
}
