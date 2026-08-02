/**
 * Where the avatars that ship without a scan behind them get their art.
 *
 * Two sources, two directories, both served by the client:
 *
 *  - `/plants/` — hand-made art. Each demo plant is a pair: `SPRITE_<Key>.png`,
 *    the creature that stands in the pot, and `IMG_<Key>.jpg`, the photograph it
 *    was drawn from, which the archive shows on the specimen card. The pairing
 *    lives on the template in demo-avatar-templates.ts.
 *  - `/sprites/` — pipeline output, for avatars nobody drew by hand. Only
 *    Thornback, the PVE opponent, is in there; `npm run sprites:generate -w
 *    server` renders it.
 *
 * Before this, every one of them pointed at `/static/sprites/<species>.png`, a
 * path nothing served and no file backed: the <img> 404'd, PlantVisuals
 * swallowed the error, and each seeded avatar rendered as a bare pot with its
 * palette tint behind it. The URL shapes live here now so the seed data, the
 * repository and the battle catalogue cannot drift from where the files are.
 */

/** Hand-made art: the demo plants' sprite/photo pairs. */
export const PLANT_ASSET_BASE_PATH = '/plants';
/** Pipeline output, written by scripts/generate-sprites.ts. */
export const SPRITE_BASE_PATH = '/sprites';

export interface SpriteCatalogEntry {
  /** Filename stem under SPRITE_BASE_PATH — also the generator's `--only` key. */
  slug: string;
  /**
   * The name handed to the pipeline's prompt-craft hop. Thornback is invented,
   * so it carries its own description rather than a binomial the prompt
   * builder could look up in its botanical-traits dictionary.
   */
  renderName: string;
  /** What breaks if this file is missing — printed by the generator. */
  usedBy: string;
}

/** URL for a hand-made asset, e.g. `/plants/SPRITE_Monstera.png`. */
export function plantAssetUrl(fileName: string): string {
  return `${PLANT_ASSET_BASE_PATH}/${fileName}`;
}

/** URL for a generated sprite, e.g. `/sprites/thornback.png`. */
export function spriteUrlForSlug(slug: string): string {
  return `${SPRITE_BASE_PATH}/${slug}.png`;
}

/**
 * Everything the generator renders. The demo plants are deliberately absent:
 * their art is hand-made and lives in `/plants/`, so generating over it would
 * replace a drawing someone made with one a model guessed at.
 */
export const SPRITE_CATALOG: SpriteCatalogEntry[] = [
  {
    slug: 'thornback',
    renderName:
      'Thornback, a bramble-armoured briar creature grown from Rubus fruticosus',
    usedBy: 'the PVE opponent on the battle screen',
  },
];
