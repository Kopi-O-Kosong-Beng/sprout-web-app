import { createThornback } from '../data/battle-catalog';
import { DEMO_AVATAR_TEMPLATES, buildAvatarRows } from '../data/demo-avatar-templates';
import {
  PLANT_ASSET_BASE_PATH,
  SPRITE_CATALOG,
  plantAssetUrl,
  spriteUrlForSlug,
} from '../data/sprite-catalog';

describe('avatar art catalogue', () => {
  it('serves every demo plant from the hand-made asset directory', () => {
    for (const row of buildAvatarRows(new Date('2026-08-01T00:00:00.000Z'))) {
      expect(row.spriteUrl.startsWith(`${PLANT_ASSET_BASE_PATH}/`)).toBe(true);
      expect(row.metadata.photoUrl).toEqual(
        expect.stringMatching(new RegExp(`^${PLANT_ASSET_BASE_PATH}/`))
      );
    }
  });

  it('pairs each demo template with a sprite and the photo it came from', () => {
    for (const template of DEMO_AVATAR_TEMPLATES) {
      expect(template.spriteFile).toMatch(/^SPRITE_[A-Za-z0-9]+\.(png|webp)$/);
      expect(template.photoFile).toMatch(/^IMG_[A-Za-z0-9]+\.(jpg|jpeg|png|webp)$/);
    }
  });

  // Two templates sharing a file means two shelves showing the same creature,
  // which reads as a bug long before anyone suspects the catalogue.
  it('gives every demo template its own files', () => {
    const sprites = DEMO_AVATAR_TEMPLATES.map((template) => template.spriteFile);
    const photos = DEMO_AVATAR_TEMPLATES.map((template) => template.photoFile);
    expect(new Set(sprites).size).toBe(sprites.length);
    expect(new Set(photos).size).toBe(photos.length);
  });

  it('builds asset URLs under the directory the client serves', () => {
    expect(plantAssetUrl('SPRITE_Monstera.png')).toBe('/plants/SPRITE_Monstera.png');
    expect(spriteUrlForSlug('thornback')).toBe('/sprites/thornback.png');
  });

  // The generator renders what nobody drew by hand. A demo plant appearing here
  // would mean a model overwriting someone's artwork on the next run.
  it('leaves the hand-made plants out of the generator catalogue', () => {
    expect(SPRITE_CATALOG.map((entry) => entry.slug)).toEqual(['thornback']);
    expect(createThornback().spriteUrl).toBe('/sprites/thornback.png');
  });
});
