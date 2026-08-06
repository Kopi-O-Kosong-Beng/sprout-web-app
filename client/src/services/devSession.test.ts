import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEV_ADMIN_EMAIL,
  endDevSession,
  getDevSession,
  isDevAdminEmail,
  isDevLoginEnabled,
  startDevSession,
} from './devSession';

/**
 * The dev sign-in shortcut, and the guard that keeps it out of production.
 *
 * The guard is `import.meta.env.DEV`, which Vite replaces with a literal at
 * build time. Under vitest that literal is `true`, so the enabled-path tests
 * run for real; the production behaviour is asserted by stubbing DEV to false,
 * which is exactly the substitution `vite build` performs.
 */

/**
 * This project's jsdom (v29) exposes no localStorage — neither as a global nor
 * on window — so anything touching storage is untestable without a stand-in.
 * A Map-backed one is installed here rather than in the shared setup file,
 * which would change the environment for every other suite. The module under
 * test guards its own storage access, so it degrades to "no session" without
 * this; the stub is what lets the round-trip actually be asserted.
 */
beforeAll(() => {
  if (typeof globalThis.localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  endDevSession();
});

describe('dev session, in a dev build', () => {
  it('is enabled under the dev flag', () => {
    expect(isDevLoginEnabled()).toBe(true);
  });

  it('accepts the dev admin address whatever its casing or padding', () => {
    expect(isDevAdminEmail(DEV_ADMIN_EMAIL)).toBe(true);
    expect(isDevAdminEmail('  TEST@Sprout.com  ')).toBe(true);
  });

  it('accepts no other address', () => {
    expect(isDevAdminEmail('someone@example.com')).toBe(false);
    expect(isDevAdminEmail('test@sprout.com.evil.example')).toBe(false);
    expect(isDevAdminEmail('')).toBe(false);
  });

  it('round-trips a session and clears it again', () => {
    expect(getDevSession()).toBeNull();
    const started = startDevSession();
    expect(started).toEqual({ uid: expect.any(String), email: DEV_ADMIN_EMAIL });
    expect(getDevSession()).toEqual(started);
    endDevSession();
    expect(getDevSession()).toBeNull();
  });

  it('ignores a corrupted or half-written session rather than half-trusting it', () => {
    localStorage.setItem('sprout-dev-session', 'not json');
    expect(getDevSession()).toBeNull();
    localStorage.setItem('sprout-dev-session', JSON.stringify({ uid: 'x' }));
    expect(getDevSession()).toBeNull();
  });
});

describe('dev session, in a production build', () => {
  // What `vite build` compiles import.meta.env.DEV down to.
  function asProductionBuild() {
    vi.stubEnv('DEV', false);
  }

  it('is disabled', () => {
    asProductionBuild();
    expect(isDevLoginEnabled()).toBe(false);
  });

  it('refuses the dev admin address, so login falls through to Firebase', () => {
    asProductionBuild();
    expect(isDevAdminEmail(DEV_ADMIN_EMAIL)).toBe(false);
  });

  it('starts no session', () => {
    asProductionBuild();
    expect(startDevSession()).toBeNull();
    expect(localStorage.getItem('sprout-dev-session')).toBeNull();
  });

  it('reads no session even when one is already in localStorage', () => {
    // The case that matters: a browser that used the shortcut against a dev
    // build, then loaded a production build from the same origin. The stored
    // session must not be honoured, or the headers would go out.
    localStorage.setItem(
      'sprout-dev-session',
      JSON.stringify({ uid: 'dev-admin-0001', email: DEV_ADMIN_EMAIL })
    );
    asProductionBuild();
    expect(getDevSession()).toBeNull();
  });
});
