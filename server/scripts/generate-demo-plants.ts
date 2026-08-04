/**
 * Renders the five demo plants' art through the real pipeline.
 *
 *   npm run sprites:generate:demo -w server              # anything still missing
 *   npm run sprites:generate:demo -w server -- --force   # re-render everything
 *   npm run sprites:generate:demo -w server -- --only=demo-avatar-ficus-lyrata
 *
 * client/public/plants/ was documented as hand-made art, but the drawings were
 * never actually committed — every seeded avatar pointed at a SPRITE_*.png that
 * did not exist, 404'd, and rendered as a bare pot. Until someone draws them by
 * hand, this renders each species through the same tier-3 pipeline path the
 * Scan screen uses (nameOnlyPrompt → render → cutout → Spica72 finish), so the
 * archive shelf and the battle picker show real plants in the same style as
 * scanned ones.
 *
 * Like generate-sprites.ts, it refuses to write the pipeline's placeholder
 * drawing: without an image-model key it fails loudly instead of committing art
 * no model made. Filenames come from demo-avatar-templates.ts — the single
 * source for what the seed rows reference — so the two cannot drift.
 */
import '../env';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { DEMO_AVATAR_TEMPLATES, type DemoAvatarTemplate } from '../data/demo-avatar-templates';
import { createDeadline } from '../pipeline/deadline';
import { finishSprite } from '../pipeline/stages/finish';
import { generateSprite } from '../pipeline/stages/generate';
import { nameOnlyPrompt } from '../pipeline/stages/promptCraft';
import { removeBackgroundSafe } from '../pipeline/stages/removeBg';
import { serverEnv } from '../platform/env';

const OUTPUT_DIRECTORY = path.resolve(__dirname, '../../client/public/plants');

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
        .map((id) => id.trim())
        .filter(Boolean)
        .forEach((id) => only.add(id));
    } else if (argument.startsWith('--out=')) {
      outputDirectory = path.resolve(argument.slice('--out='.length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { force, only: only.size > 0 ? only : null, outputDirectory };
}

function selectTemplates(options: Options): DemoAvatarTemplate[] {
  if (!options.only) return DEMO_AVATAR_TEMPLATES;

  const known = new Set(DEMO_AVATAR_TEMPLATES.map((template) => template.id));
  const unknown = [...options.only].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown template id(s): ${unknown.join(', ')}. Known ids: ${[...known].join(', ')}`
    );
  }
  return DEMO_AVATAR_TEMPLATES.filter((template) => options.only!.has(template.id));
}

/** One sprite, start to finish. Throws rather than write art no model made. */
async function renderTemplate(
  template: DemoAvatarTemplate,
  outputPath: string
): Promise<{ model: string; cutout: boolean; bytes: number }> {
  const deadline = createDeadline();

  const prompt = nameOnlyPrompt(template.speciesName);
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
  const templates = selectTemplates(options);
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
  for (const template of templates) {
    const outputPath = path.join(options.outputDirectory, template.spriteFile);
    if (!options.force && existsSync(outputPath)) {
      console.log(`- ${template.spriteFile}: already present, skipping (--force to redo)`);
      continue;
    }

    process.stdout.write(`- ${template.spriteFile}: rendering (${template.speciesName})... `);
    try {
      const result = await renderTemplate(template, outputPath);
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
