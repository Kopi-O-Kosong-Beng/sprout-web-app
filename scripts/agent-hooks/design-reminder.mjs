/**
 * design-reminder.mjs — Design-phase hook.
 * Trigger: UserPromptSubmit (automatic). Prints nothing unless the prompt
 * looks like UI/design work; then emits a short checklist as extra context.
 * Exit: always 0 (non-blocking) — stdout is appended to Claude's context.
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { readStdinJson, REPO_ROOT } from './hook-lib.mjs';

const DESIGN_WORDS =
  /\b(ui|page|screen|styling|style|tailwind|css|visual|design|screenshot|pencil|layout|responsive|theme|font|colou?r)\b|DESIGN\.md/i;

const prompt = readStdinJson().prompt ?? process.argv.slice(2).join(' ');
if (!prompt || !DESIGN_WORDS.test(prompt)) process.exit(0);

const designPath = path.join(REPO_ROOT, 'DESIGN.md');
const lines = ['[design hook] This looks like UI/design work:'];

if (existsSync(designPath)) {
  const ageDays = Math.floor(
    (Date.now() - statSync(designPath).mtimeMs) / 86_400_000
  );
  lines.push(
    `- Check DESIGN.md first (last modified ${ageDays} day(s) ago${ageDays > 14 ? ' — possibly stale, confirm with the user' : ''}).`
  );
} else {
  lines.push(
    '- DESIGN.md is MISSING — ask for a visual reference (screenshot/mockup/Pencil file) before implementing visuals.'
  );
}
lines.push(
  '- Plan responsive behavior (320/480/768/1024/1440px, no horizontal scroll).',
  '- Plan accessibility: labels on inputs, one h1, keyboard path, visible focus, WCAG AA contrast.',
  '- Align with the pencil-wireframe-design-step skill if a new screen is being designed.'
);

console.log(lines.join('\n'));
