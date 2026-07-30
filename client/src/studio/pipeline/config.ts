/**
 * The client's view of the pipeline's tunables.
 *
 * The canonical copy is `server/pipeline/config.ts` — that is the one the
 * pipeline actually quantises against, and the one the pipeline tests assert on.
 * The studio only needs the palette, to draw the swatch strip that shows what
 * the sprites were snapped to, so this is a presentation constant rather than a
 * second source of truth. The same 24 values are also declared as
 * `--color-f24-*` design tokens in index.css.
 */

export const SPRITE_SIZE = 192;

// Florentine24 by Haboo (Lospec: /palette-list/florentine24). 24 colours.
export const SPROUT_PALETTE: string[] = [
  '#175145', '#2E8065', '#51B341', '#9BD547', '#FFF971', '#FF7F4F',
  '#FF4F4F', '#EE3046', '#DF426E', '#A62654', '#621B52', '#371848',
  '#0C082A', '#261152', '#272573', '#4876BB', '#7FD3E6', '#C7F7F2',
  '#FFFFFF', '#D29C8A', '#9E4D4D', '#712835', '#5D1835', '#35082A',
];

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

export type PipelineTier = 'gemma' | 'gemini' | 'nameOnly' | 'photoCrop';
