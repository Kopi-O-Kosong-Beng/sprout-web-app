import { buildScanMetadata } from '../services/scan-persistence';

/**
 * What a scanned plant carries into the archive.
 *
 * persistScan wrote `metadata: null` unconditionally, so every field the route
 * had already paid Plant.id for — description, care notes, toxicity — was
 * fetched and thrown away. Meanwhile the seeded demo plants carried a richer
 * record than anything a player could earn by scanning.
 *
 * The shape matters more than it looks: Firestore rejects `undefined` outright,
 * and `{}` is not the same as `null` to the archive, which reads an object as
 * "there are details to show" and would render an empty panel.
 */
describe('buildScanMetadata', () => {
  it('keeps every populated field', () => {
    const metadata = buildScanMetadata({
      description: 'A deciduous shrub native to Japan.',
      commonNames: ['bigleaf hydrangea', 'hortensia'],
      bestLightCondition: 'Partial shade to full sun.',
      bestSoilType: 'Rich, well-draining, slightly acidic.',
      bestWatering: 'Consistently moist soil.',
      toxicity: 'Toxic to humans and animals.',
      commonUses: 'Ornamental landscaping.',
      confidence: 0.99,
    });

    expect(metadata).toEqual({
      description: 'A deciduous shrub native to Japan.',
      commonNames: ['bigleaf hydrangea', 'hortensia'],
      bestLightCondition: 'Partial shade to full sun.',
      bestSoilType: 'Rich, well-draining, slightly acidic.',
      bestWatering: 'Consistently moist soil.',
      toxicity: 'Toxic to humans and animals.',
      commonUses: 'Ornamental landscaping.',
      confidence: 0.99,
    });
  });

  /* An unidentified scan has no details, and the species name is a stand-in —
     there is nothing true to record against it. */
  it('returns null when there are no details at all', () => {
    expect(buildScanMetadata(undefined)).toBeNull();
  });

  /* Not {}. The archive treats an object as "there are details here" and would
     draw an empty panel under the plant. */
  it('returns null rather than an empty object when every field is blank', () => {
    expect(
      buildScanMetadata({
        description: '   ',
        commonNames: [],
        toxicity: '',
      })
    ).toBeNull();
  });

  /* Firestore rejects undefined values outright, so an absent field has to be
     genuinely absent from the object rather than present-and-undefined. */
  it('omits blank fields instead of storing them as undefined', () => {
    const metadata = buildScanMetadata({
      description: 'Something true.',
      toxicity: '',
      bestSoilType: undefined,
    });

    expect(metadata).toEqual({ description: 'Something true.' });
    expect(Object.keys(metadata!)).toEqual(['description']);
    expect('toxicity' in metadata!).toBe(false);
  });

  /* 0 is a legitimate confidence — a falsy check here would silently drop the
     one value most worth recording about a doubtful identification. */
  it('keeps a zero confidence', () => {
    expect(buildScanMetadata({ confidence: 0 })).toEqual({ confidence: 0 });
  });

  it('drops a non-finite confidence rather than writing NaN to Firestore', () => {
    expect(buildScanMetadata({ confidence: Number.NaN })).toBeNull();
    expect(buildScanMetadata({ confidence: Number.POSITIVE_INFINITY })).toBeNull();
  });

  /* Upstream prose is unbounded and this rides in every archive page payload.
     A provider that starts returning essays must not inflate the collection. */
  it('caps a long string and marks the cut', () => {
    const metadata = buildScanMetadata({ description: 'a'.repeat(5_000) });
    const description = metadata!.description as string;

    expect(description).toHaveLength(600);
    expect(description.endsWith('…')).toBe(true);
  });

  it('trims surrounding whitespace and caps the common-name list', () => {
    const metadata = buildScanMetadata({
      commonNames: ['  one  ', '', '   ', 'two', 'three', 'four', 'five', 'six'],
      description: '  padded  ',
    });

    expect(metadata!.commonNames).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(metadata!.description).toBe('padded');
  });

  /* Guards the decision itself: Plant.id returns neither, verified against the
     live API. If someone adds them back, it should be because the data has a
     real source — see md/PLANT_DETAILS.md — not by accident. */
  it('records no habitat or conservation status', () => {
    const metadata = buildScanMetadata({
      description: 'A deciduous shrub native to Japan.',
      toxicity: 'Toxic to humans and animals.',
    });

    expect(metadata).not.toHaveProperty('habitat');
    expect(metadata).not.toHaveProperty('conservationStatus');
  });
});
