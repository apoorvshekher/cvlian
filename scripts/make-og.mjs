/* Renders the social card to public/og.png.
 *
 * The card is a build artefact, not a hand-drawn asset: it is generated from
 * the same tokens the app uses, with the headless Chromium the test suite
 * already needs, so it cannot drift from the product's own colours. Run it
 * again after changing the wordmark or the palette:
 *
 *   node scripts/make-og.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function chromePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const hits = globSync(join(homedir(), ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"));
  if (!hits.length) throw new Error("No Chromium found; set PLAYWRIGHT_CHROMIUM");
  return hits.sort().at(-1);
}

/* the vendored interface font, embedded — the card must render identically
 * whether or not the machine building it has a network */
const FIGTREE = (await readFile(join(ROOT, "src/fonts/figtree-latin.woff2"))).toString("base64");

const CARD = `<!doctype html><meta charset="utf-8"><style>
  @font-face {
    font-family: "Figtree"; font-style: normal; font-weight: 100 900;
    src: url(data:font/woff2;base64,${FIGTREE}) format("woff2");
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; display: flex; align-items: center; gap: 64px;
    padding: 0 76px; background: #faf8f5; color: #1b1a17;
    font-family: "Figtree", ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased; overflow: hidden;
  }
  .left { display: flex; flex-direction: column; gap: 24px; flex: 1; min-width: 0; }
  .mark { display: flex; align-items: center; gap: 15px; }
  .mark .sq { width: 44px; height: 44px; border-radius: 12px; background: #2f7a5f; position: relative; }
  .mark .sq i { position: absolute; left: 11px; right: 11px; height: 3.5px; border-radius: 2px; background: #fff; }
  .mark .sq i:nth-child(1) { top: 12px; }
  .mark .sq i:nth-child(2) { top: 20.5px; }
  .mark .sq i:nth-child(3) { top: 29px; right: 19px; }
  .mark b { font-size: 29px; font-weight: 600; letter-spacing: -0.015em; }
  .mark b em { font-style: normal; color: #2f7a5f; }
  h1 { font-size: 58px; line-height: 1.09; font-weight: 600; letter-spacing: -0.032em; }
  p { font-size: 24px; line-height: 1.45; color: #5c584f; max-width: 24ch; }
  .feet { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 2px; }
  .feet span {
    font-size: 17px; font-weight: 500; color: #24614b;
    background: #e9f2ee; border: 1px solid #bcd8cd; border-radius: 999px; padding: 8px 16px;
  }

  /* the page it makes, at a glance — the same shape the editor previews */
  .page {
    width: 340px; height: 440px; flex: none; padding: 30px 28px;
    background: #fff; border: 1px solid #e8e3da; border-radius: 6px;
    box-shadow: 0 18px 40px rgba(27, 26, 23, 0.10);
    display: flex; flex-direction: column; gap: 13px;
    transform: rotate(2deg);
  }
  .page .nm { height: 15px; width: 56%; border-radius: 3px; background: #1b1a17; }
  .page .ct { height: 6px; width: 74%; border-radius: 3px; background: #d8d1c4; margin-top: -5px; }
  .page .h { height: 7px; width: 36%; border-radius: 3px; background: #2f7a5f; margin-top: 7px; }
  .page .rule { height: 1px; background: #e8e3da; margin-top: -6px; }
  .page .l { height: 5px; border-radius: 3px; background: #e2ddd3; }
  .page .l.b { background: #c9c3b6; width: 62%; }
</style>
<div class="left">
  <div class="mark"><span class="sq"><i></i><i></i><i></i></span><b>CV<em>Lian</em></b></div>
  <h1>A résumé editor<br/>that needs no server.</h1>
  <p>Real LaTeX, typeset in your browser. Your words never leave your machine.</p>
  <div class="feet"><span>No account</span><span>No backend</span><span>Free forever</span></div>
</div>
<div class="page">
  <div class="nm"></div><div class="ct"></div>
  <div class="h"></div><div class="rule"></div>
  <div class="l b"></div><div class="l"></div><div class="l" style="width:88%"></div>
  <div class="h"></div><div class="rule"></div>
  <div class="l b"></div><div class="l"></div><div class="l" style="width:92%"></div>
  <div class="l" style="width:70%"></div>
  <div class="h"></div><div class="rule"></div>
  <div class="l b"></div><div class="l" style="width:84%"></div>
</div>`;

const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
await page.setContent(CARD, { waitUntil: "load" });
await page.waitForTimeout(400);
await writeFile(join(ROOT, "public/og.png"), await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } }));
await browser.close();
console.log("wrote public/og.png");
