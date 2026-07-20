import '../env';
import { randomUUID } from 'crypto';
import { getStorageAdmin } from '../firebase';

interface StorageWriteOptions {
  resumable: boolean;
  contentType: string;
  metadata: { cacheControl: string };
}

export interface StorageProbeFile {
  save(data: Buffer, options: StorageWriteOptions): Promise<unknown>;
  download(): Promise<[Buffer]>;
  delete(options: { ignoreNotFound: true }): Promise<unknown>;
}

export interface StorageProbeDependencies {
  createFile(bucketName: string, objectName: string): StorageProbeFile;
  createId(): string;
}

interface StoragePreflightResult {
  bucket: string;
  writeReadDelete: true;
}

interface MainOptions {
  env?: NodeJS.ProcessEnv;
  dependencies?: StorageProbeDependencies;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
}

const defaultDependencies: StorageProbeDependencies = {
  createFile(bucketName, objectName) {
    return getStorageAdmin().bucket(bucketName).file(objectName);
  },
  createId: randomUUID,
};

function requireBucketName(value: string | undefined): string {
  const bucketName = value?.trim();
  if (!bucketName) {
    throw new Error('Missing required env var: FIREBASE_STORAGE_BUCKET');
  }
  if (/\s|[\u0000-\u001f\u007f]/.test(bucketName)) {
    throw new Error('Invalid FIREBASE_STORAGE_BUCKET');
  }
  return bucketName;
}

export async function runStoragePreflight(
  configuredBucket: string | undefined,
  dependencies: StorageProbeDependencies = defaultDependencies
): Promise<StoragePreflightResult> {
  const bucketName = requireBucketName(configuredBucket);
  const id = dependencies.createId();
  const objectName = `.preflight/sprout-storage-${id}.txt`;
  const payload = Buffer.from(`sprout-storage-preflight:${id}`);
  let file: StorageProbeFile | undefined;
  let phase = 'initialization';
  let probeFailure: Error | undefined;

  try {
    file = dependencies.createFile(bucketName, objectName);
    phase = 'write';
    await file.save(payload, {
      resumable: false,
      contentType: 'text/plain',
      metadata: { cacheControl: 'no-store' },
    });

    phase = 'read';
    const [downloaded] = await file.download();
    if (!downloaded.equals(payload)) {
      probeFailure = new Error('Storage bucket probe read mismatch');
    }
  } catch {
    probeFailure = new Error(`Storage bucket probe failed during ${phase}`);
  } finally {
    if (file) {
      try {
        await file.delete({ ignoreNotFound: true });
      } catch {
        throw new Error('Storage bucket probe cleanup failed');
      }
    }
  }

  if (probeFailure) throw probeFailure;
  return { bucket: bucketName, writeReadDelete: true };
}

export async function main(options: MainOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const dependencies = options.dependencies ?? defaultDependencies;
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;

  try {
    const result = await runStoragePreflight(env.FIREBASE_STORAGE_BUCKET, dependencies);
    stdout(`[storage-check] bucket=${result.bucket} writeReadDelete=${result.writeReadDelete}`);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : 'Storage bucket probe failed';
    stderr(`[storage-check] failed: ${message}`);
    return 1;
  }
}

if (require.main === module) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
