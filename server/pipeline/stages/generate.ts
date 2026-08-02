import sharp from "sharp";
import { SPRITE_SIZE, nearestPaletteHex } from "../config";
import { Deadline, FLUX_TIMEOUT_MS } from "../deadline";
import { applyStyleScaffold } from "../promptStyle";

const FLUX_ENDPOINT =
  "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface RenderKeys {
  flux?: string | null;
  gemini?: string | null;
  geminiModel: string;
  /** Which provider is tried first; the other is the automatic fallback. */
  provider: "flux" | "gemini";
}

export interface RenderResult {
  png: Buffer;
  /** False when no image model ran and the placeholder drawing was used. */
  fromModel: boolean;
  /** Exact model that produced the bytes, for honest Dex stamping. */
  model: string;
  /** Prompt actually sent, after scrubbing and style scaffolding. */
  finalPrompt: string;
  /** Style-contradicting terms cut from the crafted prompt, for the studio. */
  strippedTerms: string[];
}

/** Renders via NVIDIA Flux.2 Klein 4B. Answers with JPEG despite the field name. */
async function renderWithFlux(
  prompt: string,
  apiKey: string,
  deadline?: Deadline,
): Promise<Buffer> {
  const response = await fetch(FLUX_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, steps: 4 }),
    signal: deadline?.signal(FLUX_TIMEOUT_MS, "the render step"),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Flux API error ${response.status}: ${raw.slice(0, 300)}`);
  }

  /*
   * A 200 here does not mean an image. NVIDIA answers with
   * { artifacts: [{ base64, finishReason, seed }] }, and on a safety-filter trip
   * or a post-acceptance rejection it returns the envelope with finishReason set
   * to something other than SUCCESS and no usable base64.
   *
   * This used to throw a bare "Flux returned no image", which is why an
   * intermittent filter trip was indistinguishable from a broken integration:
   * the one field that says which had been parsed past and dropped. Surface it.
   */
  const artifact = JSON.parse(raw)?.artifacts?.[0];
  const base64 = artifact?.base64;

  if (typeof base64 !== "string" || base64.length === 0) {
    const reason = artifact?.finishReason ?? "no finishReason returned";
    throw new Error(
      `Flux returned no image (finishReason=${reason}). ` +
        `This is usually an intermittent content-filter trip rather than a config problem — ` +
        `the same prompt often succeeds on a retry with a different seed.`,
    );
  }

  // Strip a data URL prefix if one is present.
  const comma = base64.indexOf(",");
  return Buffer.from(comma === -1 ? base64 : base64.slice(comma + 1), "base64");
}

/** Renders via a Gemini image model ("Nano Banana"). Returns JPEG or PNG. */
async function renderWithGemini(
  prompt: string,
  apiKey: string,
  model: string,
  deadline?: Deadline,
): Promise<Buffer> {
  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: deadline?.signal(FLUX_TIMEOUT_MS, "the render step"),
    },
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini image API error ${response.status}: ${raw.slice(0, 300)}`);
  }

  /*
   * Same shape of trap as the Flux path above: 200 OK is not an image. A safety
   * block returns a candidate carrying finishReason and no inline data, and a
   * prompt-level block returns promptFeedback.blockReason with no candidate at
   * all. Reporting only "returned no image" makes an intermittent block
   * indistinguishable from a broken integration.
   */
  const body = JSON.parse(raw);
  const candidate = body?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const inline = parts.map((p: any) => p.inlineData ?? p.inline_data).find(Boolean);

  if (!inline?.data) {
    const blocked = body?.promptFeedback?.blockReason;
    const reason = blocked
      ? `prompt blocked (${blocked})`
      : `finishReason=${candidate?.finishReason ?? "absent"}`;
    throw new Error(`Gemini image model returned no image (${reason}).`);
  }
  return Buffer.from(inline.data, "base64");
}

/**
 * Renders the crafted prompt into a sprite.
 *
 * Either provider can lead (IMAGE_PROVIDER); whichever does, the other is tried
 * automatically before giving up. That matters because these are billed on
 * separate accounts — one running out of credit should cost latency, not the
 * sprite.
 *
 * The NVIDIA proxy is mandatory rather than a key-hiding convenience: its
 * endpoints answer CORS preflights without an Access-Control-Allow-Origin
 * header, so browser JS cannot call them at all.
 */
export async function generateSprite(
  prompt: string,
  keys: RenderKeys,
  deadline?: Deadline,
): Promise<RenderResult> {
  const usable = (k?: string | null) => !!k && k !== "MOCK_KEY";

  /*
   * The scaffold is built per provider, not once: both get the same scrubbed
   * description and the same positive style targets, but only Gemini gets an
   * avoid-clause. Flux is guidance-distilled and reads a negative list as a
   * request — see pipeline/promptStyle.ts.
   */
  const fluxScaffold = applyStyleScaffold(prompt, "flux");
  const geminiScaffold = applyStyleScaffold(prompt, "gemini");

  if (fluxScaffold.removed.length > 0) {
    console.info(
      `Stripped style-contradicting terms from the crafted prompt: ${fluxScaffold.removed.join(", ")}`,
    );
  }

  // Say so rather than letting a quietly shortened description look intentional.
  if (fluxScaffold.truncated) {
    console.warn(
      `Crafted description trimmed to fit Flux's 800-character prompt limit ` +
        `(final prompt ${fluxScaffold.prompt.length} chars). The style clause is intact; ` +
        `the tail of the creature description was dropped.`,
    );
  }

  const attempts: { model: string; prompt: string; run: () => Promise<Buffer> }[] = [];
  const addFlux = () => {
    if (usable(keys.flux)) {
      attempts.push({
        model: "black-forest-labs/flux.2-klein-4b",
        prompt: fluxScaffold.prompt,
        run: () => renderWithFlux(fluxScaffold.prompt, keys.flux!, deadline),
      });
    }
  };
  const addGemini = () => {
    if (usable(keys.gemini)) {
      attempts.push({
        model: keys.geminiModel,
        prompt: geminiScaffold.prompt,
        run: () =>
          renderWithGemini(geminiScaffold.prompt, keys.gemini!, keys.geminiModel, deadline),
      });
    }
  };

  if (keys.provider === "gemini") {
    addGemini();
    addFlux();
  } else {
    addFlux();
    addGemini();
  }

  if (attempts.length === 0) {
    console.warn(
      "No image-model key configured — returning a placeholder drawing, not a generated sprite.",
    );
    return {
      png: await generateProceduralPixelArt(prompt),
      fromModel: false,
      model: "procedural-placeholder",
      // The placeholder matches on species keywords in the crafted text, so it
      // gets the unscaffolded prompt — style tokens would only add noise.
      finalPrompt: prompt,
      strippedTerms: fluxScaffold.removed,
    };
  }

  let lastError: unknown;
  for (const [i, attempt] of attempts.entries()) {
    try {
      return {
        png: await attempt.run(),
        fromModel: true,
        model: attempt.model,
        finalPrompt: attempt.prompt,
        strippedTerms: fluxScaffold.removed,
      };
    } catch (err: any) {
      lastError = err;
      const more = i < attempts.length - 1;
      console.warn(
        `Render via ${attempt.model} failed${more ? ", trying the other provider" : ""}: ${err?.message ?? err}`,
      );
      // A spent budget won't recover on the next provider — stop immediately.
      if (String(err?.message ?? "").includes("Ran out of time")) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Procedural Pixel Art Generator for Sprout Monster Sprite
 * Dynamically parses prompt text to render species-specific visual traits, colors, and body structures.
 */
async function generateProceduralPixelArt(prompt: string): Promise<Buffer> {
  const width = SPRITE_SIZE;
  const height = SPRITE_SIZE;
  const channels = 4;
  const buffer = Buffer.alloc(width * height * channels, 0); // start fully transparent

  const promptLower = prompt.toLowerCase();

  /*
   * Asked for by hue, resolved to whatever the active palette has nearest.
   *
   * These were bare indices with the hex written in the comment, and the two
   * had already parted company: index 8 was commented "#FFA93C golden yellow"
   * while Florentine24's entry 8 is #DF426E, a magenta — so the golden stamens
   * drawn below came out pink. That is the same drift the block further down
   * documents, still live in this one because only the lower half was fixed.
   * Naming the colour instead of its position removes the failure mode.
   */
  const cLeafGreen = nearestPaletteHex("#51B341");   // green feet/leaves
  const cLeafLight = nearestPaletteHex("#9BD547");   // bright green
  const cStamenGold = nearestPaletteHex("#FFA93C");  // golden yellow
  const cStamenLight = nearestPaletteHex("#FDF762"); // light yellow
  const cOutline = nearestPaletteHex("#0C082A");     // near-black outline
  const cEyeWhite = nearestPaletteHex("#FFFFFF");    // white
  const cPupil = cOutline;
  const cTongue = nearestPaletteHex("#FF4F4F");      // pink/red

  const hexToRgb = (hex: string) => {
    const num = parseInt(hex.replace("#", ""), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };

  const leafRgb = hexToRgb(cLeafGreen);
  const leafLightRgb = hexToRgb(cLeafLight);
  const stamenRgb = hexToRgb(cStamenGold);
  const stamenLightRgb = hexToRgb(cStamenLight);
  const outlineRgb = hexToRgb(cOutline);
  const whiteRgb = hexToRgb(cEyeWhite);
  const pupilRgb = hexToRgb(cPupil);
  const tongueRgb = hexToRgb(cTongue);

  const drawPixel = (x: number, y: number, rgb: number[], alpha = 255) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (Math.floor(y) * width + Math.floor(x)) * channels;
    buffer[idx] = rgb[0];
    buffer[idx + 1] = rgb[1];
    buffer[idx + 2] = rgb[2];
    buffer[idx + 3] = alpha;
  };

  const drawFilledCircle = (cx: number, cy: number, r: number, fillRgb: number[], outlineRgbVal?: number[]) => {
    for (let y = cy - r - 2; y <= cy + r + 2; y++) {
      for (let x = cx - r - 2; x <= cx + r + 2; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist <= r) {
          drawPixel(x, y, fillRgb);
        } else if (outlineRgbVal && dist <= r + 1.8) {
          drawPixel(x, y, outlineRgbVal);
        }
      }
    }
  };

  const centerX = Math.floor(width / 2);
  const centerY = 100;

  /*
   * Named by hue, resolved against the active palette.
   *
   * These were bare indices carried over from an older palette, so after a
   * palette switch the numbers no longer matched their own comments: melastoma
   * resolved to a near-black purple instead of magenta, and trumpet/sunflower
   * to magenta instead of yellow. Naming the target hue and letting
   * nearestPaletteHex find it means a palette swap re-resolves rather than
   * silently re-points.
   */
  const LIME = nearestPaletteHex("#9BD547");
  const GREEN = nearestPaletteHex("#51B341");
  const TEAL = nearestPaletteHex("#2E8065");
  const TEAL_DEEP = nearestPaletteHex("#175145");
  const YELLOW = nearestPaletteHex("#FFF971");
  const ORANGE = nearestPaletteHex("#FF7F4F");
  const RED = nearestPaletteHex("#FF4F4F");
  const RED_DEEP = nearestPaletteHex("#EE3046");
  const MAGENTA = nearestPaletteHex("#DF426E");
  const MAGENTA_DEEP = nearestPaletteHex("#A62654");
  const BLUE = nearestPaletteHex("#4876BB");
  const CYAN = nearestPaletteHex("#7FD3E6");
  const BRICK = nearestPaletteHex("#9E4D4D");
  const BRICK_DEEP = nearestPaletteHex("#712835");

  /** First keyword match wins, so order from most to least specific. */
  const SPECIES_COLOURS: { match: string[]; primary: string; dark: string }[] = [
    { match: ['melastoma'], primary: MAGENTA, dark: MAGENTA_DEEP },
    { match: ['papilionanthe', 'vanda', 'orchid'], primary: MAGENTA, dark: MAGENTA_DEEP },
    { match: ['fritillaria', 'crown imperial'], primary: ORANGE, dark: RED_DEEP },
    { match: ['albizia', 'mimosa', 'silk tree'], primary: MAGENTA, dark: MAGENTA_DEEP },
    { match: ['sedum', 'stonecrop'], primary: LIME, dark: ORANGE },
    { match: ['ilex', 'holly'], primary: TEAL, dark: TEAL_DEEP },
    { match: ['pennisetum', 'fountain grass'], primary: BRICK, dark: BRICK_DEEP },
    { match: ['hydrangea'], primary: CYAN, dark: BLUE },
    { match: ['trumpet', 'brugmansia', 'bell', 'sunflower'], primary: YELLOW, dark: ORANGE },
    { match: ['milkwort', 'polygala', 'gentian', 'pea', 'clitoria'], primary: CYAN, dark: BLUE },
    { match: ['rose'], primary: RED, dark: RED_DEEP },
  ];

  const species = SPECIES_COLOURS.find((s) => s.match.some((m) => promptLower.includes(m)));
  const primaryColor = species?.primary ?? LIME;
  const darkBodyColor = species?.dark ?? GREEN;

  // Shape flags — these drive which crown/petal geometry gets drawn below,
  // independently of the colour table above.
  const isMelastoma = promptLower.includes('melastoma');
  const isMilkwort =
    promptLower.includes('milkwort') ||
    promptLower.includes('polygala') ||
    promptLower.includes('gentian') ||
    promptLower.includes('pea') ||
    promptLower.includes('clitoria') ||
    promptLower.includes('hydrangea');
  const isTrumpet =
    promptLower.includes('trumpet') ||
    promptLower.includes('brugmansia') ||
    promptLower.includes('bell') ||
    promptLower.includes('fritillaria');
  const isSunflower = promptLower.includes('sunflower');

  const bodyRgb = hexToRgb(primaryColor);
  const darkBodyRgb = hexToRgb(darkBodyColor);

  // 1. Draw Feet
  const drawFoot = (footCx: number, footCy: number) => {
    [-12, 0, 12].forEach((dx) => {
      drawFilledCircle(footCx + dx, footCy, 12, leafRgb, outlineRgb);
      drawFilledCircle(footCx + dx, footCy - 3, 8, leafLightRgb);
    });
  };
  drawFoot(centerX - 35, centerY + 42);
  drawFoot(centerX + 35, centerY + 42);

  // 2. Draw Species-Specific Body & Features
  if (isMelastoma) {
    // --- MELASTOMA SPECIES ---
    // Side Arm Stubs
    [-50, 50].forEach((armCxDir) => {
      drawFilledCircle(centerX + armCxDir, centerY + 4, 16, bodyRgb, outlineRgb);
    });
    // Main Body
    drawFilledCircle(centerX, centerY, 42, bodyRgb, outlineRgb);
    // Crown of 5 Large Magenta Petals
    const petalAngles = [-0.8, -0.4, 0, 0.4, 0.8];
    petalAngles.forEach((angle) => {
      const px = centerX + Math.sin(angle) * 36;
      const py = centerY - 34 - Math.cos(angle) * 18;
      drawFilledCircle(px, py, 20, darkBodyRgb, outlineRgb);
      drawFilledCircle(px, py - 3, 14, bodyRgb);
    });
    // Golden Spiraling Stamens
    const drawCurlicue = (sx: number, sy: number, dir: number) => {
      for (let i = 0; i < 22; i++) {
        const curX = sx + dir * Math.sin(i * 0.3) * 12 + i * dir * 0.8;
        const curY = sy - i * 1.2 - Math.cos(i * 0.4) * 6;
        drawFilledCircle(curX, curY, 3, stamenRgb, outlineRgb);
        drawPixel(curX, curY, stamenLightRgb);
      }
    };
    drawCurlicue(centerX - 10, centerY - 58, -1);
    drawCurlicue(centerX + 10, centerY - 58, 1);
  } else if (isMilkwort) {
    // --- CHALK MILKWORT SPECIES ---
    // Royal Blue Crested Fringe Head & Body
    drawFilledCircle(centerX, centerY, 40, bodyRgb, outlineRgb);
    // Crested fringe blossom head on top
    for (let i = -35; i <= 35; i += 10) {
      drawFilledCircle(centerX + i, centerY - 38, 14, darkBodyRgb, outlineRgb);
      drawFilledCircle(centerX + i, centerY - 42, 8, bodyRgb);
    }
    // Vine tendril arms
    [-46, 46].forEach((dir) => {
      drawFilledCircle(centerX + dir, centerY + 10, 14, darkBodyRgb, outlineRgb);
    });
  } else if (isTrumpet) {
    // --- ANGEL'S TRUMPET SPECIES ---
    // Yellow/Golden Pendant Bell/Trumpet Flower Head
    drawFilledCircle(centerX, centerY + 10, 38, bodyRgb, outlineRgb);
    // Pendant hanging bell trumpet flares over shoulders
    for (let y = centerY - 50; y <= centerY - 10; y++) {
      const progress = (y - (centerY - 50)) / 40;
      const widthAtY = Math.floor(8 + progress * 32);
      for (let x = centerX - widthAtY; x <= centerX + widthAtY; x++) {
        drawPixel(x, y, darkBodyRgb);
      }
    }
  } else if (isSunflower) {
    // --- SUNFLOWER SPECIES ---
    // Dark seed-disk center face
    const seedRgb = hexToRgb('#583313');
    drawFilledCircle(centerX, centerY, 38, seedRgb, outlineRgb);
    // Radiating yellow ray petals
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const px = centerX + Math.cos(angle) * 48;
      const py = centerY + Math.sin(angle) * 48;
      drawFilledCircle(px, py, 12, bodyRgb, outlineRgb);
    }
  } else {
    // --- GENERIC / OTHER PLANT SPECIES ---
    drawFilledCircle(centerX, centerY, 40, bodyRgb, outlineRgb);
    // Top sprout leaves
    drawFilledCircle(centerX - 12, centerY - 44, 14, leafLightRgb, outlineRgb);
    drawFilledCircle(centerX + 12, centerY - 44, 14, leafRgb, outlineRgb);
    [-48, 48].forEach((armCxDir) => {
      drawFilledCircle(centerX + armCxDir, centerY + 8, 12, bodyRgb, outlineRgb);
    });
  }

  // 3. Face: Large Sparkling Anime Eyes
  const eyeOffsetX = 18;
  const eyeOffsetY = -6;
  const eyeR = 10;

  [-eyeOffsetX, eyeOffsetX].forEach((offset) => {
    const ex = centerX + offset;
    const ey = centerY + eyeOffsetY;
    drawFilledCircle(ex, ey, eyeR, pupilRgb, outlineRgb);
    drawFilledCircle(ex + 2, ey - 3, 3.5, whiteRgb);
    drawFilledCircle(ex - 3, ey + 3, 2, whiteRgb);
  });

  // 4. Cute Open Smiling Mouth
  const mouthY = centerY + 12;
  for (let x = centerX - 8; x <= centerX + 8; x++) {
    const mouthCurve = Math.floor((x - centerX) ** 2 / 12);
    const my = mouthY + mouthCurve;
    drawPixel(x, my, outlineRgb);
    drawPixel(x, my + 1, tongueRgb);
  }

  // 5. Cheeks
  [-26, 26].forEach((offset) => {
    drawFilledCircle(centerX + offset, centerY + 8, 4, tongueRgb, outlineRgb);
  });

  return sharp(buffer, { raw: { width, height, channels } }).png().toBuffer();
}
