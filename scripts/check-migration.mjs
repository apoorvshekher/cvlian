/* Renders a resume JSON twice — with the pre-typed-fields upgrade off and
 * on — and diffs the LaTeX. The upgrade is only allowed to change the
 * document where we intend it to, so this is the gate for touching the
 * parser in storage.ts.
 *
 *   node scripts/check-migration.mjs resume.json
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = process.argv[2] ?? "public/sample.json";
const out = mkdtempSync(join(tmpdir(), "mig-"));
try {
  execFileSync("npx", ["tsc", "src/storage.ts", "src/render.ts", "--outDir", out,
    "--module", "commonjs", "--target", "es2022", "--skipLibCheck"], { stdio: "pipe" });
} catch { /* tsc emits despite type noise from the DOM-free context */ }

const require = createRequire(import.meta.url);
const { normalizeData } = require(join(out, "storage.js"));
const { renderTex } = require(join(out, "render.js"));
const raw = JSON.parse(readFileSync(file, "utf8"));

const before = renderTex(normalizeData(raw, { upgrade: false }));
const after = renderTex(normalizeData(raw));
writeFileSync(join(out, "before.tex"), before);
writeFileSync(join(out, "after.tex"), after);

const kinds = normalizeData(raw).sections.map((s) => `${s.title} -> ${s.kind}`);
console.log("sections:\n  " + kinds.join("\n  "));

if (before === after) {
  console.log("\nLaTeX identical — the upgrade changes nothing in the PDF.");
} else {
  const a = before.split("\n");
  const b = after.split("\n");
  const diff = [];
  for (let i = 0, j = 0; i < a.length || j < b.length; ) {
    if (a[i] === b[j]) { i++; j++; continue; }
    const nextMatch = b.indexOf(a[i], j);
    if (nextMatch === -1) { diff.push(["-", a[i++]]); }
    else { while (j < nextMatch) diff.push(["+", b[j++]]); }
    if (diff.length > 400) break;
  }
  console.log(`\nLaTeX differs (${diff.length} changed lines):`);
  for (const [sign, line] of diff) console.log(`  ${sign} ${line.trim().slice(0, 120)}`);
  console.log(`\nfull files: ${out}/before.tex ${out}/after.tex`);
  process.exitCode = 1;
}
