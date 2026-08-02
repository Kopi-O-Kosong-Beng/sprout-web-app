import { describe, expect, it } from 'vitest';
import { summarise } from './text';

describe('summarise', () => {
  it('leaves short text alone', () => {
    expect(summarise('A climbing aroid.')).toBe('A climbing aroid.');
  });

  it.each([null, undefined, '   '])('returns null for %p', (value) => {
    expect(summarise(value)).toBeNull();
  });

  // Cutting mid-word reads as corruption; cutting at a sentence reads as an
  // excerpt, which is what the card wants.
  it('prefers the last whole sentence that fits', () => {
    const text = 'A large evergreen tree. It flowers twice a year. Long prose follows here.';
    expect(summarise(text, 60)).toBe('A large evergreen tree. It flowers twice a year.');
  });

  // ...but only when the sentence uses most of the budget. A boundary in the
  // first half would throw away more text than the ellipsis costs.
  it('takes a whole word over a sentence that wastes half the budget', () => {
    const text = 'A large evergreen tree. It flowers twice a year. Long prose follows.';
    expect(summarise(text, 45)).toBe('A large evergreen tree. It flowers twice a…');
  });

  it('falls back to a whole word with an ellipsis', () => {
    expect(summarise('supercalifragilistic expialidocious wording', 25)).toBe(
      'supercalifragilistic…'
    );
  });

  it('never exceeds the limit by more than the ellipsis', () => {
    const long = 'word '.repeat(200);
    expect(summarise(long, 100)!.length).toBeLessThanOrEqual(101);
  });
});
