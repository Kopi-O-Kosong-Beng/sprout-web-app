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
}

export interface SpriteStorageDependencies {
  createFile(bucketName: string, objectName: string): SpriteStorageFile;
  createToken(): string;
  bucketName(): string;
}

export interface SpriteStorage {
  /** Saves the PNG for a species and returns a durable download URL. */
  save(speciesKey: string, png: Buffer): Promise<string>;
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

function objectNameFor(speciesKey: string): string {
  return `sprites/${speciesKey}/${SPRITE_VERSION}.png`;
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

      /** Stamps our own token onto an object that already exists but has none.
       *  Unconditional by necessity — see writeSprite. The returned URL then
       *  carries a token that is genuinely on the object, not one we invented
       *  and never wrote. */
      const rewriteTokenlessObject = async (): Promise<string> => {
        const token = dependencies.createToken();
        await writeSprite(file, png, token, false);
        return downloadUrl(bucketName, objectName, token);
      };

      const [exists] = await file.exists();
      if (exists) {
        const [metadata] = await file.getMetadata();
        const existingToken = metadata.metadata?.firebaseStorageDownloadTokens;
        if (existingToken) return downloadUrl(bucketName, objectName, existingToken);
        // A token-less object cannot be served over the download URL. Rewrite
        // it rather than handing back a dead link.
        return rewriteTokenlessObject();
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
          if (winningToken) return downloadUrl(bucketName, objectName, winningToken);
          // The winner stored an object with no token — dead for every caller,
          // not just this one. Same repair as above.
          return rewriteTokenlessObject();
        }
        throw err;
      }
      return downloadUrl(bucketName, objectName, token);
    },
  };
}

export default createFirebaseSpriteStorage;
