export interface Contact {
  text: string;
  url: string;
  icon: string;
}

export interface Personal {
  name: string;
  contacts: Contact[];
}

export interface Bullet {
  id: string;
  text: string;
}

export interface LevelItem {
  name: string;
  level: number; // 1–5
}

/* Month is a label from MONTHS ("" = unset); year is free text so "2018",
 * "'18" and "" all work. */
export interface DateVal {
  month: string;
  year: string;
}

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "June",
  "July", "Aug", "Sept", "Oct", "Nov", "Dec",
];

/* Discriminated on `kind`. The typed kinds (experience/education/project)
 * carry real fields so themes decide how each part is set; `standard` is
 * the free-form fallback ("Custom") and the shape every unknown kind
 * normalizes to. */
export type Entry =
  | {
      id: string;
      kind: "experience";
      role: string;
      company: string;
      location: string;
      start: DateVal;
      end: DateVal;
      current: boolean;
      bullets: Bullet[];
    }
  | {
      id: string;
      kind: "education";
      school: string;
      degree: string;
      field: string;
      location: string;
      gpa: string;
      start: DateVal;
      end: DateVal;
      current: boolean;
      bullets: Bullet[];
    }
  | {
      id: string;
      kind: "project";
      name: string;
      link: string;
      description: string;
      start: DateVal;
      end: DateVal;
      current: boolean;
      bullets: Bullet[];
    }
  /* One line: what it is, who issued it, when. `link` is the credential. */
  | {
      id: string;
      kind: "certification";
      name: string;
      issuer: string;
      link: string;
      date: DateVal;
      bullets: Bullet[];
    }
  /* `authors` takes inline markdown, so **your name** can stand out;
     `link` is the DOI or the paper. */
  | {
      id: string;
      kind: "publication";
      title: string;
      authors: string;
      venue: string;
      link: string;
      date: DateVal;
      bullets: Bullet[];
    }
  /* Anything else with a title, a subtitle and a date: awards, talks,
     volunteering. */
  | {
      id: string;
      kind: "item";
      title: string;
      subtitle: string;
      link: string;
      start: DateVal;
      end: DateVal;
      current: boolean;
      bullets: Bullet[];
    }
  | { id: string; kind: "paragraph"; text: string }
  | { id: string; kind: "tags"; group: string; tags: string[] }
  | { id: string; kind: "levels"; items: LevelItem[] }
  | { id: string; kind: "standard"; left: string; right: string; bullets: Bullet[] };

export type EntryKind = Entry["kind"];

export interface ResumeSection {
  id: string;
  title: string;
  /* The entry type this section adds by default (chosen when created). */
  kind: EntryKind;
  /* Sidebar-theme placement; ignored by other themes. */
  side: boolean;
  entries: Entry[];
}

/* Per-resume look. Stored fully resolved (no unset fields) so switching
 * themes keeps the user's customizations; theme defaults apply only on
 * first use or explicit reset. */
export interface DesignSettings {
  themeId: string;
  accent: string; // #rrggbb
  font: string; // id in FONTS registry
  fontSize: number; // pt: 10 | 11 | 12
  margins: number; // cm
  density: number; // spacing multiplier
  paper: "letter" | "a4";
  nameSize: number; // pt
  dateColWidth: number; // cm
}

export interface ResumeData {
  /* schema stamp — see DATA_VERSION in storage.ts */
  v?: number;
  personal: Personal;
  sections: ResumeSection[];
  design: DesignSettings;
}

/* How the editor changes the résumé. `deleting` marks an edit that IS a
 * delete: made in the master, whatever it took out leaves every copy too at
 * the next save point (see prune in master.ts). Nothing else may set it — a
 * retyped address loses its old value too, and that is a rewording. */
export type EditData = (mutate: (d: ResumeData) => void, deleting?: boolean) => void;

/* A variant of the resume — "Data Scientist", "ML Engineer". `data` is the
 * live working copy, and the only one: a copy keeps no saved versions. */
export interface Branch {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: ResumeData;
  /* where it came from, in words — "Made from Master" — so the copies read
   * as a tree without a graph. Absent on the first copy of a workspace. */
  origin?: string;
  /* Set only on the sample a fresh workspace opens on: the fingerprint of
   * its data as it arrived. While the data still matches, the copy is a
   * placeholder rather than anyone's work, and it gives way to real work
   * instead of being merged in beside it (see untouchedSample in merge.ts). */
  sample?: string;
}

/* Something the user deleted, remembered so a merge cannot bring it back.
 * Without these the sync's union of copies returned every deleted one
 * straight from Drive a second after the click. A copy edited somewhere
 * else after it was deleted here is newer than the deletion and survives —
 * an edit beats a delete, never the other way round. */
export interface Removal {
  id: string;
  at: string;
}

export interface Store {
  activeId: string;
  /* the copy nothing is ever cut out of. It is an ordinary branch, flagged —
   * making it its own kind of document would make the page count, the PDF
   * button and the compile all lie about it. */
  masterId?: string;
  branches: Branch[];
  /* newest first; see Removal */
  removed?: Removal[];
}
