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

  it('returns a download URL carrying the token', async () => {
    const file = fakeFile();
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(url).toContain('sprites%2Ffern%2Fv1.png');
    expect(url).toContain(`token=${TOKEN}`);
    expect(url).toContain('alt=media');
  });

  it('reuses an existing object instead of re-uploading', async () => {
    const file = fakeFile({
      exists: true,
      metadata: { firebaseStorageDownloadTokens: 'existing-token' },
    });
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).not.toHaveBeenCalled();
    expect(url).toContain('token=existing-token');
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
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

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
 * returning its URL is a dead link — and returning a URL built from a token
 * that was never written is a dead link that also looks fine in the archive
 * record. The repair has to actually store the token.
 */
describe('firebase sprite storage token-less recovery', () => {
  it('stores the token it hands back when the object has lost its own', async () => {
    const file = fakeFile({ exists: true, metadata: {} });
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).toHaveBeenCalledTimes(1);
    // The write cannot be create-only: the object already exists, so
    // ifGenerationMatch: 0 could only ever 412.
    expect(file.save).toHaveBeenCalledWith(
      PNG,
      expect.not.objectContaining({ preconditionOpts: expect.anything() })
    );
    expect(storedToken(file)).toBe(TOKEN);
    expect(url).toContain(`token=${storedToken(file)}`);
  });

  it('repairs a token-less object that won the create race', async () => {
    const file = fakeFile();
    // The other writer created the object first, and stored no token.
    file.save.mockImplementationOnce(async () => {
      file.state.exists = true;
      file.state.metadata = {};
      throw Object.assign(new Error('Precondition Failed'), { code: 412 });
    });
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).toHaveBeenCalledTimes(2);
    expect(storedToken(file)).toBe(TOKEN);
    expect(url).toContain(`token=${TOKEN}`);
  });

  it('leaves the object servable — the returned token is the stored one', async () => {
    const file = fakeFile({ exists: true, metadata: { cacheControl: 'public' } });
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    const [metadata] = await file.getMetadata();
    const token = metadata.metadata?.firebaseStorageDownloadTokens;
    expect(token).toBeTruthy();
    expect(url).toContain(`token=${token}`);
    expect(file.state.bytes).toBe(PNG);
  });
});
