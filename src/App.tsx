import { useCallback, useEffect, useRef, useState } from "react";
import { PdfTeXEngine } from "./engine";
import { extractErrors, pageStats, renderTex } from "./render";
import { STORE_KEY, fetchSample, loadStore, makeBranch, makeSection, markRemoved, normalizeData, normalizeStore, persistStore } from "./storage";
import { absorb, contactKey, cutsBetween, masterOf, prune, type Cut } from "./master";
import type { Branch, Contact, EditData, Entry, ResumeData, Store } from "./types";
import { Beside, type BesideTab, type Checked } from "./components/Beside";
import { EditorPane } from "./components/EditorPane";
import { FirstRunStrip } from "./components/FirstRunStrip";
import { Landing } from "./components/Landing";
import { NoticeBar, explainCompileFailure, type Notice } from "./components/NoticeBar";
import { Preview } from "./components/Preview";
import { TopBar, type Status } from "./components/TopBar";
import { googleDrive } from "./sync/googleDrive";
import { sampleStamp, untouchedSample } from "./sync/merge";
import { useSync } from "./sync/useSync";

/* The engine needs a .fmt built by itself; it's vendored under
 * public/texlive/pdftex/10/swiftlatexpdftex.fmt. */
async function initEngine(): Promise<PdfTeXEngine> {
  const res = await fetch("texlive/pdftex/10/swiftlatexpdftex.fmt", { method: "HEAD" }).catch(() => null);
  if (!res || !res.ok) {
    throw new Error("TeX format file missing from site (texlive/pdftex/10/swiftlatexpdftex.fmt)");
  }
  const engine = new PdfTeXEngine();
  await engine.loadEngine();
  engine.setTexliveEndpoint(new URL("texlive/", document.baseURI).href);
  return engine;
}

function sanitize(text: string): string {
  return text.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* Who is using the app right now.
 *
 *  "restoring" — deciding, on boot, whether a Google session comes back
 *  "out"       — the front page: sign in, or carry on as a guest
 *  "guest"     — working locally, with the account still on offer
 *  "google"    — signed in; the workspace lives in their own Drive
 *
 * The front page is the default, not a first-run interstitial: a guest
 * meets it every visit, which is what keeps the account on offer instead
 * of buried. Only a restorable Google session skips it. */
type Session = "restoring" | "out" | "guest" | "google";

/* The panel beside the page, as this viewer left it. A convenience, so it
 * lives in this browser only; a first visit opens it where there is room
 * for it next to a readable page, and folds it where there is not. */
const BESIDE_KEY = "resume-beside";
function readBeside(): { open: boolean; tab: BesideTab } {
  try {
    const o = JSON.parse(localStorage.getItem(BESIDE_KEY) ?? "null") as { open?: unknown; tab?: unknown } | null;
    if (o && typeof o.open === "boolean" && (o.tab === "check" || o.tab === "look")) return { open: o.open, tab: o.tab };
  } catch { /* unreadable: start fresh */ }
  return { open: window.innerWidth >= 1500, tab: "check" };
}

function hasLocalWork(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== null;
  } catch {
    return false;
  }
}

export default function App() {
  const [session, setSession] = useState<Session>("restoring");
  const [store, setStore] = useState<Store | null>(null);
  const [status, setStatus] = useState<Status>({ text: "Starting up…" });
  const [notice, setNotice] = useState<Notice | null>(null);
  /* the sample arrived with no explanation of whose résumé it is */
  const [greet, setGreet] = useState(false);
  const [focusName, setFocusName] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);
  /* what the last successful compile measured, for the page check */
  const [checked, setChecked] = useState<Checked | null>(null);
  const [beside, setBeside] = useState(readBeside);
  /* bumped when the rail asks for Look & feel, so a stacked layout scrolls to it */
  const [reveal, setReveal] = useState(0);
  /* a section the page check asked the editor to show */
  const [goTo, setGoTo] = useState<{ id: string; n: number } | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      (localStorage.getItem("theme") as "light" | "dark" | null) ??
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );

  const engineRef = useRef<PdfTeXEngine | null>(null);
  const storeRef = useRef<Store | null>(null);
  storeRef.current = store;
  const pdfRef = useRef<{ url: string; name: string } | null>(null);
  /* The blob URL from two compiles ago. The previous one can still be on
   * screen while the next page loads behind it, so a URL is only released a
   * generation after it stops being current. */
  const spentUrlRef = useRef<string | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  /* The exact ResumeData the compiler has been handed, or promised. Anything
   * else in the active branch means the page on screen is out of date, and
   * that identity check is the whole of the auto-compile decision. */
  const compiledRef = useRef<ResumeData | null>(null);
  const initRef = useRef(false);
  /* a refused write is reported once, not once per save */
  const saveFailedRef = useRef(false);
  /* the sync hook is created further down; these two calls are made from
   * places defined before it, so they go through a ref */
  const syncRef = useRef<{ committed: () => void; wake: () => void } | null>(null);
  /* a workspace pulled from Drive on the landing page, used instead of the sample */
  const adoptedRef = useRef<Store | null>(null);
  /* What was deleted from the master since the last save point, and which
   * copy was the master then. The save point takes it out of every copy. */
  const cutsRef = useRef<{ masterId: string; cuts: Cut[] }>({ masterId: "", cuts: [] });

  const setStatusText = useCallback((text: string, cls?: string, title?: string) => {
    setStatus((s) => (s.text === text && s.cls === cls && s.title === title ? s : { text, cls, title }));
  }, []);

  /* Every save in the app goes through here. localStorage is the whole
   * database, so a refused write is the one failure a person may not be left
   * unaware of — the status would otherwise go on reading "compiled and
   * saved" over a résumé that exists only on screen. Export and Drive are
   * the two ways out, so the notice names both, and it is raised once rather
   * than on every keystroke that follows. */
  const saveStore = useCallback((s: Store): void => {
    if (persistStore(s)) {
      saveFailedRef.current = false;
      return;
    }
    if (saveFailedRef.current) return;
    saveFailedRef.current = true;
    setNotice({
      kind: "error",
      title: "This browser would not store your résumé.",
      body:
        "Site data is blocked or full — a private window does this. Nothing on screen is lost: " +
        "use Export to keep a copy on disk, or sign in to keep one in Drive.",
    });
  }, []);

  /* ---------- compile (serialized through a queue) ---------- */

  const doCompile = useCallback(async () => {
    const engine = engineRef.current;
    const s = storeRef.current;
    if (!engine || !s) return;
    const branch = s.branches.find((b) => b.id === s.activeId) ?? s.branches[0];
    setStatusText("Compiling…", "busy");
    setNotice((n) => (n?.kind === "error" ? null : n));
    const t0 = performance.now();
    try {
      const tex = renderTex(branch.data);
      engine.writeMemFSFile("main.tex", tex);
      engine.setEngineMainFile("main.tex");
      let result = await engine.compileLaTeX();
      if (result.pdf) {
        // second pass resolves lastpage/references
        engine.writeMemFSFile("main.tex", tex);
        result = await engine.compileLaTeX();
      }
      if (result.pdf) {
        const blob = new Blob([result.pdf as BlobPart], { type: "application/pdf" });
        /* Release the generation before last, never the one still on screen. */
        if (spentUrlRef.current) URL.revokeObjectURL(spentUrlRef.current);
        spentUrlRef.current = pdfRef.current?.url ?? null;
        const base = sanitize(branch.data.personal.name) || "resume";
        const ver = sanitize(branch.name);
        const name = base + "_Resume" + (ver && ver !== "Main" ? "_" + ver : "") + ".pdf";
        const next = { url: URL.createObjectURL(blob), name };
        pdfRef.current = next;
        setPdf(next);
        setChecked({ stats: pageStats(result.log), at: Date.now(), seconds: (performance.now() - t0) / 1000 });
        /* typing carried on while this was building, so the page is already
         * behind again — say so rather than claiming to be up to date */
        const moved = compiledRef.current !== (storeRef.current
          ? (storeRef.current.branches.find((b) => b.id === storeRef.current!.activeId) ?? storeRef.current.branches[0]).data
          : null);
        if (moved) {
          setStatusText("Edited — press Compile to save", "dirty");
        } else {
          setStatusText(
            "Compiled and saved",
            "ok",
            `Typeset in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
          );
        }
      } else {
        setStatusText("Couldn't compile", "err");
        setNotice(explainCompileFailure(extractErrors(result.log), branch.data));
      }
    } catch (err) {
      setStatusText("Couldn't compile", "err", (err as Error).message);
    } finally {
      /* Compiling is the save point. This is the only place the workspace
       * reaches localStorage during ordinary use, which is why it runs
       * whatever the compile made of it — a failed build must not cost
       * anyone the words that caused it. The freshest store is written, not
       * the one captured at the top: seconds pass while pdfTeX runs. */
      const saved = storeRef.current ? grow(storeRef.current) : null;
      if (saved) saveStore(saved);
      /* and Drive follows the save point — pushed now if a token is in hand,
       * otherwise on the next click that can get one */
      syncRef.current?.committed();
    }
  }, [setStatusText, saveStore]);

  const compile = useCallback((): Promise<void> => {
    /* Stamp now, not when the queue gets to it: the auto-compile effect below
     * decides by identity, and work already promised must not earn a second
     * run when a switch or a Ctrl+S lands first. */
    const s = storeRef.current;
    const branch = s ? (s.branches.find((b) => b.id === s.activeId) ?? s.branches[0]) : undefined;
    compiledRef.current = branch?.data ?? null;
    const p = queueRef.current.then(doCompile);
    queueRef.current = p.catch(() => {});
    return p;
  }, [doCompile]);

  /* ---------- boot: is there a session to come back to? ---------- */

  useEffect(() => {
    /* ?landing shows the front page even to someone signed in */
    const forced = new URLSearchParams(location.search).has("landing");
    /* A session comes back from what this browser remembers, never from a
     * round trip to Google: the token flow can only get a token by opening
     * a window, and a window at page load is one nobody asked for (and one
     * most browsers block). The editor opens on the local copy; useSync
     * resumes quietly if the tab still holds a token, and otherwise parks
     * as "behind" until the next Compile — the click that makes asking
     * Google allowed. */
    const returning = !forced && googleDrive.isConfigured() && googleDrive.wasConnected();
    /* With nothing kept locally there is nothing to open on, and adopting
     * Drive's copy needs a token — so that one case goes through the front
     * page, where the Google door is a click and the popup is expected. */
    setSession(returning && hasLocalWork() ? "google" : "out");
  }, []);

  /* The master is the pool every copy is drawn from, so whatever a copy has
   * written that the master has never seen joins it here — at the save point,
   * with the words already on screen, never mid-keystroke. Only additions
   * travel (see master.ts), which is what makes leaving this running safe.
   * What was deleted from the master leaves the copies first: absorbing
   * before that would hand it straight back from a copy still holding it. */
  const grow = useCallback((s: Store): Store => {
    const { masterId, cuts } = cutsRef.current;
    cutsRef.current = { masterId: "", cuts: [] };
    const pruned = prune(s, masterId, cuts);
    const base = pruned ?? s;
    const grown = absorb(base, makeSection) ?? pruned;
    if (grown) setStore(grown);
    return grown ?? s;
  }, []);

  /* Workspace changes — a copy made, renamed, switched or deleted — are
   * commands, not typing, and they stick the moment they are given. Only the
   * résumé's own words wait for a compile: deleting something and finding it
   * back after a reload is not a save model, it is a bug. */
  const updateStore = useCallback((fn: (s: Store) => Store) => {
    const cur = storeRef.current;
    if (!cur) return;
    const next = grow(fn(cur));
    saveStore(next);
    syncRef.current?.committed();
    setStore(next);
  }, [grow, saveStore]);

  const editBranch = useCallback(
    (branchId: string, fn: (b: Branch) => Branch) => {
      updateStore((s) => ({ ...s, branches: s.branches.map((b) => (b.id === branchId ? fn(b) : b)) }));
    },
    [updateStore],
  );

  /* ---------- init: load store, then engine ---------- */

  const inside = session === "guest" || session === "google";
  useEffect(() => {
    if (!inside || initRef.current) return;
    initRef.current = true;
    void (async () => {
      let s = adoptedRef.current ?? loadStore();
      if (!s) {
        const sample = await fetchSample();
        /* stamped, so it can give way to real work until someone edits it */
        const b = { ...makeBranch("Master", sample), sample: sampleStamp(sample) };
        s = { activeId: b.id, masterId: b.id, branches: [b] };
        saveStore(s);
        /* only when the sample is what they got — an adopted or imported
         * résumé is already theirs and needs no introduction */
        setGreet(true);
      }
      setStore(s);
      setStatusText("Getting the typesetter ready…", "busy");
      try {
        engineRef.current = await initEngine();
        setEngineReady(true);
      } catch (err) {
        setStatusText("The typesetter didn't load", "err", (err as Error).message);
      }
    })();
  }, [inside, setStatusText]);

  const activeBranch = store?.branches.find((b) => b.id === store.activeId) ?? store?.branches[0];

  /* compile whenever the engine comes up or the active copy changes */
  const activeId = store?.activeId;
  useEffect(() => {
    if (engineReady && activeId) void compile();
  }, [engineReady, activeId, compile]);

  /* Nothing is written as you type — compiling is what saves. The one
   * exception is leaving the page: a silent flush costs nothing and losing
   * an hour of typing to a closed tab is not a lesson worth teaching. */
  useEffect(() => {
    const flush = () => {
      const s = storeRef.current;
      /* a delete from the master must not wait for a compile that never comes */
      if (s) persistStore(prune(s, cutsRef.current.masterId, cutsRef.current.cuts) ?? s);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);


  useEffect(() => {
    try {
      localStorage.setItem(BESIDE_KEY, JSON.stringify(beside));
    } catch { /* a preference, not the résumé: losing it costs nothing */ }
  }, [beside]);

  const openLook = useCallback(() => {
    setBeside({ open: true, tab: "look" });
    setReveal((n) => n + 1);
  }, []);

  /* theme */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  /* ---------- edits ---------- */

  const editData: EditData = useCallback(
    (mutate: (d: ResumeData) => void, deleting = false) => {
      setStore((s) => {
        if (!s) return s;
        return {
          ...s,
          branches: s.branches.map((b) => {
            if (b.id !== s.activeId) return b;
            const data = structuredClone(b.data);
            mutate(data);
            /* a delete in the master is remembered until the save point,
             * which takes it out of the copies too (prune, in grow) */
            if (deleting && b.id === masterOf(s)?.id) {
              const cut = cutsBetween(b.data, data);
              if (cutsRef.current.masterId !== b.id) cutsRef.current = { masterId: b.id, cuts: [] };
              cutsRef.current.cuts.push(...cut);
            }
            return { ...b, updatedAt: new Date().toISOString(), data };
          }),
        };
      });
      /* with no engine there is no redraw coming, so leave the reason why on
       * screen rather than replacing it with a promise nothing will keep */
      if (engineRef.current) setStatusText("Edited — press Compile to save", "dirty");
      setGreet(false);
    },
    [setStatusText],
  );

  /* ---------- sync to the user's own cloud storage ---------- */

  const applyRemote = useCallback((next: Store) => {
    setStore(next);
    saveStore(next);
  }, [saveStore]);

  const sync = useSync({ provider: googleDrive, store, onStore: applyRemote });
  syncRef.current = sync;

  /* The compile that follows a click. The click is what makes Google's
   * window allowed, so a signed-in session with a dead token asks for one
   * here — and nowhere else. The boot-time compile calls compile() directly
   * and must never wake Drive: that would be a popup at page load. */
  const compileFromClick = useCallback(() => {
    syncRef.current?.wake();
    void compile();
  }, [compile]);

  /* Ctrl+S compiles */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        compileFromClick();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compileFromClick]);

  /* A guest upgrading to an account: connect() merges what is here into
   * Drive and pushes it, so nothing they wrote as a guest is stranded. */
  const signIn = useCallback(async () => {
    await sync.connect();
    if (googleDrive.wasConnected()) setSession("google");
  }, [sync]);

  /* Signing out always takes the résumé off this machine — one action, so
   * nobody has to pick the safe one. The copy in Drive is what makes that
   * safe, which is why the confirmation says when Drive last had it. */
  const signOut = useCallback(async () => {
    await sync.disconnect();
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* private mode — there was nothing kept to clear */
    }
    setStore(null);
    adoptedRef.current = null;
    /* let the next entry re-read whatever is left */
    initRef.current = false;
    compiledRef.current = null;
    setSession("out");
  }, [sync]);

  /* ---------- copies ---------- */

  const addBranches = useCallback((branches: Branch[]) => {
    /* an imported backup brings its own idea of which copy is the master;
     * this workspace already has one, so only the branches come across —
     * and whatever they hold that this master lacks joins it on the next
     * save point, like anything else written in a copy */
    updateStore((s) => ({ ...s, activeId: branches[0].id, branches: [...s.branches, ...branches] }));
  }, [updateStore]);

  /* An import into a workspace that is still only the untouched sample
   * replaces it, and the file decides the master (a single résumé is its
   * own). Appended instead, the sample stayed the master: it absorbed every
   * imported entry and offered its placeholders back on every shelf. */
  const importBranches = useCallback((branches: Branch[], masterId?: string) => {
    const cur = storeRef.current;
    if (!cur || !cur.branches.every(untouchedSample)) return addBranches(branches);
    const master = branches.some((b) => b.id === masterId) ? masterId! : branches[0].id;
    updateStore((s) => ({ ...s, activeId: branches[0].id, masterId: master, branches }));
  }, [addBranches, updateStore]);

  /* ---------- the master ---------- */

  const makeMaster = useCallback((branchId: string) => {
    updateStore((s) => ({ ...s, masterId: branchId }));
  }, [updateStore]);

  /* A new copy says where it came from, so the list reads as a tree
   * without anyone drawing one. */
  const newCopy = (fromId: string, name: string) => {
    const from = store?.branches.find((b) => b.id === fromId) ?? activeBranch;
    if (!from) return;
    addBranches([makeBranch(name, structuredClone(from.data), `Made from ${from.name}`)]);
  };

  const renameCopy = (branchId: string, name: string) => editBranch(branchId, (b) => ({ ...b, name }));

  const deleteCopy = (branchId: string) => {
    updateStore((cur) => {
      /* the sheet only offers this when there is more than one */
      if (cur.branches.length <= 1) return cur;
      const branches = cur.branches.filter((b) => b.id !== branchId);
      const activeId = branches.some((b) => b.id === cur.activeId) ? cur.activeId : branches[0].id;
      const masterId = branches.some((b) => b.id === cur.masterId) ? cur.masterId : branches[0].id;
      /* remembered, or the next sync unions the copy straight back from Drive */
      return { ...cur, activeId, masterId, branches, removed: markRemoved(cur, branchId) };
    });
  };

  const addFromLibrary = useCallback(
    (sectionIndex: number, entry: Entry) => {
      editData((d) => {
        const section = d.sections[sectionIndex];
        if (section && !d.sections.some((s) => s.entries.some((e) => e.id === entry.id))) {
          section.entries.push(structuredClone(entry));
        }
      });
    },
    [editData],
  );

  /* Your details is pooled like any section: the master holds every way of
   * reaching you that any copy has ever carried, and a copy takes one back
   * out of it here. Contacts have no ids, so "already here" is the same
   * question the pool asks — where does it go (see contactKey). */
  const addContactFromLibrary = useCallback(
    (contact: Contact) => {
      editData((d) => {
        const here = new Set(d.personal.contacts.map(contactKey));
        if (!here.has(contactKey(contact))) d.personal.contacts.push(structuredClone(contact));
      });
    },
    [editData],
  );

  /* ---------- import / export ---------- */

  const exportJson = () => {
    const s = storeRef.current;
    if (!s) return;
    saveStore(s);
    /* a backup is the whole workspace, deletions included — or importing it
     * next to a Drive copy would resurrect what was cut */
    const payload = { exportedAt: new Date().toISOString(), activeId: s.activeId, masterId: s.masterId, branches: s.branches, removed: s.removed };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "resume-branches.json");
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      let obj: unknown;
      try {
        obj = JSON.parse(String(reader.result));
      } catch (err) {
        setNotice({
          kind: "error",
          title: `"${file.name}" isn't valid JSON, so there was nothing to read.`,
          body: "If you exported it from here, try exporting again — a half-written file does this.",
          log: (err as Error).message,
        });
        return;
      }
      const o = obj as { branches?: unknown; versions?: unknown; personal?: unknown; sections?: unknown };
      if (Array.isArray(o.branches) || Array.isArray(o.versions)) {
        // a backup: append every branch with fresh ids, overwriting nothing
        const imported = normalizeStore(o);
        if (!imported) {
          setNotice({
            kind: "error",
            title: `"${file.name}" looks like a backup, but there are no résumés inside it.`,
          });
          return;
        }
        const tag = "-" + Date.now();
        importBranches(imported.branches.map((b) => ({ ...b, id: b.id + tag })), imported.masterId + tag);
      } else if (o.personal && o.sections) {
        // single resume (same shape as resume.json)
        const name = file.name.replace(/\.json$/i, "") || "Imported";
        importBranches([makeBranch(name, normalizeData(o))]);
      } else {
        setNotice({
          kind: "error",
          title: `Nothing in "${file.name}" looks like a résumé.`,
          body: "Import takes either a single résumé or a backup exported from here.",
        });
      }
    };
    reader.readAsText(file);
  };

  const downloadPdf = () => {
    const cur = pdfRef.current;
    if (!cur) return;
    const a = document.createElement("a");
    a.href = cur.url;
    a.download = cur.name;
    document.body.append(a);
    a.click();
    a.remove();
  };

  /* ---------- render ---------- */

  if (session === "restoring") {
    /* a blank hold, not the front page: flashing the door at someone whose
     * session is about to come back would be worse than a beat of nothing */
    return <div className="booting" />;
  }

  if (session === "out") {
    return (
      <Landing
        hasLocalWork={hasLocalWork()}
        onEnter={(initial, as) => {
          if (initial) {
            adoptedRef.current = initial;
            saveStore(initial);
          }
          setSession(as);
        }}
      />
    );
  }

  return (
    <>
      <TopBar
        store={store}
        branch={activeBranch ?? null}
        status={status}
        pdfReady={!!pdf}
        theme={theme}
        onSwitch={(id) => updateStore((s) => ({ ...s, activeId: id }))}
        onNewCopy={newCopy}
        onRenameCopy={renameCopy}
        onDeleteCopy={deleteCopy}
        syncProvider={googleDrive}
        syncState={sync.state}
        onSyncConnect={() => void sync.connect()}
        onSyncNow={() => void sync.syncNow()}
        masterId={store?.masterId}
        onMakeMaster={makeMaster}
        signedIn={session === "google"}
        onSignIn={() => void signIn()}
        onSignOut={() => void signOut()}
        onCompile={compileFromClick}
        onDownload={downloadPdf}
        onExport={exportJson}
        onImportFile={importFile}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      {greet && (
        <FirstRunStrip
          onMakeMine={() => {
            setGreet(false);
            setFocusName(true);
          }}
          onImportFile={(f) => {
            setGreet(false);
            importFile(f);
          }}
          onStartEmpty={() => {
            setGreet(false);
            editData((d) => {
              d.personal.name = "";
              d.personal.contacts = [];
              /* the section titles are the scaffolding worth keeping */
              d.sections.forEach((sec) => { sec.entries = []; });
            });
            setFocusName(true);
          }}
          onDismiss={() => setGreet(false)}
        />
      )}
      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}
      <main className="layout">
        {activeBranch && (
          <EditorPane
            key={activeBranch.id}
            data={activeBranch.data}
            store={store}
            branchId={activeBranch.id}
            onAddFromLibrary={addFromLibrary}
            onAddContact={addContactFromLibrary}
            editData={editData}
            focusName={focusName}
            onNameFocused={() => setFocusName(false)}
            onOpenLook={openLook}
            goTo={goTo}
          />
        )}
        <Preview url={pdf?.url ?? null} name={pdf?.name} />
        {activeBranch && (
          <Beside
            open={beside.open}
            tab={beside.tab}
            onOpen={(tab) => setBeside({ open: true, tab })}
            onFold={() => setBeside((b) => ({ ...b, open: false }))}
            reveal={reveal}
            data={activeBranch.data}
            editData={editData}
            checked={checked}
            stale={status.cls === "dirty"}
            failed={status.cls === "err"}
            onGoTo={(id) => setGoTo({ id, n: Date.now() })}
          />
        )}
      </main>
    </>
  );
}
