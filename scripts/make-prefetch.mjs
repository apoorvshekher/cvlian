/* Writes public/texlive/prefetch.json — which TeX files a compile reads, by
 * theme and by font — so the app can fetch them all at once instead of the
 * engine asking for each one with a blocking request (src/prefetch.ts).
 *
 * The list is measured, never written by hand: every theme × font × font
 * size is compiled from the sample in headless Chromium, with prefetching
 * and the service worker switched off, and every file the engine asks the
 * site for is recorded, found or missing. Run it again after vendoring TeX
 * files, adding a theme or font, or changing what the renderers load; the
 * smoke run fails when the sample's first compile has to fetch a file the
 * list lacks.
 *
 *   npm run make-prefetch      (builds first)
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, globSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright-core";
import { fontIds, fontSizes, themeIds } from "./tex-registry.mjs";

const DIST = new URL("../dist/", import.meta.url).pathname;
const OUT = new URL("../public/texlive/prefetch.json", import.meta.url).pathname;
const STORE_KEY = "resume-editor-store-v1";
const TEX = "/texlive/pdftex/";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml" };

function chromePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const hits = globSync(join(homedir(), ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"));
  if (!hits.length) throw new Error("No Chromium found; set PLAYWRIGHT_CHROMIUM");
  return hits.sort().at(-1);
}

function serveDist() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = join(DIST, path === "/" ? "index.html" : path.slice(1));
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

const intersect = (sets) => sets.reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
const sorted = (set) => [...set].sort();

async function main() {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("dist/ missing — run `npm run build` first");
  const { server, url } = await serveDist();
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });

  /* one prefetch-free context per compile: a fresh engine asks for everything */
  async function context() {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/texlive/prefetch.json", (r) => r.fulfill({ status: 404, body: "" }));
    return ctx;
  }

  /* the sample as the app itself stores it, to set each design on */
  let ctx = await context();
  let page = await ctx.newPage();
  await page.goto(url);
  await (await page.waitForSelector('.dbtn:has-text("Start writing")', { timeout: 30000 })).click();
  await page.waitForSelector(".status.ok", { timeout: 120000 });
  const sample = await page.evaluate((k) => localStorage.getItem(k), STORE_KEY);
  await ctx.close();

  async function record(design) {
    const store = JSON.parse(sample);
    for (const b of store.branches) b.data.design = { ...b.data.design, ...design };
    const ctx = await context();
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORE_KEY, JSON.stringify(store)]);
    const page = await ctx.newPage();
    const found = new Set();
    const missing = new Set();
    page.on("response", (r) => {
      const path = new URL(r.url()).pathname;
      if (r.request().method() !== "GET" || !path.includes(TEX)) return;
      const key = path.slice(path.indexOf(TEX) + TEX.length);
      if (r.status() === 200) found.add(key);
      else if (r.status() === 404) missing.add(key);
    });
    await page.goto(url);
    await (await page.waitForSelector('.dbtn:has-text("Continue as guest")', { timeout: 30000 })).click();
    const status = await page.waitForSelector(".status.ok, .status.err", { timeout: 120000 });
    if ((await status.getAttribute("class")).includes("err")) {
      throw new Error(`the sample did not compile with ${JSON.stringify(design)}`);
    }
    await ctx.close();
    return { found, missing };
  }

  const themes = themeIds();
  const fonts = fontIds();
  const sizes = fontSizes();
  const combos = themes.flatMap((theme) => fonts.flatMap((font) => sizes.map((fontSize) => ({ themeId: theme, font, fontSize }))));
  const results = new Map();
  /* a few at a time: each is a fresh engine doing real TeX work */
  for (let i = 0; i < combos.length; i += 4) {
    const batch = combos.slice(i, i + 4);
    const done = await Promise.all(batch.map(record));
    batch.forEach((c, j) => results.set(c, done[j]));
    process.stdout.write(`\rcompiled ${Math.min(i + 4, combos.length)}/${combos.length}`);
  }
  console.log();
  await browser.close();
  server.close();

  const all = [...results.entries()];
  const of = (pred) => all.filter(([c]) => pred(c)).map(([, r]) => r.found);
  const core = intersect(of(() => true));
  const byTheme = {};
  for (const t of themes) byTheme[t] = new Set([...intersect(of((c) => c.themeId === t))].filter((k) => !core.has(k)));
  const byFont = {};
  for (const f of fonts) {
    byFont[f] = new Set();
    for (const [c, r] of all) {
      if (c.font !== f) continue;
      for (const k of r.found) if (!core.has(k) && !byTheme[c.themeId].has(k)) byFont[f].add(k);
    }
  }
  const found = new Set(all.flatMap(([, r]) => [...r.found]));
  const missing = new Set(all.flatMap(([, r]) => [...r.missing]).filter((k) => !found.has(k)));

  const list = {
    about:
      "Written by `npm run make-prefetch` (scripts/make-prefetch.mjs) — do not edit by hand. " +
      "The TeX files a compile reads, keyed <kpse format>/<name> under texlive/pdftex/: a compile " +
      "fetches core + themes[its theme] + fonts[its font] in parallel before it starts, and tells the " +
      "engine that the names in missing are not on the site. See src/prefetch.ts.",
    core: sorted(core),
    themes: Object.fromEntries(themes.map((t) => [t, sorted(byTheme[t])])),
    fonts: Object.fromEntries(fonts.map((f) => [f, sorted(byFont[f])])),
    missing: sorted(missing),
  };
  await writeFile(OUT, JSON.stringify(list, null, 2) + "\n");

  const kb = (keys) => (keys.reduce((n, k) => n + statSync(join(DIST, TEX, k)).size, 0) / 1024).toFixed(0);
  console.log(`wrote ${OUT}`);
  console.log(`  core      ${list.core.length} files, ${kb(list.core)} KB`);
  for (const t of themes) console.log(`  theme ${t.padEnd(9)} +${list.themes[t].length} files, ${kb(list.themes[t])} KB`);
  for (const f of fonts) console.log(`  font  ${f.padEnd(9)} +${list.fonts[f].length} files, ${kb(list.fonts[f])} KB`);
  console.log(`  missing   ${list.missing.length} names the engine will not ask the site for`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
