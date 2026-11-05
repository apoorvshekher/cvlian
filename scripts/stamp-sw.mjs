/* Stamps dist/sw.js with a build id derived from what was actually built.
 *
 * This runs as part of `npm run build`, so the cache name changes whenever
 * any shipped byte changes and a deploy can never be served out of a
 * previous deploy's cache. Doing it by hand would work exactly until the
 * once somebody forgot, and on a static host a stuck cache has no remedy.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/* sw.js is hashed too, in the un-stamped state it is in right now — a change
 * to the worker's own rules has to retire the cache those rules filled.
 * Reading it before writing it is what keeps that free of a chicken-and-egg:
 * vite empties dist on every build, so this is always the pristine copy. */
const files = (await walk(DIST)).sort();
const h = createHash("sha256");
for (const f of files) h.update(f.slice(DIST.length)).update(await readFile(f));
const build = h.digest("hex").slice(0, 12);

/* What a visit needs before it can do anything at all: the page, its hashed
 * bundles, the icon, the sample résumé and the WASM engine. Everything under
 * texlive/ is left out on purpose — see the note in sw.js — and so is PDF.js
 * (assets/pdfjs/, named in vite.config.ts): half a megabyte that only a
 * browser with no PDF viewer of its own ever loads, cached when it does. */
const shell = files
  .map((f) => f.slice(DIST.length + 1).split(sep).join("/"))
  .filter((f) => f === "index.html" || f.startsWith("assets/") || f === "icon.svg" || f === "sample.json" || f.startsWith("swiftlatexpdftex."))
  .filter((f) => !f.startsWith("assets/pdfjs/"))
  .filter((f) => !f.endsWith(".map"));

const sw = join(DIST, "sw.js");
const src = await readFile(sw, "utf8");
for (const token of ["__BUILD__", "__SHELL__"]) {
  if (!src.includes(token)) throw new Error(`dist/sw.js has no ${token} placeholder to stamp`);
}
await writeFile(sw, src.replace("__BUILD__", build).replace("__SHELL__", JSON.stringify(shell)));
console.log(`stamped dist/sw.js with build ${build} (${files.length} files, ${shell.length} precached)`);
