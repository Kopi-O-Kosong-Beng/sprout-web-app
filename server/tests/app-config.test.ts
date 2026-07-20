import { resolveTrustProxy } from '../app';

describe('trust proxy configuration', () => {
  it('trusts exactly one proxy hop in production by default', () => {
    expect(resolveTrustProxy('production', undefined)).toBe(1);
    expect(resolveTrustProxy('test', undefined)).toBe(false);
  });

  it('accepts a bounded positive hop override and rejects unsafe values', () => {
    expect(resolveTrustProxy('production', '2')).toBe(2);
    expect(resolveTrustProxy('production', '0')).toBe(1);
    expect(resolveTrustProxy('production', 'true')).toBe(1);
    expect(resolveTrustProxy('production', '20')).toBe(1);
  });
});
