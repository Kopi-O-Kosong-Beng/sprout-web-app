import { describe, expect, it } from 'vitest';

describe('frontend test environment', () => {
  it('provides a DOM', () => {
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });
});
