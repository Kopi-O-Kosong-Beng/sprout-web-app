import taxonomyData from "../data/taxonomyMoves.json";
import { IdentificationResult } from "./identify";

export interface PlantMove {
  id: string;
  name: string;
  power: number;
  cooldown: number;
  accuracy: number;
  type: string;
}

export interface AssembledPlant {
  name: string;
  maxHealth: number;
  speed: number;
  moves: PlantMove[];
  probability: number;
  common_names: string[];
  taxonomy: Record<string, string>;
  description: string;
  best_light_condition?: string;
  best_soil_type?: string;
  common_uses?: string;
  cultural_significance?: string;
  toxicity?: string;
  best_watering?: string;
  spriteUrl: string;
}

/**
 * Step 7 / §4: assemblePlant
 * Generates maxHealth = 100, speed in 5-20, selects 4 moves based on taxonomy mapping.
 */
export function assemblePlant(
  identification: Partial<IdentificationResult> & { name: string },
  spriteUrl: string
): AssembledPlant {
  const speed = Math.floor(Math.random() * 16) + 5; // random 5-20

  // Select moves based on taxonomy
  let candidateMoves: PlantMove[] = [];
  if (identification.taxonomy) {
    for (const taxonName of Object.values(identification.taxonomy)) {
      if (taxonomyData.taxonomyMap[taxonName as keyof typeof taxonomyData.taxonomyMap]) {
        candidateMoves = taxonomyData.taxonomyMap[taxonName as keyof typeof taxonomyData.taxonomyMap];
        break;
      }
    }
  }

  // Fallback to default moves
  if (!candidateMoves || candidateMoves.length === 0) {
    candidateMoves = taxonomyData.defaultMoves;
  }

  // Pick 4 moves
  const moves = candidateMoves.slice(0, 4);

  return {
    name: identification.name,
    maxHealth: 100,
    speed,
    moves,
    probability: identification.probability || 1.0,
    common_names: identification.common_names || [],
    taxonomy: identification.taxonomy || {},
    description: identification.description || "A Sprout plant creature.",
    best_light_condition: identification.best_light_condition,
    best_soil_type: identification.best_soil_type,
    common_uses: identification.common_uses,
    cultural_significance: identification.cultural_significance,
    toxicity: identification.toxicity,
    best_watering: identification.best_watering,
    spriteUrl,
  };
}
