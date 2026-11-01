/* End-to-end sync checks against a stubbed Drive.
 *
 * Everything here is a bug that actually shipped: a sync merging a stale
 * snapshot over whatever the user typed during the round trip, and an idle
 * connected tab rewriting the remote file every few seconds forever. Both
 * are invisible in unit tests of the merge — they live in the orchestration
 * — so they need the real app driven in a real browser.
 *
 *   npm run check-sync-live
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { globSync } from "node:fs";
import { extname, join } from "node:path";
import { homedir } from "node:os";
import { chromium } from "playwright-core";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };

console.log("building with a stub client id…");
execFileSync("npm", ["run", "build"], {
  cwd: ROOT,
  stdio: "pipe",
  env: { ...process.env, VITE_GOOGLE_CLIENT_ID: "stub.apps.googleusercontent.com" },
});

/* The stub counts token requests in localStorage, which survives a reload:
 * asking Google for a token is what opens a popup, so "did the page ask
 * without a click?" is the only way to see that bug from outside. */
const GIS_STUB = `window.google={accounts:{oauth2:{initTokenClient(){const c={callback:null,
  requestAccessToken(){try{localStorage.setItem('__tokreq',String(1+Number(localStorage.getItem('__tokreq')||0)))}catch(e){}
  setTimeout(()=>c.callback({access_token:'stub',expires_in:3600}),10);}};return c;},
  revoke(t,d){if(d)d();}}}};`;

function chromePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const hits = globSync(join(homedir(), ".cache/ms-playwright/chromium-*/chrome-linux*/chrome"));
  if (!hits.length) throw new Error("No Chromium found; set PLAYWRIGHT_CHROMIUM");
  return hits.sort().at(-1);
}

/* A stand-in for the user's Drive, with a settable latency. */
function makeDrive() {
  return { file: null, version: 0, writes: 0, readDelayMs: 0 };
}

async function withApp(drive, run, opts = {}) {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = join(DIST, urlPath === "/" ? "index.html" : urlPath.slice(1));
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  const url = await new Promise((r) =>
    server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}/`)),
  );
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await ctx.route("https://accounts.google.com/gsi/client", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: GIS_STUB }));
  await ctx.route(/googleapis\.com\/.*/, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.pathname === "/drive/v3/files" && req.method() === "GET")
      return json({ files: drive.file ? [{ id: "f1", version: String(drive.version) }] : [] });
    if (u.pathname.startsWith("/drive/v3/files/") && u.searchParams.get("alt") === "media") {
      if (drive.readDelayMs) await new Promise((r) => setTimeout(r, drive.readDelayMs));
      return json(JSON.parse(drive.file));
    }
    if (u.pathname.startsWith("/upload/drive/v3/files")) {
      let body = req.postData() ?? "";
      if (req.method() === "POST") body = body.split(/\r\n\r\n/).pop().split(/\r\n--/)[0];
      drive.file = body;
      drive.version++;
      drive.writes++;
      return json({ id: "f1", version: String(drive.version) });
    }
    return json({});
  });

  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (!opts.landing) {
      // a fresh profile meets the landing first; take the local door
      const door = await page
        .waitForSelector('.dbtn:has-text("Start writing")', { timeout: 15000 })
        .catch(() => null);
      if (door) await door.click();
      await page.waitForSelector(".status.ok", { timeout: 120000 });
    }
    return await run(page);
  } finally {
    await browser.close();
    server.close();
  }
}

const connect = async (page) => {
  await page.click(".btn.signin");
  await page.waitForSelector(".sync-dot.idle", { timeout: 30000 });
};

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}: ${label}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/* 1. typing during a slow sync must not be overwritten by the merge */
{
  const drive = makeDrive();
  await withApp(drive, async (page) => {
    await connect(page);
    // make the remote diverge so the merge path genuinely runs
    const j = JSON.parse(drive.file);
    j.branches[0].data.personal.name = "Stale Remote Name";
    j.branches[0].updatedAt = "2020-01-01T00:00:00.000Z";
    drive.file = JSON.stringify(j);
    drive.version++;
    drive.readDelayMs = 2500;

    await page.click('.rrow:has-text("Your details")');
    await page.click(".sync-btn");
    await page.click('.btn:has-text("Sync now")');
    /* the sheet's scrim covers the bar, so it closes from its own header */
    await page.click(".sh-head .icobtn");
    await page.waitForTimeout(500);
    await page.fill(".contact-row .c-line input >> nth=0", "typed-during-sync");
    await page.waitForTimeout(4000);
    const got = await page.$eval(".contact-row .c-line input >> nth=0", (e) => e.value);
    check("an edit made during a sync survives the merge", got === "typed-during-sync", `got "${got}"`);
  });
}

/* 2. a connected tab nobody is touching must not write to Drive */
{
  const drive = makeDrive();
  await withApp(drive, async (page) => {
    await connect(page);
    const before = drive.writes;
    await page.waitForTimeout(14000);
    check("an idle connected tab stops writing", drive.writes === before, `${drive.writes - before} extra write(s)`);
  });
}

/* 3. Drive follows the save point: typing alone never reaches it, Compile does */
{
  const drive = makeDrive();
  await withApp(drive, async (page) => {
    await connect(page);
    const before = drive.writes;
    await page.click('.rrow:has-text("Your details")');
    await page.fill(".contact-row .c-line input >> nth=0", "typed-not-compiled");
    await page.waitForTimeout(6000);
    check("typing alone does not write to Drive",
      drive.writes === before && !drive.file?.includes("typed-not-compiled"),
      `${drive.writes - before} write(s)`);

    /* Ctrl+S is the save point; the push follows the compile, not the key */
    await page.keyboard.press("Control+s");
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !drive.file?.includes("typed-not-compiled")) await page.waitForTimeout(250);
    check("Compile pushes the save point to Drive", !!drive.file?.includes("typed-not-compiled"));
  });
}

/* 4. choosing Google on the landing adopts a workspace already in Drive */
{
  const drive = makeDrive();
  drive.file = JSON.stringify({
    savedAt: new Date().toISOString(),
    activeId: "remote-1",
    branches: [{
      id: "remote-1", name: "From Another Machine",
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-09-12T10:00:00Z",
      data: {
        personal: { name: "Already In Drive", contacts: [] },
        sections: [],
        design: { themeId: "classic", accent: "#0b0b0a", font: "charter", fontSize: 10, margins: 2, density: 1, paper: "letter", nameSize: 25, dateColWidth: 4.5 },
      },
    }],
  });
  drive.version = 7;
  await withApp(drive, async (page) => {
    await page.click('.dbtn:has-text("Sign in with Google")');
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    await page.click(".docchip");
    const branches = await page.$$eval(".ccard .cname", (o) => o.map((e) => e.textContent));
    check("the Google door adopts the workspace already in Drive",
      branches.includes("From Another Machine") && branches.length === 1,
      `branches: ${JSON.stringify(branches)}`);
  }, { landing: true });
}

/* 5. a reload must never open Google's window; Compile is what asks */
{
  const drive = makeDrive();
  await withApp(drive, async (page) => {
    await connect(page);
    const asked = () => page.evaluate(() => Number(localStorage.getItem("__tokreq") || 0));
    const afterClick = await asked();

    /* inside the hour the tab still holds the token: no click, no window */
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sync-dot.idle", { timeout: 60000 });
    check("a reload with a live token resumes without asking Google", (await asked()) === afterClick,
      `${(await asked()) - afterClick} unasked-for sign-in popup(s)`);

    /* the token has expired: still no window at page load — park instead */
    await page.evaluate(() => sessionStorage.removeItem("resume-sync-google-token"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sync-btn", { timeout: 60000 });
    await page.waitForTimeout(3000);
    check("a reload with a dead token asks Google for nothing", (await asked()) === afterClick,
      `${(await asked()) - afterClick} unasked-for sign-in popup(s)`);
    check("the signed-in session comes back behind, not signed out",
      !!(await page.$(".sync-btn.behind")));

    /* and the click that always comes gets the session back, asking exactly once */
    await page.keyboard.press("Control+s");
    await page.waitForSelector(".sync-dot.idle", { timeout: 60000 });
    check("Compile with a dead token asks Google exactly once, then syncs", (await asked()) === afterClick + 1,
      `${(await asked()) - afterClick} request(s)`);
  });
}

/* 6. deleting a copy while signed in — the sync that follows used to union
 *    it straight back from Drive, so the delete never stuck */
{
  const drive = makeDrive();
  await withApp(drive, async (page) => {
    await connect(page);
    const until = async (cond, ms) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !(await cond())) await page.waitForTimeout(250);
      return cond();
    };
    const cards = () => page.$$eval(".ccard .cname", (o) => o.map((e) => e.textContent));
    await page.click(".docchip");
    await page.waitForSelector(".sheet", { timeout: 10000 });
    await page.click(".cadd");
    await page.fill(".inline-name input", "Doomed copy");
    await page.click(".inline-name .hact.primary");
    await page.waitForSelector('.ccard:has-text("Doomed copy")', { timeout: 10000 });
    check("a new copy reaches Drive on its own", await until(() => !!drive.file?.includes('"Doomed copy"'), 15000));

    /* making it switched to it, so it is the one the sheet is showing */
    await page.click('.dt-head .btn.danger:has-text("Delete")');
    await page.click(".confirm-strip .hact.danger");
    const writes = drive.writes;
    check("the deletion is pushed", await until(() => drive.writes > writes, 15000));
    await page.waitForTimeout(1500);
    const rows = await cards();
    check("a deleted copy stays deleted after the sync",
      !rows.includes("Doomed copy") && !drive.file?.includes('"Doomed copy"'),
      `copies: ${JSON.stringify(rows)}`);

    /* and a reload — the merge running the other way — must not resurrect it either */
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sync-dot.idle", { timeout: 60000 });
    await page.click(".docchip");
    await page.waitForSelector(".sheet", { timeout: 10000 });
    const after = await cards();
    check("  ...and after a reload", !after.includes("Doomed copy"), `copies: ${JSON.stringify(after)}`);
  });
}

/* 7. Drive lagging behind this browser is not a conflict. Typing without
 *    compiling reaches localStorage on unload but never Drive, so the next
 *    boot merges a local copy against an older remote one — and used to
 *    set the remote aside as something nobody asked for, on every visit. */
{
  const drive = makeDrive();
  await withApp(drive, async (page) => {
    await connect(page);
    /* every copy in the workspace, straight from the store — a conflict
       splits one off, and this is what a reload would find */
    const rows = () => page.evaluate(() => {
      const raw = localStorage.getItem("resume-editor-store-v1");
      if (!raw) return 0;
      return JSON.parse(raw).branches.length;
    });
    const before = await rows();

    /* typed and compiled: both sides agree */
    await page.click('.rrow:has-text("Your details")');
    await page.fill(".contact-row .c-line input >> nth=0", "compiled once");
    await page.keyboard.press("Control+s");
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    await page.waitForTimeout(3000);

    /* typed and NOT compiled, then reloaded: Drive is now behind */
    await page.fill(".contact-row .c-line input >> nth=0", "typed then closed");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sync-dot.idle", { timeout: 60000 });
    await page.waitForTimeout(1000);
    check("a reload with Drive behind invents no copy", (await rows()) === before,
      `${(await rows()) - before} unasked-for copy(s)`);

    /* and a compile after it must not mint one either */
    await page.keyboard.press("Control+s");
    await page.waitForSelector(".status.ok", { timeout: 120000 });
    await page.waitForTimeout(3000);
    check("a compile while signed in invents no copy", (await rows()) === before,
      `${(await rows()) - before} unasked-for copy(s)`);
  });
}

/* 8. a guest signing in from the editor to a Drive that already holds a
 *    résumé: the sample they were looking at used to be unioned in beside
 *    it — as the active copy and the master — and pushed up to Drive */
{
  const drive = makeDrive();
  drive.file = JSON.stringify({
    savedAt: new Date().toISOString(),
    activeId: "remote-1",
    masterId: "remote-1",
    branches: [{
      id: "remote-1", name: "Master",
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-09-12T10:00:00Z",
      data: {
        personal: { name: "Already In Drive", contacts: [] },
        sections: [],
        design: { themeId: "classic", accent: "#0b0b0a", font: "charter", fontSize: 10, margins: 2, density: 1, paper: "letter", nameSize: 25, dateColWidth: 4.5 },
      },
    }],
  });
  drive.version = 3;
  await withApp(drive, async (page) => {
    await connect(page);
    await page.waitForTimeout(1500);
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem("resume-editor-store-v1")));
    const names = local.branches.map((b) => b.data.personal.name);
    check("signing in as a guest leaves the untouched sample behind",
      names.length === 1 && names[0] === "Already In Drive", `copies: ${JSON.stringify(names)}`);
    check("  ...and Drive's résumé is the one open, and the master",
      local.activeId === "remote-1" && local.masterId === "remote-1");
    check("  ...and the sample never reaches Drive",
      JSON.parse(drive.file).branches.length === 1, `${JSON.parse(drive.file).branches.length} copies in Drive`);
  });
}

console.log(failures ? `\n${failures} failed` : "\nsync behaves");
process.exitCode = failures ? 1 : 0;
