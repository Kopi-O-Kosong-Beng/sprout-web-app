import {
  createFirebaseSpriteStorage,
  type SpriteStorageDependencies,
  type SpriteStorageFile,
} from '../services/sprite-storage';

const PNG = Buffer.from('fake-png-bytes');
const TOKEN = '11111111-2222-3333-4444-555555555555';

function fakeFile(overrides: Partial<SpriteStorageFile> = {}) {
  return {
    exists: jest.fn().mockResolvedValue([false]),
    save: jest.fn().mockResolvedValue(undefined),
    getMetadata: jest.fn().mockResolvedValue([{ metadata: {} }]),
    ...overrides,
  };
}

function deps(file: ReturnType<typeof fakeFile>): SpriteStorageDependencies {
  return {
    createFile: jest.fn().mockReturnValue(file),
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
      exists: jest.fn().mockResolvedValue([true]),
      getMetadata: jest
        .fn()
        .mockResolvedValue([{ metadata: { firebaseStorageDownloadTokens: 'existing-token' } }]),
    });
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).not.toHaveBeenCalled();
    expect(url).toContain('token=existing-token');
  });

  it('re-uploads when the existing object has lost its token', async () => {
    const file = fakeFile({
      exists: jest.fn().mockResolvedValue([true]),
      getMetadata: jest.fn().mockResolvedValue([{ metadata: {} }]),
    });
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).toHaveBeenCalledTimes(1);
    expect(url).toContain(`token=${TOKEN}`);
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
    const preconditionFailed = Object.assign(new Error('Precondition Failed'), { code: 412 });
    const file = fakeFile({
      save: jest.fn().mockRejectedValue(preconditionFailed),
      getMetadata: jest
        .fn()
        .mockResolvedValue([{ metadata: { firebaseStorageDownloadTokens: winnerToken } }]),
    });
    const url = await createFirebaseSpriteStorage(deps(file)).save('fern', PNG);

    expect(file.save).toHaveBeenCalledTimes(1);
    expect(url).toContain(`token=${winnerToken}`);
    expect(url).not.toContain(`token=${TOKEN}`);
  });

  it('propagates a non-412 failure from save() instead of swallowing it', async () => {
    const authFailure = Object.assign(new Error('permission denied'), { code: 403 });
    const file = fakeFile({
      save: jest.fn().mockRejectedValue(authFailure),
    });

    await expect(
      createFirebaseSpriteStorage(deps(file)).save('fern', PNG)
    ).rejects.toThrow('permission denied');
    expect(file.getMetadata).not.toHaveBeenCalled();
  });
});
