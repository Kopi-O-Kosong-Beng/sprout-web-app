import { EvalScores, PipelineTier } from "./config";

export interface DexDoc {
  speciesKey: string;
  canonicalName: string;
  commonNames: string[];
  taxonomy: Record<string, string>;
  spriteUrl: string;
  firstDiscoveredBy: string;
  firstDiscoveredAt: string;
  producedByTier: PipelineTier;
  generationPrompt: string;
  modelVersion: string;
  paletteVersion: string;
  stageLatenciesMs: Record<string, number>;
  removeBgOk: boolean;
  evalScores: EvalScores;
  status: "pending" | "approved";
  discoveryCount: number;
}

/**
 * Sanitizes species name to speciesKey (lowercased, non-alphanumerics -> "_")
 */
export function sanitizeSpeciesKey(speciesName: string): string {
  return speciesName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Helper to construct a Dex doc object
 */
export function createDexDoc(
  speciesName: string,
  commonNames: string[],
  taxonomy: Record<string, string>,
  spriteUrl: string,
  uid: string,
  tier: PipelineTier,
  prompt: string,
  latencies: Record<string, number>,
  removeBgOk: boolean,
  scores: EvalScores,
  status: "pending" | "approved",
  /** Exact render model, so the record matches what produced the sprite. */
  modelVersion: string
): DexDoc {
  return {
    speciesKey: sanitizeSpeciesKey(speciesName),
    canonicalName: speciesName,
    commonNames,
    taxonomy,
    spriteUrl,
    firstDiscoveredBy: uid,
    firstDiscoveredAt: new Date().toISOString(),
    producedByTier: tier,
    generationPrompt: prompt,
    modelVersion,
    paletteVersion: "Florentine24",
    stageLatenciesMs: latencies,
    removeBgOk,
    evalScores: scores,
    status,
    discoveryCount: 1,
  };
}
