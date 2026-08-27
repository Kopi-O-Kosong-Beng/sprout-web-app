import { Deadline, IDENTIFY_TIMEOUT_MS } from "../deadline";
import { pickMockSpecies } from "./mockSpecies";
export interface IdentificationResult {
  name: string;
  probability: number;
  common_names: string[];
  taxonomy: Record<string, string>;
  description?: string;
  best_light_condition?: string;
  best_soil_type?: string;
  common_uses?: string;
  cultural_significance?: string;
  toxicity?: string;
  best_watering?: string;
}

export interface IdentificationError {
  error: string;
  needsName?: boolean;
}

/**
 * True when identifyPlant will take its mock path for this key.
 *
 * Exported so callers can tell a *real* identification from the hardcoded
 * stand-in below without inspecting the species name it returns. Callers need
 * that distinction: the mock answers "Polygala calcarea" for every photo, so
 * treating it as a genuine species would make two different users' plants share
 * one canonical dex record and one canonical sprite. Deriving it from the same
 * condition identifyPlant itself branches on keeps the two from drifting.
 */
export function isMockIdentification(apiKey: string | null | undefined): boolean {
  return !apiKey || apiKey === "MOCK_KEY";
}

/**
 * Step 3 / §2: identifyPlant
 * Plant.id v3 identification + flattening + is-plant check.
 */
export async function identifyPlant(
  photoBase64: string,
  apiKey: string,
  deadline?: Deadline
): Promise<IdentificationResult | IdentificationError> {
  if (isMockIdentification(apiKey)) {
    // Varied mock, opt-in. One fixed answer is right for a test suite and wrong
    // for a demo: every scan lands on the same canonical dex record, so someone
    // photographing five plants finishes with one creature and four silent
    // rescans of it. MOCK_IDENTIFY_MODE=varied spreads scans across a pool
    // instead, still deterministically — the same photograph always yields the
    // same species — so nothing that asserts on this becomes flaky.
    if (process.env.MOCK_IDENTIFY_MODE === "varied") {
      const species = pickMockSpecies(photoBase64);
      return {
        name: species.name,
        probability: 0.92,
        common_names: species.commonNames,
        taxonomy: {
          kingdom: "Plantae",
          order: species.order,
          family: species.family,
          genus: species.genus,
        },
        description: species.description,
        best_light_condition: species.light,
        best_soil_type: species.soil,
        best_watering: species.watering,
      };
    }

    // Graceful mock mode if API key is mock or missing during dry runs
    return {
      name: "Polygala calcarea",
      probability: 0.92,
      common_names: ["chalk milkwort", "milkwort"],
      // Keys must stay lowercase — this must match the Plant.id v3 response shape
      // (details.taxonomy comes back as { kingdom, order, family, genus, ... }),
      // since every downstream reader (e.g. pipeline.routes.ts's
      // identification.taxonomy?.family) reads lowercase keys.
      taxonomy: { kingdom: "Plantae", order: "Fabales", family: "Polygalaceae", genus: "Polygala" },
      description: "A small perennial plant with vibrant blue flowers.",
      best_light_condition: "Full sun",
      best_soil_type: "Chalky / Alkaline",
      best_watering: "Moderate",
    };
  }

  const cleanB64 = photoBase64.replace(/^data:image\/\w+;base64,/, "");

  try {
    const url = "https://api.plant.id/v3/identification?details=common_names,url,description,taxonomy,rank,gbif_id,inaturalist_id,image,synonyms,edible_parts,watering,best_light_condition,best_soil_type,common_uses,cultural_significance,toxicity,best_watering&language=en";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
      },
      body: JSON.stringify({
        images: [cleanB64],
      }),
      signal: deadline?.signal(IDENTIFY_TIMEOUT_MS, "plant identification"),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: `Plant.id API HTTP ${response.status}: ${errText}` };
    }

    const data = (await response.json()) as any;
    const result = data.result;

    if (!result) {
      return { error: "Invalid response from Plant.id API" };
    }

    // Check if it's a plant
    const isPlant = result.is_plant?.binary === true || (result.is_plant?.probability ?? 0) >= 0.5;
    if (!isPlant) {
      return { error: "Not identified as a plant.", needsName: true };
    }

    const suggestions = result.classification?.suggestions;
    if (!suggestions || suggestions.length === 0) {
      return { error: "No classification suggestions found.", needsName: true };
    }

    const top = suggestions[0];
    const details = top.details || {};

    return {
      name: top.name || "Unknown Plant",
      probability: top.probability || 0,
      common_names: details.common_names || [],
      taxonomy: details.taxonomy || {},
      description: details.description?.value || details.description || "",
      best_light_condition: details.best_light_condition || "",
      best_soil_type: details.best_soil_type || "",
      common_uses: details.common_uses || "",
      cultural_significance: details.cultural_significance || "",
      toxicity: details.toxicity || "",
      best_watering: details.best_watering || details.watering || "",
    };
  } catch (err: any) {
    return { error: `Plant.id request failed: ${err.message}` };
  }
}
