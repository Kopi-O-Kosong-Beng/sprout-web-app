/**
 * docs-sync.mjs — Documentation sync hook.
 * Trigger: PostToolUse on Edit|Write (automatic) — fires when setup-shaping
 * files change (package.json, .env.example, vite config, routes, deployment).
 * Emits a non-blocking reminder listing which docs may now be stale.
 * Never edits docs itself. Exit: always 0.
 */
import { emitPostToolContext, readStdinJson, repoRelative } from './hook-lib.mjs';

const rel = repoRelative(readStdinJson().tool_input?.file_path);
if (!rel) process.exit(0);

const triggers = [
  [/(^|\/)package\.json$/, 'README.md (setup/scripts) and FRONTEND_HANDOFF.md if client scripts changed'],
  [/^\.env\.example$/, 'README.md env-var section and FRONTEND_HANDOFF.md'],
  [/^client\/vite\.config\.ts$/, 'README.md dev-server notes (port 5173 is CORS-locked)'],
  [/^server\/routes\//, 'FRONTEND_HANDOFF.md endpoint list; requirements.md ONLY if the formal requirement changed'],
  [/^(render\.yaml|vercel\.json|DEPLOYMENT\.md)$/, 'DEPLOYMENT.md topology/env tables'],
  [/^client\/src\/App\.css$/, 'DESIGN.md if visual behavior diverged from it'],
];

const hits = triggers.filter(([re]) => re.test(rel)).map(([, doc]) => doc);
if (hits.length === 0) process.exit(0);

emitPostToolContext(
  `[docs hook] ${rel} changed — check whether these docs need a matching update (suggest, don't silently rewrite requirements.md):\n- ${hits.join('\n- ')}\n- tasks.md if ownership/status changed.`
);
