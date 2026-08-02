/**
 * Trimming prose to fit a card.
 *
 * Plant.id descriptions run to several hundred words — a paragraph about
 * cultivation history is not what a specimen card is for, and pasting one in
 * pushes the stats off the screen. Cutting at a word boundary and marking the
 * cut keeps the card a card, and the full text stays on the record for anywhere
 * that wants it.
 */
const DEFAULT_LIMIT = 240;

export function summarise(
  text: string | null | undefined,
  limit = DEFAULT_LIMIT
): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= limit) return trimmed;

  const cut = trimmed.slice(0, limit);
  // Prefer the last sentence that fits; fall back to the last whole word.
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentenceEnd > limit * 0.5) return cut.slice(0, sentenceEnd + 1);

  const wordEnd = cut.lastIndexOf(' ');
  return `${(wordEnd > 0 ? cut.slice(0, wordEnd) : cut).replace(/[,;:]$/, '')}…`;
}
