import type { Branch, Contact, Entry, EntryKind, ResumeData, ResumeSection, Store } from "./types";

/* The master résumé: every element you have ever written, in one place.
 *
 * It is not a document you send — it is the pool the tailored copies are
 * drawn from. Whatever you write in a copy turns up here by itself at the
 * next save point, and `libraryFor` is the same pool read the other way, so
 * a copy can take anything back out of it.
 *
 * Copies already share entry ids — newCopy structuredClones, and normalizeData
 * keeps ids rather than minting new ones — so "what is in this copy that the
 * master has never seen" is a set difference, not a guess.
 *
 * That same fact draws the only line that matters here. An ADDED thing has an
 * id the master has never seen: it belongs in the pool. An EDITED thing has
 * the same id and different words, and those words were tailored on purpose —
 * flowing them back would overwrite the master with role-specific phrasing.
 * **Additions travel, rewordings never do**, and that asymmetry is what keeps
 * an automatic flow safe to leave running.
 *
 * The master is the union of every copy, so the one way out of it is a
 * deliberate delete made IN the master: that is taken out of every copy too
 * (`prune`), before the master absorbs anything at the same save point —
 * otherwise a copy still holding it would put it straight back, and
 * deleting from the master would mean hunting it down in every copy. */

export type AdditionKind = "entry" | "bullet" | "tags" | "contact";

export interface Addition {
  /* one key per thing carried; a tags addition carries one per tag */
  keys: string[];
  kind: AdditionKind;
  fromId: string;
  fromName: string;
  /* where it lives — set for everything that lives in a section, which is
   * everything except a contact: Your details is not one */
  sectionId?: string;
  sectionTitle?: string;
  sectionKind?: EntryKind;
  /* the entry itself, or the one a bullet or a tag was added to */
  entry?: Entry;
  bulletId?: string;
  bulletText?: string;
  tags?: string[];
  /* a way to reach you */
  contact?: Contact;
}

/* Your details is pooled like any section, and a contact has no id to pool
 * it by — so, like a tag, it travels by value. The value that means "the
 * same contact" is **where it goes**: two rows pointing at the same address
 * are the same way of reaching you however the label is worded, so
 * relabelling "linkedin.com/in/alexdoe" to "LinkedIn" is a rewording and
 * stays in the copy it was written for. A row that goes nowhere is just
 * text, and then the text is all there is to go on.
 *
 * The name is deliberately not here. There is one of it, it is always
 * present, so every change to it is a rewording by definition — and a name
 * tailored for one employer is the last thing that should reach the pool. */
export const contactKey = (c: Contact): string =>
  c.url.trim().toLowerCase().replace(/\/+$/, "") || c.text.trim().toLowerCase();

const hasContact = (c: Contact): boolean => !!(c.text.trim() || c.url.trim());

const entriesOf = (d: ResumeData): Entry[] => d.sections.flatMap((s) => s.entries);
const bulletsOf = (e: Entry) => ("bullets" in e ? e.bullets : []);

/* An entry someone started and left blank is not worth carrying anywhere. */
function hasSubstance(e: Entry): boolean {
  const some = (...xs: string[]) => xs.some((x) => x && x.trim());
  const bullets = bulletsOf(e).some((b) => b.text.trim());
  switch (e.kind) {
    case "experience": return some(e.role, e.company) || bullets;
    case "education": return some(e.school, e.degree, e.field);
    case "project": return some(e.name, e.description) || bullets;
    case "item": return some(e.title, e.subtitle) || bullets;
    case "certification": return some(e.name, e.issuer) || bullets;
    case "publication": return some(e.title, e.venue, e.authors) || bullets;
    case "paragraph": return some(e.text);
    case "tags": return e.tags.some((t) => t.trim());
    case "levels": return e.items.some((i) => i.name.trim());
    default: return some(e.left, e.right) || bullets;
  }
}

export function masterOf(store: Store): Branch | undefined {
  return store.branches.find((b) => b.id === store.masterId) ?? store.branches[0];
}

/* Everything written in another copy that the master does not have yet. */
export function pendingAdditions(store: Store): Addition[] {
  const master = masterOf(store);
  if (!master) return [];
  const byId = new Map(entriesOf(master.data).map((e) => [e.id, e]));
  const out: Addition[] = [];
  const taken = new Set<string>();

  const push = (a: Addition) => {
    /* the same thing can be new in two copies at once — carry it once */
    const kept = a.keys.filter((k) => !taken.has(k));
    if (!kept.length) return;
    kept.forEach((k) => taken.add(k));
    const id = a.entry?.id;
    out.push({ ...a, keys: kept, tags: a.tags?.filter((t) => kept.includes(`t:${id}:${t}`)) });
  };

  const masterContacts = new Set(master.data.personal.contacts.filter(hasContact).map(contactKey));

  for (const b of store.branches) {
    if (b.id === master.id) continue;

    /* Your details, on the same terms as everything else */
    for (const c of b.data.personal.contacts) {
      if (!hasContact(c)) continue;
      const key = contactKey(c);
      if (masterContacts.has(key)) continue;
      push({ fromId: b.id, fromName: b.name, kind: "contact", keys: [`c:${key}`], contact: c });
    }

    for (const s of b.data.sections) {
      for (const e of s.entries) {
        const base = {
          fromId: b.id,
          fromName: b.name,
          sectionId: s.id,
          sectionTitle: s.title,
          sectionKind: s.kind,
          entry: e,
        };
        const here = byId.get(e.id);

        if (!here) {
          if (hasSubstance(e)) push({ ...base, kind: "entry", keys: [`e:${e.id}`] });
          continue;
        }

        const has = new Set(bulletsOf(here).map((x) => x.id));
        for (const bu of bulletsOf(e)) {
          if (has.has(bu.id) || !bu.text.trim()) continue;
          push({ ...base, kind: "bullet", keys: [`b:${bu.id}`], bulletId: bu.id, bulletText: bu.text });
        }

        if (e.kind === "tags" && here.kind === "tags") {
          const had = new Set(here.tags.map((t) => t.trim()).filter(Boolean));
          const added = e.tags.map((t) => t.trim()).filter((t) => t && !had.has(t));
          if (added.length) {
            push({ ...base, kind: "tags", keys: added.map((t) => `t:${e.id}:${t}`), tags: added });
          }
        }
      }
    }
  }
  return out;
}

/* Put one addition into the master's data. Mutates the clone it is given. */
export function applyAddition(
  data: ResumeData,
  a: Addition,
  makeSection: (kind: EntryKind, title: string) => ResumeSection,
): void {
  if (a.kind === "contact") {
    if (!a.contact) return;
    const had = new Set(data.personal.contacts.filter(hasContact).map(contactKey));
    if (!had.has(contactKey(a.contact))) data.personal.contacts.push(structuredClone(a.contact));
    return;
  }

  if (!a.entry) return;
  const entry = a.entry;

  if (a.kind === "entry") {
    const title = a.sectionTitle ?? "";
    let target =
      data.sections.find((s) => s.id === a.sectionId) ??
      data.sections.find((s) => s.title.trim().toLowerCase() === title.trim().toLowerCase());
    if (!target) {
      /* the master has no section for this — give it one rather than quietly
       * dropping something someone asked to keep */
      target = makeSection(a.sectionKind ?? "standard", title);
      data.sections.push(target);
    }
    if (!target.entries.some((e) => e.id === entry.id)) target.entries.push(structuredClone(entry));
    return;
  }

  const host = entriesOf(data).find((e) => e.id === entry.id);
  if (!host) return;

  if (a.kind === "bullet" && "bullets" in host && a.bulletId) {
    const bullet = bulletsOf(entry).find((x) => x.id === a.bulletId);
    if (bullet && !host.bullets.some((x) => x.id === bullet.id)) host.bullets.push(structuredClone(bullet));
    return;
  }

  if (a.kind === "tags" && host.kind === "tags" && a.tags) {
    const had = new Set(host.tags.map((t) => t.trim()));
    for (const t of a.tags) if (!had.has(t)) host.tags.push(t);
  }
}

/* Something deleted from the master, by what identifies it — the same four
 * granularities additions travel by, plus the section holding them. */
export type Cut =
  | { kind: "section"; id: string }
  | { kind: "entry"; id: string }
  | { kind: "bullet"; id: string }
  | { kind: "tag"; entryId: string; tag: string }
  | { kind: "contact"; key: string };

/* What one delete took out of the master. Only ever run over an edit that
 * IS a delete — a contact whose address is retyped also loses its old key,
 * and that is a rewording, never a cut. */
export function cutsBetween(before: ResumeData, after: ResumeData): Cut[] {
  const out: Cut[] = [];
  for (const s of before.sections) {
    if (!after.sections.some((x) => x.id === s.id)) out.push({ kind: "section", id: s.id });
  }
  const now = new Map(entriesOf(after).map((e) => [e.id, e]));
  for (const e of entriesOf(before)) {
    const here = now.get(e.id);
    if (!here) {
      out.push({ kind: "entry", id: e.id });
      continue;
    }
    const kept = new Set(bulletsOf(here).map((b) => b.id));
    for (const b of bulletsOf(e)) if (!kept.has(b.id)) out.push({ kind: "bullet", id: b.id });
    if (e.kind === "tags" && here.kind === "tags") {
      const had = new Set(here.tags.map((t) => t.trim()));
      for (const t of e.tags.map((x) => x.trim())) if (t && !had.has(t)) out.push({ kind: "tag", entryId: e.id, tag: t });
    }
  }
  const keep = new Set(after.personal.contacts.filter(hasContact).map(contactKey));
  for (const c of before.personal.contacts) {
    if (hasContact(c) && !keep.has(contactKey(c))) out.push({ kind: "contact", key: contactKey(c) });
  }
  return out;
}

/* Take what was deleted from the master out of every other copy. A cut the
 * master holds again was undone and is skipped; a cut made while another
 * copy was the master is not this master's to apply. Returns null when no
 * copy held any of it. */
export function prune(store: Store, masterId: string, cuts: Cut[]): Store | null {
  const master = masterOf(store);
  if (!master || master.id !== masterId || !cuts.length) return null;
  const m = master.data;
  const held = entriesOf(m);
  const undone = (c: Cut): boolean => {
    switch (c.kind) {
      case "section": return m.sections.some((s) => s.id === c.id);
      case "entry": return held.some((e) => e.id === c.id);
      case "bullet": return held.some((e) => bulletsOf(e).some((b) => b.id === c.id));
      case "tag": return held.some((e) => e.id === c.entryId && e.kind === "tags" && e.tags.some((t) => t.trim() === c.tag));
      case "contact": return m.personal.contacts.some((x) => hasContact(x) && contactKey(x) === c.key);
    }
  };
  const live = cuts.filter((c) => !undone(c));
  if (!live.length) return null;

  const sections = new Set<string>();
  const entries = new Set<string>();
  const bullets = new Set<string>();
  const contacts = new Set<string>();
  const tags = new Map<string, Set<string>>();
  for (const c of live) {
    if (c.kind === "section") sections.add(c.id);
    else if (c.kind === "entry") entries.add(c.id);
    else if (c.kind === "bullet") bullets.add(c.id);
    else if (c.kind === "contact") contacts.add(c.key);
    else tags.set(c.entryId, (tags.get(c.entryId) ?? new Set<string>()).add(c.tag));
  }

  let changed = false;
  const branches = store.branches.map((b) => {
    if (b.id === master.id) return b;
    const data = structuredClone(b.data);
    let hit = false;
    const pick = <T,>(list: T[], keep: (x: T) => boolean): T[] => {
      const out = list.filter(keep);
      if (out.length !== list.length) hit = true;
      return out;
    };
    data.personal.contacts = pick(data.personal.contacts, (c) => !(hasContact(c) && contacts.has(contactKey(c))));
    for (const s of data.sections) {
      s.entries = pick(s.entries, (e) => !entries.has(e.id));
      for (const e of s.entries) {
        if ("bullets" in e) e.bullets = pick(e.bullets, (x) => !bullets.has(x.id));
        const lost = e.kind === "tags" ? tags.get(e.id) : undefined;
        if (e.kind === "tags" && lost) e.tags = pick(e.tags, (t) => !lost.has(t.trim()));
      }
    }
    /* the section goes too, once nothing this copy wrote itself is left in it */
    data.sections = pick(data.sections, (s) => !(sections.has(s.id) && !s.entries.length));
    if (!hit) return b;
    changed = true;
    return { ...b, data, updatedAt: new Date().toISOString() };
  });
  return changed ? { ...store, branches } : null;
}

/* Grow the master by everything the copies have written since it last looked.
 * Returns a new store, or null when there is nothing to carry — callers run
 * this at every save point, so "nothing changed" has to cost nothing. */
export function absorb(
  store: Store,
  makeSection: (kind: EntryKind, title: string) => ResumeSection,
): Store | null {
  const master = masterOf(store);
  if (!master) return null;
  const pending = pendingAdditions(store);
  if (!pending.length) return null;

  const data = structuredClone(master.data);
  for (const a of pending) applyAddition(data, a, makeSection);
  return {
    ...store,
    branches: store.branches.map((b) =>
      b.id === master.id ? { ...b, data, updatedAt: new Date().toISOString() } : b,
    ),
  };
}

/* The master's ways of reaching you that this copy does not hold — the same
 * pool as libraryFor, read for Your details. Adding one back is a plain copy
 * of the row: contacts are matched by where they go, so afterwards both hold
 * the same one and it stops counting as an addition in either direction. */
export function contactsFor(
  store: Store,
  branchId: string,
): { contact: Contact; fromName: string }[] {
  const mine = store.branches.find((b) => b.id === branchId);
  const master = masterOf(store);
  if (!mine || !master || master.id === branchId) return [];
  const have = new Set(mine.data.personal.contacts.filter(hasContact).map(contactKey));
  return master.data.personal.contacts
    .filter((c) => hasContact(c) && !have.has(contactKey(c)))
    .map((contact) => ({ contact, fromName: master.name }));
}

/* The master's entries of this kind that this copy does not hold — the pool,
 * read from a copy's side. Everything ends up in the master, so reading only
 * the master reaches every copy's work without going looking for it. Adding
 * one keeps its id, so afterwards both hold the same thing and it stops
 * counting as an addition in either direction. */
export function libraryFor(
  store: Store,
  branchId: string,
  kind: EntryKind,
): { entry: Entry; fromName: string }[] {
  const mine = store.branches.find((b) => b.id === branchId);
  const master = masterOf(store);
  if (!mine || !master || master.id === branchId) return [];
  const have = new Set(entriesOf(mine.data).map((e) => e.id));
  return entriesOf(master.data)
    .filter((e) => e.kind === kind && !have.has(e.id))
    .map((entry) => ({ entry, fromName: master.name }));
}
