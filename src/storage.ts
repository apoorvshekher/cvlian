import { tagGroup } from "./tex/base";
import { normalizeDesign } from "./tex/design";
import type { Branch, Bullet, DateVal, Entry, EntryKind, LevelItem, Removal, ResumeData, ResumeSection, Store } from "./types";
import { MONTHS } from "./types";

export const STORE_KEY = "resume-editor-store-v1";

/* Bumped only when a one-off conversion has to run over everyone's saved
 * data. `normalizeData` stamps it, so the conversion happens once and then
 * stops second-guessing what the user has chosen since.
 *   1 — typed fields: Custom entries parsed back into real ones
 *   2 — certifications and publications, which were General entries until
 *       they had kinds of their own
 *   3 — skills, which were Custom lines ("**Languages:** Python, SQL") until
 *       a skill group printed exactly that way */
export const DATA_VERSION = 3;

export function newId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function makeBullet(text = ""): Bullet {
  return { id: newId(), text };
}

const noDate = (): DateVal => ({ month: "", year: "" });

export function makeEntry(kind: EntryKind = "standard"): Entry {
  const id = newId();
  switch (kind) {
    case "experience":
      return { id, kind, role: "", company: "", location: "", start: noDate(), end: noDate(), current: false, bullets: [] };
    case "education":
      return { id, kind, school: "", degree: "", field: "", location: "", gpa: "", start: noDate(), end: noDate(), current: false, bullets: [] };
    case "project":
      return { id, kind, name: "", link: "", description: "", start: noDate(), end: noDate(), current: false, bullets: [] };
    case "certification":
      return { id, kind, name: "", issuer: "", link: "", date: noDate(), bullets: [] };
    case "publication":
      return { id, kind, title: "", authors: "", venue: "", link: "", date: noDate(), bullets: [] };
    case "item":
      return { id, kind, title: "", subtitle: "", link: "", start: noDate(), end: noDate(), current: false, bullets: [] };
    case "paragraph":
      return { id, kind, text: "" };
    case "tags":
      return { id, kind, group: "", tags: [] };
    case "levels":
      return { id, kind, items: [{ name: "", level: 3 }] };
    default:
      return { id, kind: "standard", left: "", right: "", bullets: [] };
  }
}

export function makeSection(kind: EntryKind = "standard", title = ""): ResumeSection {
  return { id: newId(), title, kind, side: false, entries: [makeEntry(kind)] };
}

/* ---------- normalization ---------- */

const str = (v: unknown): string => (v == null ? "" : String(v));

/* Bullets were plain strings before ids were introduced; accept both. */
function normalizeBullet(b: unknown): Bullet {
  if (b && typeof b === "object") {
    const o = b as Partial<Bullet>;
    return { id: o.id || newId(), text: str(o.text) };
  }
  return { id: newId(), text: str(b) };
}

function normalizeBullets(v: unknown): Bullet[] {
  return (Array.isArray(v) ? v : []).map(normalizeBullet);
}

function normalizeDate(v: unknown): DateVal {
  if (v && typeof v === "object") {
    const o = v as Partial<DateVal>;
    return { month: str(o.month), year: str(o.year) };
  }
  // a bare string ("Sept 2018") splits into month + year where it can
  const s = str(v).trim();
  if (!s) return { month: "", year: "" };
  const m = MONTHS.find((mo) => s.toLowerCase().startsWith(mo.toLowerCase()));
  const year = s.replace(/^[A-Za-z.]+\s*/, "").trim();
  return { month: m ?? "", year: m ? year : s };
}

function normalizeLevels(v: unknown): LevelItem[] {
  return (Array.isArray(v) ? v : []).map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const level = Math.round(Number(o.level));
    return {
      name: str(o.name),
      level: Number.isFinite(level) ? Math.min(5, Math.max(1, level)) : 3,
    };
  });
}

/* Unknown/missing kind (all pre-kind data, and data from future versions)
 * degrades to a standard entry built from whatever fields exist. */
function normalizeEntry(e: unknown): Entry {
  const o = (e ?? {}) as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newId();
  switch (o.kind) {
    case "experience":
      return {
        id, kind: "experience",
        role: str(o.role), company: str(o.company), location: str(o.location),
        start: normalizeDate(o.start), end: normalizeDate(o.end),
        current: o.current === true, bullets: normalizeBullets(o.bullets),
      };
    case "education":
      return {
        id, kind: "education",
        school: str(o.school), degree: str(o.degree), field: str(o.field),
        location: str(o.location), gpa: str(o.gpa),
        start: normalizeDate(o.start), end: normalizeDate(o.end),
        current: o.current === true, bullets: normalizeBullets(o.bullets),
      };
    case "project":
      return {
        id, kind: "project",
        name: str(o.name), link: str(o.link),
        description: str(o.description ?? o.stack),
        start: normalizeDate(o.start), end: normalizeDate(o.end),
        current: o.current === true, bullets: normalizeBullets(o.bullets),
      };
    case "certification":
      return {
        id, kind: "certification",
        name: str(o.name), issuer: str(o.issuer), link: str(o.link),
        date: normalizeDate(o.date), bullets: normalizeBullets(o.bullets),
      };
    case "publication":
      return {
        id, kind: "publication",
        title: str(o.title), authors: str(o.authors), venue: str(o.venue), link: str(o.link),
        date: normalizeDate(o.date), bullets: normalizeBullets(o.bullets),
      };
    case "item":
      return {
        id, kind: "item",
        title: str(o.title), subtitle: str(o.subtitle), link: str(o.link),
        start: normalizeDate(o.start), end: normalizeDate(o.end),
        current: o.current === true, bullets: normalizeBullets(o.bullets),
      };
    case "paragraph":
      return { id, kind: "paragraph", text: str(o.text) };
    case "tags":
      return {
        id, kind: "tags", group: str(o.group),
        tags: (Array.isArray(o.tags) ? o.tags : []).map(str),
      };
    case "levels":
      return { id, kind: "levels", items: normalizeLevels(o.items) };
    default:
      return {
        id, kind: "standard",
        left: str(o.left), right: str(o.right), bullets: normalizeBullets(o.bullets),
      };
  }
}


/* ---------- upgrading pre-typed entries ---------- */

/* Resumes written before typed fields kept their structure as markdown in
 * one text box, in whatever shape the author liked:
 *     "**Master of Engineering in EE**\nDelhi Technological University"
 *     "**Research Fellow**, Vision Lab -- Boston, MA"
 *     "[Azure AI Engineer, *Microsoft*](https://…)"
 * These parse that back into real fields. Nothing here guesses at meaning
 * beyond the markup: a bold lead is the primary, a trailing italic or a
 * second line is the secondary, a link is a link. */

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/;
/* Separator between the two halves of a line or a date range. A bare
 * hyphen counts, but only when it is surrounded by spaces, so hyphenated
 * words ("Vision-Language") survive. */
const DASH_RE = /\s+(?:—|–|---|--|-|to)\s+/i;
const LEAD_SEP_RE = /^\s*(?:,|—|–|---|--|-|·|\|)\s*/;

function unwrapAll(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").trim();
}

/* "[**Name**, *Issuer*](url)" -> {text: "**Name**, *Issuer*", link: url} */
function takeLink(line: string): { text: string; link: string } {
  const m = LINK_RE.exec(line);
  if (!m) return { text: line, link: "" };
  return { text: line.replace(LINK_RE, m[1]), link: m[2] };
}

/* A line like "**Role**, Company -- Boston" splits into its bold lead and
 * whatever follows; "Plain text" yields ("", "Plain text"). */
function splitLead(text: string): { lead: string; rest: string } {
  const bold = /^\s*\*\*(.+?)\*\*(.*)$/.exec(text);
  if (bold) return { lead: bold[1].trim(), rest: bold[2].replace(LEAD_SEP_RE, "").trim() };
  return { lead: "", rest: text.trim() };
}

/* Pull a trailing "*italic*" off a line: "Azure AI, *Microsoft*". */
function splitTrailingItalic(text: string): { head: string; italic: string } {
  const m = /^(.*?)[,;]?\s*\*([^*]+)\*\s*$/.exec(text);
  if (!m || !m[1].trim()) return { head: text.trim(), italic: "" };
  return { head: m[1].replace(/[,;]\s*$/, "").trim(), italic: m[2].trim() };
}

function splitPair(text: string): [string, string] {
  const parts = text.split(DASH_RE);
  if (parts.length > 1) return [parts[0].trim(), parts.slice(1).join(" ").trim()];
  const comma = /^(.*?),\s*(.+)$/.exec(text);
  return comma ? [comma[1].trim(), comma[2].trim()] : [text.trim(), ""];
}

function monthFrom(word: string): string {
  const w = word.trim().toLowerCase().replace(/\.$/, "").slice(0, 3);
  if (!w) return "";
  return MONTHS.find((m) => m.toLowerCase().slice(0, 3) === w) ?? "";
}

/* One side of a range: "Sept 2018" -> {month, year}. */
function oneDate(text: string): DateVal {
  const t = text.trim();
  const m = /^([A-Za-z.]+)\s+([^\s]+)$/.exec(t);
  if (m && monthFrom(m[1])) return { month: m[1].trim(), year: m[2].trim() };
  if (monthFrom(t) && !/\d/.test(t)) return { month: t, year: "" };
  return { month: "", year: t };
}

const PRESENT_RE = /^(present|now|current|ongoing|today|date)$/i;

interface Dates { start: DateVal; end: DateVal; current: boolean }

/* Parse the first line of a right column as a date range. Returns null when
 * it is prose rather than dates, which keeps the entry Custom. */
function parseRange(text: string): Dates | null {
  const t = text.trim();
  if (!t) return { start: { month: "", year: "" }, end: { month: "", year: "" }, current: false };
  if (!/\d{4}/.test(t) && !PRESENT_RE.test(t)) return null;

  const sides = t.split(DASH_RE);
  if (sides.length > 2) return null;
  const a = sides[0].trim();
  const b = (sides[1] ?? "").trim();
  if (PRESENT_RE.test(a)) return null;
  return {
    start: oneDate(a),
    end: b && !PRESENT_RE.test(b) ? oneDate(b) : { month: "", year: "" },
    current: PRESENT_RE.test(b),
  };
}

const DEGREE_RE = /\b(bachelor|master|b\.?\s?s\b|m\.?\s?s\b|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|ph\.?\s?d|doctor|diploma|mba|associate|certificate)\b/i;
const GPA_RE = /\b(?:c?gpa|grade)\b\s*[:\-]?\s*([\d.]+\s*(?:\/\s*[\d.]+)?)/i;

const hasDate = (d: DateVal) => !!(d.month.trim() || d.year.trim());

/* Certifications and publications were General entries until they had kinds
 * of their own, and carry over field for field. They hold one date, so an
 * entry with a real range (or "Present") stays General rather than losing
 * half of it — null says so. */
function fromItem(
  e: Extract<Entry, { kind: "item" }>,
  to: "certification" | "publication",
): Entry | null {
  if (e.current || (hasDate(e.start) && hasDate(e.end))) return null;
  const base = { id: e.id, link: e.link, date: hasDate(e.start) ? e.start : e.end, bullets: e.bullets };
  return to === "certification"
    ? { ...base, kind: "certification", name: e.title, issuer: e.subtitle }
    : { ...base, kind: "publication", title: e.title, authors: "", venue: e.subtitle };
}

/* Returns a typed entry, or null to keep the Custom one as it is. */
function upgradeStandard(
  e: Extract<Entry, { kind: "standard" }>,
  kind: EntryKind,
): Entry | null {
  const lines = e.left.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length || lines.length > 2) return null;

  const rightLines = e.right.split("\n").map((l) => l.trim()).filter(Boolean);
  const range = parseRange(rightLines[0] ?? "");
  if (!range) return null;
  const rightExtra = rightLines.slice(1).join(" ");

  const first = takeLink(lines[0]);
  const { lead, rest } = splitLead(first.text);
  const secondLine = unwrapAll(lines[1] ?? "");
  const base = { id: e.id, ...range, bullets: e.bullets };

  switch (kind) {
    case "experience": {
      const role = lead || unwrapAll(rest);
      const orgSource = lead ? rest : secondLine;
      const [company, location] = splitPair(unwrapAll(orgSource || secondLine));
      return { ...base, kind: "experience", role, company, location };
    }
    case "education": {
      const a = unwrapAll(lead || rest);
      const b = secondLine || unwrapAll(rest);
      // whichever line names a degree is the degree; the other is the school
      const degreeFirst = DEGREE_RE.test(a) && !DEGREE_RE.test(b);
      const degreeLine = degreeFirst ? a : DEGREE_RE.test(b) ? b : "";
      const schoolLine = degreeFirst ? b : a;
      const inSplit = /^(.*?)\s+in\s+(.*)$/i.exec(degreeLine);
      const gpa = (GPA_RE.exec(rightExtra) ?? GPA_RE.exec(degreeLine) ?? [])[1] ?? "";
      return {
        ...base,
        kind: "education",
        school: schoolLine,
        degree: inSplit ? inSplit[1].trim() : degreeLine,
        field: inSplit ? inSplit[2].trim() : "",
        location: "",
        gpa: gpa.trim(),
      };
    }
    case "project":
      return {
        ...base,
        kind: "project",
        name: lead || unwrapAll(rest),
        link: first.link,
        description: secondLine || (lead ? unwrapAll(rest) : ""),
      };
    default: {
      /* "item", and the two single-dated kinds read the same way: a title,
       * an optional subtitle (the issuer, the venue), an optional link */
      const italic = splitTrailingItalic(first.text);
      const title = lead || unwrapAll(italic.head) || unwrapAll(first.text);
      const subtitle = secondLine || italic.italic || (lead ? unwrapAll(rest) : "");
      const item = { ...base, kind: "item" as const, title, subtitle, link: first.link };
      return kind === "certification" || kind === "publication" ? fromItem(item, kind) ?? item : item;
    }
  }
}

/* Guess a section's type from its title, for resumes saved before section
 * kinds existed. `tags` and `levels` are never inferred from a title alone —
 * dot meters change how a section prints, and a skill group is only taken
 * from a line that already reads as one (`skillsFromStandard`). */
function kindFromTitle(title: string): EntryKind | null {
  const t = title.toLowerCase();
  if (/educat|school|universit|degree|academ/.test(t)) return "education";
  if (/experien|employ|work|career|position|internship/.test(t)) return "experience";
  if (/project|portfolio/.test(t)) return "project";
  if (/certificat|licen/.test(t)) return "certification";
  if (/publicat|paper/.test(t)) return "publication";
  if (/patent|award|honor|talk|present|volunteer|leadership|activit/.test(t)) return "item";
  return null;
}

/* Convert an entry to another kind, carrying over whatever maps. Used by the
 * editor's type switcher, so it must never silently drop the main text. */
function linkOf(e: Entry): string {
  return "link" in e ? e.link : "";
}

/* A tags entry as the one line it prints as, "**Group:** a, b", so a switch
 * to a text kind keeps every tag and switching back reads the label again. */
function tagsLine(e: Extract<Entry, { kind: "tags" }>): string {
  const list = e.tags.filter((t) => t.trim()).join(", ");
  const group = tagGroup(e.group);
  return group ? `**${group}:** ${list}` : list;
}

/* Split a list on commas and semicolons, but not inside brackets:
 * "Azure (Functions, Blob Storage), AWS" is two tags, not three. */
function splitTags(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth) depth--;
    if ((ch === "," || ch === ";") && !depth) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean);
}

/* "**Languages:** Python, SQL" → a group and its tags; anything else is all tags. */
function tagsFromText(text: string): { group: string; tags: string[] } {
  const line = text.replace(/\n+/g, ", ");
  /* the colon is what makes a bold lead a label: "**Python**, SQL" is two tags */
  const m = /^\s*\*\*([^*]+?)(?::\*\*|\*\*\s*:)(.*)$/.exec(line);
  return m ? { group: m[1].trim(), tags: splitTags(m[2]) } : { group: "", tags: splitTags(line) };
}

const SKILLS_RE = /skill|technolog|tool|tech stack|competenc|expertise/i;

/* The same line either way: spacing around commas, and whether the colon
 * sits inside the bold, are all a skill group would change. */
const asPrinted = (s: string) =>
  s.replace(/\*\*\s*:/g, ":**").replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();

/* Skills were Custom lines until a skill group printed the same way, so a
 * line that reads back to itself becomes one. Anything that would print
 * differently — a date, bullets, a second line, semicolons — stays Custom. */
function skillsFromStandard(e: Extract<Entry, { kind: "standard" }>): Entry | null {
  const line = e.left.trim();
  if (!line || line.includes("\n") || e.right.trim() || e.bullets.some((b) => b.text.trim())) return null;
  const skills = { id: e.id, kind: "tags" as const, ...tagsFromText(line) };
  /* a list, not a sentence that happens to sit under "Skills" */
  if (!skills.tags.length || (!skills.group && skills.tags.length < 2)) return null;
  return asPrinted(tagsLine(skills)) === asPrinted(line) ? skills : null;
}

export function convertEntry(e: Entry, to: EntryKind): Entry {
  if (e.kind === to) return e;
  const primary =
    e.kind === "experience" ? e.role
    : e.kind === "education" ? e.school
    : e.kind === "project" ? e.name
    : e.kind === "item" ? e.title
    : e.kind === "certification" ? e.name
    : e.kind === "publication" ? e.title
    : e.kind === "tags" ? tagsLine(e)
    : e.kind === "levels" ? e.items.map((i) => i.name).filter((n) => n.trim()).join(", ")
    : e.kind === "paragraph" ? e.text
    : e.left;
  const secondary =
    e.kind === "experience" ? [e.company, e.location].filter(Boolean).join(" — ")
    : e.kind === "education" ? [e.degree, e.field].filter(Boolean).join(" in ")
    : e.kind === "project" ? e.description
    : e.kind === "item" ? e.subtitle
    : e.kind === "certification" ? e.issuer
    : e.kind === "publication" ? e.venue
    : "";
  const bullets = "bullets" in e ? e.bullets : [];
  const dates =
    "start" in e
      ? { start: e.start, end: e.end, current: e.current }
      : { start: "date" in e ? e.date : noDate(), end: noDate(), current: false };
  /* the single-dated kinds keep whichever end of a range was filled in */
  const date = hasDate(dates.start) ? dates.start : dates.end;
  const id = e.id;

  switch (to) {
    case "experience": {
      const [company, location] = secondary ? secondary.split(/\s+—\s+/) : ["", ""];
      return { id, kind: "experience", role: primary, company: company ?? "", location: location ?? "", ...dates, bullets };
    }
    case "education":
      return { id, kind: "education", school: primary, degree: secondary, field: "", location: "", gpa: "", ...dates, bullets };
    case "project":
      return { id, kind: "project", name: primary, link: linkOf(e), description: secondary, ...dates, bullets };
    case "item":
      return { id, kind: "item", title: primary, subtitle: secondary, link: linkOf(e), ...dates, bullets };
    case "certification":
      return { id, kind: "certification", name: primary, issuer: secondary, link: linkOf(e), date, bullets };
    case "publication":
      return { id, kind: "publication", title: primary, authors: "", venue: secondary, link: linkOf(e), date, bullets };
    case "paragraph":
      return { id, kind: "paragraph", text: [primary, ...bullets.map((b) => b.text)].filter(Boolean).join("\n") };
    case "tags":
      return { id, kind: "tags", ...tagsFromText(primary) };
    case "levels": {
      /* a list of skills becomes one row each, every tag kept */
      const names = e.kind === "tags" ? e.tags.filter((t) => t.trim()) : primary ? [primary] : [""];
      return { id, kind: "levels", items: names.map((name) => ({ name, level: 3 })) };
    }
    default:
      return {
        id, kind: "standard",
        left: [primary, secondary].filter(Boolean).join("\n"),
        right: [dates.start.month, dates.start.year].filter(Boolean).join(" "),
        bullets,
      };
  }
}

const KINDS: EntryKind[] = ["experience", "education", "project", "certification", "publication", "item", "paragraph", "tags", "levels", "standard"];
/* the kinds a Custom entry from before typed fields can be parsed into */
const PARSED: EntryKind[] = ["experience", "education", "project", "certification", "publication", "item"];

/* Fill in any missing fields (including ids and section kinds on older
 * data) so the editor can rely on the full shape. Runs on load/import/
 * sample only — editData's structuredClone preserves everything after. */
export function normalizeData(raw: unknown, opts: { upgrade?: boolean } = {}): ResumeData {
  /* Data this build has already looked at carries a stamp, and each one-off
   * conversion runs only on data stamped before it existed. Once stamped it
   * is never re-read that way, so a section someone deliberately keeps as
   * Custom (or General) stays that way instead of being "fixed" on every load. */
  const stamp = opts.upgrade === false ? DATA_VERSION : ((raw as { v?: number } | null)?.v ?? 0);
  /* from before typed fields: parse Custom entries back into them */
  const legacy = stamp < 1;
  /* from before certifications and publications had kinds of their own */
  const splitGeneral = stamp < 2;
  /* from before a skill group printed the way skills are written */
  const skillLines = stamp < 3;
  const d = (raw ?? {}) as Partial<ResumeData>;
  const personal = d.personal ?? { name: "", contacts: [] };
  return {
    personal: {
      name: personal.name ?? "",
      contacts: (personal.contacts ?? []).map((c) => ({
        text: c?.text ?? "",
        url: c?.url ?? "",
        icon: c?.icon ?? "",
      })),
    },
    sections: (d.sections ?? []).map((s) => {
      let entries = ((s?.entries ?? []) as unknown[]).map(normalizeEntry);
      const title = s?.title ?? "";
      const declared = (s as { kind?: unknown } | undefined)?.kind;
      /* "standard" is what an older build also wrote when it could not tell,
       * so on unstamped data it is not evidence of a choice — re-infer, or
       * the upgrade is unreachable for exactly the resumes it is for. */
      const trusted = KINDS.includes(declared as EntryKind) && !(legacy && declared === "standard");
      let kind: EntryKind = trusted
        ? (declared as EntryKind)
        : entries.every((e) => e.kind === "standard")
          ? kindFromTitle(title) ?? entries[0]?.kind ?? "standard"
          : entries[0]?.kind ?? "standard";
      // resumes saved before typed fields: parse the markdown back into them
      if (legacy && PARSED.includes(kind)) {
        const into = kind;
        entries = entries.map((e) =>
          e.kind === "standard" ? upgradeStandard(e, into) ?? e : e,
        );
      }
      /* General was the only kind that fit a certification or a publication
       * before they had their own — and the add menu even named a new
       * General section "Certifications" — so those sections move across */
      const split = splitGeneral && kind === "item" ? kindFromTitle(title) : null;
      if (split === "certification" || split === "publication") {
        kind = split;
        entries = entries.map((e) => (e.kind === "item" ? fromItem(e, split) ?? e : e));
      }
      /* "Skills & Technologies" kept as Custom lines: each line that prints
       * the same as a skill group becomes one, and the section adds skill
       * groups from then on once every line has moved */
      if (skillLines && kind === "standard" && SKILLS_RE.test(title)) {
        entries = entries.map((e) => (e.kind === "standard" ? skillsFromStandard(e) ?? e : e));
        if (entries.length && entries.every((e) => e.kind === "tags")) kind = "tags";
      }
      /* a conversion builds entries in its own field order; rebuild them the
       * way the next load will, so this load and that one agree byte for
       * byte — the sync's fingerprints compare exactly that */
      if (legacy || splitGeneral || skillLines) entries = entries.map(normalizeEntry);
      return {
        id: s?.id || newId(),
        title,
        kind,
        side: s?.side === true,
        entries,
      };
    }),
    design: normalizeDesign(d.design),
    v: DATA_VERSION,
  };
}

export function makeBranch(name: string, data: ResumeData, origin?: string): Branch {
  const now = new Date().toISOString();
  return { id: newId(), name, createdAt: now, updatedAt: now, data, ...(origin ? { origin } : {}) };
}

/* Copies used to carry saved versions, and those are gone — a backup that
 * still holds some imports without them. The one worth keeping is the one
 * that said where the copy came from; it lives on as `origin`. */
function legacyOrigin(versions: unknown): string {
  const list = Array.isArray(versions) ? (versions as { kind?: unknown; name?: unknown }[]) : [];
  const first = list.find((v) => v?.kind === "origin");
  return typeof first?.name === "string" ? first.name : "";
}

function normalizeBranch(b: unknown): Branch {
  const o = (b ?? {}) as Partial<Branch> & { versions?: unknown };
  const now = new Date().toISOString();
  const origin = typeof o.origin === "string" && o.origin ? o.origin : legacyOrigin(o.versions);
  const sample = typeof o.sample === "string" && o.sample ? o.sample : "";
  return {
    id: o.id || newId(),
    name: o.name || "Main",
    createdAt: o.createdAt || now,
    updatedAt: o.updatedAt || now,
    data: normalizeData(o.data),
    ...(origin ? { origin } : {}),
    ...(sample ? { sample } : {}),
  };
}

/* Tombstones are what let a delete survive a merge: without them the union
 * of copies brings every deleted one straight back from Drive. Ids never
 * repeat, so the cap only ages out deletions no device could still be
 * holding the other half of. */
export const REMOVED_KEEP = 500;
export function markRemoved(store: Store, ...ids: string[]): Removal[] {
  const at = new Date().toISOString();
  return [...ids.map((id) => ({ id, at })), ...(store.removed ?? [])].slice(0, REMOVED_KEEP);
}

const isRemoval = (r: unknown): r is Removal =>
  !!r && typeof (r as Removal).id === "string" && typeof (r as Removal).at === "string";

/* Accepts the current {branches} shape and the older flat {versions} one,
 * where every "version" was really a separate variant — each of those
 * becomes a copy of its own. */
export function normalizeStore(raw: unknown): Store | null {
  const o = (raw ?? {}) as { activeId?: string; masterId?: string; branches?: unknown; versions?: unknown; removed?: unknown };
  const list = Array.isArray(o.branches) ? o.branches : Array.isArray(o.versions) ? o.versions : null;
  if (!list || !list.length) return null;
  const branches = list.map(normalizeBranch);
  const activeId = branches.some((b) => b.id === o.activeId) ? String(o.activeId) : branches[0].id;
  /* every store has exactly one master; the oldest copy is it until said otherwise */
  const masterId = branches.some((b) => b.id === o.masterId) ? String(o.masterId) : branches[0].id;
  /* it used to be the default copy, called "Main", before it became the pool
   * every other copy is drawn from; the name is the only thing that says so */
  for (const b of branches) if (b.id === masterId && b.name.trim().toLowerCase() === "main") b.name = "Master";
  const removed = Array.isArray(o.removed) ? o.removed.filter(isRemoval).slice(0, REMOVED_KEEP) : [];
  return { activeId, masterId, branches, ...(removed.length ? { removed } : {}) };
}

export function loadStore(): Store | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeStore(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/* This one key is the whole database, so a write that fails quietly is the
 * most dangerous thing the app can do: the status bar would go on saying
 * "saved" while nothing reached the disk. A full quota, a private window and
 * blocked site data all land in the catch, so the result is reported and the
 * caller says so out loud. */
export function persistStore(store: Store): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.warn("Could not persist resume store (storage full or blocked):", err);
    return false;
  }
}

export async function fetchSample(): Promise<ResumeData> {
  const res = await fetch("sample.json");
  return normalizeData(await res.json());
}
