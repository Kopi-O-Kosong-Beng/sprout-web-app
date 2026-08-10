import {
  createFirebaseSpriteStorage,
  type SpriteStorageDependencies,
  type SpriteStorageFile,
} from '../services/sprite-storage';

const PNG = Buffer.from('fake-png-bytes');
const TOKEN = '11111111-2222-3333-4444-555555555555';

interface SaveOptions {
  metadata?: { metadata?: Record<string, string> };
  preconditionOpts?: { ifGenerationMatch?: number };
}

/**
 * Stands in for a GCS File, including the one behaviour the previous fake got
 * wrong: `save()` resolved unconditionally, so a create-only upload appeared to
 * succeed against an object that already existed. Real GCS cannot do that —
 * `ifGenerationMatch: 0` means "only if there is no live generation" and fails
 * with 412 — and the token-less recovery test passed only because of the gap.
 * The fake now rejects the way the service does, and remembers what was
 * written, so a returned token can be checked against the stored object.
 */
function fakeFile(initial: { exists?: boolean; metadata?: Record<string, string> } = {}) {
  const state = {
    exists: initial.exists ?? false,
    metadata: initial.metadata ?? {},
    bytes: null as Buffer | null,
  };

  return {
    state,
    exists: jest.fn(async (): Promise<[boolean]> => [state.exists]),
    getMetadata: jest.fn(
      async (): Promise<[{ metadata?: Record<string, string> }]> => [{ metadata: state.metadata }]
    ),
    save: jest.fn(async (data: Buffer, options: unknown): Promise<unknown> => {
      const { preconditionOpts, metadata } = (options ?? {}) as SaveOptions;
      if (preconditionOpts?.ifGenerationMatch === 0 && state.exists) {
        throw Object.assign(new Error('Precondition Failed'), { code: 412 });
      }
      state.exists = true;
      state.bytes = data;
      state.metadata = metadata?.metadata ?? {};
      return undefined;
    }),
    // Metadata-only update: bytes are untouched, custom metadata keys merge in.
    setMetadata: jest.fn(async (update: { metadata: Record<string, string> }): Promise<unknown> => {
      state.metadata = { ...state.metadata, ...update.metadata };
      return undefined;
    }),
  };
}

/** The token actually stored on the object, as a reader would find it. */
function storedToken(file: ReturnType<typeof fakeFile>): string | undefined {
  return file.state.metadata.firebaseStorageDownloadTokens;
}

function deps(file: ReturnType<typeof fakeFile>): SpriteStorageDependencies {
  // Annotated rather than passed straight through, so the fake drifting from
  // the injected interface is a compile error here.
  const asStorageFile: SpriteStorageFile = file;
  return {
    createFile: jest.fn().mockReturnValue(asStorageFile),
    createToken: () => TOKEN,
    bucketName: () => 'sprout-test.firebasestorage.app',
  };
}

describe('firebase sprite storage', () => {
  it('writes the sprite under a canonical per-species path', async () => {
    const file = fakeFile();
    const dependencies = deps(file);
    await createFirebaseSpriteStorage(dependencies).save('monstera_deliciosa', PNG);

    expect(dependencies.createFile).toHaveBeenCalledWith(
      'sprout-test.firebasestorage.app',
      'sprites/monstera_deliciosa/v1.png'
    );
    expect(file.save).toHaveBeenCalledTimes(1);
    expect(file.save).toHaveBeenCalledWith(
      PNG,
      expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } })
    );
  });

  it('returns a download URL carrying the token, and reports the create', async () => {
    const file = fakeFile();
    const { url, created } = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(url).toContain('sprites%2Ffern%2Fv1.png');
    expect(url).toContain(`token=${TOKEN}`);
    expect(url).toContain('alt=media');
    // The candidate flow branches on this: created means "this render IS v1".
    expect(created).toBe(true);
  });

  it('reuses an existing object instead of re-uploading', async () => {
    const file = fakeFile({
      exists: true,
      metadata: { firebaseStorageDownloadTokens: 'existing-token' },
    });
    const { url, created } = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).not.toHaveBeenCalled();
    expect(url).toContain('token=existing-token');
    // Reuse means the render was NOT stored — the caller queues it as a
    // versioned candidate instead.
    expect(created).toBe(false);
  });

  it('rejects an empty species key rather than writing to a junk path', async () => {
    const file = fakeFile();
    await expect(
      createFirebaseSpriteStorage(deps(file)).save('', PNG)
    ).rejects.toThrow('speciesKey');
    expect(file.save).not.toHaveBeenCalled();
  });

  it('returns the winning token when a concurrent create-only upload loses the race', async () => {
    const winnerToken = 'winner-token-from-the-other-request';
    // exists() answered false, then the other writer landed: the create-only
    // save is what discovers the race.
    const file = fakeFile();
    file.save.mockImplementationOnce(async () => {
      file.state.exists = true;
      file.state.metadata = { firebaseStorageDownloadTokens: winnerToken };
      throw Object.assign(new Error('Precondition Failed'), { code: 412 });
    });
    const { url } = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).toHaveBeenCalledTimes(1);
    expect(url).toContain(`token=${winnerToken}`);
    expect(url).not.toContain(`token=${TOKEN}`);
  });

  it('propagates a non-412 failure from save() instead of swallowing it', async () => {
    const authFailure = Object.assign(new Error('permission denied'), { code: 403 });
    const file = fakeFile();
    file.save.mockRejectedValue(authFailure);

    await expect(
      createFirebaseSpriteStorage(deps(file)).save('fern', PNG)
    ).rejects.toThrow('permission denied');
    expect(file.getMetadata).not.toHaveBeenCalled();
  });
});

/**
 * The recovery path for an object that exists but carries no download token.
 * Such an object cannot be served over the Firebase download URL at all, so
 * returning its URL is a dead link. The repair stamps a token onto the object
 * via a metadata-only update — it must NOT re-upload the current render, which
 * would silently replace the canonical sprite's content — and it reports
 * repaired:true so the caller can overwrite the dex's dead url.
 */
describe('firebase sprite storage token-less recovery', () => {
  it('stamps a token onto the object without rewriting its bytes', async () => {
    const file = fakeFile({ exists: true, metadata: {} });
    const { url, repaired } = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    // The bytes are left as they were — the current render must not overwrite
    // the canonical sprite. A metadata-only setMetadata does the stamping.
    expect(file.save).not.toHaveBeenCalled();
    expect(file.setMetadata).toHaveBeenCalledTimes(1);
    expect(file.state.bytes).toBeNull();
    expect(storedToken(file)).toBe(TOKEN);
    expect(url).toContain(`token=${TOKEN}`);
    expect(repaired).toBe(true);
  });

  it('repairs a token-less object that won the create race, preserving its bytes', async () => {
    const winnerBytes = Buffer.from('winner-render');
    const file = fakeFile();
    // The other writer created the object first, with content but no token.
    file.save.mockImplementationOnce(async () => {
      file.state.exists = true;
      file.state.bytes = winnerBytes;
      file.state.metadata = {};
      throw Object.assign(new Error('Precondition Failed'), { code: 412 });
    });
    const { url, repaired } = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    // Only the losing create-only save() ran; the repair is metadata-only, so
    // the winner's bytes survive rather than being clobbered by our PNG.
    expect(file.save).toHaveBeenCalledTimes(1);
    expect(file.setMetadata).toHaveBeenCalledTimes(1);
    expect(file.state.bytes).toBe(winnerBytes);
    expect(storedToken(file)).toBe(TOKEN);
    expect(url).toContain(`token=${TOKEN}`);
    expect(repaired).toBe(true);
  });

  it('leaves the object servable — the returned token is the stored one', async () => {
    const file = fakeFile({ exists: true, metadata: { cacheControl: 'public' } });
    const { url } = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    const [metadata] = await file.getMetadata();
    const token = metadata.metadata?.firebaseStorageDownloadTokens;
    expect(token).toBeTruthy();
    expect(url).toContain(`token=${token}`);
    // cacheControl (a sibling metadata field) is preserved by the merge.
    expect(file.state.metadata.cacheControl).toBe('public');
  });
});

describe('download URL host', () => {
  // A URL must resolve where the bytes actually went: the service follows the
  // same FIREBASE_STORAGE_EMULATOR_HOST signal firebase-admin honors for the
  // write itself. Before this branched, emulator-backed stacks (dev, e2e)
  // persisted production URLs for objects that only exist in the emulator.
  const ENV_KEY = 'FIREBASE_STORAGE_EMULATOR_HOST';
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('points at production when no Storage emulator is configured', async () => {
    delete process.env[ENV_KEY];
    const { url } = await createFirebaseSpriteStorage(deps(fakeFile())).save('fern', PNG);
    expect(url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\//);
  });

  it('points at the emulator when this process stores sprites there', async () => {
    process.env[ENV_KEY] = '127.0.0.1:9199';
    const { url } = await createFirebaseSpriteStorage(deps(fakeFile())).save('fern', PNG);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:9199\/v0\/b\//);
    expect(url).toContain('sprites%2Ffern%2Fv1.png');
  });

  it('keeps an explicit scheme on the emulator host', async () => {
    process.env[ENV_KEY] = 'http://localhost:9199';
    const { url } = await createFirebaseSpriteStorage(deps(fakeFile())).save('fern', PNG);
    expect(url).toMatch(/^http:\/\/localhost:9199\/v0\/b\//);
  });
});
