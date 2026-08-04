import { serverEnv } from '../platform/env';

/**
 * USE_MOCK_APIS was declared in three config files and read by nothing, while
 * README told developers it meant no real API calls. It now works by
 * withholding the credentials, so every hop takes the keyless path it already
 * had. These pin that, because the failure mode is silent and expensive: the
 * flag reading "true" while five funded services are billed per scan.
 */
describe('USE_MOCK_APIS', () => {
  const KEYS = {
    PLANT_API_KEY: 'plant-live',
    GEMINI_API_KEY: 'gemini-live',
    NVIDIA_API_KEY: 'nvidia-live',
    FLUX_API_KEY: 'flux-live',
    REMOVE_BG_API_KEY: 'removebg-live',
  };
  // Restore key-by-key. Replacing process.env wholesale drops variables other
  // suites depend on — FIRESTORE_EMULATOR_HOST among them — because
  // --runInBand shares a single process.
  const TOUCHED = [...Object.keys(KEYS), 'USE_MOCK_APIS'];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));
    Object.assign(process.env, KEYS);
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('withholds every upstream credential when true', () => {
    process.env.USE_MOCK_APIS = 'true';

    expect(serverEnv.plantApiKey).toBeNull();
    expect(serverEnv.geminiKey).toBeNull();
    expect(serverEnv.gemmaApiKey).toBeNull();
    expect(serverEnv.fluxApiKey).toBeNull();
    expect(serverEnv.withoutbgKey).toBeNull();
  });

  it('hands the real keys over when false', () => {
    process.env.USE_MOCK_APIS = 'false';

    expect(serverEnv.plantApiKey).toBe('plant-live');
    expect(serverEnv.geminiKey).toBe('gemini-live');
    expect(serverEnv.fluxApiKey).toBe('flux-live');
    expect(serverEnv.withoutbgKey).toBe('removebg-live');
  });

  it('defaults to live when unset, so a missing flag never silently stubs a deploy', () => {
    delete process.env.USE_MOCK_APIS;

    expect(serverEnv.plantApiKey).toBe('plant-live');
  });

  it('treats any value other than the exact string "true" as live', () => {
    for (const value of ['TRUE', '1', 'yes', '']) {
      process.env.USE_MOCK_APIS = value;
      expect(serverEnv.plantApiKey).toBe('plant-live');
    }
  });
});

describe('MIN_CONFIDENCE_THRESHOLD', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.MIN_CONFIDENCE_THRESHOLD;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.MIN_CONFIDENCE_THRESHOLD;
    else process.env.MIN_CONFIDENCE_THRESHOLD = saved;
  });

  it('reads a configured probability', () => {
    process.env.MIN_CONFIDENCE_THRESHOLD = '0.85';
    expect(serverEnv.minConfidenceThreshold).toBe(0.85);
  });

  it('honours 0 rather than treating it as unset', () => {
    process.env.MIN_CONFIDENCE_THRESHOLD = '0';
    expect(serverEnv.minConfidenceThreshold).toBe(0);
  });

  it.each(['', 'high', '-1', '1.5', 'NaN'])(
    'falls back to 0.7 rather than throwing on %s',
    (value) => {
      process.env.MIN_CONFIDENCE_THRESHOLD = value;
      expect(serverEnv.minConfidenceThreshold).toBe(0.7);
    }
  );
});
