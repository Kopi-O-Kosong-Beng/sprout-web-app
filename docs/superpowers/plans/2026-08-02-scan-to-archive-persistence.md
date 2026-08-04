# Scan-to-Archive Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a completed web scan persist into the user's archive — authenticated, de-duplicated per species, with a canonical sprite in Firebase Storage and first-discoverer attribution.

**Architecture:** The six pipeline stages already run inside `runStage2cOnward`, the shared tail of both pipeline entry points. Persistence is appended there so neither entry point can bypass it: the finished PNG goes to Firebase Storage under a species key, a `dex` document records who found the species first, and an `avatar_records` row is upserted for the caller. Stats are derived from the species key by a pure hash so the same species always yields the same numbers.

**Tech Stack:** TypeScript, Express, Firebase Admin (Firestore + Storage), Jest (server), Vitest (client and `server/pipeline`), Supertest, Firestore Emulator.

**Spec:** `docs/superpowers/specs/2026-08-02-scan-to-archive-persistence-design.md`

**Branch:** `features/zhifeng/scan-to-archive-persistence` (already created, off `main` at `a38e27b`)

## Global Constraints

- **Never commit to `main`.** All work lands on the feature branch above and merges via PR.
- **Two test runners.** `server/tests/*.test.ts` is **Jest**. `server/pipeline/__tests__/*.test.ts` is **Vitest**. New server tests in this plan are Jest and belong in `server/tests/`.
- **Always invoke Jest as `node node_modules/jest/bin/jest.js` from the `server/` directory.** A bare `jest` resolves to the root-hoisted jest 30 and crashes with `clearMocksOnScope is not a function`. This is a known landmine documented in `.github/workflows/tests.yml:65-71`.
- **Never commit `.env`, `serviceAccountKey.json`, or any credential.**
- **Runtime is Firestore only.** Do not add SQLite or any second datastore.
- Stats derivation must be **pure**: no randomness, no clock, no `crypto`. Reproducibility is a report requirement.
- Display names may be exposed across users. **Email addresses must never be.**
- Existing passing suites must stay green. Do not modify `battle-engine.ts` or `battle-catalog.ts`.

---

### Task 1: Deterministic species stats

**Files:**
- Create: `server/data/species-stats.ts`
- Test: `server/tests/species-stats.test.ts`

**Interfaces:**
- Consumes: `AvatarStats` from `server/models/avatar.ts`; `sanitizeSpeciesKey` from `server/pipeline/dex.ts`
- Produces: `deriveSpeciesStats(speciesKey: string): AvatarStats` — returns four integers inside the documented ranges, identical for the same key on every call and machine.

- [ ] **Step 1: Write the failing test**

Create `server/tests/species-stats.test.ts`:

```typescript
import { deriveSpeciesStats, SPECIES_STAT_RANGES } from '../data/species-stats';
import { sanitizeSpeciesKey } from '../pipeline/dex';

describe('deriveSpeciesStats', () => {
  const KEYS = [
    'monstera_deliciosa',
    'helianthus_annuus',
    'quercus_robur',
    'a',
    'z'.repeat(200),
  ];

  it('returns the same stats for the same key every time', () => {
    for (const key of KEYS) {
      expect(deriveSpeciesStats(key)).toEqual(deriveSpeciesStats(key));
    }
  });

  it('keeps every stat inside its documented range', () => {
    for (const key of KEYS) {
      const stats = deriveSpeciesStats(key);
      for (const [name, range] of Object.entries(SPECIES_STAT_RANGES)) {
        const value = stats[name as keyof typeof stats];
        expect(value).toBeGreaterThanOrEqual(range.min);
        expect(value).toBeLessThanOrEqual(range.max);
      }
    }
  });

  it('returns integers, because the battle engine rejects non-integer hp', () => {
    for (const key of KEYS) {
      const stats = deriveSpeciesStats(key);
      expect(Number.isInteger(stats.hp)).toBe(true);
      expect(Number.isInteger(stats.attack)).toBe(true);
      expect(Number.isInteger(stats.defense)).toBe(true);
      expect(Number.isInteger(stats.speed)).toBe(true);
    }
  });

  it('gives different species different stats', () => {
    const a = deriveSpeciesStats('monstera_deliciosa');
    const b = deriveSpeciesStats('quercus_robur');
    expect(a).not.toEqual(b);
  });

  it('treats casing and punctuation drift as the same species', () => {
    const a = deriveSpeciesStats(sanitizeSpeciesKey('Monstera deliciosa'));
    const b = deriveSpeciesStats(sanitizeSpeciesKey('monstera  Deliciosa!'));
    expect(a).toEqual(b);
  });

  it('pins known values so the report can quote them', () => {
    expect(deriveSpeciesStats('monstera_deliciosa')).toEqual({
      hp: expect.any(Number),
      attack: expect.any(Number),
      defense: expect.any(Number),
      speed: expect.any(Number),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/species-stats.test.ts
```
Expected: FAIL — `Cannot find module '../data/species-stats'`.

- [ ] **Step 3: Write the implementation**

Create `server/data/species-stats.ts`:

```typescript
/** Deterministic per-species battle stats — spec 2026-08-02 section D.
 *
 *  The pipeline supplies only maxHealth (always 100) and a Math.random() speed
 *  of 5-20. That is unusable: the NPC Thornback has speed 46, so the player
 *  would always move second, and a random draw makes test values impossible to
 *  reproduce in the report. Instead every stat is derived from the species key
 *  by a pure hash, so one species always yields one set of numbers — on every
 *  machine, on every run.
 *
 *  Ranges match the seeded demo records so scanned plants are balanced against
 *  Thornback (hp 124, attack 58, defense 55, speed 46).
 */
import type { AvatarStats } from '../models/avatar';

export const SPECIES_STAT_RANGES = {
  hp: { min: 96, max: 168 },
  attack: { min: 41, max: 72 },
  defense: { min: 41, max: 88 },
  speed: { min: 22, max: 68 },
} as const;

/** FNV-1a, 32-bit. Chosen because it is short, stable, and dependency-free —
 *  crypto hashes would work too but pull in a Node built-in for no benefit. */
function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A distinct seed per stat, so hp and attack do not move together. */
const STAT_SEEDS = {
  hp: 0x811c9dc5,
  attack: 0x01000193,
  defense: 0x7fffffff,
  speed: 0x9e3779b9,
} as const;

export function deriveSpeciesStats(speciesKey: string): AvatarStats {
  const stats = {} as AvatarStats;
  for (const name of ['hp', 'attack', 'defense', 'speed'] as const) {
    const { min, max } = SPECIES_STAT_RANGES[name];
    const span = max - min + 1;
    stats[name] = min + (fnv1a(speciesKey, STAT_SEEDS[name]) % span);
  }
  return stats;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/species-stats.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Pin the real values in the test**

Run this to print the actual derived values:
```bash
npx tsx -e "import('./data/species-stats').then(m=>console.log(JSON.stringify(m.deriveSpeciesStats('monstera_deliciosa'))))"
```
Replace the `expect.any(Number)` block in the last test with the exact object printed, so the test pins real numbers the report can quote. Re-run the command from Step 4 and confirm PASS.

- [ ] **Step 6: Commit**

```bash
git add server/data/species-stats.ts server/tests/species-stats.test.ts
git commit -m "feat(avatar): derive deterministic battle stats from the species key"
```

---

### Task 2: Canonical sprite storage

**Files:**
- Create: `server/services/sprite-storage.ts`
- Test: `server/tests/sprite-storage.test.ts`

**Interfaces:**
- Consumes: `getStorageAdmin` from `server/firebase.ts`
- Produces:
  - `interface SpriteStorage { save(speciesKey: string, png: Buffer): Promise<string> }`
  - `createFirebaseSpriteStorage(deps?: SpriteStorageDependencies): SpriteStorage`
  - `interface SpriteStorageDependencies { createFile(bucketName: string, objectName: string): SpriteStorageFile; createToken(): string; bucketName(): string }`
  - `interface SpriteStorageFile { exists(): Promise<[boolean]>; save(data: Buffer, options: unknown): Promise<unknown>; getMetadata(): Promise<[{ metadata?: Record<string, string> }]> }`

- [ ] **Step 1: Write the failing test**

Create `server/tests/sprite-storage.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/sprite-storage.test.ts
```
Expected: FAIL — `Cannot find module '../services/sprite-storage'`.

- [ ] **Step 3: Write the implementation**

Create `server/services/sprite-storage.ts`:

```typescript
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
    return getStorageAdmin().bucket(bucketName).file(objectName) as SpriteStorageFile;
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

      const [exists] = await file.exists();
      if (exists) {
        const [metadata] = await file.getMetadata();
        const existingToken = metadata.metadata?.firebaseStorageDownloadTokens;
        // A token-less object cannot be served over the download URL, so fall
        // through and rewrite it rather than handing back a dead link.
        if (existingToken) return downloadUrl(bucketName, objectName, existingToken);
      }

      const token = dependencies.createToken();
      await file.save(png, {
        resumable: false,
        contentType: 'image/png',
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      return downloadUrl(bucketName, objectName, token);
    },
  };
}

export default createFirebaseSpriteStorage;
```

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/sprite-storage.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/services/sprite-storage.ts server/tests/sprite-storage.test.ts
git commit -m "feat(storage): store one canonical sprite per species in Firebase Storage"
```

---

### Task 3: First-discoverer dex repository

**Files:**
- Create: `server/models/dex.ts`
- Create: `server/repositories/dex.ts`
- Test: `server/tests/dex-repository.test.ts`

**Interfaces:**
- Consumes: `getDb` from `server/firebase.ts`
- Produces:
  - `interface DexDiscovery { speciesKey: string; speciesName: string; firstDiscoveredBy: string; firstDiscoveredAt: string; discoveryCount: number }`
  - `dexRepository.recordDiscovery(speciesKey: string, userId: string, speciesName: string): Promise<DexDiscovery>`
  - `dexRepository.get(speciesKey: string): Promise<DexDiscovery | null>`

- [ ] **Step 1: Write the failing test**

Create `server/tests/dex-repository.test.ts`:

```typescript
import dexRepository from '../repositories/dex';
import { clearFirestore } from './firestore-test-utils';

describe('dex repository', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('records the first discoverer of an unseen species', async () => {
    const result = await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');

    expect(result.firstDiscoveredBy).toBe('user-a');
    expect(result.discoveryCount).toBe(1);
    expect(result.speciesName).toBe('Fern');
    expect(Date.parse(result.firstDiscoveredAt)).not.toBeNaN();
  });

  it('keeps the original discoverer when someone else finds it later', async () => {
    const first = await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const second = await dexRepository.recordDiscovery('fern', 'user-b', 'Fern');

    expect(second.firstDiscoveredBy).toBe('user-a');
    expect(second.firstDiscoveredAt).toBe(first.firstDiscoveredAt);
    expect(second.discoveryCount).toBe(2);
  });

  it('counts every discovery, including repeats by the same user', async () => {
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const third = await dexRepository.recordDiscovery('fern', 'user-c', 'Fern');

    expect(third.discoveryCount).toBe(3);
  });

  it('keeps species independent of one another', async () => {
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const oak = await dexRepository.recordDiscovery('oak', 'user-b', 'Oak');

    expect(oak.firstDiscoveredBy).toBe('user-b');
    expect(oak.discoveryCount).toBe(1);
  });

  it('returns null for a species nobody has scanned', async () => {
    expect(await dexRepository.get('never_seen')).toBeNull();
  });

  it('reads back a recorded discovery', async () => {
    await dexRepository.recordDiscovery('fern', 'user-a', 'Fern');
    const found = await dexRepository.get('fern');

    expect(found).not.toBeNull();
    expect(found!.firstDiscoveredBy).toBe('user-a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/dex-repository.test.ts"
```
Expected: FAIL — `Cannot find module '../repositories/dex'`.

- [ ] **Step 3: Write the model**

Create `server/models/dex.ts`:

```typescript
/** Species dex — one record per species, shared across all users.
 *  Spec 2026-08-02 section E. */

export interface DexDiscovery {
  speciesKey: string;
  speciesName: string;
  /** UID of whoever scanned this species first. Never an email. */
  firstDiscoveredBy: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
}

export interface DexRepository {
  /** Creates the species record, or increments its count if it already exists. */
  recordDiscovery(
    speciesKey: string,
    userId: string,
    speciesName: string
  ): Promise<DexDiscovery>;
  get(speciesKey: string): Promise<DexDiscovery | null>;
}
```

- [ ] **Step 4: Write the repository**

Create `server/repositories/dex.ts`:

```typescript
/** Firestore dex repository — spec 2026-08-02 section E.
 *
 *  The species key is the document id, which makes "has anyone found this
 *  before?" a single point read and keeps the increment inside one transaction.
 */
import { getDb } from '../firebase';
import type { DexDiscovery, DexRepository } from '../models/dex';

const COLLECTION = 'dex';

function toDiscovery(speciesKey: string, data: FirebaseFirestore.DocumentData): DexDiscovery {
  return {
    speciesKey,
    speciesName: String(data.speciesName ?? speciesKey),
    firstDiscoveredBy: String(data.firstDiscoveredBy ?? ''),
    firstDiscoveredAt: String(data.firstDiscoveredAt ?? ''),
    discoveryCount: Number(data.discoveryCount ?? 0),
  };
}

export const firestoreDexRepository: DexRepository = {
  async recordDiscovery(speciesKey, userId, speciesName) {
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(speciesKey);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists) {
        const created: DexDiscovery = {
          speciesKey,
          speciesName,
          firstDiscoveredBy: userId,
          firstDiscoveredAt: new Date().toISOString(),
          discoveryCount: 1,
        };
        transaction.create(ref, created);
        return created;
      }

      const existing = toDiscovery(speciesKey, snapshot.data() ?? {});
      const updated: DexDiscovery = {
        ...existing,
        discoveryCount: existing.discoveryCount + 1,
      };
      // First-discoverer fields are deliberately untouched — being first is the
      // whole point of the feature, so a later scan must never overwrite it.
      transaction.update(ref, { discoveryCount: updated.discoveryCount });
      return updated;
    });
  },

  async get(speciesKey) {
    const snapshot = await getDb().collection(COLLECTION).doc(speciesKey).get();
    if (!snapshot.exists) return null;
    return toDiscovery(speciesKey, snapshot.data() ?? {});
  },
};

export default firestoreDexRepository;
```

- [ ] **Step 5: Run test to verify it passes**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/dex-repository.test.ts"
```
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add server/models/dex.ts server/repositories/dex.ts server/tests/dex-repository.test.ts
git commit -m "feat(dex): record the first discoverer and discovery count per species"
```

---

### Task 4: Archive upsert with per-species de-duplication

**Files:**
- Modify: `server/models/avatar.ts` (add `ScanUpsertInput`, extend `AvatarRepository`)
- Modify: `server/repositories/avatars.ts` (add `upsertFromScan`)
- Test: `server/tests/avatar-upsert.test.ts`

**Interfaces:**
- Consumes: `sanitizeSpeciesKey` from `server/pipeline/dex.ts`; `AvatarStats`, `AvatarRecord` from `server/models/avatar.ts`
- Produces: `avatarRepository.upsertFromScan(userId: string, input: ScanUpsertInput): Promise<{ record: AvatarRecord; created: boolean }>`

- [ ] **Step 1: Write the failing test**

Create `server/tests/avatar-upsert.test.ts`:

```typescript
import avatarRepository from '../repositories/avatars';
import type { ScanUpsertInput } from '../models/avatar';
import { clearFirestore } from './firestore-test-utils';

const USER = 'user-scan-1';

function input(overrides: Partial<ScanUpsertInput> = {}): ScanUpsertInput {
  return {
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    spriteUrl: 'https://example.test/sprites/monstera_deliciosa/v1.png',
    stats: { hp: 120, attack: 55, defense: 60, speed: 40 },
    metadata: null,
    ...overrides,
  };
}

describe('avatar upsertFromScan', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('creates a persistent web record on the first scan', async () => {
    const { record, created } = await avatarRepository.upsertFromScan(USER, input());

    expect(created).toBe(true);
    expect(record.userId).toBe(USER);
    expect(record.speciesName).toBe('Monstera deliciosa');
    expect(record.speciesFamily).toBe('Araceae');
    expect(record.source).toBe('web');
    expect(record.isTemporary).toBe(false);
    expect(record.expiresAt).toBeNull();
    expect(record.stats).toEqual({ hp: 120, attack: 55, defense: 60, speed: 40 });
  });

  it('does not duplicate when the same species is scanned again', async () => {
    const first = await avatarRepository.upsertFromScan(USER, input());
    const second = await avatarRepository.upsertFromScan(USER, input());

    expect(second.created).toBe(false);
    expect(second.record.id).toBe(first.record.id);

    const page = await avatarRepository.listByUser(USER, 1, 20);
    expect(page.total).toBe(1);
  });

  it('treats casing and punctuation drift as the same species', async () => {
    await avatarRepository.upsertFromScan(USER, input());
    const again = await avatarRepository.upsertFromScan(
      USER,
      input({ speciesName: 'monstera  DELICIOSA!' })
    );

    expect(again.created).toBe(false);
    const page = await avatarRepository.listByUser(USER, 1, 20);
    expect(page.total).toBe(1);
  });

  it('keeps the original discoveredAt and stamps lastSeenAt on a repeat', async () => {
    const first = await avatarRepository.upsertFromScan(USER, input());
    const second = await avatarRepository.upsertFromScan(USER, input());

    expect(second.record.discoveredAt).toBe(first.record.discoveredAt);
    const lastSeenAt = (second.record.metadata ?? {}).lastSeenAt;
    expect(typeof lastSeenAt).toBe('string');
    expect(Date.parse(String(lastSeenAt))).not.toBeNaN();
  });

  it('keeps different species as separate records', async () => {
    await avatarRepository.upsertFromScan(USER, input());
    await avatarRepository.upsertFromScan(USER, input({ speciesName: 'Quercus robur' }));

    const page = await avatarRepository.listByUser(USER, 1, 20);
    expect(page.total).toBe(2);
  });

  it('keeps one user’s scan out of another user’s archive', async () => {
    await avatarRepository.upsertFromScan(USER, input());
    await avatarRepository.upsertFromScan('user-scan-2', input());

    expect((await avatarRepository.listByUser(USER, 1, 20)).total).toBe(1);
    expect((await avatarRepository.listByUser('user-scan-2', 1, 20)).total).toBe(1);
  });

  it('creates a record that is immediately battle eligible', async () => {
    const { record } = await avatarRepository.upsertFromScan(USER, input());
    const { isAvatarBattleEligible } = await import('../data/battle-eligibility');

    expect(isAvatarBattleEligible(record, new Date())).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/avatar-upsert.test.ts"
```
Expected: FAIL — `upsertFromScan is not a function`.

- [ ] **Step 3: Extend the model**

In `server/models/avatar.ts`, add after the `PaginatedAvatars` interface:

```typescript
/** What a completed scan contributes to the archive — spec 2026-08-02 section C. */
export interface ScanUpsertInput {
  speciesName: string;
  speciesFamily: string | null;
  spriteUrl: string;
  stats: AvatarStats;
  metadata: Record<string, unknown> | null;
}
```

Then add this method to the `AvatarRepository` interface, after `getOwned`:

```typescript
  /** Creates the caller's record for a species, or returns the existing one.
   *  De-duplicates on the sanitized species name (Req UC4 collection rules). */
  upsertFromScan(
    userId: string,
    input: ScanUpsertInput
  ): Promise<{ record: AvatarRecord; created: boolean }>;
```

- [ ] **Step 4: Implement the repository method**

In `server/repositories/avatars.ts`, add this import at the top with the others:

```typescript
import { sanitizeSpeciesKey } from '../pipeline/dex';
import type { ScanUpsertInput } from '../models/avatar';
```

Then add this method to the `firestoreAvatarRepository` object, before `ensureDemoSet`:

```typescript
  async upsertFromScan(userId: string, input: ScanUpsertInput) {
    const db = getDb();
    const speciesKey = sanitizeSpeciesKey(input.speciesName);
    if (!speciesKey) {
      throw new Error('speciesName must contain at least one alphanumeric character');
    }

    // The repository already filters by userId and works in memory rather than
    // adding a composite index (see the note at the top of this file). Matching
    // the sanitized name here follows that same trade-off, and avoids a schema
    // migration for the seeded demo records, which carry no species key.
    const existingPage = await this.listByUser(userId, 1, 1000);
    const match = existingPage.items.find(
      (candidate) => sanitizeSpeciesKey(candidate.speciesName) === speciesKey
    );

    const now = new Date().toISOString();

    if (match) {
      const metadata = { ...(match.metadata ?? {}), lastSeenAt: now };
      await db.collection('avatar_records').doc(match.id).update({ metadata });
      return { record: { ...match, metadata }, created: false };
    }

    const ref = db.collection('avatar_records').doc();
    const record: AvatarRecord = {
      id: ref.id,
      userId,
      speciesName: input.speciesName,
      speciesFamily: input.speciesFamily,
      spriteUrl: input.spriteUrl,
      discoveredAt: now,
      source: 'web',
      // Spec decision D2: web scans are persistent, so nothing expires
      // mid-showcase and the archive keeps what the user collected.
      isTemporary: false,
      expiresAt: null,
      stats: input.stats,
      metadata: input.metadata,
    };
    const { id, ...document } = record;
    await ref.create(document);
    return { record, created: true };
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/avatar-upsert.test.ts"
```
Expected: PASS, 7 tests.

- [ ] **Step 6: Verify the existing archive suites still pass**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/avatar-api.test.ts tests/avatar-demo.test.ts"
```
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add server/models/avatar.ts server/repositories/avatars.ts server/tests/avatar-upsert.test.ts
git commit -m "feat(archive): upsert scanned species without duplicating records"
```

---

### Task 5: Authenticate the pipeline routes

**Files:**
- Modify: `server/routes/pipeline.routes.ts`
- Test: `server/tests/pipeline-auth.test.ts`

**Interfaces:**
- Consumes: `authMiddleware` (default export) from `server/middleware/auth.middleware.ts`, which sets `req.user = { uid }`
- Produces: both pipeline routes reject unauthenticated callers before doing any generation work.

- [ ] **Step 1: Write the failing test**

Create `server/tests/pipeline-auth.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';

describe('pipeline route authentication', () => {
  it('rejects an unauthenticated run-stream request', async () => {
    const response = await request(app)
      .post('/api/pipeline/run-stream')
      .send({ imageBase64: 'AAAA' });

    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated run-stage2c request', async () => {
    const response = await request(app)
      .post('/api/pipeline/run-stage2c')
      .send({ rawSpriteB64: 'AAAA' });

    expect(response.status).toBe(401);
  });

  it('rejects a malformed bearer token', async () => {
    const response = await request(app)
      .post('/api/pipeline/run-stream')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ imageBase64: 'AAAA' });

    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/pipeline-auth.test.ts
```
Expected: FAIL — the route responds 200 with a stream instead of 401.

- [ ] **Step 3: Add the guard**

In `server/routes/pipeline.routes.ts`, add the import beside the existing ones:

```typescript
import authMiddleware from '../middleware/auth.middleware';
```

Then, immediately after the `const router = ...` line and **before** the first `router.post`, add:

```typescript
// Spec 2026-08-02 section A. Without this the server cannot attribute a scan to
// a user, and an anonymous caller can spend the Plant.id and Gemini quota.
router.use(authMiddleware);
```

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/pipeline-auth.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/routes/pipeline.routes.ts server/tests/pipeline-auth.test.ts
git commit -m "fix(pipeline): require an authenticated caller on the generation routes"
```

---

### Task 6: Persist the completed scan

**Files:**
- Modify: `server/routes/pipeline.routes.ts` (`runStage2cOnward` and both call sites)
- Create: `server/services/scan-persistence.ts`
- Test: `server/tests/scan-persistence.test.ts`

**Interfaces:**
- Consumes: `deriveSpeciesStats` (Task 1), `createFirebaseSpriteStorage` (Task 2), `dexRepository` (Task 3), `avatarRepository.upsertFromScan` (Task 4), `sanitizeSpeciesKey`
- Produces: `persistScan(deps, userId, speciesName, speciesFamily, png): Promise<ScanPersistResult>` where
  `interface ScanPersistResult { saved: boolean; avatarId: string | null; created: boolean; saveError?: string; discovery: DexDiscovery | null }`

- [ ] **Step 1: Write the failing test**

Create `server/tests/scan-persistence.test.ts`:

```typescript
import { persistScan, type ScanPersistenceDependencies } from '../services/scan-persistence';
import type { AvatarRecord } from '../models/avatar';

const PNG = Buffer.from('png');

const RECORD = { id: 'avatar-1' } as AvatarRecord;

function deps(overrides: Partial<ScanPersistenceDependencies> = {}): ScanPersistenceDependencies {
  return {
    storage: { save: jest.fn().mockResolvedValue('https://cdn.test/fern.png') },
    dex: {
      recordDiscovery: jest.fn().mockResolvedValue({
        speciesKey: 'fern',
        speciesName: 'Fern',
        firstDiscoveredBy: 'user-a',
        firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
        discoveryCount: 1,
      }),
      get: jest.fn(),
    },
    avatars: { upsertFromScan: jest.fn().mockResolvedValue({ record: RECORD, created: true }) },
    ...overrides,
  };
}

describe('persistScan', () => {
  it('stores the sprite, records the discovery, and writes the archive row', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-a', 'Fern', 'Polypodiaceae', PNG);

    expect(dependencies.storage.save).toHaveBeenCalledWith('fern', PNG);
    expect(dependencies.dex.recordDiscovery).toHaveBeenCalledWith('fern', 'user-a', 'Fern');
    expect(result.saved).toBe(true);
    expect(result.avatarId).toBe('avatar-1');
    expect(result.discovery?.firstDiscoveredBy).toBe('user-a');
  });

  it('passes the stored sprite URL through to the archive record', async () => {
    const dependencies = deps();
    await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(dependencies.avatars.upsertFromScan).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ spriteUrl: 'https://cdn.test/fern.png' })
    );
  });

  it('reports a storage failure without throwing', async () => {
    const dependencies = deps({
      storage: { save: jest.fn().mockRejectedValue(new Error('bucket unreachable')) },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(false);
    expect(result.avatarId).toBeNull();
    expect(result.saveError).toContain('bucket unreachable');
  });

  it('reports a Firestore failure without throwing', async () => {
    const dependencies = deps({
      avatars: { upsertFromScan: jest.fn().mockRejectedValue(new Error('firestore down')) },
    });
    const result = await persistScan(dependencies, 'user-a', 'Fern', null, PNG);

    expect(result.saved).toBe(false);
    expect(result.saveError).toContain('firestore down');
  });

  it('refuses a species name with no usable characters', async () => {
    const dependencies = deps();
    const result = await persistScan(dependencies, 'user-a', '!!!', null, PNG);

    expect(result.saved).toBe(false);
    expect(dependencies.storage.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/scan-persistence.test.ts
```
Expected: FAIL — `Cannot find module '../services/scan-persistence'`.

- [ ] **Step 3: Write the service**

Create `server/services/scan-persistence.ts`:

```typescript
/** Scan persistence — spec 2026-08-02 sections C, E and F.
 *
 *  Kept out of the route so the ordering (store sprite, record discovery, write
 *  the archive row) is testable without an HTTP stream, and so a failure here
 *  can be reported to the user rather than crashing the generation run.
 */
import { sanitizeSpeciesKey } from '../pipeline/dex';
import { deriveSpeciesStats } from '../data/species-stats';
import type { AvatarRepository } from '../models/avatar';
import type { DexDiscovery, DexRepository } from '../models/dex';
import type { SpriteStorage } from './sprite-storage';

export interface ScanPersistenceDependencies {
  storage: SpriteStorage;
  dex: DexRepository;
  avatars: Pick<AvatarRepository, 'upsertFromScan'>;
}

export interface ScanPersistResult {
  saved: boolean;
  avatarId: string | null;
  created: boolean;
  saveError?: string;
  discovery: DexDiscovery | null;
}

export async function persistScan(
  dependencies: ScanPersistenceDependencies,
  userId: string,
  speciesName: string,
  speciesFamily: string | null,
  png: Buffer
): Promise<ScanPersistResult> {
  const failure = (saveError: string): ScanPersistResult => ({
    saved: false,
    avatarId: null,
    created: false,
    saveError,
    discovery: null,
  });

  const speciesKey = sanitizeSpeciesKey(speciesName);
  if (!speciesKey) {
    return failure('Identified species name has no usable characters');
  }

  try {
    const spriteUrl = await dependencies.storage.save(speciesKey, png);
    const discovery = await dependencies.dex.recordDiscovery(speciesKey, userId, speciesName);
    const { record, created } = await dependencies.avatars.upsertFromScan(userId, {
      speciesName,
      speciesFamily,
      spriteUrl,
      stats: deriveSpeciesStats(speciesKey),
      metadata: null,
    });

    return { saved: true, avatarId: record.id, created, discovery };
  } catch (error) {
    // Deliberately swallowed: the sprite was generated successfully and the user
    // should still see it. Section F — a save fault must not look like a
    // pipeline crash.
    const message = error instanceof Error ? error.message : String(error);
    console.error('Scan persistence failed:', message);
    return failure(message);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:
```bash
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/scan-persistence.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into the route**

In `server/routes/pipeline.routes.ts`, add these imports:

```typescript
import { persistScan } from '../services/scan-persistence';
import createFirebaseSpriteStorage from '../services/sprite-storage';
import dexRepository from '../repositories/dex';
import avatarRepository from '../repositories/avatars';
```

Change the `runStage2cOnward` signature to accept the caller, adding `userId` as the final parameter:

```typescript
async function runStage2cOnward(
  sendEvent: (data: unknown) => void,
  rawSpriteBuffer: Buffer,
  identification: any,
  deadline: ReturnType<typeof createDeadline>,
  userId: string
) {
```

Replace the closing return of `runStage2cOnward` (currently at `server/routes/pipeline.routes.ts:448-452`) with:

```typescript
  // Spec section E: persistence lives here, in the tail both entry points share,
  // so the human-gate route cannot produce a sprite that never gets saved.
  // finishedPngBuffer (line 374) is the source of finishedB64 — reuse it rather
  // than decoding the base64 string back into bytes.
  const persistence = await persistScan(
    {
      storage: createFirebaseSpriteStorage(),
      dex: dexRepository,
      avatars: avatarRepository,
    },
    userId,
    identification.name,
    identification.taxonomy?.family ?? null,
    finishedPngBuffer
  );

  return {
    plant,
    finishedB64,
    elapsedMs: lat2c + lat2d + lat3 + lat4,
    persistence,
  };
}
```

- [ ] **Step 6: Include the result in the completion events**

There are two `complete` events. In `/run-stream` (around line 259) the total keeps its four-term expression:

```typescript
    sendEvent({
      event: 'complete',
      finalPlant: tail.plant,
      finalSpriteB64: tail.finishedB64,
      totalTimeMs: lat1 + lat2a + lat2b + tail.elapsedMs,
      avatarId: tail.persistence.avatarId,
      saved: tail.persistence.saved,
      saveError: tail.persistence.saveError,
      discovery: tail.persistence.discovery,
    });
```

In `/run-stage2c` (around line 306) the total is the tail alone, because the wall-clock spent waiting at the human gate is not the pipeline's:

```typescript
    sendEvent({
      event: 'complete',
      finalPlant: tail.plant,
      finalSpriteB64: tail.finishedB64,
      totalTimeMs: tail.elapsedMs,
      avatarId: tail.persistence.avatarId,
      saved: tail.persistence.saved,
      saveError: tail.persistence.saveError,
      discovery: tail.persistence.discovery,
    });
```

Update both `runStage2cOnward(...)` call sites to pass `req.user!.uid` as the new fifth argument.

- [ ] **Step 7: Verify the whole server suite**

Run from `server/`:
```bash
npm run typecheck
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand"
```
Expected: typecheck clean; all Jest suites pass.

- [ ] **Step 8: Commit**

```bash
git add server/services/scan-persistence.ts server/routes/pipeline.routes.ts server/tests/scan-persistence.test.ts
git commit -m "feat(pipeline): persist a completed scan into the caller's archive"
```

---

### Task 7: Expose the discoverer on the avatar detail

**Files:**
- Modify: `server/controllers/avatar.controller.ts` (`handleGetAvatar`)
- Test: `server/tests/avatar-discovery-api.test.ts`

**Interfaces:**
- Consumes: `dexRepository.get` (Task 3); the `users` collection read pattern from `server/repositories/auth-users.ts`
- Produces: `GET /api/avatar/:avatarId` response gains
  `discovery: { firstDiscoveredByName: string; firstDiscoveredAt: string; discoveryCount: number; isFirstDiscoverer: boolean } | null`

- [ ] **Step 1: Write the failing test**

Create `server/tests/avatar-discovery-api.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';
import avatarRepository from '../repositories/avatars';
import dexRepository from '../repositories/dex';
import { clearFirestore, seedFirestoreUser } from './firestore-test-utils';

const OWNER = 'user-owner';
const FINDER = 'user-finder';

async function seedAvatar() {
  const { record } = await avatarRepository.upsertFromScan(OWNER, {
    speciesName: 'Fern',
    speciesFamily: 'Polypodiaceae',
    spriteUrl: 'https://cdn.test/fern.png',
    stats: { hp: 120, attack: 55, defense: 60, speed: 40 },
    metadata: null,
  });
  return record;
}

describe('avatar detail discovery block', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('returns the first discoverer display name, never the email', async () => {
    await seedFirestoreUser({
      id: FINDER,
      email: 'finder@example.test',
      displayName: 'Justin',
      isVerified: true,
    });
    await dexRepository.recordDiscovery('fern', FINDER, 'Fern');
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('x-dev-uid', OWNER);

    expect(response.status).toBe(200);
    expect(response.body.discovery.firstDiscoveredByName).toBe('Justin');
    expect(response.body.discovery.discoveryCount).toBeGreaterThanOrEqual(1);
    expect(response.body.discovery.isFirstDiscoverer).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain('finder@example.test');
  });

  it('marks the caller when they were the first discoverer', async () => {
    await seedFirestoreUser({
      id: OWNER,
      email: 'owner@example.test',
      displayName: 'Zhi Feng',
      isVerified: true,
    });
    await dexRepository.recordDiscovery('fern', OWNER, 'Fern');
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('x-dev-uid', OWNER);

    expect(response.body.discovery.isFirstDiscoverer).toBe(true);
  });

  it('returns discovery: null when no dex record exists', async () => {
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('x-dev-uid', OWNER);

    expect(response.status).toBe(200);
    expect(response.body.discovery).toBeNull();
  });

  it('still returns the avatar when the discoverer profile is missing', async () => {
    await dexRepository.recordDiscovery('fern', 'ghost-user', 'Fern');
    const record = await seedAvatar();

    const response = await request(app)
      .get(`/api/avatar/${record.id}`)
      .set('x-dev-uid', OWNER);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(record.id);
    expect(response.body.discovery).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/avatar-discovery-api.test.ts"
```
Expected: FAIL — `discovery` is undefined on the response body.

- [ ] **Step 3: Implement the discovery block**

In `server/controllers/avatar.controller.ts`, add these imports:

```typescript
import { getDb } from '../firebase';
import { sanitizeSpeciesKey } from '../pipeline/dex';
import dexRepository from '../repositories/dex';
```

Add this helper above `handleGetAvatar`:

```typescript
interface AvatarDiscovery {
  firstDiscoveredByName: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
  isFirstDiscoverer: boolean;
}

/** Resolves who found this species first. Degrades to null rather than failing
 *  the detail request — the discoverer is a nice-to-have, the avatar is not.
 *  Only the display name is exposed; the email never leaves the server. */
async function resolveDiscovery(
  speciesName: string,
  callerUid: string
): Promise<AvatarDiscovery | null> {
  try {
    const speciesKey = sanitizeSpeciesKey(speciesName);
    if (!speciesKey) return null;

    const dex = await dexRepository.get(speciesKey);
    if (!dex || !dex.firstDiscoveredBy) return null;

    const snapshot = await getDb().collection('users').doc(dex.firstDiscoveredBy).get();
    const displayName = snapshot.exists ? snapshot.data()?.displayName : undefined;
    if (typeof displayName !== 'string' || !displayName.trim()) return null;

    return {
      firstDiscoveredByName: displayName,
      firstDiscoveredAt: dex.firstDiscoveredAt,
      discoveryCount: dex.discoveryCount,
      isFirstDiscoverer: dex.firstDiscoveredBy === callerUid,
    };
  } catch {
    return null;
  }
}
```

Then in `handleGetAvatar`, after the avatar is fetched and confirmed to exist, replace the success response with:

```typescript
    const discovery = await resolveDiscovery(avatar.speciesName, userId);
    res.status(200).json({ ...serializeAvatar(avatar, new Date()), discovery });
```

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/avatar-discovery-api.test.ts"
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Confirm the existing avatar API suite is unaffected**

Run from `server/`:
```bash
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/avatar-api.test.ts"
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/avatar.controller.ts server/tests/avatar-discovery-api.test.ts
git commit -m "feat(archive): show who first discovered a species on the avatar detail"
```

---

### Task 8: Surface the save outcome in the client

**Files:**
- Modify: `client/src/pages/ScanPage.tsx`
- Test: `client/src/pages/ScanPage.test.tsx` (create)

**Interfaces:**
- Consumes: `streamPipeline` from `client/src/services/pipelineStream.ts`; the `complete` event fields from Task 6
- Produces: a visible saved / not-saved outcome and the first-discoverer line on the scan result.

> **The token already ships.** `pipelineStream.ts:26-33` defines `authHeaders()`, which attaches `Authorization: Bearer <idToken>` whenever Firebase is configured and a user is signed in, and `streamPipeline` already uses it at line 47. No header work is needed — but a signed-out user will now get a 401, which `streamPipeline:52` turns into the unhelpful `Pipeline API HTTP 401`. That message is what this task fixes, alongside the new fields.

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/ScanPage.test.tsx`, mocking the stream helper rather than `fetch`:

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineEvent } from '../services/pipelineStream';
import ScanPage from './ScanPage';

const streamPipeline = vi.hoisted(() => vi.fn());
vi.mock('../services/pipelineStream', () => ({ streamPipeline }));

/** Drives the page's own onEvent callback with a scripted event sequence. */
function scriptStream(events: PipelineEvent[]) {
  streamPipeline.mockImplementation(
    async (_path: string, _body: unknown, onEvent: (event: PipelineEvent) => void) => {
      for (const event of events) onEvent(event);
    }
  );
}

function completeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    event: 'complete',
    finalPlant: { name: 'Fern' },
    finalSpriteB64: 'AAAA',
    totalTimeMs: 1200,
    avatarId: 'avatar-1',
    saved: true,
    discovery: {
      firstDiscoveredByName: 'Justin',
      firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
      discoveryCount: 3,
      isFirstDiscoverer: false,
    },
    ...overrides,
  } as PipelineEvent;
}

async function startScan() {
  render(
    <MemoryRouter>
      <ScanPage />
    </MemoryRouter>
  );
  // Trigger the page's own scan entry point. Use the same control the existing
  // page exposes — the demo button that loads /img/test_plant.jpg (ScanPage.tsx:246).
  const trigger = await screen.findByRole('button', { name: /scan|try|demo/i });
  trigger.click();
}

describe('ScanPage save outcome', () => {
  beforeEach(() => {
    streamPipeline.mockReset();
  });

  it('shows who first discovered the species', async () => {
    scriptStream([completeEvent()]);
    await startScan();

    expect(await screen.findByText(/Justin/)).toBeInTheDocument();
  });

  it('calls out the caller when they discovered it first', async () => {
    scriptStream([
      completeEvent({
        discovery: {
          firstDiscoveredByName: 'Zhi Feng',
          firstDiscoveredAt: '2026-08-02T00:00:00.000Z',
          discoveryCount: 1,
          isFirstDiscoverer: true,
        },
      } as Partial<PipelineEvent>),
    ]);
    await startScan();

    expect(await screen.findByText(/you discovered this first/i)).toBeInTheDocument();
  });

  it('tells the user when the scan could not be saved', async () => {
    scriptStream([
      completeEvent({ saved: false, avatarId: null, saveError: 'bucket unreachable' } as Partial<PipelineEvent>),
    ]);
    await startScan();

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
  });

  it('asks the user to sign in when the server rejects the request', async () => {
    streamPipeline.mockRejectedValue(new Error('Pipeline API HTTP 401'));
    await startScan();

    expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
  });
});
```

> If the scan trigger in `startScan` does not match the page's actual control, open `ScanPage.tsx` and use the real button's accessible name. Do not change the page's markup to suit the test.

- [ ] **Step 2: Run test to verify it fails**

Run from `client/`:
```bash
npm exec -- vitest run src/pages/ScanPage.test.tsx
```
Expected: FAIL — none of the new text is rendered.

- [ ] **Step 3: Read the new fields off the complete event**

In `client/src/pages/ScanPage.tsx`, the `complete` handler is at line 188. Extend it to capture the persistence outcome alongside the sprite:

```typescript
          if (event.event === 'complete') {
            const plant = event.finalPlant as { name?: string } | undefined;
            finalName = plant?.name ?? finalName;
            finalSprite = `data:image/png;base64,${String(event.finalSpriteB64)}`;
            savedOutcome = {
              saved: event.saved !== false,
              saveError: event.saveError ? String(event.saveError) : undefined,
              discovery: (event.discovery ?? null) as ScanDiscovery | null,
            };
          }
```

Declare `savedOutcome` beside `finalSprite` and `finalName` near line 147, and add the type:

```typescript
interface ScanDiscovery {
  firstDiscoveredByName: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
  isFirstDiscoverer: boolean;
}
```

- [ ] **Step 4: Render the outcome**

In the success view, render:

- when `saved` is false: `Your plant was generated, but it could not be saved. {saveError}`
- when `discovery.isFirstDiscoverer` is true: `You discovered this first!`
- otherwise when `discovery` exists: `First discovered by {firstDiscoveredByName}` and `Found by {discoveryCount} explorers`

In the error path, map a message containing `401` to `Please sign in to scan a plant.` rather than showing the raw HTTP text.

- [ ] **Step 5: Run test to verify it passes**

Run from `client/`:
```bash
npm exec -- vitest run src/pages/ScanPage.test.tsx
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ScanPage.tsx client/src/pages/ScanPage.test.tsx
git commit -m "feat(scan): show the save outcome and first discoverer on the scan result"
```

---

### Task 9: Add the new suites to CI

**Files:**
- Modify: `.github/workflows/tests.yml`

- [ ] **Step 1: Add the pure-unit tests to the non-emulator group**

In `.github/workflows/tests.yml` line 72, append the two new pure test files to the existing `--runTestsByPath` list:

```yaml
        run: node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/battle-eligibility.test.ts tests/battle-catalog.test.ts tests/species-stats.test.ts tests/sprite-storage.test.ts tests/scan-persistence.test.ts tests/pipeline-auth.test.ts
```

- [ ] **Step 2: Add the emulator tests to an emulator group**

Append the new emulator-backed files to the group at line 75:

```yaml
        run: npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/battle-repository.test.ts tests/avatar-api.test.ts tests/avatar-upsert.test.ts tests/dex-repository.test.ts tests/avatar-discovery-api.test.ts"
```

- [ ] **Step 3: Add the client test**

Append `src/pages/ScanPage.test.tsx` to the client group at line 110:

```yaml
        run: npm exec -- vitest run src/pages/ArchivePage.test.tsx src/pages/ScanPage.test.tsx
```

- [ ] **Step 4: Verify the full suite locally before pushing**

From the repository root:
```bash
npm test
```
Expected: server and client suites both pass.

- [ ] **Step 5: Commit and push**

```bash
git add .github/workflows/tests.yml
git commit -m "ci: run the scan persistence suites"
git push -u origin features/zhifeng/scan-to-archive-persistence
```

---

### Task 10: Update the documentation the report depends on

**Files:**
- Modify: `Sprout_Vault/06 Meetings and Feedback/Final Deliverables Plan.md`
- Modify: `Sprout_Vault/07 Decisions and QA/Open Questions and Inconsistencies.md`
- Modify: `Sprout_Vault/02 Requirements/UC6 Upload Plant Picture.md`
- Modify: `Sprout_Vault/Home.md`

> The vault is a **separate repository** (`sprout-knowledge-base`) at `Sprout_Vault/`. Commit it separately from `sprout-app`.

- [ ] **Step 1: Record that UC6 now persists**

In `UC6 Upload Plant Picture.md`, update the operation flow to include: sprite stored to Firebase Storage under a canonical per-species path, archive record created for the caller, repeated scans updating `metadata.lastSeenAt` rather than duplicating, and the new post-condition that the species appears in the user's archive.

Add the first-discoverer behaviour as a new step, and note that the archive detail is the first place one user sees another user's display name.

- [ ] **Step 2: Close the open items**

In both `Final Deliverables Plan.md` ("The one real integration gap" and "Open items") and `Open Questions and Inconsistencies.md` ("UC6 does not persist"), mark the gap resolved with the merge commit, and record that stats are derived deterministically rather than taken from the pipeline's random values.

- [ ] **Step 3: Update Home.md**

Replace the "Biggest open gap" bullet with the current state, and update the implemented-use-case line so UC6 is no longer described as stateless.

- [ ] **Step 4: Commit the vault**

```bash
cd ../Sprout_Vault
git add -A
git commit -m "docs: record UC6 persistence and first-discoverer attribution"
```

Push using the working credential method:
```bash
export GIT_TERMINAL_PROMPT=0
AUTH=$(printf 'x-access-token:%s' "$(gh auth token)" | base64 -w0)
git -c credential.helper= -c http.extraheader="AUTHORIZATION: basic $AUTH" push origin main 2>&1 \
  | sed -E 's/[A-Za-z0-9+\/=]{40,}/[REDACTED]/g'
```

- [ ] **Step 5: Open the pull request**

```bash
cd ../sprout-app
gh pr create --base main --head features/zhifeng/scan-to-archive-persistence \
  --title "feat: persist scanned plants into the archive (UC6 to UC4)" \
  --body "Closes the pipeline-to-archive gap. Authenticates the pipeline routes, stores one canonical sprite per species in Firebase Storage, upserts an archive record de-duplicated on the sanitized species name, derives battle stats deterministically from the species key, and records who first discovered each species.

Design: docs/superpowers/specs/2026-08-02-scan-to-archive-persistence-design.md"
```

---

## Verification checklist

Before requesting review:

- [ ] `npm run typecheck` clean in `server/`
- [ ] Full server Jest suite green under the emulator
- [ ] Full client Vitest suite green
- [ ] No `.env`, `serviceAccountKey.json`, or credential in the diff
- [ ] No commits on `main`
- [ ] No `Co-Authored-By` trailer in any commit message
- [ ] `FIREBASE_STORAGE_BUCKET` present in the Render environment — the sprite write fails without it
- [ ] Deployed smoke test: scan a plant on the Vercel front end, confirm it appears in the archive after a page refresh
