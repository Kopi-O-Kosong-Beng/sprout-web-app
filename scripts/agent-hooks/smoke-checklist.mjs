/**
 * smoke-checklist.mjs — Visual smoke-test hook.
 * Trigger: MANUAL/OPTIONAL, for frontend UI changes:
 *   node scripts/agent-hooks/smoke-checklist.mjs
 * Prints the browser smoke-test checklist. If browser/devtools tooling is
 * available to the agent, walk it for real; otherwise hand the list to the
 * human. Screenshots only when they add signal. Pixel-perfection is only in
 * scope when the task itself is visual polish.
 */
console.log(`[smoke hook] Browser smoke test (http://localhost:5173, devtools console open):

  [ ] Landing (/) renders; no console errors
  [ ] Nav links work; Archive + PVE Battle are greyed out when signed out
  [ ] Login with demo@sprout.app / Password123! lands back on the app signed in
  [ ] Reset-password flow reaches the OTP step (code appears in backend terminal when EMAIL_MODE=console)
  [ ] /archive renders the avatar grid; selecting a card updates the detail panel
  [ ] /battle: select -> Start PVE Match -> loading -> battle arena transition works
  [ ] /contact form renders; a valid submit returns an SPR-... reference number
  [ ] Console shows zero errors after the full pass
  [ ] Viewport check at 375px and 1440px: no horizontal scroll, nothing clipped

Report results in the final answer; a skipped row is reported as skipped.`);
