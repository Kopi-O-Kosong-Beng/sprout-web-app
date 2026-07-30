import manifest from './manifest.json';

/**
 * Golden set access layer.
 *
 * The manifest's `photo` field used to be dead metadata — the studio drew
 * coloured circles on a canvas instead. These helpers make it load-bearing by
 * resolving each declared path to a bundled asset URL.
 */

export interface GoldenExpect {
  isPlant?: boolean;
  identifiedNameIncludes?: string;
  programmatic?: Record<string, boolean> | null;
  judgeMin?: Record<string, number>;
  signatureFeature?: string;
  expectedTier?: string;
  producedByTier?: string;
  note?: string;
  [key: string]: unknown;
}

export interface GoldenCase {
  id: string;
  photo?: string;
  species?: string;
  commonName: string;
  manualName?: string;
  /** Deliberately hard input (no single hero bloom) — relaxed judge minimums. */
  stress?: boolean;
  /** Fault-injection directives for the fallback-tier cases. */
  inject?: Record<string, string>;
  expect: GoldenExpect;
}

export const GOLDEN_CASES = manifest.cases as GoldenCase[];

export const PALETTE_UNDER_TEST = manifest.paletteUnderTest;

/**
 * The eight real species. Excludes the `edge_*` entries: two genuine edge cases
 * plus four fault-injection cases that reuse the melastoma photo, which would
 * otherwise show up as duplicates in the scanner's fixture picker.
 */
export const PLANT_CASES = GOLDEN_CASES.filter((c) => !c.id.startsWith('edge_'));

/* -------------------------------------------------------------------------- */

// Vite inlines these at build time, so the photos are hashed and cached like
// any other asset rather than fetched by a hand-built path at runtime.
const assets = import.meta.glob('./photos/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byFilename = new Map<string, string>(
  Object.entries(assets).map(([path, url]) => [path.split('/').pop()!, url]),
);

/** Resolve a manifest `photo` path (e.g. "goldenset/photos/melastoma.jpg") to a URL. */
export function photoUrl(manifestPath?: string): string | undefined {
  if (!manifestPath) return undefined;
  return byFilename.get(manifestPath.split('/').pop()!);
}

/**
 * Fixture photos ship as bundled assets, but the pipeline endpoint wants a
 * base64 data URL in the request body — same shape a drag-and-drop upload
 * produces, so both paths stay identical downstream.
 */
export async function loadPhotoAsDataUrl(manifestPath?: string): Promise<string | null> {
  const url = photoUrl(manifestPath);
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fixture photo ${url} failed: HTTP ${response.status}`);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
