/**
 * Renders the sprites nobody drew by hand, through the real pipeline, once.
 *
 *   npm run sprites:generate -w server              # everything still missing
 *   npm run sprites:generate -w server -- --force   # re-render everything
 *   npm run sprites:generate -w server -- --only=thornback,ficus-lyrata
 *
 * Two sets, two output directories:
 *
 *  - the SPRITE_CATALOG (Thornback, the PVE opponent) renders into
 *    client/public/sprites/<slug>.png;
 *  - the five demo plants render into client/public/plants/ under the exact
 *    `spriteFile` names their templates in demo-avatar-templates.ts point at.
 *
 * Demo art is meant to be hand-made eventually; until someone draws it, this
 * fills the pots with pipeline renders. A file that already exists is never
 * overwritten without --force, so dropping real hand-made art into
 * client/public/plants/ retires the render for that plant permanently.
 *
 * None of these have a photo behind them, so this takes the pipeline's
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
 */
import '../env';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { DEMO_AVATAR_TEMPLATES } from '../data/demo-avatar-templates';
import { SPRITE_CATALOG } from '../data/sprite-catalog';
import { createDeadline } from '../pipeline/deadline';
import { finishSprite } from '../pipeline/stages/finish';
import { generateSprite } from '../pipeline/stages/generate';
import { nameOnlyPrompt } from '../pipeline/stages/promptCraft';
import { removeBackgroundSafe } from '../pipeline/stages/removeBg';
import { serverEnv } from '../platform/env';

const SPRITES_OUTPUT_DIRECTORY = path.resolve(
  __dirname,
  '../../client/public/sprites'
);
const PLANTS_OUTPUT_DIRECTORY = path.resolve(__dirname, '../../client/public/plants');

/** One file to render: what to draw, what it's for, and where it lands. */
interface RenderJob {
  /** The `--only` key. */
  slug: string;
  /** The name handed to the pipeline's prompt-craft hop. */
  renderName: string;
  /** What breaks if this file is missing — printed beside the render. */
  usedBy: string;
  outputDirectory: string;
  fileName: string;
}

function buildJobs(outputOverride: string | null): RenderJob[] {
  return [
    ...SPRITE_CATALOG.map((entry) => ({
      slug: entry.slug,
      renderName: entry.renderName,
      usedBy: entry.usedBy,
      outputDirectory: outputOverride ?? SPRITES_OUTPUT_DIRECTORY,
      fileName: `${entry.slug}.png`,
    })),
    // The demo plants render under the exact spriteFile names their templates
    // point at, so the record's URL and the file on disk cannot drift apart.
    ...DEMO_AVATAR_TEMPLATES.map((template) => ({
      slug: template.id.replace(/^demo-avatar-/, ''),
      renderName: template.speciesName,
      usedBy: `the demo plant ${template.speciesName}`,
      outputDirectory: outputOverride ?? PLANTS_OUTPUT_DIRECTORY,
      fileName: template.spriteFile,
    })),
  ];
}

interface Options {
  force: boolean;
  only: Set<string> | null;
  outputOverride: string | null;
}

export function parseOptions(argv: string[]): Options {
  const only = new Set<string>();
  let force = false;
  let outputOverride: string | null = null;

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
      outputOverride = path.resolve(argument.slice('--out='.length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { force, only: only.size > 0 ? only : null, outputOverride };
}

function selectJobs(options: Options): RenderJob[] {
  const jobs = buildJobs(options.outputOverride);
  if (!options.only) return jobs;

  const known = new Set(jobs.map((job) => job.slug));
  const unknown = [...options.only].filter((slug) => !known.has(slug));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown sprite slug(s): ${unknown.join(', ')}. Known slugs: ${[...known].join(', ')}`
    );
  }
  return jobs.filter((job) => options.only!.has(job.slug));
}

/** One sprite, start to finish. Throws rather than write art no model made. */
async function renderEntry(
  entry: RenderJob,
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
  const finished = await finishSprite(cutout.png, { keyBackdrop: cutout.removeBgOk });

  await writeFile(outputPath, finished);
  return { model: render.model, cutout: cutout.removeBgOk, bytes: finished.length };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseOptions(argv);
  const jobs = selectJobs(options);
  for (const directory of new Set(jobs.map((job) => job.outputDirectory))) {
    await mkdir(directory, { recursive: true });
  }

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
  for (const job of jobs) {
    const outputPath = path.join(job.outputDirectory, job.fileName);
    if (!options.force && existsSync(outputPath)) {
      console.log(`- ${job.slug}: already present, skipping (--force to redo)`);
      continue;
    }

    process.stdout.write(`- ${job.slug}: rendering (${job.usedBy})... `);
    try {
      const result = await renderEntry(job, outputPath);
      console.log(
        `ok, ${(result.bytes / 1024).toFixed(1)} kB via ${result.model}` +
          (result.cutout ? ' with cutout' : ' WITHOUT cutout')
      );
    } catch (error) {
      failures += 1;
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `\nWrote to ${[...new Set(jobs.map((job) => job.outputDirectory))].join(', ')}`
  );
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
