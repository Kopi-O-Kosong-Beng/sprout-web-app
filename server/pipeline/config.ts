// Config block - Single source of truth for Sprout AI Pipeline tunables

export const PROMPT_FALLBACK_TIMEOUT_MS = 15_000;

/*
 * Model IDs used to live here and had all drifted from what the code called:
 * GEMMA_MODEL named Gemma but pointed at Llama, NANO_BANANA named Nano Banana
 * but pointed at Imagen, and GEMINI_VLM pointed at gemini-2.0-flash, which is
 * retired and 404s. They now live in platform/env.ts, overridable per deployment
 * so a retired model is a config change rather than a code change.
 */

export const SPRITE_SIZE = 192;

// Florentine24 by Haboo (Lospec: /palette-list/florentine24). 24 colours.
export const SPROUT_PALETTE: string[] = [
  "#175145", "#2E8065", "#51B341", "#9BD547", "#FFF971", "#FF7F4F",
  "#FF4F4F", "#EE3046", "#DF426E", "#A62654", "#621B52", "#371848",
  "#0C082A", "#261152", "#272573", "#4876BB", "#7FD3E6", "#C7F7F2",
  "#FFFFFF", "#D29C8A", "#9E4D4D", "#712835", "#5D1835", "#35082A",
];

export const REMOVEBG_SIZE = "preview";
export const AUTO_APPROVE_JUDGE_MIN = 4;

export interface EvalScores {
  paletteValid: boolean;
  hasAlpha: boolean;
  notBlank: boolean;
  dimsOk: boolean;
  judgeCute?: number;
  judgeResemblance?: number;
  judgeEdges?: number;
  judgeStyle?: number;
}

export type PipelineTier = "gemma" | "gemini" | "nameOnly" | "photoCrop";
