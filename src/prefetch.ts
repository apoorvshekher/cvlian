/* Why a first compile on the live site used to take most of a minute.
 *
 * pdfTeX opens files the way it would on a disk: one at a time, and it
 * cannot go on until each one arrives. In the browser every open is a
 * blocking request to the host — about a millisecond locally, a few hundred
 * over the internet — so the ~115 files a résumé reads cost 40-odd seconds
 * of nothing but waiting, while typesetting itself took about one.
 *
 * texlive/prefetch.json lists what a compile reads, by theme and by font.
 * It is written by `npm run make-prefetch`, never by hand, and the smoke run
 * fails when it goes stale. Here those files are fetched all at once (the
 * host multiplexes them, and the service worker keeps each one for offline
 * use) and handed to the engine before it starts, so it finds every file
 * already in memory. The list is only ever a head start: a file it lacks is
 * fetched the old way, one it lists needlessly costs a few KB, and a list
 * that will not load means no head start, never a failed compile.
 */
import type { PdfTeXEngine } from "./engine";
import type { DesignSettings } from "./types";

type Design = Pick<DesignSettings, "themeId" | "font">;

interface Manifest {
  core?: string[];
  themes?: Record<string, string[]>;
  fonts?: Record<string, string[]>;
  missing?: string[];
}

const MANIFEST_URL = "texlive/prefetch.json";
const TEX_ROOT = "texlive/pdftex/";

let manifest: Promise<Manifest | null> | undefined;
function loadManifest(): Promise<Manifest | null> {
  manifest ??= fetch(MANIFEST_URL)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifest;
}

async function wanted(design: Design): Promise<{ keys: string[]; missing: string[] } | null> {
  const m = await loadManifest();
  if (!m) return null;
  const keys = new Set([...(m.core ?? []), ...(m.themes?.[design.themeId] ?? []), ...(m.fonts?.[design.font] ?? [])]);
  return { keys: [...keys], missing: m.missing ?? [] };
}

/* One download per file, shared by the warm-up and the hand-over. A file
 * that will not arrive resolves to null and is left to the engine. */
const downloads = new Map<string, Promise<ArrayBuffer | null>>();
function download(key: string): Promise<ArrayBuffer | null> {
  let p = downloads.get(key);
  if (!p) {
    p = fetch(TEX_ROOT + key)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    downloads.set(key, p);
  }
  return p;
}

/* Start downloading before there is an engine to give the files to, so the
 * downloads overlap the engine's own start-up. */
export function warmTexFiles(design: Design): void {
  void wanted(design).then((w) => w?.keys.forEach(download));
}

const handed = new WeakMap<PdfTeXEngine, Set<string>>();

/* Before a compile: give the engine every listed file it has not been given
 * yet — all of them the first time, and only a new font's or theme's files
 * after that. Never throws for a file; at worst the engine fetches it. */
export async function preloadTexFiles(engine: PdfTeXEngine, design: Design): Promise<void> {
  const w = await wanted(design);
  if (!w) return;
  let have = handed.get(engine);
  const first = !have;
  if (!have) handed.set(engine, (have = new Set()));
  const keys = w.keys.filter((k) => !have.has(k));
  for (const k of keys) have.add(k);
  const data = await Promise.all(keys.map(download));
  const files: { key: string; data: ArrayBuffer }[] = [];
  keys.forEach((key, i) => {
    /* transferred to the worker, so this copy is spent either way */
    downloads.delete(key);
    const d = data[i];
    if (d) files.push({ key, data: d });
  });
  if (files.length || first) engine.preloadTexFiles(files, first ? w.missing : []);
}
