# CVLian

A résumé editor that needs no server.

You write in the browser, it typesets with **real LaTeX** — a full pdfTeX
compiled to WebAssembly — and the PDF appears beside what you are typing.
There is no backend, no account, no upload and nothing to pay. The whole
thing is a folder of static files; GitHub Pages serves it as-is.

Your words stay on your machine. If you want them on more than one machine,
you sign into **your own** Google Drive and the app keeps a single file there.
It never sees a server of ours, because there isn't one.

---

## What it does

**One résumé, many tailored copies.** Most people do not have a résumé, they
have six — one per kind of role, each a slightly different edit of the same
career. CVLian makes that the shape of the app rather than six files on a
desktop.

- **The master** is the pool every copy is drawn from: every bullet, entry
  and skill you have ever written. It is not a document you send. It fills
  itself — whatever you write in a tailored copy joins it at the next save,
  and anything in it can be pulled into any copy.
- **Copies** are the ones you send. Cut what a role does not need; what you
  cut is still offered back from the master, so nothing is lost by tailoring.
- **Additions travel, rewordings never do.** A new bullet flows back to the
  master; a phrase you reworded for one employer stays where you wrote it.

**Compiling is manual, and compiling is what saves.** `Ctrl+S` or the Compile
button builds the page and commits the workspace, in that one gesture. Typing
costs nothing: no timers, no network, no surprise rebuilds.

**Three themes** (classic, sidebar, banner), four typefaces, and the usual
levers — margins, density, font size, paper, accent colour — all of which
change the page and never a word of the résumé.

**It works offline.** Once a résumé has been built once, the engine and the
TeX files it needs are cached, and you can keep working with the network off.

**Nothing phones home.** Not analytics, not a webfont — the interface
typeface is vendored too. The test suite fails if any request goes anywhere
but the site itself. Signing into Google Drive is the one exception, it is
your Drive, and it is a button you choose to press.

---

## Using it

Open the site. Take the local door and you are writing immediately, against a
sample you can make your own, import over, or clear.

| | |
|---|---|
| **Compile / save** | `Ctrl+S`, or the Compile button |
| **Export** | Every copy, as one JSON backup |
| **Import** | A backup, or a single résumé JSON |
| **PDF** | Downloads the page you are looking at |
| **Sign in** | Keeps the workspace in your own Google Drive |

Signing out revokes the token and clears the résumé from that browser — one
action, so nobody has to pick the safe one. The Drive copy is what makes that
safe, and the confirmation tells you when Drive last had your work.

`?landing` on the URL shows the front page even when you are signed in.

---

## Running it yourself

```bash
npm install
npm run dev          # http://localhost:5173 — fully self-contained
npm run build        # type-check, build to dist/, stamp the service worker
```

`dist/` is a plain static folder. To confirm it behaves the way Pages will
serve it:

```bash
python3 -m http.server 8003 --directory dist
```

### Tests

There is no linter; the smoke suite is the test suite, and it drives the real
app in headless Chromium against the real WASM engine.

```bash
npm test                   # everything below, in order
npm run smoke              # build + compile the sample as plain static files
npm run check-sync         # the sync merge rules, headless, no Google account
npm run check-sync-live    # the real app against a stubbed Drive
```

`npm run smoke` fails on **any** HTTP error except the engine's harmless
`.cfg`/`.dfu`/`.vf` probes, which makes it the exact detector for a TeX file
that was never vendored. Extra matrices cover the things unit tests cannot
see:

```bash
node scripts/smoke.mjs --steps design,fonts,themes   # every design control at its extremes
node scripts/smoke.mjs --steps compile               # typing never compiles or saves; Ctrl+S does
node scripts/smoke.mjs --steps copies                # a new copy says where it came from; copy commands stick
node scripts/smoke.mjs --steps master                # additions travel, rewordings do not
node scripts/smoke.mjs --steps contacts              # every icon, and a URL full of TeX specials
node scripts/smoke.mjs --steps offline               # it still typesets with the network off
node scripts/smoke.mjs --steps import                # an old-format export still loads
node scripts/smoke.mjs --steps legacy                # the pre-typed-fields upgrade reaches saved data
node scripts/smoke.mjs --url https://you.github.io/resume/   # check a deployment
```

Before touching the parser in `storage.ts`, render a **real** résumé through
the migration and read the diff — a toy fixture will not catch what that does:

```bash
npm run check-migration -- resume.json
```

---

## Deploying

Push to `main`. `.github/workflows/deploy.yml` runs the suite, builds, and
publishes `dist/`; set the repository's Pages source to **GitHub Actions**.

Google Drive sync is optional and off unless you configure it. It needs a
browser OAuth client id at build time — a public identifier, not a secret —
as the repository variable `GOOGLE_CLIENT_ID`. Without it the app runs
normally and simply reports the provider as unconfigured.
See [`docs/google-drive-setup.md`](docs/google-drive-setup.md), including the
two traps that cost the most time (test users, and the origin mismatch).

---

## How it works

```
localStorage / Drive  →  renderTex()  →  WASM pdfTeX (2 passes)  →  PDF blob
     (every copy)        src/tex/          public/swiftlatex*        iframe
```

- **`src/tex/`** — the JSON→LaTeX renderers. `base.ts` reduces any entry to
  `{leftLines, right, bullets}` of ready-escaped LaTeX, so a new entry kind
  needs one branch and every theme picks it up. Everything a user types is
  escaped; `escUrl()` handles the one field that cannot be (a URL is an
  `\href` argument, where a `%` swallows the line).
- **`src/App.tsx`** — owns the store, a serialized compile queue, and the
  save point. `persistStore` runs in the compile's `finally`, so a failed
  build never costs anyone the words that caused it.
- **`src/sync/`** — bring-your-own-storage. `merge.ts` is pure and holds every
  conflict rule: nothing is discarded, the newer copy stays live, the older is
  kept beside it as a copy of its own — and only for a *real* conflict, which
  content fingerprints make knowable. Tombstones make a delete stick.
- **`src/master.ts`** — the pool, and the set difference that keeps it safe to
  fill automatically.
- **`public/texlive/`** — a pinned, self-hosted TeX tree (~24MB, 290 files).
  Nothing is fetched from anyone else's TeX server.
- **`public/sw.js`** — the service worker. Stamped at build time from the
  contents of `dist`, so a deploy can never be served out of a previous
  deploy's cache.

`CLAUDE.md` is the long version — the architecture, the data model, and the
bugs behind each rule.

---

## What it's built on

This project **vendors and modifies** components with their own licences:

- **[SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX)** — the WASM pdfTeX
  engine (`public/swiftlatexpdftex.js`, `.wasm`) and `src/engine.ts`, a typed
  port of its `PdfTeXEngine.js` (release v20022022), both locally patched.
  Copyright (c) SwiftLab, 2018–2022. **Licensed AGPL-3.0**, which is why this
  project is too.
- **[TeX Live](https://tug.org/texlive/)** — the files under `public/texlive/`,
  each under its own licence (mostly LPPL), redistributed unmodified.
- **[Font Awesome Free](https://fontawesome.com)** — the contact icons
  (CC BY 4.0 / SIL OFL 1.1 for the fonts).
- **[Figtree](https://fonts.google.com/specimen/Figtree)** — the interface
  typeface (SIL OFL 1.1), vendored in `src/fonts/` rather than fetched, so
  the app makes no third-party request at all.
- **React**, **Vite**, **TypeScript** (MIT).

## Licence

**AGPL-3.0** — see [`LICENSE`](LICENSE).

This is not a preference. CVLian embeds and derives from SwiftLaTeX, which is
AGPL-3.0, so the combined work is AGPL-3.0 as well. In practice this costs a
free, open, publicly-hosted project nothing: the licence asks that anyone who
runs a modified copy for others makes their source available, and a public
repository serving a static site already does exactly that. If you fork it,
keep the repository public.
