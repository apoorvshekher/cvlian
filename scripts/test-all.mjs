/* The whole suite, in the order that keeps it honest. `npm test` runs this,
 * and so does CI before anything is published.
 *
 * Two orderings are load-bearing:
 *   - `import` and `legacy` load one-section fixtures, so they cannot follow
 *     a step that selects the nth section. Each gets its own process.
 *   - `check-sync-live` rebuilds dist with a stub Google client id, so it
 *     runs last and a deploy rebuilds afterwards with the real one.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const RUNS = [
  ["build + the sample compiles as plain static files", "npm", ["run", "smoke"]],
  ["every design control at its extremes", "node", ["scripts/smoke.mjs", "--steps", "design,fonts,themes"]],
  ["typing never compiles or saves; Ctrl+S does", "node", ["scripts/smoke.mjs", "--steps", "compile"]],
  ["beside the page: the check measures it, Look & feel lives there", "node", ["scripts/smoke.mjs", "--steps", "beside"]],
  ["every contact icon, and a URL full of TeX specials", "node", ["scripts/smoke.mjs", "--steps", "contacts"]],
  ["a new copy says where it came from; copy commands stick", "node", ["scripts/smoke.mjs", "--steps", "copies"]],
  ["additions travel to the master, rewordings do not", "node", ["scripts/smoke.mjs", "--steps", "master"]],
  ["it still typesets with the network off", "node", ["scripts/smoke.mjs", "--steps", "offline"]],
  ["an old-format export still loads; a hostile one runs no TeX; stray control characters compile", "node", ["scripts/smoke.mjs", "--steps", "import,injection,controls"]],
  ["an entry is all on one page or all on the next", "node", ["scripts/smoke.mjs", "--steps", "pagebreak"]],
  ["the pre-typed-fields upgrade reaches saved data", "node", ["scripts/smoke.mjs", "--steps", "legacy"]],
  ["the sync merge rules", "npm", ["run", "check-sync"]],
  ["the real app against a stubbed Drive", "npm", ["run", "check-sync-live"]],
];

let failed = 0;
for (const [label, cmd, args] of RUNS) {
  console.log(`\n\x1b[1m── ${label}\x1b[0m`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    failed++;
    console.error(`\x1b[31mFAILED: ${label}\x1b[0m`);
    break; // a broken build makes every later run meaningless
  }
}

if (failed) {
  console.error("\nsuite failed");
  process.exit(1);
}
console.log(`\n\x1b[32mall ${RUNS.length} runs passed\x1b[0m`);
