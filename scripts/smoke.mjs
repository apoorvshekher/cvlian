/* Headless smoke check: serves dist/ as plain static files (exactly what
 * GitHub Pages does), drives the app in headless Chromium, and fails on any
 * unexpected HTTP error or a compile that doesn't finish.
 *
 *   npm run smoke                     build is up to you; serves ./dist
 *   node scripts/smoke.mjs --url X    check a live deployment instead
 *   node scripts/smoke.mjs --steps a,b  run extra named steps (see STEPS)
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { globSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright-core";
import { fontIds, themeIds } from "./tex-registry.mjs";

const DIST = new URL("../dist/", import.meta.url).pathname;
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

// Optional file probes the TeX engine makes that 404 harmlessly. `main.aux`
// is the job's own aux: on a first pass it does not exist yet, so the engine
// asks the network for it. It is never vendored — a stray copy once sat in
// public/texlive, gitignored by `*.aux`, so the suite passed locally and
// failed in CI, while every first pass read another document's labels.
const HARMLESS_404 = /\.(cfg|dfu|vf)$|\/main\.aux$/;

/* texlive/prefetch.json against the files actually in the build. A listed
 * file the site lacks is a 404 on every first visit; a name listed as
 * missing that has since been vendored is worse — the engine is told it is
 * not there and never reads it, with no error anywhere. */
function prefetchListProblems() {
  const stale = (why) => `texlive/prefetch.json ${why} — run \`npm run make-prefetch\``;
  const file = join(DIST, "texlive/prefetch.json");
  if (!existsSync(file)) return [stale("is missing from the build")];
  const list = JSON.parse(readFileSync(file, "utf8"));
  const has = (key) => existsSync(join(DIST, "texlive/pdftex", key));
  const out = [];
  for (const t of themeIds()) if (!list.themes?.[t]) out.push(stale(`has no entry for theme "${t}"`));
  for (const f of fontIds()) if (!list.fonts?.[f]) out.push(stale(`has no entry for font "${f}"`));
  const listed = [list.core ?? [], ...Object.values(list.themes ?? {}), ...Object.values(list.fonts ?? {})].flat();
  for (const k of listed) if (!has(k)) out.push(stale(`lists ${k}, which the site does not have`));
  for (const k of list.missing ?? []) if (has(k)) out.push(stale(`says ${k} is missing, but it is vendored now`));
  return out;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

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

/* Named extra steps; each gets ({page, check, recompile}) and should drive
 * the UI to a state where the compile status shows ✓ again. */
async function openDesign(page) {
  await page.click('.rrow:has-text("Look")');
  await page.waitForSelector(".thumbs .thumb", { timeout: 10000 });
}

/* The layout picker is three little pictures now, and the centimetre
 * sliders live behind Fine-tune. */
async function pickTheme(page, name) {
  await page.click(`.thumb:has-text("${name}")`);
}

async function openFineTune(page) {
  if (!(await page.locator(".fold.open").count())) await page.click(".fold");
  await page.waitForSelector('input[name="margins"]', { timeout: 10000 });
}

/* A PDF's text with every compressed stream opened, so link annotations
 * (which pdfTeX packs into object streams) can be read as plain strings. */
function pdfText(buf) {
  const raw = buf.toString("latin1");
  const parts = [raw];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      parts.push(inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"));
    } catch { /* not deflated — already in raw */ }
  }
  return parts.join("\n");
}

/* Which page each link in a PDF sits on: a link annotation belongs to the
 * page it is drawn on, so this is the one thing in the file that says where
 * a piece of text landed. pdfTeX keeps pages and annotations in compressed
 * object streams, so those are unpacked first. */
function linkPages(buf) {
  const raw = buf.toString("latin1");
  const objs = new Map();
  for (const m of raw.matchAll(/(\d+) 0 obj\s*((?:(?!endobj)[\s\S])*?)endobj/g)) objs.set(Number(m[1]), m[2]);
  for (const m of raw.matchAll(/obj\s*(<<(?:(?!endobj)[\s\S])*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (!/\/Type\s*\/ObjStm/.test(m[1])) continue;
    const n = Number(/\/N\s+(\d+)/.exec(m[1])[1]);
    const first = Number(/\/First\s+(\d+)/.exec(m[1])[1]);
    const body = inflateSync(Buffer.from(m[2], "latin1")).toString("latin1");
    const head = body.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const end = i + 1 < n ? head[2 * i + 3] : body.length - first;
      objs.set(head[2 * i], body.slice(first + head[2 * i + 1], first + end));
    }
  }
  const refs = (s) => [...s.matchAll(/(\d+)\s+0\s+R/g)].map((r) => Number(r[1]));
  const kids = [...objs.values()].find((o) => /\/Type\s*\/Pages\b/.test(o) && /\/Kids/.test(o));
  const pages = refs(/\/Kids\s*\[([^\]]*)\]/.exec(kids)[1]);
  const where = new Map();
  pages.forEach((id, i) => {
    const annots = /\/Annots\s*\[([^\]]*)\]/.exec(objs.get(id) ?? "");
    for (const a of annots ? refs(annots[1]) : []) {
      const uri = /\/URI\s*\(((?:\\.|[^\\)])*)\)/.exec(objs.get(a) ?? "");
      if (uri) where.set(uri[1], i + 1);
    }
  });
  return { pages: pages.length, where };
}

/* Select the nth content section in the rail and return its pane. */
async function openSection(page, n) {
  await page.click(`.rail-list .rrow:not(.pinned) >> nth=${n}`);
  await page.waitForSelector(".pane-head .ptitle", { timeout: 10000 });
}

const STEPS = {
  /* The offline promise, which is the whole point of shipping a service
   * worker: once a résumé has been built once, the app must go on building
   * it with the network off. Nothing else in the suite would notice this
   * breaking — every other step has a server sitting right there.
   *
   * The first load of a first visit runs before the worker controls
   * anything, so the sequence is deliberate: one more *online* pass to get
   * a fully-controlled load and a compile that fills the TeX cache, and only
   * then the network is cut. That is also the honest claim to make to a
   * user — it works offline after it has worked once. */
  async offline({ page, check }) {
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, { timeout: 20000 });
    console.log("ok: the service worker took control of the page");

    const enter = async () => {
      const door = await page
        .waitForSelector('.dbtn:has-text("Continue as guest"), .dbtn:has-text("Start writing")', { timeout: 15000 })
        .catch(() => null);
      if (door) await door.click();
    };

    /* an online, worker-controlled pass: this is what fills the cache */
    await page.reload({ waitUntil: "domcontentloaded" });
    await enter();
    await check("a controlled reload still compiles");

    await page.context().setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await enter();
      await page.waitForSelector(".status.ok", { timeout: 120000 });
      console.log("ok: with the network off, the page still loads and still typesets");
    } finally {
      await page.context().setOffline(false);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await enter();
    await check("and it comes back online none the wiser");
  },

  /* Compiling is manual, and it is also what saves. Three things follow that
   * nothing else can check: typing alone must never build the page, the
   * workspace must not reach localStorage until a compile finishes, and the
   * preview must still swap frames rather than blink. */
  async compile({ page }) {
    const cls = () => page.$eval(".status", (el) => [...el.classList].join(" "));
    const stored = () => page.evaluate(() => localStorage.getItem("resume-editor-store-v1"));
    const frontSrc = () =>
      page.$eval(".pdf-page:not(.pdf-incoming)", (el) => el.getAttribute("src")).catch(() => null);

    await openSection(page, 0);
    const title = page.locator(".pane-head .ptitle");
    await title.click();

    const before = await frontSrc();
    const savedBefore = await stored();
    await title.pressSequentially("XYZ", { delay: 80 });

    /* four seconds is twice the old debounce: nothing may happen on its own */
    await page.waitForTimeout(4000);
    if (!(await cls()).includes("dirty")) {
      throw new Error("typing did not leave the editor showing unsaved work");
    }
    if ((await frontSrc()) !== before) throw new Error("the page rebuilt itself without being asked");
    if ((await stored()) !== savedBefore) {
      throw new Error("typing reached localStorage — compiling is supposed to be the save point");
    }
    console.log("ok: typing alone neither compiles nor saves");

    await page.keyboard.press("Control+s");
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    if ((await stored()) === savedBefore) throw new Error("a finished compile did not save the workspace");
    const after = await frontSrc();
    if (!after || after === before) throw new Error("the visible frame never picked up the compile");
    console.log("ok: Ctrl+S compiles, and the compile is what saves");

    /* and the button does the same thing */
    await title.pressSequentially("!", { delay: 60 });
    await page.waitForTimeout(500);
    const savedMid = await stored();
    await page.click('.btn:has-text("Compile")');
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    if ((await stored()) === savedMid) throw new Error("the Compile button did not save");
    console.log("ok: the Compile button does the same as Ctrl+S");

    await page.waitForTimeout(1500);
    if (await page.locator(".pdf-incoming").count()) {
      throw new Error("the preview frames are still loading each other after settling");
    }
    console.log("ok: the preview swapped frames and stayed settled on one");
  },

  /* Exercise every design control at its extremes; any missing vendored
   * TeX file (size11.clo, Charter bold-italic, ...) fails the compile. */
  async design({ page, recompile }) {
    // *italic* inside a \bfseries section title exercises Charter bold-italic
    await openSection(page, 1);
    await page.fill(".pane-head .ptitle", "Education *and* Training");
    await recompile("bold-italic section title");

    await openDesign(page);
    for (const size of ["11", "12"]) {
      await page.click(`[data-seg="fontSize"] [data-v="${size}"]`);
      await recompile(`${size}pt`);
    }
    await page.click('[data-seg="paper"] [data-v="a4"]');
    await recompile("A4 paper");
    await page.fill('input[type="color"]', "#1a56a0");
    await recompile("custom accent");
    await openFineTune(page);
    for (const [name, value] of [["margins", "1"], ["density", "0.75"], ["density", "1.5"], ["nameSize", "32"], ["dateColWidth", "3"]]) {
      await page.fill(`input[name="${name}"]`, value);
      await recompile(`${name}=${value}`);
    }
  },

  /* Old exports (string bullets, no ids/kinds/design) must import + compile. */
  async import({ page }) {
    const fixture = new URL("./fixtures/old-export.json", import.meta.url).pathname;
    await page.setInputFiles('.actions input[type="file"]', fixture);
    await page.waitForSelector(".status.busy", { timeout: 15000 }).catch(() => {});
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    console.log("ok: old-format import compiles");
  },

  /* An imported file is someone else's words, and none of them may reach TeX
   * as anything but text. Two holes let them: the contact icon went into
   * \faIcon{…} raw, and TeX turns "^^7d" into "}" and "^^5c" into "\" while
   * it reads, so a URL with no brace or backslash in it could still close
   * \href's argument and run any pdfTeX primitive — a link, a catalog entry,
   * JavaScript — in the PDF someone then sends out, all under "Compiled and
   * saved". The fixture spells its marker "^^50WNED", so "PWNED" is in the
   * PDF only if TeX decoded it: only if the payload ran. */
  async injection({ page }) {
    const fixture = new URL("./fixtures/tex-injection.json", import.meta.url).pathname;
    await page.setInputFiles('.actions input[type="file"]', fixture);
    await page.waitForSelector(".status.busy", { timeout: 15000 }).catch(() => {});
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('.btn:has-text("PDF")')]);
    const pdf = pdfText(await readFile(await dl.path()));
    /* the page built is the fixture's, or the rest of this proves nothing */
    if (!/\/URI\s*\(https:\/\/ok\.example\//.test(pdf)) {
      throw new Error("the PDF is not the imported résumé's — its links are missing");
    }
    const ran = [...new Set([...pdf.matchAll(/PWNED[\w-]*|attacker\.example/g)].map((m) => m[0]))];
    if (ran.length) throw new Error(`an imported file ran TeX in the PDF: ${ran.join(", ")}`);
    console.log("ok: an imported icon, contact link, entry link and prose link run no TeX");
  },

  /* Characters no font sets each stopped the compile outright: PowerPoint's
   * soft return (a vertical tab, which comes along on a paste), NUL, ESC, DEL,
   * a form feed, U+2028, and a blank line inside a one-line field (a \par in
   * the PDF title's package option). esc() drops them or reads them as a
   * space, and escUrl() drops them from a link the way a browser does. */
  async controls({ page }) {
    const fixture = new URL("./fixtures/control-chars.json", import.meta.url).pathname;
    await page.setInputFiles('.actions input[type="file"]', fixture);
    await page.waitForSelector(".status.busy", { timeout: 15000 }).catch(() => {});
    const status = await page.waitForSelector(".status.ok, .status.err", { timeout: 120000 });
    if (/\berr\b/.test(await status.getAttribute("class"))) {
      throw new Error("control characters in an imported résumé stopped the compile");
    }
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('.btn:has-text("PDF")')]);
    const pdf = pdfText(await readFile(await dl.path()));
    if (!/\/URI\s*\(https:\/\/ok\.example\/broken-line\)/.test(pdf)) {
      throw new Error("a link with a newline and a tab in it did not come out whole");
    }
    console.log("ok: control characters and stray blank lines compile, and a link sheds them");
  },

  /* The column beside the page. Check measures the compiled page — TeX says
   * how many pages and how much of the last one is used — and flags only
   * what the data can be sure of, each flag a way to the section. Look is the
   * design card, which used to take the editor's place; the rail's row now
   * opens it here. It starts folded where it would squeeze the page, and
   * stays the way it was left. */
  async beside({ page }) {
    if (!(await page.locator(".beside.folded").count())) {
      throw new Error("at 1280px wide the panel should start folded, not squeeze the page");
    }
    await page.click('.beside.folded [aria-label="Check the page"]');
    await page.waitForSelector(".pcheck .ck-big", { timeout: 10000 });
    const card = (await page.innerText(".ck-card")).replace(/\s+/g, " ").trim();
    if (!/^1 page/.test(card) || !/\d+ lines? to spare/.test(card)) {
      throw new Error(`the page check did not measure the sample: "${card}"`);
    }
    console.log(`ok: the page check measures the compiled page — "${card}"`);

    await page.click('button:has-text("Start empty")');
    await page.waitForSelector(".ck-note", { timeout: 5000 });
    const flags = await page.$$eval(".ck-flag b", (bs) => bs.map((b) => b.textContent));
    if (!flags.includes("Education is empty")) {
      throw new Error(`an empty section was not flagged: ${JSON.stringify(flags)}`);
    }
    await page.click('.ck-flag:has-text("Education is empty")');
    await page.waitForTimeout(300);
    if ((await page.inputValue(".pane-head .ptitle")) !== "Education") {
      throw new Error("a flag did not take the editor to its section");
    }
    console.log("ok: edits mark the figures stale, an empty section is flagged, and the flag goes to it");

    await page.click(".bs-fold");
    await page.waitForSelector(".beside.folded", { timeout: 5000 });
    await page.click('.rrow:has-text("Look")');
    await page.waitForSelector(".beside .thumbs .thumb", { timeout: 5000 });
    if (!/Look/.test(await page.textContent(".bs-tab.on"))) throw new Error("the rail's Look & feel did not open the Look tab");
    console.log("ok: the rail's Look & feel opens the Look tab beside the page, folded or not");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.click('.dbtn:has-text("Continue as guest")');
    await page.waitForSelector(".beside", { timeout: 60000 });
    if ((await page.locator(".beside.folded").count()) || !/Look/.test(await page.textContent(".bs-tab.on"))) {
      throw new Error("the panel did not come back the way it was left");
    }
    console.log("ok: the panel stays the way it was left");
  },

  /* An entry is all on one page or all on the next. The page used to break
   * anywhere inside one — between its bullets, or between a project's title
   * and its description, which paracol sets in columns of its own and breaks
   * whatever any penalty says. Every part of every project here is a link,
   * and a link annotation belongs to the page it is on, so the PDF itself
   * says where each part landed. */
  async pagebreak({ page, recompile }) {
    const words = "built and shipped a small service that answers every request across the whole cluster within budget";
    const none = { month: "", year: "" };
    const yr = (y) => ({ month: "Jan", year: String(y) });
    const linked = (n, bullets, dated, desc) => ({
      kind: "project", name: `Title${n} Project`, link: `https://t.example/${n}`,
      description: `[Desc${n}](https://d.example/${n}) ${desc}`, stack: "",
      start: dated ? yr(2020) : none, end: dated ? yr(2021) : none, current: false,
      bullets: Array.from({ length: bullets }, (_, i) => ({ text: `[P${n}B${i + 1}](https://b.example/${n}-${i + 1}) ${words}` })),
    });
    const job = (n, bullets, twice) => ({
      kind: "experience", role: `Role${n} Engineer`, company: `Company${n}`, location: "Remote",
      start: yr(2018), end: yr(2020), current: false,
      bullets: Array.from({ length: bullets }, (_, i) => ({ text: `E${n}B${i + 1} ${words}${twice ? " " + words : ""}` })),
    });
    const resume = (profile, jobs, projects) => ({
      personal: { name: "Page Breaks", contacts: [{ text: "a@example.com", url: "mailto:a@example.com", icon: "" }] },
      sections: [
        { title: "Profile", kind: "paragraph", entries: [{ kind: "paragraph", text: `${words} `.repeat(profile) }] },
        { title: "Experience", kind: "experience", entries: jobs },
        { title: "Projects", kind: "project", entries: projects },
      ],
    });
    /* Two shapes, each tuned so that some entry breaks across pages without
       the fix: projects with dates and bullets, where the page used to break
       between bullets or after the two-column head; and what a real list
       holds — a title and a description, nothing else — which still split
       after the dated ones held together. */
    const shapes = [
      ["dated projects with bullets", 8, resume(3, [1, 2, 3].map((n) => job(n, 4, true)),
        Array.from({ length: 8 }, (_, i) => linked(i + 1, 2 + ((i + 1) % 2), true, "of what it does")))],
      ["a title and a description", 14, resume(4, [1, 2, 3].map((n) => job(n, 3, true)),
        Array.from({ length: 14 }, (_, i) => {
          const n = i + 1;
          return n % 4 === 0 ? linked(n, 2, true, "of what it does") : linked(n, 0, false, `${words}${n % 2 ? " " + words : ""}`);
        }))],
    ];

    for (const [label, count, doc] of shapes) {
      const file = join(mkdtempSync(join(tmpdir(), "pagebreak-")), "page-breaks.json");
      await writeFile(file, JSON.stringify(doc));
      await page.setInputFiles('.actions input[type="file"]', file);
      await page.waitForSelector(".status.busy", { timeout: 15000 }).catch(() => {});
      await page.waitForSelector(".status.ok", { timeout: 120000 });
      for (const theme of ["Classic", "Banner", "Sidebar"]) {
        await openDesign(page);
        await pickTheme(page, theme);
        await recompile(`page breaks, ${label}, ${theme}`);
        const [dl] = await Promise.all([page.waitForEvent("download"), page.click('.btn:has-text("PDF")')]);
        const { pages, where } = linkPages(await readFile(await dl.path()));
        if (pages < 2 || where.size < 2 * count) {
          throw new Error(`${label}, ${theme}: ${pages} page(s), ${where.size} links — the fixture no longer tests a page break`);
        }
        const split = Array.from({ length: count }, (_, i) => i + 1).filter((n) => {
          const on = [...where].filter(([uri]) => new RegExp(`\\.example/${n}(-|$)`).test(uri)).map(([, p]) => p);
          return new Set(on).size > 1;
        });
        if (split.length) throw new Error(`${label}, ${theme}: project ${split.join(", ")} split across pages`);
      }
    }
    console.log("ok: no entry is split across pages, in any theme");
  },

  /* A résumé saved before typed fields has to reach those fields, and a
   * section someone keeps as Custom has to stay Custom. Both hang off the
   * same line: "standard" is a real choice AND the value older builds wrote
   * when they could not tell, so only an unstamped document gets re-read. */
  async legacy({ page }) {
    const fixture = new URL("./fixtures/stale-standard.json", import.meta.url).pathname;
    const openFirstEntry = async () => {
      await page.click('.rrow:has-text("Experience")');
      await page.waitForSelector(".pane-head .ptitle", { timeout: 10000 });
      await page.click(".entry-head >> nth=0");
      await page.waitForTimeout(200);
      return page.$$eval(".entry-body label", (es) => es.map((e) => e.textContent.trim()).join(" "));
    };
    const switchTo = async (name) => {
      await page.click(".docchip");
      await page.waitForSelector(".sheet", { timeout: 10000 });
      /* looking at a copy is NOT switching to it — that is the whole point */
      await page.click(`.ccard:has-text("${name}")`);
      await page.click('.btn:has-text("Edit this one")');
      await page.waitForSelector(".sheet", { state: "hidden", timeout: 10000 });
      await page.waitForTimeout(200);
    };

    /* import switches to the first branch in the file, so this one is live */
    await page.setInputFiles('.actions input[type="file"]', fixture);
    await page.waitForSelector(".status.ok", { timeout: 120000 });

    const upgraded = await openFirstEntry();
    if (!/Role/.test(upgraded) || !/Company/.test(upgraded)) {
      throw new Error("a résumé from before typed fields never reached them: " + upgraded.slice(0, 90));
    }
    console.log("ok: an unstamped résumé reaches its typed fields");

    await switchTo("Custom on purpose");
    const kept = await openFirstEntry();
    if (!/Content/.test(kept)) {
      throw new Error("a section deliberately left as Custom was converted anyway: " + kept.slice(0, 90));
    }
    console.log("ok: a section kept as Custom stays Custom");
  },

  /* Compile with each font family, with bold-italic + name-size in play. */
  async fonts({ page, recompile }) {
    await openSection(page, 1);
    await page.fill(".pane-head .ptitle", "Education *and* Training");
    await openDesign(page);
    for (const font of ["Latin Modern", "Palatino", "Times", "Charter"]) {
      await page.click(`.spec:has-text("${font}")`);
      await recompile(`font ${font}`);
    }
  },

  /* The sync panel has to be honest in both builds: with a client id it
   * offers a connect button, without one it says why it cannot. */
  async sync({ page }) {
    await page.click(".docchip");
    await page.waitForSelector(".sh-foot", { timeout: 10000 });
    const text = await page.textContent(".sh-foot");
    const hasConnect = !!(await page.$('.btn:has-text("Sign in with Google")'));

    if (/signing in is off/i.test(text)) {
      if (hasConnect) throw new Error("offered to connect with no client id configured");
      console.log("ok: the panel explains itself without a client id");
    } else if (hasConnect) {
      if (!/working as a guest/i.test(text)) {
        throw new Error("configured panel did not show a status: " + text.slice(0, 120));
      }
      console.log("ok: the panel offers Drive with a client id configured");
    } else {
      throw new Error("panel showed neither a reason nor a way to connect: " + text.slice(0, 120));
    }
    await page.click(".sh-head .icobtn");
  },

  /* Both fields that reach LaTeX unescaped, in one compile: every icon the
   * picker offers, and a URL carrying the characters that used to take the
   * whole build down (% ends a TeX line, # is a parameter character). */
  async contacts({ page, recompile }) {
    const LABELS = ["Email", "Phone", "Website", "Location", "LinkedIn", "GitHub", "GitLab", "ORCID", "Other link"];
    await page.click('.rrow:has-text("Your details")');
    await page.waitForSelector(".contact-row", { timeout: 10000 });

    while ((await page.locator(".contact-row").count()) < LABELS.length) {
      await page.click('.add-btn:has-text("Add a way")');
    }
    for (let i = 0; i < LABELS.length; i++) {
      const row = page.locator(".contact-row").nth(i);
      await row.locator(".ip-btn").click();
      await page.click(`.ip-grid button:has-text("${LABELS[i]}")`);
      await row.locator(".c-line input").nth(0).fill(LABELS[i]);
    }
    await recompile("every contact icon in the picker");

    await page.locator(".contact-row").nth(0).locator(".c-line input").nth(1)
      .fill("https://example.com/a%20b?x=1&y=2#frag_ment~here");
    await recompile("a link carrying % # & _ ~");

    /* "Goes to" takes whatever is typed, and hyperref reads a target with no
       scheme as a local file: "linkedin.com/in/x" pointed at linkedin.com/in/x.pdf
       and printed in file-link cyan instead of the accent. Only the PDF shows it. */
    await page.locator(".contact-row").nth(1).locator(".c-line input").nth(1).fill("example.com/no-scheme");
    await recompile("a link typed without https://");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click('.btn:has-text("PDF")')]);
    const pdf = pdfText(await readFile(await dl.path()));
    if (!/\/URI\s*\(https:\/\/example\.com\/no-scheme\)/.test(pdf) || /\/GoToR\b/.test(pdf)) {
      throw new Error("a link typed without https:// became a link to a local file");
    }
    console.log("ok: a link typed without https:// still goes to the web");
  },

  /* The sheet is the only place copies are operated, and three promises live
   * there that nothing else can check: a new copy says where it came from,
   * looking at a copy is not switching to it, and every command in it sticks
   * the moment it is given — a copy made, renamed or deleted must not wait
   * for a compile the way typing does, or a reload quietly undoes it. */
  async copies({ page, recompile }) {
    const sheet = async () => {
      if (!(await page.locator(".sheet").count())) await page.click(".docchip");
      await page.waitForSelector(".sheet", { timeout: 10000 });
    };
    const close = async () => {
      if (await page.locator(".sheet").count()) await page.click(".sh-head .icobtn");
      await page.waitForSelector(".sheet", { state: "hidden", timeout: 10000 });
    };
    /* what a reload would actually find */
    const storedNames = () => page.evaluate(() => {
      const raw = localStorage.getItem("resume-editor-store-v1");
      return raw ? JSON.parse(raw).branches.map((b) => b.name) : [];
    });

    await sheet();
    await page.click('.cadd:has-text("Tailor one for a job")');
    await page.fill(".inline-name input", "Data Scientist");
    await page.click(".inline-name .hact.primary");
    await page.waitForSelector('.ccard:has-text("Data Scientist")', { timeout: 10000 });
    const from = await page.textContent('.ccard:has-text("Data Scientist") .cfrom');
    if (!/Made from Master/.test(from ?? "")) {
      throw new Error(`a new copy does not say where it came from: "${from}"`);
    }
    if (!(await storedNames()).includes("Data Scientist")) {
      throw new Error("making a copy did not reach storage — a reload would lose it");
    }
    console.log('ok: a new copy says "Made from Master", and is saved the moment it is made');

    /* making it switched the editor to it; reading the master must not switch back */
    await page.click(".ccard:has(.mtag)");
    await page.waitForSelector('.dt-head .btn:has-text("Edit this one")', { timeout: 10000 });
    if (!/Data Scientist/.test(await page.textContent(".docchip .dc-copy"))) {
      throw new Error("looking at the master switched the editor to it");
    }
    if (!/What's in it/.test(await page.textContent(".hist .h-top"))) {
      throw new Error("the panel does not say what the copy holds");
    }
    console.log("ok: looking at a copy is not switching to it");

    await page.click('.ccard:has-text("Data Scientist")');
    await page.click('.dt-head .btn:has-text("Rename")');
    await page.fill(".inline-name input", "ML Engineer");
    await page.click(".inline-name .hact.primary");
    await page.waitForSelector('.ccard:has-text("ML Engineer")', { timeout: 10000 });
    if (!(await storedNames()).includes("ML Engineer")) {
      throw new Error("renaming a copy did not reach storage — a reload would undo it");
    }
    console.log("ok: a rename sticks straight away");

    await page.click('.dt-head .btn.danger:has-text("Delete")');
    await page.click(".confirm-strip .hact.danger");
    await page.waitForSelector('.ccard:has-text("ML Engineer")', { state: "detached", timeout: 10000 });
    if ((await storedNames()).includes("ML Engineer")) {
      throw new Error("deleting a copy did not reach storage — a reload would bring it back");
    }
    console.log("ok: a delete sticks straight away");

    await close();
    await recompile("after the copy work");
  },

  /* The master is the pool every copy is drawn from: whatever a copy writes
   * joins it by itself at the next save point, and a copy can take anything
   * back out of it. The rule the whole feature rests on is that ADDITIONS
   * travel and REWORDINGS never do — copies share entry ids, so both halves
   * are a set difference rather than a guess. */
  async master({ page, recompile }) {
    const sheet = async () => {
      if (!(await page.locator(".sheet").count())) await page.click(".docchip");
      await page.waitForSelector(".sheet", { timeout: 10000 });
    };
    const close = async () => {
      if (await page.locator(".sheet").count()) await page.click(".sh-head .icobtn");
      await page.waitForSelector(".sheet", { state: "hidden", timeout: 10000 });
    };
    const onMaster = async () => {
      await sheet();
      await page.click(".ccard:has(.mtag)");
      await page.waitForTimeout(250);
    };

    await sheet();
    await page.click(".cadd");
    await page.fill(".inline-name input", "Data Scientist");
    await page.click(".inline-name .hact.primary");
    /* making a copy switches to it, and that compile is a save point: typing
       before it ends is saved — and absorbed — when it does */
    await page.waitForSelector(".status.ok", { state: "hidden", timeout: 20000 }).catch(() => {});
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    await close();

    /* three different shapes of addition, and one rewording, in the copy only */
    await page.click('.rrow:has-text("Experience")');
    await page.click(".entry-head >> nth=0");
    await page.fill(".entry:not(.collapsed) .cin >> nth=0", "Reworded For This Job");
    await page.click(".bullets .add-btn");
    await page.fill(".bullet-row textarea >> nth=-1", "Shipped the ranking model behind every request");
    await page.click(".addrow .add-btn >> nth=0");
    await page.waitForTimeout(300);
    await page.fill(".entry:not(.collapsed) >> nth=-1 >> .cin >> nth=0", "Research Intern");
    await page.click('.rrow:has-text("Skills")');
    await page.click(".entry-head >> nth=0");
    await page.fill(".chip-input", "PyTorch");
    await page.press(".chip-input", "Enter");
    await page.waitForTimeout(500);

    /* Your details is pooled on exactly the same terms. A contact has no id,
       so it travels by where it goes: a new destination is an addition, and
       a relabelled one is a rewording that must stay put. Giving the link a
       trailing slash first is what decouples the label from it (the field
       follows the text until someone edits it) — and contactKey normalises
       that slash away, so it is still the same destination. */
    await page.click(".rrow.pinned");
    await page.waitForSelector(".contact-row", { timeout: 10000 });
    await page.click(".addrow .add-btn >> nth=0");
    await page.waitForTimeout(250);
    await page.fill(".contact-row >> nth=-1 >> .c-line input >> nth=0", "scholar.example.com/alex");
    await page.fill(".contact-row >> nth=2 >> .c-line input >> nth=1", "https://linkedin.com/in/alexdoe/");
    await page.fill(".contact-row >> nth=2 >> .c-line input >> nth=0", "LinkedIn profile");
    await page.waitForTimeout(400);

    /* nothing has travelled yet: the flow runs at the save point, not on a key */
    await onMaster();
    const before = await page.textContent(".pagewrap");
    if (before.includes("Research Intern")) {
      throw new Error("the master took an addition before anything was compiled");
    }
    console.log("ok: nothing travels until the save point");
    await close();

    await recompile("compiled the copy, so the master catches up");

    /* the page sketch only draws the first few bullets, so ask the store what
       the master actually holds — which is also what a reload would find */
    const inMaster = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("resume-editor-store-v1"));
      const m = st.branches.find((b) => b.id === st.masterId) ?? st.branches[0];
      return JSON.stringify(m.data);
    });
    for (const want of ["Shipped the ranking model", "Research Intern", "PyTorch", "scholar.example.com/alex"]) {
      if (!inMaster.includes(want)) throw new Error(`"${want}" never reached the master`);
    }
    console.log("ok: a bullet, an entry, a tag and a contact all reach the master by themselves");

    if (inMaster.includes("Reworded For This Job")) {
      throw new Error("a rewording overwrote the master — only additions may travel");
    }
    if (inMaster.includes("LinkedIn profile")) {
      throw new Error("a relabelled contact reached the master — the destination was unchanged");
    }
    console.log("ok: a rewording stays in the copy it was written for, in Your details too");

    /* and the other direction: cut something out, the master still has it */
    await close();
    await page.click('.rrow:has-text("Experience")');
    const had = await page.locator(".entry").count();
    /* one click, no question — and what went is held right there */
    await page.locator(".entry-head .del").last().click();
    await page.waitForSelector(".undo-row", { timeout: 5000 });
    if ((await page.locator(".entry").count()) !== had - 1) throw new Error("the entry was not removed");
    if (!/Research Intern/.test(await page.textContent(".undo-row"))) {
      throw new Error("the undo line does not say what was deleted");
    }
    await page.click('.undo-row .hact:has-text("Undo")');
    await page.waitForTimeout(300);
    if ((await page.locator(".entry").count()) !== had || !/Research Intern/.test(await page.locator(".entry-title").last().textContent())) {
      throw new Error("Undo did not put the entry back where it was");
    }
    console.log("ok: an entry deletes in one click, and Undo puts it back where it was");
    await page.locator(".entry-head .del").last().click();
    await page.waitForTimeout(300);
    await page.click('.add-btn:has-text("From your library")');
    await page.waitForSelector(".lib-row", { timeout: 10000 });
    const offer = await page.textContent(".lib-row");
    if (!/Research Intern/.test(offer) || !/from Master/.test(offer)) {
      throw new Error(`the library did not offer it back: "${offer}"`);
    }
    console.log("ok: what you cut out is offered back from the master");

    /* and the same both ways in Your details */
    await page.click(".rrow.pinned");
    await page.waitForSelector(".contact-row", { timeout: 10000 });
    const hadC = await page.locator(".contact-row").count();
    await page.locator(".contact-row .del").last().click();
    await page.waitForTimeout(400);
    if ((await page.locator(".contact-row").count()) !== hadC - 1) {
      throw new Error("the contact was not removed");
    }
    await page.click('.add-btn:has-text("From your library")');
    await page.waitForSelector(".lib-row", { timeout: 10000 });
    const cOffer = await page.textContent(".lib");
    if (!/scholar\.example\.com\/alex/.test(cOffer) || !/from Master/.test(cOffer)) {
      throw new Error(`Your details did not offer the contact back: "${cOffer}"`);
    }
    await page.click(".lib-row .lib-add");
    await page.waitForTimeout(400);
    if ((await page.locator(".contact-row").count()) !== hadC) {
      throw new Error("adding it back from the library did not restore the contact");
    }
    console.log("ok: a way to reach you comes back from the master the same way");

    await recompile("after the master work");

    /* Deleting from the master is the one way out of the pool, so it must
       leave every copy too — the copy still holding it would otherwise hand
       it straight back at the next save point. The copy reworded this entry;
       it is still the same entry, so it goes as well. */
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("resume-editor-store-v1")));
    const st0 = await stored();
    const masterData = st0.branches.find((b) => b.id === st0.masterId).data;
    const doomed = masterData.sections.find((x) => x.title === "Experience").entries[0].id;
    await onMaster();
    await page.click('.dt-head .btn:has-text("Edit this one")');
    await page.waitForSelector(".sheet", { state: "hidden", timeout: 10000 });
    await page.click('.rrow:has-text("Experience")');
    await page.locator(".entry-head .del").first().click();
    await page.click(".rrow.pinned");
    await page.waitForSelector(".contact-row", { timeout: 10000 });
    const doomedContact = await page.locator(".contact-row").last().locator(".c-line input").first().inputValue();
    await page.locator(".contact-row .del").last().click();
    await page.waitForTimeout(300);
    await recompile("deleted from the master");

    const st1 = await stored();
    const holding = st1.branches.filter((b) => JSON.stringify(b.data).includes(`"${doomed}"`)).map((b) => b.name);
    if (holding.length) throw new Error(`an entry deleted from the master is still in: ${holding.join(", ")}`);
    if (JSON.stringify(st1).includes("Reworded For This Job")) {
      throw new Error("a copy's rewording of the deleted entry survived it");
    }
    const stillReach = st1.branches.filter((b) => b.data.personal.contacts.some((x) => x.text === doomedContact)).map((b) => b.name);
    if (stillReach.length) throw new Error(`a contact deleted from the master is still in: ${stillReach.join(", ")}`);
    console.log("ok: a delete in the master leaves every copy, and the master does not take it back");
  },

  /* Every theme compiles; sidebar gets sections actually marked side. */
  async themes({ page, recompile }) {
    await openDesign(page);
    await pickTheme(page, "Banner");
    await recompile("theme banner");

    await pickTheme(page, "Sidebar");
    // move Profile, Certifications, Skills and Languages into the sidebar
    // column — the narrow column stacks a certification's date under it
    for (const n of [0, 5, 6, 7]) {
      await openSection(page, n);
      await page.click(".pane-head .pbtn:not(.del)");
    }
    await recompile("theme sidebar");

    await openDesign(page);
    await pickTheme(page, "Classic");
    await recompile("theme classic");
  },
};

async function main() {
  const liveUrl = arg("--url");
  const stepNames = (arg("--steps") ?? "").split(",").filter(Boolean);
  for (const s of stepNames) if (!STEPS[s]) throw new Error(`unknown step "${s}"`);

  let server = null;
  let url = liveUrl;
  if (!url) {
    if (!existsSync(join(DIST, "index.html"))) throw new Error("dist/ missing — run `npm run build` first");
    ({ server, url } = await serveDist());
  }

  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
  const page = await (await browser.newContext()).newPage();

  const problems = liveUrl ? [] : prefetchListProblems();
  /* Every TeX file the engine fetches for itself is a blocking round trip,
   * one after another — on the live site that came to 50s before the first
   * page. src/prefetch.ts hands it everything texlive/prefetch.json lists
   * before it starts, so on the sample's first compile the engine (a worker,
   * whose requests are XHRs; the prefetch's are fetches) must ask the site
   * for nothing. When it does, the list has gone stale. */
  const lazy = [];
  let firstCompile = true;
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (firstCompile && r.resourceType() === "xhr" && path.includes("/texlive/pdftex/")) {
      lazy.push(path.slice(path.indexOf("/texlive/pdftex/") + 16));
    }
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !HARMLESS_404.test(new URL(r.url()).pathname)) {
      problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  /* "Your words never leave your machine" is a claim on the front page, so
   * it is checked rather than asserted: on the guest path nothing may be
   * requested from anywhere but the site itself. The interface font is
   * vendored for exactly this reason. Signing into Drive is the one thing
   * that talks to anyone else, and it is a deliberate click this run never
   * makes — check-sync-live covers that path against a stubbed Google. */
  const origin = new URL(url).origin;
  page.on("request", (r) => {
    const u = new URL(r.url());
    /* only the real network counts. chrome://resources and the built-in PDF
     * viewer extension are the browser drawing the preview, not the app
     * talking to anyone, and data:/blob: never left the page. */
    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    if (u.origin !== origin) problems.push(`third-party request: ${r.url().slice(0, 120)}`);
  });
  /* Naming and confirming happen in the page now. If a prompt/confirm/alert
   * ever comes back, the run fails rather than quietly clicking through it. */
  page.on("dialog", (d) => {
    problems.push(`native ${d.type()} dialog: ${d.message().slice(0, 90)}`);
    void d.dismiss();
  });

  const check = async (label) => {
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    console.log(`ok: ${label}`);
  };

  /* Force a compile and wait for THIS run to finish. Compiling is automatic
   * after a pause now, so Ctrl+S is the forced path; waiting for the current
   * ✓ to go away first means we never read the previous run's. */
  const recompile = async (label) => {
    await page.keyboard.press("Control+s");
    await page.waitForSelector(".status.ok", { state: "hidden", timeout: 20000 }).catch(() => {});
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    console.log(`ok: ${label}`);
  };

  await page.goto(url, { waitUntil: "domcontentloaded" });

  /* A fresh visitor meets the landing page first; take the local door. */
  const localDoor = await page.waitForSelector('.dbtn:has-text("Start writing")', { timeout: 15000 }).catch(() => null);
  if (localDoor) {
    await localDoor.click();
    console.log("ok: landing offers both doors, local one enters the editor");
  } else {
    console.log("note: no landing shown (already entered)");
  }

  await check("sample compiles");
  firstCompile = false;
  if (lazy.length) {
    problems.push(
      `the first compile fetched ${lazy.length} TeX file(s) one blocking request at a time, because ` +
        `texlive/prefetch.json does not list them — run \`npm run make-prefetch\`: ${lazy.slice(0, 10).join(" ")}`,
    );
  } else {
    console.log("ok: the first compile found every TeX file already fetched");
  }

  for (const name of stepNames) await STEPS[name]({ page, check, recompile });

  await browser.close();
  server?.close();

  if (problems.length) {
    console.error("FAIL:\n" + problems.map((p) => "  " + p).join("\n"));
    process.exit(1);
  }
  console.log("smoke passed");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
