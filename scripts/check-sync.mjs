/* Exercises the sync merge rules without a browser or a Google account.
 * The promise merging makes is that nothing is ever discarded, so every
 * case here asserts where each side's work ended up.
 *
 *   node scripts/check-sync.mjs
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "sync-"));
try {
  execFileSync("npx", ["tsc", "src/sync/merge.ts", "src/master.ts", "--outDir", out,
    "--module", "commonjs", "--target", "es2022", "--skipLibCheck"], { stdio: "pipe" });
} catch { /* tsc still emits */ }

const require = createRequire(import.meta.url);
const { mergeStores, fingerprint, rekeySeen, untouchedSample, sampleStamp } = require(join(out, "sync/merge.js"));
const { normalizeStore, normalizeData } = require(join(out, "storage.js"));
const { absorb, cutsBetween, prune } = require(join(out, "master.js"));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "ok  " : "FAIL"}: ${label}`);
  if (!cond) failures++;
};

const data = (title) => ({
  personal: { name: "Alex", contacts: [] },
  sections: [{ id: "s1", title, kind: "standard", side: false, entries: [] }],
  design: { themeId: "classic", accent: "#000000", font: "charter", fontSize: 10, margins: 2, density: 1, paper: "letter", nameSize: 25, dateColWidth: 4.5 },
});
const branch = (id, name, title, updatedAt) => ({
  id, name, createdAt: "2026-01-01T00:00:00Z", updatedAt, data: data(title),
});
const titles = (store) => store.branches.map((b) => b.data.sections[0].title);

/* 1. identical on both sides */
{
  const a = { activeId: "b1", branches: [branch("b1", "Main", "same", "2026-09-10T10:00:00Z")] };
  const r = mergeStores(a, structuredClone(a), "Drive");
  check("identical stores merge silently", r.notes.length === 0 && r.store.branches.length === 1);
}

/* 2. a branch that only exists remotely is adopted */
{
  const local = { activeId: "b1", branches: [branch("b1", "Main", "x", "2026-09-10T10:00:00Z")] };
  const remote = { activeId: "b1", branches: [branch("b1", "Main", "x", "2026-09-10T10:00:00Z"), branch("b2", "Data Scientist", "y", "2026-09-11T10:00:00Z")] };
  const r = mergeStores(local, remote, "Drive");
  check("remote-only branch is added", r.store.branches.length === 2 && r.store.branches.some((b) => b.name === "Data Scientist"));
  check("  ...and is reported", r.notes.some((n) => n.includes("Data Scientist")));
}

/* 3. same copy edited on both sides — newer stays live, older is kept as a
 *    copy of its own, right beside it */
{
  const local = { activeId: "b1", masterId: "b1", branches: [branch("b1", "Main", "local edit", "2026-09-12T12:00:00Z")] };
  const remote = { activeId: "b1", masterId: "b1", branches: [branch("b1", "Main", "remote edit", "2026-09-11T09:00:00Z")] };
  const r = mergeStores(local, remote, "Drive");
  const [live, other] = r.store.branches;
  check("newer local copy stays live", live.id === "b1" && live.data.sections[0].title === "local edit");
  check("older remote copy is kept as a copy beside it", r.store.branches.length === 2 && other?.data.sections[0].title === "remote edit");
  check("  ...under an id of its own", !!other && other.id !== "b1");
  check("  ...named for where it came from", other?.name === "Main — from Drive");
  check("  ...and saying why it exists", /both sides changed/.test(other?.origin ?? ""));
  check("  ...while the master stays the live one", r.store.masterId === "b1" && r.store.activeId === "b1");
  check("  ...and the split is reported", r.notes.some((n) => n.includes("Main — from Drive")));
}

/* 4. the same, with the remote being newer */
{
  const local = { activeId: "b1", branches: [branch("b1", "Main", "local edit", "2026-09-10T08:00:00Z")] };
  const remote = { activeId: "b1", branches: [branch("b1", "Data Scientist", "remote edit", "2026-09-12T12:00:00Z")] };
  const r = mergeStores(local, remote, "Drive");
  const [live, other] = r.store.branches;
  check("newer remote copy becomes live", live.data.sections[0].title === "remote edit");
  check("this device's copy is kept as a copy", other?.data.sections[0].title === "local edit");
  check("  ...named for where it came from", other?.name === "Main — from this device");
  check("  ...and the live one keeps its local name", live.name === "Main");
}

/* 5. a Drive file written while copies still carried saved versions merges
 *    cleanly: the versions are gone, and where each copy came from is not */
{
  const T = "2026-09-10T10:00:00Z";
  const old = (title) => ({
    ...branch("b1", "Data Scientist", title, T),
    versions: [
      { id: "v1", name: "before the rewrite", kind: "named", savedAt: T, data: data("snap") },
      { id: "v0", name: "Made from Master", kind: "origin", savedAt: T, data: data("snap") },
    ],
  });
  const local = normalizeStore({ activeId: "b1", branches: [old("x")] });
  const remote = normalizeStore({ activeId: "b1", branches: [old("x")] });
  check("a copy's old saved versions are not carried any more", local.branches.every((b) => !("versions" in b)));
  check("  ...but where it came from is", local.branches[0].origin === "Made from Master");
  const r = mergeStores(local, remote, "Drive");
  check("  ...and the same copy on both sides is not a conflict", r.notes.length === 0 && r.store.branches.length === 1);
}

/* 6. the active branch survives, or falls back to one that exists */
{
  const local = { activeId: "gone", branches: [branch("b1", "Main", "x", "2026-09-10T10:00:00Z")] };
  const r = mergeStores(local, { activeId: "b1", branches: [] }, "Drive");
  check("a dangling activeId falls back to a real branch", r.store.activeId === "b1");
}

/* 7. a deleted copy stays deleted, unless it was edited elsewhere afterwards */
{
  const local = { activeId: "b1", removed: [{ id: "b2", at: "2026-09-10T11:00:00Z" }], branches: [branch("b1", "Main", "x", "2026-09-10T10:00:00Z")] };
  const stale = { activeId: "b1", branches: [branch("b1", "Main", "x", "2026-09-10T10:00:00Z"), branch("b2", "Old", "y", "2026-09-10T09:00:00Z")] };
  const gone = mergeStores(local, stale, "Drive");
  check("a deleted copy does not come back from Drive", gone.store.branches.length === 1);
  check("  ...and the deletion travels to the other side", gone.store.removed?.some((x) => x.id === "b2"));
  check("  ...where it deletes the same copy", mergeStores(stale, gone.store, "Drive").store.branches.length === 1);
  const edited = { activeId: "b1", branches: [branch("b1", "Main", "x", "2026-09-10T10:00:00Z"), branch("b2", "Old", "y", "2026-09-10T12:00:00Z")] };
  const r = mergeStores(local, edited, "Drive");
  check("a copy edited after it was deleted elsewhere survives", r.store.branches.length === 2);
  check("  ...and its tombstone is dropped", !(r.store.removed ?? []).some((x) => x.id === "b2"));
}

/* 8. which copy is the master survives the round trip */
{
  const T = "2026-09-10T10:00:00Z";
  const local = { activeId: "b1", masterId: "b2", branches: [branch("b1", "Main", "x", T), branch("b2", "Master", "m", T)] };
  const r = mergeStores(local, { activeId: "b1", branches: [branch("b1", "Main", "x", T)] }, "Drive");
  check("the master flag survives a merge", r.store.masterId === "b2");
}

/* 9. one side has not moved since our last push — no conflict, nothing split */
{
  const T = "2026-09-10T10:00:00Z";
  const sent = { activeId: "b1", branches: [branch("b1", "Main", "as pushed", T)] };
  const seen = { b1: fingerprint(sent.branches[0].data) };

  /* Drive is simply behind: it still holds what we sent, we have typed since */
  const ahead = { activeId: "b1", branches: [branch("b1", "Main", "typed since", "2026-09-10T12:00:00Z")] };
  let r = mergeStores(ahead, sent, "Drive", seen);
  check("Drive being behind this browser is not a conflict", r.store.branches.length === 1);
  check("  ...and the local copy stays live", r.store.branches[0].data.sections[0].title === "typed since");

  /* the other way: we have not moved, another device carried on from our push */
  const theirs = { activeId: "b1", branches: [branch("b1", "Data Scientist", "their edit", "2026-09-10T12:00:00Z")] };
  r = mergeStores(sent, theirs, "Drive", seen);
  check("another device continuing from our push is not a conflict", r.store.branches.length === 1);
  check("  ...and their newer copy becomes live", r.store.branches[0].data.sections[0].title === "their edit");
  check("  ...under the name this browser uses", r.store.branches[0].name === "Main");

  /* both moved since that push: that is a real conflict and both are kept */
  const mine = { activeId: "b1", branches: [branch("b1", "Main", "my edit", "2026-09-10T12:00:00Z")] };
  r = mergeStores(mine, theirs, "Drive", seen);
  check("both sides moving since the push still keeps both", titles(r.store).join() === "my edit,their edit");

  /* and the other device, merging that back, takes it as it is: its own copy
     has not moved since it pushed "their edit", so nothing splits twice */
  const back = mergeStores(theirs, r.store, "Drive", { b1: fingerprint(theirs.branches[0].data) });
  check("  ...and the other device takes the split as it is", titles(back.store).join() === "my edit,their edit");
  check("  ...without splitting it again", back.notes.every((n) => !n.includes("differed")));
}

/* 10. a build that reads stored data into a new shape (a DATA_VERSION
 *     conversion) must not make Drive look like it moved. Certifications
 *     saved as General entries are the real case: v1 data, read by v2. */
{
  const T = "2026-09-10T10:00:00Z";
  const v1 = (name) => ({
    v: 1,
    personal: { name, contacts: [] },
    sections: [{ id: "s1", title: "Certifications", kind: "item", side: false, entries: [{
      id: "c1", kind: "item", title: "Azure AI Engineer", subtitle: "Microsoft", link: "https://x.example",
      start: { month: "Jan", year: "2025" }, end: { month: "", year: "" }, current: false, bullets: [],
    }] }],
    design: data("x").design,
  });

  const once = normalizeData(v1("Alex"));
  check("a converted copy is already in the shape a reload gives it",
    fingerprint(once) === fingerprint(normalizeData(JSON.parse(JSON.stringify(once)))));

  /* the old build pushed this; then this browser typed without compiling */
  const stored = { activeId: "b1", branches: [{ id: "b1", name: "Main", createdAt: T, updatedAt: T, data: v1("Alex") }] };
  const seen = { b1: fingerprint(stored.branches[0].data) };
  const local = normalizeStore({ activeId: "b1", branches: [{ ...stored.branches[0], updatedAt: "2026-09-11T10:00:00Z", data: v1("Alex Typed") }] });
  const parsed = normalizeStore(stored);
  check("  ...which the new build reads as certifications", parsed.branches[0].data.sections[0].kind === "certification");
  const r = mergeStores(local, parsed, "Drive", rekeySeen(seen, stored, parsed));
  check("the first sync after an upgrade still sees Drive is merely behind",
    r.store.branches.length === 1 && r.store.branches[0].data.personal.name === "Alex Typed");
}

/* 11. v3: skills kept as Custom lines become skill groups — but only lines
 *     that print the same either way — and the first sync afterwards still
 *     reads Drive as merely behind. */
{
  const T = "2026-10-01T10:00:00Z";
  const line = (id, left, extra = {}) => ({ id, kind: "standard", left, right: "", bullets: [], ...extra });
  const v2 = (name) => ({
    v: 2,
    personal: { name, contacts: [] },
    sections: [
      { id: "s1", title: "Skills & Technologies", kind: "standard", side: false, entries: [
        line("k1", "**Core Areas:** Machine Learning, Computer Vision"),
        line("k2", "**Cloud & DevOps:** Azure (AI Foundry, Blob Storage), AWS (Bedrock, Lambda), Git"),
        line("k3", "Python, SQL"),
      ] },
      { id: "s2", title: "Tools", kind: "standard", side: false, entries: [
        line("t1", "**Editors:** Vim, VS Code"),
        line("t2", "Fluent in three languages."),
        line("t3", "**Build:** Make; Bazel"),
        line("t4", "**Infra:** Docker", { right: "2024" }),
      ] },
      { id: "s3", title: "Profile", kind: "standard", side: false, entries: [line("p1", "**Note:** a, b")] },
    ],
    design: data("x").design,
  });

  const once = normalizeData(v2("Alex"));
  const [skills, tools, profile] = once.sections;
  check("v3: a skills section of Custom lines becomes skill groups", skills.kind === "tags" && skills.entries.every((e) => e.kind === "tags"));
  check("  ...the bold lead is the group, bracketed commas stay inside a tag",
    skills.entries[1].group === "Cloud & DevOps" && skills.entries[1].tags.join("|") === "Azure (AI Foundry, Blob Storage)|AWS (Bedrock, Lambda)|Git");
  check("  ...ids are kept, so copies and the master still agree", skills.entries.map((e) => e.id).join() === "k1,k2,k3");
  check("  ...a sentence, a semicolon list and a dated line stay Custom",
    tools.kind === "standard" && tools.entries.map((e) => e.kind).join() === "tags,standard,standard,standard");
  check("  ...and a section not about skills is left alone", profile.entries[0].kind === "standard");
  check("  ...already in the shape a reload gives it",
    fingerprint(once) === fingerprint(normalizeData(JSON.parse(JSON.stringify(once)))));

  const kept = JSON.parse(JSON.stringify(once));
  kept.sections[0].entries[0] = line("k1", "**Core Areas:** Machine Learning");
  kept.sections[0].kind = "standard";
  check("  ...once stamped, a line turned back into Custom stays Custom",
    normalizeData(kept).sections[0].entries[0].kind === "standard");

  const stored = { activeId: "b1", branches: [{ id: "b1", name: "Master", createdAt: T, updatedAt: T, data: v2("Alex") }] };
  const seen = { b1: fingerprint(stored.branches[0].data) };
  const local = normalizeStore({ activeId: "b1", branches: [{ ...stored.branches[0], updatedAt: "2026-10-02T10:00:00Z", data: v2("Alex Typed") }] });
  const parsed = normalizeStore(stored);
  const r = mergeStores(local, parsed, "Drive", rekeySeen(seen, stored, parsed));
  check("the first sync after the skills upgrade still sees Drive is merely behind",
    r.store.branches.length === 1 && r.store.branches[0].data.personal.name === "Alex Typed");
}

/* 12. The sample a guest opens on is a placeholder, not work. Signing in to
 *     a Drive that already held a résumé used to union the sample in beside
 *     it — as the active copy AND the master, which then absorbed every real
 *     entry and offered its placeholders back on every shelf. */
{
  const { readFileSync } = await import("node:fs");
  const sampleData = normalizeData(JSON.parse(readFileSync(new URL("../public/sample.json", import.meta.url), "utf8")));
  const T = "2026-10-01T10:00:00Z";
  const sample = (id) => ({ id, name: "Master", createdAt: T, updatedAt: T, data: structuredClone(sampleData), sample: sampleStamp(sampleData) });
  const real = branch("r1", "Master", "Real Work", "2026-09-01T10:00:00Z");
  const names = (s) => s.branches.map((b) => b.id).join();

  const reloaded = normalizeStore(JSON.parse(JSON.stringify({ activeId: "s1", branches: [sample("s1")] })));
  check("an untouched sample is still untouched after a reload", untouchedSample(reloaded.branches[0]));

  const signIn = mergeStores(
    { activeId: "s1", masterId: "s1", branches: [sample("s1")] },
    { activeId: "r1", masterId: "r1", branches: [real] },
  ).store;
  check("a guest's untouched sample gives way to the résumé already in Drive", names(signIn) === "r1");
  check("  ...and Drive's copy is the active one and the master", signIn.activeId === "r1" && signIn.masterId === "r1");

  const edited = sample("s1");
  edited.data.personal.name = "Typed As A Guest";
  check("a sample anyone has edited is work, and is kept",
    names(mergeStores({ activeId: "s1", masterId: "s1", branches: [edited] }, { activeId: "r1", branches: [real] }).store) === "s1,r1");

  const themed = sample("s1");
  themed.data.design.themeId = "sidebar";
  check("trying a theme on the sample does not make it work",
    names(mergeStores({ activeId: "s1", masterId: "s1", branches: [themed] }, { activeId: "r1", branches: [real] }).store) === "r1");

  const both = { activeId: "s1", masterId: "s1", branches: [sample("s1"), { ...real, id: "c1" }] };
  check("a sample both sides hold is the workspace's own, and stays",
    names(mergeStores(both, structuredClone(both)).store) === "s1,c1");

  check("another device's untouched sample does not join this one's work",
    names(mergeStores({ activeId: "r1", branches: [real] }, { activeId: "s2", branches: [sample("s2")] }).store) === "r1");
  check("two fresh devices keep one sample, not two",
    names(mergeStores({ activeId: "s1", branches: [sample("s1")] }, { activeId: "s2", branches: [sample("s2")] }).store) === "s1");
}

/* 13. A delete made in the master leaves every copy too — or the master,
 *     the union of every copy, takes it straight back at the next save
 *     point and deleting means hunting it down copy by copy. */
{
  const T = "2026-10-01T10:00:00Z";
  const exp = (id, role, bullets = []) => ({ id, kind: "experience", role, company: "", location: "", start: { month: "", year: "" }, end: { month: "", year: "" }, current: false, bullets });
  const doc = () => ({
    personal: { name: "Alex", contacts: [{ text: "Scholar", url: "https://scholar.example.com/alex", icon: "" }, { text: "Site", url: "https://alex.example", icon: "" }] },
    sections: [
      { id: "s-exp", title: "Experience", kind: "experience", side: false, entries: [exp("e1", "Engineer", [{ id: "b1", text: "Built it" }, { id: "b2", text: "Ran it" }]), exp("e2", "Intern")] },
      { id: "s-sk", title: "Skills", kind: "tags", side: false, entries: [{ id: "t1", kind: "tags", group: "Tools", tags: ["Python", "SQL"] }] },
      { id: "s-old", title: "Old", kind: "experience", side: false, entries: [exp("e3", "Long Ago")] },
    ],
    design: data("x").design,
  });
  const store = () => ({ activeId: "m", masterId: "m", branches: [
    { id: "m", name: "Master", createdAt: T, updatedAt: T, data: doc() },
    { id: "c", name: "Data Scientist", createdAt: T, updatedAt: T, data: doc() },
  ] });
  const edit = (d, fn) => { const next = structuredClone(d); fn(next); return next; };
  const copyOf = (s) => s.branches.find((b) => b.id === "c").data;
  const ids = (d) => d.sections.flatMap((x) => x.entries.map((e) => e.id)).join();

  const before = doc();
  const cut = [
    ...cutsBetween(before, edit(before, (d) => d.sections[0].entries.splice(1, 1))),
    ...cutsBetween(before, edit(before, (d) => d.sections[0].entries[0].bullets.splice(1, 1))),
    ...cutsBetween(before, edit(before, (d) => d.sections[1].entries[0].tags.splice(1, 1))),
    ...cutsBetween(before, edit(before, (d) => d.personal.contacts.splice(0, 1))),
    ...cutsBetween(before, edit(before, (d) => d.sections.splice(2, 1))),
  ];
  check("a delete in the master reads as cuts of each kind",
    cut.map((c) => c.kind).join() === "entry,bullet,tag,contact,section,entry");

  const s = store();
  s.branches[0].data = edit(s.branches[0].data, (d) => {
    d.sections[0].entries.splice(1, 1);
    d.sections[0].entries[0].bullets.splice(1, 1);
    d.sections[1].entries[0].tags.splice(1, 1);
    d.personal.contacts.splice(0, 1);
    d.sections.splice(2, 1);
  });
  const c = copyOf(prune(s, "m", cut));
  check("  ...and each one leaves the copy too",
    ids(c) === "e1,t1" && c.sections[0].entries[0].bullets.map((b) => b.id).join() === "b1" &&
    c.sections[1].entries[0].tags.join() === "Python" && c.personal.contacts.map((x) => x.text).join() === "Site");
  check("  ...the section included, once nothing of the copy's own is left in it", !c.sections.some((x) => x.id === "s-old"));
  const pruned = prune(s, "m", cut);
  check("  ...and the save point's absorb does not hand any of it back", absorb(pruned, () => { throw new Error("no section needed"); }) === null);

  const kept = store();
  kept.branches[1].data.sections[2].entries.push(exp("e9", "Only In The Copy"));
  kept.branches[0].data = edit(kept.branches[0].data, (d) => d.sections.splice(2, 1));
  const k = copyOf(prune(kept, "m", cutsBetween(doc(), kept.branches[0].data)));
  check("a section the master dropped stays in a copy that wrote its own entry there",
    k.sections.some((x) => x.id === "s-old") && ids(k).includes("e9") && !ids(k).includes("e3"));

  const undone = store();
  check("an undone delete (the master holds it again) takes nothing from the copies",
    prune(undone, "m", [{ kind: "entry", id: "e2" }]) === null);

  const reworded = store();
  reworded.branches[1].data.sections[0].entries[1].role = "Intern, Reworded";
  reworded.branches[0].data = edit(reworded.branches[0].data, (d) => d.sections[0].entries.splice(1, 1));
  check("a copy's rewording of a deleted entry goes too — it is the same entry",
    !ids(copyOf(prune(reworded, "m", [{ kind: "entry", id: "e2" }]))).includes("e2"));

  const moved = store();
  moved.branches[0].data = edit(moved.branches[0].data, (d) => d.sections[0].entries.splice(1, 1));
  moved.masterId = "c";
  check("a cut made under another master is not applied", prune(moved, "m", [{ kind: "entry", id: "e2" }]) === null);
}

console.log(failures ? `\n${failures} failed` : "\nall merge rules hold");
process.exitCode = failures ? 1 : 0;
