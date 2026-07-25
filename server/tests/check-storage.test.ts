import {
  main,
  runStoragePreflight,
  type StorageProbeDependencies,
  type StorageProbeFile,
} from '../scripts/check-storage';

function makeFile(): jest.Mocked<StorageProbeFile> {
  return {
    save: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue([Buffer.from('sprout-storage-preflight:fixed-id')]),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDependencies(file: StorageProbeFile): StorageProbeDependencies {
  return {
    createFile: jest.fn(() => file),
    createId: jest.fn(() => 'fixed-id'),
  };
}

describe('storage preflight', () => {
  it('fails safely when FIREBASE_STORAGE_BUCKET is missing', async () => {
    const file = makeFile();
    const dependencies = makeDependencies(file);
    const stdout = jest.fn();
    const stderr = jest.fn();

    await expect(main({ env: {}, dependencies, stdout, stderr })).resolves.toBe(1);

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      '[storage-check] failed: Missing required env var: FIREBASE_STORAGE_BUCKET'
    );
    expect(dependencies.createFile).not.toHaveBeenCalled();
  });

  it('writes, reads, deletes, and emits stable success output', async () => {
    const file = makeFile();
    let written = Buffer.alloc(0);
    file.save.mockImplementation(async (data) => {
      written = Buffer.from(data);
    });
    file.download.mockImplementation(async () => [Buffer.from(written)]);
    const dependencies = makeDependencies(file);
    const stdout = jest.fn();
    const stderr = jest.fn();

    await expect(main({
      env: { FIREBASE_STORAGE_BUCKET: 'sprout-dev-66f08.appspot.com' },
      dependencies,
      stdout,
      stderr,
    })).resolves.toBe(0);

    expect(dependencies.createFile).toHaveBeenCalledWith(
      'sprout-dev-66f08.appspot.com',
      '.preflight/sprout-storage-fixed-id.txt'
    );
    expect(file.save).toHaveBeenCalledWith(
      Buffer.from('sprout-storage-preflight:fixed-id'),
      expect.objectContaining({ resumable: false, contentType: 'text/plain' })
    );
    expect(file.download).toHaveBeenCalledTimes(1);
    expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    expect(file.save.mock.invocationCallOrder[0]).toBeLessThan(
      file.download.mock.invocationCallOrder[0]
    );
    expect(file.download.mock.invocationCallOrder[0]).toBeLessThan(
      file.delete.mock.invocationCallOrder[0]
    );
    expect(stdout).toHaveBeenCalledWith(
      '[storage-check] bucket=sprout-dev-66f08.appspot.com writeReadDelete=true'
    );
    expect(stderr).not.toHaveBeenCalled();
  });

  it('fails on a read mismatch and still deletes the probe object', async () => {
    const file = makeFile();
    file.download.mockResolvedValue([Buffer.from('unexpected content')]);

    await expect(runStoragePreflight(
      'sprout-dev-66f08.appspot.com',
      makeDependencies(file)
    )).rejects.toThrow('Storage bucket probe read mismatch');

    expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('sanitizes operation failures and still attempts cleanup', async () => {
    const file = makeFile();
    file.save.mockRejectedValue(new Error('private_key=do-not-print'));

    await expect(runStoragePreflight(
      'sprout-dev-66f08.appspot.com',
      makeDependencies(file)
    )).rejects.toThrow('Storage bucket probe failed during write');

    expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('reports cleanup failure safely and returns nonzero', async () => {
    const file = makeFile();
    let written = Buffer.alloc(0);
    file.save.mockImplementation(async (data) => {
      written = Buffer.from(data);
    });
    file.download.mockImplementation(async () => [Buffer.from(written)]);
    file.delete.mockRejectedValue(new Error('access_token=do-not-print'));
    const stderr = jest.fn();

    await expect(main({
      env: { FIREBASE_STORAGE_BUCKET: 'sprout-dev-66f08.appspot.com' },
      dependencies: makeDependencies(file),
      stdout: jest.fn(),
      stderr,
    })).resolves.toBe(1);

    expect(stderr).toHaveBeenCalledWith(
      '[storage-check] failed: Storage bucket probe cleanup failed'
    );
    expect(stderr.mock.calls.flat().join('\n')).not.toContain('access_token');
  });
});
