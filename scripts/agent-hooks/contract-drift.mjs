/**
 * contract-drift.mjs — API contract drift hook.
 * Trigger: PostToolUse on Edit|Write (automatic) — fires only when a
 * frontend API-client file or backend route/controller file changed.
 * Emits a short non-blocking checklist as extra context for the agent.
 * It never rewrites contracts itself. Exit: always 0.
 */
import { emitPostToolContext, readStdinJson, repoRelative } from './hook-lib.mjs';

const CONTRACT_FILE =
  /^(client\/src\/services\/.+\.ts|server\/(routes|controllers)\/.+\.ts)$/;

const rel = repoRelative(readStdinJson().tool_input?.file_path);
if (!rel || !CONTRACT_FILE.test(rel)) process.exit(0);

const side = rel.startsWith('client/') ? 'frontend API client' : 'backend route/controller';
emitPostToolContext(
  `[contract hook] ${rel} (${side}) changed — verify before finishing:
- Frontend service methods still match backend routes (method, path, params).
- Request/response fields match requirements.md and the Supertest assertions.
- Error strings shown in the UI still match the backend's exact strings (409/400 messages are matched verbatim in the client).
- Auth requirement documented: which routes need Authorization vs x-dev-uid vs public.
- If the contract genuinely changed: update FRONTEND_HANDOFF.md and the tests that assert the old shape.`
);
