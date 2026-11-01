import { Fragment, useRef, useState } from "react";
import type { Entry, EntryKind } from "../types";
import { convertEntry, makeBullet } from "../storage";
import {
  AutoGrowTextarea, Cell, Check, DateIn, Field, FieldRow, HeadButtons, TextIn, UndoRow, fmtDate, fmtRange, plain, restoreAt,
} from "./controls";
import { arrayMove, useDnDList, type DnDList } from "./dnd";
import { GripIcon, XIcon } from "./icons";

export const KIND_LABELS: Record<EntryKind, string> = {
  experience: "Experience",
  education: "Education",
  project: "Project",
  certification: "Certification",
  publication: "Publication",
  item: "General",
  paragraph: "Paragraph",
  tags: "Skill group",
  levels: "Levels",
  standard: "Custom",
};

/* What each type is for, shown in the add-entry menu. */
export const KIND_FIELDS: Record<EntryKind, string> = {
  experience: "Role · Company · Dates · Bullets",
  education: "School · Degree · Field · Dates",
  project: "Name · Link · Description · Bullets",
  certification: "Name · Issuer · Date · Credential link",
  publication: "Title · Authors · Venue · Date · Link",
  item: "Title · Subtitle · Dates — awards, talks, volunteering",
  paragraph: "A block of prose",
  tags: "Group: skill, skill, … — one line each",
  levels: "Name · Proficiency 1–5",
  standard: "Free-form left / right / bullets",
};

export function entryTitle(e: Entry): string {
  switch (e.kind) {
    case "experience": return e.role || e.company;
    case "education": return e.school || e.degree;
    case "project": return e.name;
    case "item": return e.title;
    case "certification": return e.name;
    case "publication": return e.title;
    case "paragraph": return plain(e.text);
    case "tags": return e.group || e.tags.filter((t) => t.trim()).slice(0, 4).join(", ");
    case "levels": return e.items.map((i) => i.name).filter((n) => n.trim()).slice(0, 4).join(", ");
    default: return plain(e.left);
  }
}

function entryMeta(e: Entry): string {
  switch (e.kind) {
    case "experience":
    case "education":
    case "project":
    case "item":
      return fmtRange(e.start, e.end, e.current);
    case "certification":
    case "publication":
      return fmtDate(e.date);
    case "standard": return plain(e.right);
    case "tags": return e.tags.length ? String(e.tags.length) : "";
    default: return "";
  }
}

export function isEmpty(e: Entry): boolean {
  switch (e.kind) {
    case "experience": return !e.role && !e.company && !e.bullets.some((b) => b.text.trim());
    case "education": return !e.school && !e.degree;
    case "project": return !e.name && !e.bullets.some((b) => b.text.trim());
    case "item": return !e.title && !e.bullets.some((b) => b.text.trim());
    case "certification": return !e.name && !e.issuer && !e.bullets.some((b) => b.text.trim());
    case "publication": return !e.title && !e.venue && !e.bullets.some((b) => b.text.trim());
    case "paragraph": return !e.text.trim();
    case "tags": return !e.tags.some((t) => t.trim());
    case "levels": return !e.items.some((i) => i.name.trim());
    default: return !e.left && !e.right && !e.bullets.some((b) => b.text.trim());
  }
}

/* Edits one entry; `deleting` marks an edit that is a delete (see EditData). */
type OnEdit = (mutate: (e: Entry) => void, deleting?: boolean) => void;

/* The mutation always runs on a clone of this same entry, so its kind
 * matches the one being rendered. */
function useEdit<K extends EntryKind>(onEdit: OnEdit, _kind: K) {
  return (mutate: (e: Extract<Entry, { kind: K }>) => void, deleting?: boolean) =>
    onEdit((e) => mutate(e as Extract<Entry, { kind: K }>), deleting);
}

/* ---------- bullets (shared by the dated kinds and Custom) ---------- */

type Bulleted = Extract<Entry, { bullets: unknown[] }>;

function Bullets({
  entry,
  label,
  onEdit,
  dnd,
}: {
  entry: Bulleted;
  label: string;
  onEdit: OnEdit;
  dnd: DnDList;
}) {
  const edit = (mutate: (e: Bulleted) => void, deleting?: boolean) => onEdit((e) => mutate(e as Bulleted), deleting);
  /* the bullet deleted last, held where it was until Undo or the next delete */
  const [undo, setUndo] = useState<{ bullet: Bulleted["bullets"][number]; index: number } | null>(null);
  const undoRow = undo && (
    <UndoRow
      what={plain(undo.bullet.text)}
      onUndo={() => {
        const { bullet, index } = undo;
        edit((e) => restoreAt(e.bullets, bullet, index));
        setUndo(null);
      }}
    />
  );
  return (
    <div className="bullets">
      <div className="blabel">
        <span>{label}</span>
        <span className="hint">emphasis only: <code>**bold**</code></span>
      </div>
      {entry.bullets.map((b, i) => (
        <Fragment key={b.id}>
          {undo?.index === i && undoRow}
          <div className={"bullet-row" + dnd.stateClass(i)} {...dnd.itemProps(i)}>
            <span className="drag-handle" title="Drag to reorder" {...dnd.handleProps(i)}>
              <GripIcon />
            </span>
            <i className="bmark" />
            <AutoGrowTextarea
              rows={1}
              value={b.text}
              onChange={(v) => edit((e) => { e.bullets[i].text = v; })}
            />
            <button
              className="del"
              title="Delete bullet"
              onClick={() => {
                setUndo(b.text.trim() ? { bullet: b, index: i } : null);
                edit((e) => { e.bullets.splice(i, 1); }, true);
              }}
            >
              <XIcon />
            </button>
          </div>
        </Fragment>
      ))}
      {undo && undo.index >= entry.bullets.length && undoRow}
      <button className="add-btn" onClick={() => edit((e) => { e.bullets.push(makeBullet()); })}>
        + Add {label.toLowerCase().replace(/s$/, "")}
      </button>
    </div>
  );
}

/* ---------- per-kind bodies ---------- */

function DatePair({
  start,
  end,
  current,
  onStart,
  onEnd,
  onCurrent,
}: {
  start: Extract<Entry, { kind: "experience" }>["start"];
  end: Extract<Entry, { kind: "experience" }>["end"];
  current: boolean;
  onStart: (v: typeof start) => void;
  onEnd: (v: typeof end) => void;
  onCurrent: (v: boolean) => void;
}) {
  return (
    <FieldRow>
      <Cell label="Year from"><DateIn value={start} onChange={onStart} /></Cell>
      <Cell label="Year to"><DateIn value={end} onChange={onEnd} disabled={current} /></Cell>
      <Cell label="Ongoing">
        <Check checked={current} onChange={onCurrent} label="Present" />
      </Cell>
    </FieldRow>
  );
}

function ExperienceBody({ entry, onEdit, dnd }: { entry: Extract<Entry, { kind: "experience" }>; onEdit: OnEdit; dnd: DnDList }) {
  const edit = useEdit(onEdit, "experience");
  return (
    <>
      <FieldRow>
        <Cell label="Role"><TextIn value={entry.role} onChange={(v) => edit((e) => { e.role = v; })} placeholder="Software Engineer" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Company"><TextIn value={entry.company} onChange={(v) => edit((e) => { e.company = v; })} placeholder="Acme Corp" /></Cell>
        <Cell label="Location" hint="optional"><TextIn value={entry.location} onChange={(v) => edit((e) => { e.location = v; })} placeholder="Remote" /></Cell>
      </FieldRow>
      <DatePair
        start={entry.start} end={entry.end} current={entry.current}
        onStart={(v) => edit((e) => { e.start = v; })}
        onEnd={(v) => edit((e) => { e.end = v; })}
        onCurrent={(v) => edit((e) => { e.current = v; })}
      />
      <Bullets entry={entry} label="Bullets" onEdit={onEdit} dnd={dnd} />
    </>
  );
}

function EducationBody({ entry, onEdit, dnd }: { entry: Extract<Entry, { kind: "education" }>; onEdit: OnEdit; dnd: DnDList }) {
  const edit = useEdit(onEdit, "education");
  return (
    <>
      <FieldRow>
        <Cell label="School"><TextIn value={entry.school} onChange={(v) => edit((e) => { e.school = v; })} placeholder="State University" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Degree"><TextIn value={entry.degree} onChange={(v) => edit((e) => { e.degree = v; })} placeholder="Bachelor of Science" /></Cell>
        <Cell label="Field of study"><TextIn value={entry.field} onChange={(v) => edit((e) => { e.field = v; })} placeholder="Computer Science" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Location" hint="optional"><TextIn value={entry.location} onChange={(v) => edit((e) => { e.location = v; })} /></Cell>
        <Cell label="GPA" hint="optional"><TextIn value={entry.gpa} onChange={(v) => edit((e) => { e.gpa = v; })} placeholder="3.8 / 4.0" /></Cell>
      </FieldRow>
      <DatePair
        start={entry.start} end={entry.end} current={entry.current}
        onStart={(v) => edit((e) => { e.start = v; })}
        onEnd={(v) => edit((e) => { e.end = v; })}
        onCurrent={(v) => edit((e) => { e.current = v; })}
      />
      <Bullets entry={entry} label="Highlights" onEdit={onEdit} dnd={dnd} />
    </>
  );
}

function ProjectBody({ entry, onEdit, dnd }: { entry: Extract<Entry, { kind: "project" }>; onEdit: OnEdit; dnd: DnDList }) {
  const edit = useEdit(onEdit, "project");
  return (
    <>
      <FieldRow>
        <Cell label="Project"><TextIn value={entry.name} onChange={(v) => edit((e) => { e.name = v; })} placeholder="CVLian" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Link" hint="optional"><TextIn value={entry.link} onChange={(v) => edit((e) => { e.link = v; })} placeholder="https://…" /></Cell>
        <Cell label="Description" hint="optional"><TextIn value={entry.description} onChange={(v) => edit((e) => { e.description = v; })} placeholder="What it does" /></Cell>
      </FieldRow>
      <DatePair
        start={entry.start} end={entry.end} current={entry.current}
        onStart={(v) => edit((e) => { e.start = v; })}
        onEnd={(v) => edit((e) => { e.end = v; })}
        onCurrent={(v) => edit((e) => { e.current = v; })}
      />
      <Bullets entry={entry} label="Bullets" onEdit={onEdit} dnd={dnd} />
    </>
  );
}

function CertificationBody({ entry, onEdit, dnd }: { entry: Extract<Entry, { kind: "certification" }>; onEdit: OnEdit; dnd: DnDList }) {
  const edit = useEdit(onEdit, "certification");
  return (
    <>
      <FieldRow>
        <Cell label="Certification"><TextIn value={entry.name} onChange={(v) => edit((e) => { e.name = v; })} placeholder="Azure AI Engineer Associate" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Issued by"><TextIn value={entry.issuer} onChange={(v) => edit((e) => { e.issuer = v; })} placeholder="Microsoft" /></Cell>
        <Cell label="Issued" hint="optional"><DateIn value={entry.date} onChange={(v) => edit((e) => { e.date = v; })} /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Credential link" hint="optional"><TextIn value={entry.link} onChange={(v) => edit((e) => { e.link = v; })} placeholder="https://…" /></Cell>
      </FieldRow>
      <Bullets entry={entry} label="Details" onEdit={onEdit} dnd={dnd} />
    </>
  );
}

function PublicationBody({ entry, onEdit, dnd }: { entry: Extract<Entry, { kind: "publication" }>; onEdit: OnEdit; dnd: DnDList }) {
  const edit = useEdit(onEdit, "publication");
  return (
    <>
      <FieldRow>
        <Cell label="Title"><TextIn value={entry.title} onChange={(v) => edit((e) => { e.title = v; })} placeholder="Attention Is All You Need" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Authors" hint="optional · **your name** prints bold"><TextIn value={entry.authors} onChange={(v) => edit((e) => { e.authors = v; })} placeholder="**A. Doe**, B. Roe" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Venue" hint="journal or conference"><TextIn value={entry.venue} onChange={(v) => edit((e) => { e.venue = v; })} placeholder="NeurIPS 2024" /></Cell>
        <Cell label="Published" hint="optional"><DateIn value={entry.date} onChange={(v) => edit((e) => { e.date = v; })} /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Link" hint="DOI or paper"><TextIn value={entry.link} onChange={(v) => edit((e) => { e.link = v; })} placeholder="https://doi.org/…" /></Cell>
      </FieldRow>
      <Bullets entry={entry} label="Details" onEdit={onEdit} dnd={dnd} />
    </>
  );
}

function ItemBody({ entry, onEdit, dnd }: { entry: Extract<Entry, { kind: "item" }>; onEdit: OnEdit; dnd: DnDList }) {
  const edit = useEdit(onEdit, "item");
  return (
    <>
      <FieldRow>
        <Cell label="Title"><TextIn value={entry.title} onChange={(v) => edit((e) => { e.title = v; })} placeholder="Best Paper Award" /></Cell>
      </FieldRow>
      <FieldRow>
        <Cell label="Subtitle" hint="who gave it, where…"><TextIn value={entry.subtitle} onChange={(v) => edit((e) => { e.subtitle = v; })} placeholder="ACM SIGKDD" /></Cell>
        <Cell label="Link" hint="optional"><TextIn value={entry.link} onChange={(v) => edit((e) => { e.link = v; })} placeholder="https://…" /></Cell>
      </FieldRow>
      <DatePair
        start={entry.start} end={entry.end} current={entry.current}
        onStart={(v) => edit((e) => { e.start = v; })}
        onEnd={(v) => edit((e) => { e.end = v; })}
        onCurrent={(v) => edit((e) => { e.current = v; })}
      />
      <Bullets entry={entry} label="Bullets" onEdit={onEdit} dnd={dnd} />
    </>
  );
}

function TagsBody({ entry, onEdit }: { entry: Extract<Entry, { kind: "tags" }>; onEdit: OnEdit }) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const edit = useEdit(onEdit, "tags");
  const dnd = useDnDList(`tags:${entry.id}`, (from, to) => edit((e) => arrayMove(e.tags, from, to)));
  const commit = () => {
    const tags = draft.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length) edit((e) => { e.tags.push(...tags); });
    setDraft("");
  };
  return (
    <>
      <FieldRow>
        <Cell label="Group label" hint="optional">
          <TextIn value={entry.group} onChange={(v) => edit((e) => { e.group = v; })} placeholder="Languages & tools" />
        </Cell>
      </FieldRow>
      <Field label="Skills" hint="enter or comma to add">
        {/* one box, like every other field: a click anywhere in it types */}
        <div className="chips" onClick={(e) => { if (e.target === e.currentTarget) input.current?.focus(); }}>
          {entry.tags.map((t, i) => (
            <span className={"chip" + dnd.stateClass(i)} key={i} {...dnd.itemProps(i)} {...dnd.handleProps(i)}>
              {t}
              <button title="Remove" onClick={() => edit((e) => { e.tags.splice(i, 1); }, true)}>
                <XIcon />
              </button>
            </span>
          ))}
          <input
            ref={input}
            type="text"
            className="chip-input"
            placeholder={entry.tags.length ? "add another…" : "Python, SQL, Docker…"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commit();
              } else if (e.key === "Backspace" && !draft && entry.tags.length) {
                edit((en) => { en.tags.pop(); });
              }
            }}
            onBlur={commit}
          />
        </div>
      </Field>
    </>
  );
}

function LevelsBody({ entry, onEdit }: { entry: Extract<Entry, { kind: "levels" }>; onEdit: OnEdit }) {
  const edit = useEdit(onEdit, "levels");
  return (
    <div className="levels">
      {entry.items.map((it, i) => (
        <div className="level-row" key={i}>
          <input
            type="text"
            className="cin"
            placeholder="Language or skill"
            value={it.name}
            onChange={(e) => edit((en) => { en.items[i].name = e.target.value; })}
          />
          <span className="level-dots">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={"level-dot" + (n <= it.level ? " filled" : "")}
                title={`Level ${n}`}
                onClick={() => edit((en) => { en.items[i].level = n; })}
              />
            ))}
          </span>
          <button className="del" title="Remove" onClick={() => edit((en) => { en.items.splice(i, 1); })}>
            <XIcon />
          </button>
        </div>
      ))}
      <button className="add-btn" onClick={() => edit((en) => { en.items.push({ name: "", level: 3 }); })}>
        + Add item
      </button>
    </div>
  );
}

function StandardBody({ entry, onEdit, dnd }: { entry: Extract<Entry, { kind: "standard" }>; onEdit: OnEdit; dnd: DnDList }) {
  const edit = useEdit(onEdit, "standard");
  return (
    <>
      <Field label="Content">
        <AutoGrowTextarea rows={2} value={entry.left} onChange={(v) => edit((e) => { e.left = v; })} />
      </Field>
      <Field label="Right column" hint="dates etc., optional">
        <AutoGrowTextarea rows={1} value={entry.right} onChange={(v) => edit((e) => { e.right = v; })} />
      </Field>
      <Bullets entry={entry} label="Bullets" onEdit={onEdit} dnd={dnd} />
    </>
  );
}

/* ---------- the card ---------- */

export function EntryCard({
  entry,
  index,
  count,
  onEdit,
  onMove,
  onDelete,
  onReplace,
  dnd,
}: {
  entry: Entry;
  index: number;
  count: number;
  onEdit: OnEdit;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
  onReplace: (e: Entry) => void;
  dnd: DnDList;
}) {
  const [collapsed, setCollapsed] = useState(!isEmpty(entry));
  const [typing, setTyping] = useState(false);
  const bulletDnd = useDnDList(`bullets:${entry.id}`, (from, to) =>
    onEdit((e) => arrayMove((e as Bulleted).bullets, from, to)),
  );
  const meta = entryMeta(entry);

  return (
    <div className={"entry" + (collapsed ? " collapsed" : "") + dnd.stateClass(index)} {...dnd.itemProps(index)}>
      <div
        className="entry-head"
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === "BUTTON" || t.closest(".drag-handle")) return;
          setCollapsed(!collapsed);
        }}
      >
        <span className="drag-handle" title="Drag to reorder" {...dnd.handleProps(index)}>
          <GripIcon />
        </span>
        <span className="entry-title">{entryTitle(entry) || `Untitled ${KIND_LABELS[entry.kind].toLowerCase()}`}</span>
        {meta && <span className="entry-meta">{meta}</span>}
        <button
          className={"typebtn" + (typing ? " on" : "")}
          title="Change this entry's type"
          onClick={() => setTyping(!typing)}
        >
          {KIND_LABELS[entry.kind]}
        </button>
        <HeadButtons index={index} count={count} kind="entry" onMove={onMove} onDelete={onDelete} />
      </div>
      {typing && (
        <div className="kindmenu inline">
          {(Object.keys(KIND_LABELS) as EntryKind[])
            .filter((k) => k !== entry.kind)
            .map((k) => (
              <button
                key={k}
                onClick={() => {
                  onReplace(convertEntry(entry, k));
                  setTyping(false);
                  setCollapsed(false);
                }}
              >
                <span className="kn">{KIND_LABELS[k]}</span>
                <span className="kf">{KIND_FIELDS[k]}</span>
              </button>
            ))}
        </div>
      )}
      {!collapsed && (
      <div className="entry-body">
        {entry.kind === "experience" && <ExperienceBody entry={entry} onEdit={onEdit} dnd={bulletDnd} />}
        {entry.kind === "education" && <EducationBody entry={entry} onEdit={onEdit} dnd={bulletDnd} />}
        {entry.kind === "project" && <ProjectBody entry={entry} onEdit={onEdit} dnd={bulletDnd} />}
        {entry.kind === "certification" && <CertificationBody entry={entry} onEdit={onEdit} dnd={bulletDnd} />}
        {entry.kind === "publication" && <PublicationBody entry={entry} onEdit={onEdit} dnd={bulletDnd} />}
        {entry.kind === "item" && <ItemBody entry={entry} onEdit={onEdit} dnd={bulletDnd} />}
        {entry.kind === "paragraph" && (
          <Field label="Text" hint="**bold**, *italic*, [label](url)">
            <AutoGrowTextarea
              rows={3}
              value={entry.text}
              onChange={(v) => onEdit((e) => { (e as Extract<Entry, { kind: "paragraph" }>).text = v; })}
            />
          </Field>
        )}
        {entry.kind === "tags" && <TagsBody entry={entry} onEdit={onEdit} />}
        {entry.kind === "levels" && <LevelsBody entry={entry} onEdit={onEdit} />}
        {entry.kind === "standard" && <StandardBody entry={entry} onEdit={onEdit} dnd={bulletDnd} />}
      </div>
      )}
    </div>
  );
}
