import { describe, expect, it } from 'vitest';
import { classifyApiError, extractApiError } from './apiClient';

/**
 * What may and may not reach a player's screen.
 *
 * The server writes `err.message` into the body for every status under 500, so
 * whatever was thrown becomes candidate UI text. These pin the line between
 * copy a controller wrote on purpose and machine output that happened to end up
 * in the same field.
 */

function axiosFailure(status: number, data: unknown) {
  return Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    response: { status, data },
    config: { method: 'post', url: '/api/thing' },
  });
}

/** No `response` at all — the request never landed. */
function networkFailure() {
  return Object.assign(new Error('Network Error'), { isAxiosError: true });
}

describe('messages that reach the player', () => {
  it('shows a business rule the controller wrote', () => {
    const err = axiosFailure(400, { error: 'You cannot delete your own admin account.' });
    expect(extractApiError(err, 'Delete failed.')).toBe(
      'You cannot delete your own admin account.'
    );
  });

  it('shows a hand-written 409 rather than a generic conflict line', () => {
    const err = axiosFailure(409, { error: 'An account with this email already exists.' });
    expect(extractApiError(err, 'Signup failed.')).toBe(
      'An account with this email already exists.'
    );
  });

  it.each([
    ['"password" length must be at least 8 characters long', 400],
    ['"email" must be a valid email', 400],
    ['"name" is not allowed to be empty', 400],
  ])('replaces raw Joi output %s', (message, status) => {
    const err = axiosFailure(status, { error: message });
    const shown = extractApiError(err, 'Check the form and try again.');

    expect(shown).toBe('Check the form and try again.');
    expect(shown).not.toContain('"');
  });

  it('replaces an exception that leaked into a 4xx body', () => {
    const err = axiosFailure(404, {
      error: 'Error: 5 NOT_FOUND: no entity to update: app: "s~sprout-dev"',
    });
    const shown = extractApiError(err, 'Not found.');

    expect(shown).not.toContain('NOT_FOUND');
    expect(shown).not.toContain('Error:');
  });

  it('replaces a message long enough to be machine output', () => {
    const err = axiosFailure(409, { error: 'x'.repeat(400) });
    expect(extractApiError(err, 'Conflict.')).not.toContain('xxxx');
  });

  it('never shows a non-JSON body, however short', () => {
    // The rate limiter answers with a bare string rather than { error }.
    const err = axiosFailure(429, 'Too many requests, please try again later.');
    const shown = extractApiError(err, 'Slow down.');

    expect(shown).toBe('Too many tries. Wait a few minutes and try again.');
  });

  it('says nothing about the server on a 500', () => {
    const err = axiosFailure(500, { error: 'Internal server error.' });
    const shown = extractApiError(err, 'Failed.');

    expect(shown).toBe('Something went wrong on our end. Try again shortly.');
  });

  it('keeps a client-authored Error, which was already sanitised here', () => {
    expect(extractApiError(new Error('Could not remove that plant.'), 'fallback')).toBe(
      'Could not remove that plant.'
    );
  });
});

describe('classifying a failure', () => {
  it.each([
    [401, 'unauthorised'],
    [403, 'unverified'],
    [404, 'notFound'],
    [409, 'conflict'],
    [429, 'rateLimited'],
    [400, 'invalid'],
    [500, 'server'],
    [503, 'server'],
  ])('maps %i to %s', (status, kind) => {
    expect(classifyApiError(axiosFailure(status, {})).kind).toBe(kind);
  });

  it('calls a request that never landed a server problem while online', () => {
    expect(classifyApiError(networkFailure()).kind).toBe('server');
  });

  it('calls it offline when the browser says so, since that is the one the player can fix', () => {
    const online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    expect(classifyApiError(networkFailure()).kind).toBe('offline');

    if (online) Object.defineProperty(navigator, 'onLine', online);
  });
});
