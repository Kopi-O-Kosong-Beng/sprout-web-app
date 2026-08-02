/**
 * Renders the sprites nobody drew by hand, through the real pipeline, once.
 *
 *   npm run sprites:generate -w server              # everything still missing
 *   npm run sprites:generate -w server -- --force   # re-render everything
 *   npm run sprites:generate -w server -- --only=thornback
 *
 * Only Thornback, the PVE opponent, is in the catalogue — the demo plants are
 * hand-made art in client/public/plants/ and are deliberately out of reach of
 * this script. Thornback has no photo behind it, so this takes the pipeline's
 * tier-3 entry point: `nameOnlyPrompt` builds the render prompt from the name
 * and its botanical traits, exactly as a scan would when the vision hop is
 * unavailable. From there it is the same path the Scan screen runs — render,
 * cutout, Spica72 finish — so it sits in the same style as anything a
 * player generates.
 *
 * It refuses to write a procedural placeholder. Committing placeholder art is
 * how "every sprite looks identical" hides in plain sight: the file exists, the
 * pot is filled, and nothing tells you the image model never ran. Without an
 * image key the script fails loudly instead.
 *
 * Output lands in client/public/sprites/, which the client serves at
 * /sprites/<slug>.png — the URL spriteUrlForSlug() in data/sprite-catalog.ts
 * hands out.
 */
import '../env';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { SPRITE_CATALOG, type SpriteCatalogEntry } from '../data/sprite-catalog';
import { createDeadline } from '../pipeline/deadline';
import { finishSprite } from '../pipeline/stages/finish';
import { generateSprite } from '../pipeline/stages/generate';
import { nameOnlyPrompt } from '../pipeline/stages/promptCraft';
import { removeBackgroundSafe } from '../pipeline/stages/removeBg';
import { serverEnv } from '../platform/env';

const OUTPUT_DIRECTORY = path.resolve(__dirname, '../../client/public/sprites');

interface Options {
  force: boolean;
  only: Set<string> | null;
  outputDirectory: string;
}

export function parseOptions(argv: string[]): Options {
  const only = new Set<string>();
  let force = false;
  let outputDirectory = OUTPUT_DIRECTORY;

  for (const argument of argv) {
    if (argument === '--force') {
      force = true;
    } else if (argument.startsWith('--only=')) {
      argument
        .slice('--only='.length)
        .split(',')
        .map((slug) => slug.trim())
        .filter(Boolean)
        .forEach((slug) => only.add(slug));
    } else if (argument.startsWith('--out=')) {
      outputDirectory = path.resolve(argument.slice('--out='.length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { force, only: only.size > 0 ? only : null, outputDirectory };
}

function selectEntries(options: Options): SpriteCatalogEntry[] {
  if (!options.only) return SPRITE_CATALOG;

  const known = new Set(SPRITE_CATALOG.map((entry) => entry.slug));
  const unknown = [...options.only].filter((slug) => !known.has(slug));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown sprite slug(s): ${unknown.join(', ')}. Known slugs: ${[...known].join(', ')}`
    );
  }
  return SPRITE_CATALOG.filter((entry) => options.only!.has(entry.slug));
}

/** One sprite, start to finish. Throws rather than write art no model made. */
async function renderEntry(
  entry: SpriteCatalogEntry,
  outputPath: string
): Promise<{ model: string; cutout: boolean; bytes: number }> {
  const deadline = createDeadline();

  const prompt = nameOnlyPrompt(entry.renderName);
  const render = await generateSprite(
    prompt,
    {
      flux: serverEnv.fluxApiKey,
      gemini: serverEnv.geminiKey,
      geminiModel: serverEnv.geminiImageModel,
      provider: serverEnv.imageProvider,
    },
    deadline
  );

  if (!render.fromModel) {
    throw new Error(
      'no image model ran — this would be a placeholder drawing, not a sprite'
    );
  }

  const cutout = await removeBackgroundSafe(
    render.png,
    serverEnv.withoutbgKey,
    deadline
  );
  const finished = await finishSprite(cutout.png);

  await writeFile(outputPath, finished);
  return { model: render.model, cutout: cutout.removeBgOk, bytes: finished.length };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseOptions(argv);
  const entries = selectEntries(options);
  await mkdir(options.outputDirectory, { recursive: true });

  if (!serverEnv.fluxApiKey && !serverEnv.geminiKey) {
    console.error(
      'No image-model key configured. Set FLUX_API_KEY (or NVIDIA_API_KEY) and/or\n' +
        'GEMINI_API_KEY in server/.env, then run this again. Without one the pipeline\n' +
        'only produces a placeholder drawing, which this script will not commit.'
    );
    return 1;
  }
  if (!serverEnv.withoutbgKey) {
    console.warn(
      'No WITHOUTBG_KEY / REMOVE_BG_API_KEY set — sprites keep the render background\n' +
        'baked in instead of a transparent cutout. They will look like tiles in the pot.\n'
    );
  }

  let failures = 0;
  for (const entry of entries) {
    const outputPath = path.join(options.outputDirectory, `${entry.slug}.png`);
    if (!options.force && existsSync(outputPath)) {
      console.log(`- ${entry.slug}: already present, skipping (--force to redo)`);
      continue;
    }

    process.stdout.write(`- ${entry.slug}: rendering (${entry.usedBy})... `);
    try {
      const result = await renderEntry(entry, outputPath);
      console.log(
        `ok, ${(result.bytes / 1024).toFixed(1)} kB via ${result.model}` +
          (result.cutout ? ' with cutout' : ' WITHOUT cutout')
      );
    } catch (error) {
      failures += 1;
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\nWrote to ${options.outputDirectory}`);
  if (failures > 0) {
    console.error(`${failures} sprite(s) failed. Re-run to retry just those.`);
    return 1;
  }
  return 0;
}

// `require.main === module` keeps the exports importable from a test without
// the script running itself, matching the other scripts in this folder.
if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
