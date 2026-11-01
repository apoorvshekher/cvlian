import { newId, REMOVED_KEEP } from "../storage";
import type { Branch, Removal, ResumeData, Store } from "../types";

/* Merging two copies of the workspace that both moved on.
 *
 * The rule is that nothing is ever discarded: a copy that exists on only one
 * side is kept, and when the same copy has different contents on each side
 * the newer one stays live while the older is kept right beside it, as a
 * copy of its own. No merge UI, no lost edits, and the other side is one
 * click away in the copies sheet.
 *
 * A copy is only ever split for a *real* conflict — both sides moved since
 * the last thing this browser sent. `Seen` is what makes that knowable:
 * after every push the sync layer records a fingerprint of each copy as it
 * went out, so a side that still matches its fingerprint has not moved and
 * the other side simply wins. Drive is routinely behind (it is only written
 * at a save point, while `beforeunload` writes localStorage), and treating
 * that lag as a conflict would split a copy on every visit — exactly the
 * noise this app promises not to make.
 *
 * The one exception is what the user deleted on purpose. `Store.removed`
 * carries those ids; without it the union returned every deleted copy from
 * Drive a second after the click, and a delete never stuck for anyone signed
 * in. A copy edited after its deletion is newer than the deletion, so it
 * survives and the tombstone is dropped — an edit beats a delete. */

export interface MergeResult {
  store: Store;
  notes: string[];
}

const sameData = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* What this browser last sent, per branch id. Content, not a clock: Drive's
 * own revision numbers say when the file changed, never whose change it was. */
export type Seen = Record<string, string>;

/* FNV-1a over the serialized copy — short enough to keep every branch's in
 * localStorage, and only ever compared for equality. */
export function fingerprint(data: unknown): string {
  const s = JSON.stringify(data);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + "." + s.length.toString(36);
}

/* `seen` was taken over copies as this browser pushed them, and a newer
 * build can read the very same stored copy into a different shape (a
 * DATA_VERSION conversion). Drive's copy as stored still matches when it has
 * not moved, so test the stored form and carry the match over to the parsed
 * one — or the first sync after an upgrade reads Drive being behind as a
 * rival edit and sets a copy aside nobody asked for. */
export function rekeySeen(
  seen: Seen,
  stored: { branches?: unknown },
  parsed: Store,
): Seen {
  const out = { ...seen };
  for (const b of Array.isArray(stored.branches) ? (stored.branches as { id?: unknown; data?: unknown }[]) : []) {
    const id = typeof b?.id === "string" ? b.id : "";
    const now = parsed.branches.find((x) => x.id === id);
    if (now && seen[id] === fingerprint(b.data)) out[id] = fingerprint(now.data);
  }
  return out;
}

/* The sample a fresh workspace opens on, its words still exactly as they
 * arrived. It is there to look at, not anyone's work: any edit to a word
 * makes it theirs. The stamp leaves the design out — trying a theme on the
 * sample is not writing a résumé. */
export const sampleStamp = (d: ResumeData): string => fingerprint({ personal: d.personal, sections: d.sections });
export const untouchedSample = (b: Branch): boolean => !!b.sample && b.sample === sampleStamp(b.data);

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "earlier"
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* Both sides' deletions, latest time per id. */
function tombstones(local: Store, remote: Store): Map<string, string> {
  const at = new Map<string, string>();
  for (const r of [...(remote.removed ?? []), ...(local.removed ?? [])]) {
    const known = at.get(r.id);
    if (known === undefined || known < r.at) at.set(r.id, r.at);
  }
  return at;
}

export function mergeStores(local: Store, remote: Store, remoteLabel = "Drive", seen: Seen = {}): MergeResult {
  const notes: string[] = [];
  const tomb = tombstones(local, remote);
  const alive = (b: Branch) => {
    const at = tomb.get(b.id);
    if (at === undefined) return true;
    if (b.updatedAt > at) {
      tomb.delete(b.id);
      return true;
    }
    return false;
  };

  /* A guest meets the sample, and signing in to a Drive that already held a
   * résumé used to union it in beside that résumé — as the active copy and
   * the master, so the master then absorbed every real entry and offered the
   * sample's placeholders back on every shelf. An untouched sample only one
   * side holds gives way: to the other side's work, and always on the
   * remote side, where it can only be another device's placeholder. One both
   * sides hold is this workspace's own and stays. */
  const placeholder = (b: Branch, other: Store) =>
    untouchedSample(b) && !other.branches.some((x) => x.id === b.id);
  const remoteHasWork = remote.branches.some((b) => !untouchedSample(b));

  const ours = local.branches.filter((b) => alive(b) && !(remoteHasWork && placeholder(b, remote)));
  const byId = new Map(
    remote.branches.filter((b) => alive(b) && !placeholder(b, local)).map((b) => [b.id, b]),
  );

  let branches: Branch[] = ours.flatMap((mine) => {
    const theirs = byId.get(mine.id);
    if (!theirs) return [mine];
    byId.delete(mine.id);

    if (sameData(mine.data, theirs.data)) return [mine];

    /* One side has not moved since this browser last pushed, so there is no
     * conflict and nothing worth keeping: the other side is simply the same
     * work, further along. Remote unchanged = Drive is behind us (the usual
     * case); local unchanged = another device carried on from our push. */
    const sent = seen[mine.id];
    if (sent !== undefined) {
      if (sent === fingerprint(theirs.data)) return [mine];
      if (sent === fingerprint(mine.data)) return [{ ...theirs, name: mine.name }];
    }

    /* both sides edited this copy: the newer stays live under its id, and
     * the older is set beside it with an id of its own */
    const mineIsNewer = mine.updatedAt >= theirs.updatedAt;
    const keep = mineIsNewer ? mine : theirs;
    const other = mineIsNewer ? theirs : mine;
    const name = `${mine.name} — ${mineIsNewer ? `from ${remoteLabel}` : "from this device"}`;
    notes.push(`"${mine.name}" differed — kept the newer one, and the other as "${name}".`);
    return [
      { ...keep, name: mine.name },
      { ...other, id: newId(), name, origin: `Set aside when both sides changed it · ${when(other.updatedAt)}` },
    ];
  });

  for (const extra of byId.values()) {
    branches.push(extra);
    notes.push(`Added the "${extra.name}" copy from ${remoteLabel}.`);
  }
  /* cannot happen — a side never tombstones its own last copy — but an empty
   * workspace is the one result worse than any merge */
  if (!branches.length) branches = local.branches;

  const has = (id: string | undefined) => !!id && branches.some((b) => b.id === id);
  const activeId = has(local.activeId) ? local.activeId : has(remote.activeId) ? remote.activeId : branches[0].id;
  const masterId = has(local.masterId) ? local.masterId : has(remote.masterId) ? remote.masterId : branches[0].id;
  const removed: Removal[] = [...tomb]
    .map(([id, at]) => ({ id, at }))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, REMOVED_KEEP);

  return { store: { activeId, masterId, branches, ...(removed.length ? { removed } : {}) }, notes };
}
