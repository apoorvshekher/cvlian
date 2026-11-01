import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeStore } from "../storage";
import type { Store } from "../types";
import { fingerprint, mergeStores, rekeySeen, type Seen } from "./merge";
import { isAuthNeeded, toPayload, type SyncProvider } from "./provider";

/* "behind" is a session that is still the user's — the connected flag is
 * set, the file id is known — with no live token. Drive can only be reached
 * again from a click, and the click that always comes is Compile, so the
 * hook parks here and the UI says "saves to Drive on your next Compile". */
export type SyncPhase = "off" | "connecting" | "behind" | "idle" | "syncing" | "error";

export interface SyncState {
  phase: SyncPhase;
  message: string;
  lastSyncedAt: string | null;
  notes: string[];
}

/* A fingerprint of each copy as this browser last pushed it. It has to
 * outlive the tab: without it every fresh page load reads Drive's older
 * copy as a rival edit, and the merge splits off a copy nobody asked for.
 * Kept next to the connected flag, never with the résumé itself. */
const SEEN_KEY = "resume-sync-seen";

function readSeen(): Seen {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Seen) : {};
  } catch {
    return {};
  }
}

function writeSeen(store: Store): Seen {
  const seen: Seen = {};
  for (const b of store.branches) seen[b.id] = fingerprint(b.data);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch { /* a full or blocked store only costs us the noise-free merge */ }
  return seen;
}

/* Commands arrive in bursts — make a copy, rename, switch — and one push
 * a beat later covers the burst. */
const COMMIT_MS = 1000;

/* Owns the conversation with one provider. Drive follows the SAVE POINT:
 * App tells the hook when something reached localStorage (`committed`) and
 * when a click happened that may open Google's window (`wake`). Nothing in
 * here runs on a timer or on typing. The local store stays the source of
 * truth for the editor; the remote is only ever a copy that gets merged in,
 * never something the UI waits on. */
export function useSync({
  provider,
  store,
  onStore,
}: {
  provider: SyncProvider;
  store: Store | null;
  onStore: (next: Store) => void;
}) {
  const [state, setState] = useState<SyncState>({
    phase: "off",
    message: "",
    lastSyncedAt: null,
    notes: [],
  });

  const storeRef = useRef<Store | null>(store);
  storeRef.current = store;
  const revRef = useRef<string | null>(null);
  /* The exact store object last pushed. Identity against the live store is
   * what decides there is something to push — deriving "dirty" from sync
   * state instead makes every completed sync look like a new change and
   * spins an idle tab forever. */
  const lastPushedRef = useRef<Store | null>(null);
  const seenRef = useRef<Seen>(readSeen());
  const timerRef = useRef<number | undefined>(undefined);
  const busyRef = useRef(false);

  const fail = useCallback((err: unknown) => {
    const message = (err as Error)?.message ?? String(err);
    /* A missing token is not a fault to retry: parking stops the hook from
     * throwing at Google until a click can get a token back. */
    setState((s) => ({ ...s, phase: isAuthNeeded(err) ? "behind" : "error", message }));
  }, []);

  /* Pull the remote copy, merge it into what we have, push the result. */
  const syncNow = useCallback(async () => {
    if (!storeRef.current || busyRef.current) return;
    busyRef.current = true;
    setState((s) => ({ ...s, phase: "syncing", message: "" }));
    try {
      const remote = await provider.load();

      /* Merge against the store as it is NOW, not as it was before the
       * round trip. Seconds pass while Drive answers and the user keeps
       * typing; merging a stale snapshot back in silently discards
       * everything they wrote in the meantime. */
      let merged = storeRef.current;
      if (!merged) return;
      let notes: string[] = [];

      if (remote) {
        const parsed = normalizeStore(remote.payload);
        if (parsed && remote.rev !== revRef.current) {
          const seen = rekeySeen(seenRef.current, remote.payload, parsed);
          const result = mergeStores(merged, parsed, provider.name, seen);
          notes = result.notes;
          // only touch local state when the merge actually changed something,
          // otherwise every sync looks like an edit and schedules another
          if (JSON.stringify(result.store) !== JSON.stringify(merged)) {
            merged = result.store;
            onStore(merged);
          }
        }
      }

      revRef.current = await provider.save(toPayload(merged));
      lastPushedRef.current = merged;
      /* what went out, so the next merge can tell our own copy from a rival */
      seenRef.current = writeSeen(merged);
      setState({
        phase: "idle",
        message: "",
        lastSyncedAt: new Date().toISOString(),
        notes,
      });
    } catch (err) {
      fail(err);
    } finally {
      busyRef.current = false;
    }
  }, [provider, onStore, fail]);

  const connect = useCallback(
    async (silent = false) => {
      if (!provider.isConfigured()) return;
      setState((s) => ({ ...s, phase: "connecting", message: "" }));
      try {
        const ok = await provider.connect(silent);
        if (!ok) {
          /* A silent resume that could not reuse a token still belongs to
           * whoever signed in before — park, do not sign them out. */
          const parked = silent && provider.wasConnected();
          setState((s) => ({
            ...s,
            phase: parked ? "behind" : "off",
            message: silent ? "" : "Sign-in was dismissed",
          }));
          return;
        }
        await syncNow();
      } catch (err) {
        fail(err);
      }
    },
    [provider, syncNow, fail],
  );

  const disconnect = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    await provider.disconnect().catch(() => {});
    revRef.current = null;
    lastPushedRef.current = null;
    seenRef.current = {};
    try {
      localStorage.removeItem(SEEN_KEY);
    } catch { /* nothing to clean up */ }
    setState({ phase: "off", message: "", lastSyncedAt: null, notes: [] });
  }, [provider]);

  /* Pick a previous session back up, silently or not at all: a popup at
   * page load is one nobody asked for, and browsers block it anyway. With
   * the token still in the tab this is a quiet pull-merge-push; without it
   * the session parks as "behind" until Compile. */
  const triedResume = useRef(false);
  useEffect(() => {
    if (triedResume.current || !store) return;
    triedResume.current = true;
    if (provider.isConfigured() && provider.wasConnected()) void connect(true);
  }, [store, provider, connect]);

  /* Something reached localStorage. Push it if that needs no window;
   * otherwise park until a click can get a token. Debounced, so a burst of
   * workspace commands is one write, and the check at fire time is identity
   * against the last push — never the phase. */
  const committed = useCallback(() => {
    if (!provider.isConfigured() || !provider.wasConnected()) return;
    if (!provider.hasToken()) {
      setState((s) => (s.phase === "connecting" || s.phase === "syncing" ? s : { ...s, phase: "behind" }));
      return;
    }
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (storeRef.current !== lastPushedRef.current) void syncNow();
    }, COMMIT_MS);
  }, [provider, syncNow]);

  /* A click that may open Google's window — Compile, Sync now. With a live
   * token there is nothing to do: `committed` will push. Without one, this
   * is the moment to ask, because the click is what makes the popup allowed.
   * Must never be reached from an effect: that is a popup at page load. */
  const wake = useCallback(() => {
    if (!provider.isConfigured() || !provider.wasConnected() || provider.hasToken()) return;
    void connect(false);
  }, [provider, connect]);

  return { state, connect, disconnect, syncNow, committed, wake };
}
