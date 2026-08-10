/** Canonical sprite storage — spec 2026-08-02 section B.
 *
 *  One object per species, not per user: the second person to scan a fern reuses
 *  the first person's sprite instead of paying to generate and store another.
 *
 *  Dependencies are injected in the same shape as scripts/check-storage.ts, whose
 *  admin write/read/delete path is the one proven against the live bucket on
 *  2026-07-21. Tests substitute a fake and never touch the network.
 */
import { randomUUID } from 'crypto';
import { getStorageAdmin } from '../firebase';

export interface SpriteStorageFile {
  exists(): Promise<[boolean]>;
  save(data: Buffer, options: unknown): Promise<unknown>;
  getMetadata(): Promise<[{ metadata?: Record<string, string> }]>;
  /** Metadata-only update — no bytes rewritten. Used to stamp a download token
   *  onto an object that has none, without replacing its content. */
  setMetadata(metadata: { metadata: Record<string, string> }): Promise<unknown>;
}

export interface SpriteStorageDependencies {
  createFile(bucketName: string, objectName: string): SpriteStorageFile;
  createToken(): string;
  bucketName(): string;
}

export interface SpriteSaveResult {
  url: string;
  /** True when this call created the canonical v1 object. False when v1
   *  already existed (the render was NOT stored — the caller decides whether
   *  to keep it as a versioned candidate via saveVersion). */
  created: boolean;
  /** True when the object existed but had no download token and this call
   *  stamped one on. The returned url is fresh; whatever url the dex already
   *  holds for this species is dead (a different, unwritten token), so the
   *  caller must force this one onto the dex record. */
  repaired: boolean;
}

export interface SpriteStorage {
  /** Saves the canonical (v1) PNG for a species and returns a durable
   *  download URL, reusing the existing object when there is one. */
  save(speciesKey: string, png: Buffer): Promise<SpriteSaveResult>;
  /** Stores a rescan's render as `sprites/<key>/v<version>.png`, create-only.
   *
   *  Returns null when an object already occupies that version — the slot is
   *  taken by a concurrent rescan that got there first, and the caller must
   *  try the next version. Create-only is what makes version allocation safe:
   *  an unconditional write would let a losing rescan clobber the winner's
   *  bytes and token after the winner had already recorded its URL. */
  saveVersion(speciesKey: string, version: number, png: Buffer): Promise<string | null>;
}

const SPRITE_VERSION = 'v1';

export const defaultSpriteStorageDependencies: SpriteStorageDependencies = {
  createFile(bucketName, objectName) {
    return getStorageAdmin().bucket(bucketName).file(objectName) as unknown as SpriteStorageFile;
  },
  createToken: randomUUID,
  bucketName() {
    const name = process.env.FIREBASE_STORAGE_BUCKET?.trim();
    if (!name) throw new Error('Missing required env var: FIREBASE_STORAGE_BUCKET');
    return name;
  },
};

function objectNameFor(speciesKey: string, version = SPRITE_VERSION): string {
  return `sprites/${speciesKey}/${version}.png`;
}

function downloadUrl(bucketName: string, objectName: string, token: string): string {
  const encoded = encodeURIComponent(objectName);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

/** Writes the PNG and stamps `token` onto the object's metadata.
 *
 *  `createOnly` picks the precondition. It must be false whenever the object is
 *  already known to exist: `ifGenerationMatch: 0` means "only if there is no
 *  live generation", so against an existing object it cannot do anything but
 *  fail with 412 — which is precisely how the token-less recovery path below
 *  used to end up returning a token it had never managed to store. */
async function writeSprite(
  file: SpriteStorageFile,
  png: Buffer,
  token: string,
  createOnly: boolean
): Promise<void> {
  await file.save(png, {
    resumable: false,
    contentType: 'image/png',
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token },
    },
    ...(createOnly
      ? // Fail instead of clobbering an object another concurrent request
        // already created for the same species.
        { preconditionOpts: { ifGenerationMatch: 0 } }
      : {}),
  });
}

export function createFirebaseSpriteStorage(
  dependencies: SpriteStorageDependencies = defaultSpriteStorageDependencies
): SpriteStorage {
  return {
    async save(speciesKey, png) {
      if (!speciesKey.trim()) {
        throw new Error('speciesKey is required to store a sprite');
      }
      const bucketName = dependencies.bucketName();
      const objectName = objectNameFor(speciesKey);
      const file = dependencies.createFile(bucketName, objectName);

      /** Makes a token-less object servable by stamping a token onto it —
       *  metadata only, so the object's BYTES are left exactly as they are.
       *  This used to re-upload `png`, which silently replaced the canonical
       *  sprite with the current scan's render (and, in the create-race path,
       *  the winner's render with the loser's). The object keeps its content;
       *  only the download token is added. */
      const stampToken = async (): Promise<string> => {
        const token = dependencies.createToken();
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
        return downloadUrl(bucketName, objectName, token);
      };

      const [exists] = await file.exists();
      if (exists) {
        const [metadata] = await file.getMetadata();
        const existingToken = metadata.metadata?.firebaseStorageDownloadTokens;
        if (existingToken) {
          return { url: downloadUrl(bucketName, objectName, existingToken), created: false, repaired: false };
        }
        // A token-less object cannot be served over the download URL. Stamp a
        // token rather than handing back a dead link — and flag the repair so
        // the dex record's stale (dead-token) url gets replaced with this one.
        return { url: await stampToken(), created: false, repaired: true };
      }

      const token = dependencies.createToken();
      try {
        await writeSprite(file, png, token, true);
      } catch (err) {
        if ((err as { code?: number }).code === 412) {
          // Lost the create race. The other writer's object is now canonical;
          // re-read it and hand back its token so both callers get a live URL.
          const [metadata] = await file.getMetadata();
          const winningToken = metadata.metadata?.firebaseStorageDownloadTokens;
          if (winningToken) {
            return { url: downloadUrl(bucketName, objectName, winningToken), created: false, repaired: false };
          }
          // The winner stored an object with no token — dead for every caller,
          // not just this one. Stamp one on (preserving the winner's bytes).
          return { url: await stampToken(), created: false, repaired: true };
        }
        throw err;
      }
      return { url: downloadUrl(bucketName, objectName, token), created: true, repaired: false };
    },

    async saveVersion(speciesKey, version, png) {
      if (!speciesKey.trim()) {
        throw new Error('speciesKey is required to store a sprite');
      }
      if (!Number.isInteger(version) || version < 2) {
        // v1 is the canonical object and has its own create-race handling in
        // save(); routing it through here would bypass that.
        throw new Error(`Candidate versions start at 2, got ${version}`);
      }
      const bucketName = dependencies.bucketName();
      const objectName = objectNameFor(speciesKey, `v${version}`);
      const file = dependencies.createFile(bucketName, objectName);
      const token = dependencies.createToken();
      try {
        // Create-only: this is the allocation gate. If the object already
        // exists, a concurrent rescan claimed this version first — report the
        // slot as taken so the caller advances to the next one rather than
        // overwriting a live, already-recorded object.
        await writeSprite(file, png, token, true);
      } catch (err) {
        if ((err as { code?: number }).code === 412) return null;
        throw err;
      }
      return downloadUrl(bucketName, objectName, token);
    },
  };
}

export default createFirebaseSpriteStorage;
