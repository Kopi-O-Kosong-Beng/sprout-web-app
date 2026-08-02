/**
 * How a plant entered the archive, and what that means for how long it stays.
 *
 *   'mobile' — an IRL scan. The player pointed a camera at a real plant, so the
 *              record is a genuine discovery and is kept.
 *   'web'    — a web upload. A file picked off disk could be anyone's photo of
 *              anything, so it is a trial run: playable, battleable, and gone
 *              after 24 hours. This is requirements.md 6.12's TempAvatar.
 *
 * The two used to be independent — `source` said where a record came from and
 * `isTemporary` said whether it expired, with nothing keeping them in step, so
 * a permanent web upload or an expiring camera scan were both representable and
 * neither meant anything. Retention is derived from the source here instead, so
 * the label the archive shows and the lifetime the record actually has can only
 * ever agree.
 */

export type CaptureSource = 'mobile' | 'web';

export const CAPTURE_SOURCES: readonly CaptureSource[] = ['mobile', 'web'];

/** Req 6.12: a web upload lives for 24 hours. */
export const TEMP_AVATAR_TTL_MS = 24 * 60 * 60 * 1000;

export interface Retention {
  isTemporary: boolean;
  expiresAt: string | null;
}

/** The lifetime a record gets, given how it was captured. */
export function retentionForSource(
  source: CaptureSource,
  now: Date = new Date()
): Retention {
  if (source !== 'web') return { isTemporary: false, expiresAt: null };
  return {
    isTemporary: true,
    expiresAt: new Date(now.getTime() + TEMP_AVATAR_TTL_MS).toISOString(),
  };
}
