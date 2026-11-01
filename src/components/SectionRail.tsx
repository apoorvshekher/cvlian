import { useState } from "react";
import type { EntryKind, ResumeData, ResumeSection } from "../types";
import { makeSection } from "../storage";
import { arrayMove, useDnDList } from "./dnd";
import { KIND_FIELDS, KIND_LABELS } from "./EntryCard";
import { GripIcon, PlusIcon, SlidersIcon, UserIcon } from "./icons";

/* What the editor pane is showing: the header block or one section by id.
 * Look & feel is not one of them any more: it opens beside the page. */
export type Sel = "header" | (string & {});

const NEW_TITLES: Record<EntryKind, string> = {
  experience: "Experience",
  education: "Education",
  project: "Projects",
  certification: "Certifications",
  publication: "Publications",
  item: "Awards",
  paragraph: "Summary",
  tags: "Skills",
  levels: "Languages",
  standard: "Section",
};

const ADD_ORDER: EntryKind[] = ["experience", "education", "project", "tags", "certification", "publication", "item", "levels", "paragraph", "standard"];

export function SectionRail({
  sections,
  contactCount,
  selected,
  onSelect,
  onOpenLook,
  editData,
}: {
  sections: ResumeSection[];
  /* shown as Your details' count, the way every other row shows its own */
  contactCount: number;
  selected: Sel;
  onSelect: (s: Sel) => void;
  /* Look & feel is not a section: it opens beside the page */
  onOpenLook: () => void;
  editData: (mutate: (d: ResumeData) => void) => void;
}) {
  const [adding, setAdding] = useState(false);
  const dnd = useDnDList("sections", (from, to) => editData((d) => arrayMove(d.sections, from, to)));

  const add = (kind: EntryKind) => {
    const section = makeSection(kind, NEW_TITLES[kind]);
    editData((d) => { d.sections.push(section); });
    setAdding(false);
    onSelect(section.id);
  };

  return (
    <aside className="rail">
      <div className="rail-label">Sections</div>
      <div className="rail-list">
        {/* Your name and how to reach you is the first section of the résumé,
            so it belongs in this list rather than in chrome above it. It is
            pinned: every theme prints it at the top of the page, and there is
            no résumé without one, so it neither moves nor goes away. */}
        <div
          className={"rrow pinned" + (selected === "header" ? " on" : "")}
          onClick={() => onSelect("header")}
        >
          <span className="drag-handle still" title="Always at the top of the page">
            <UserIcon />
          </span>
          <span className="rnum">01</span>
          <span className="rname">Your details</span>
          <span className="rcount">{contactCount}</span>
        </div>

        {sections.map((s, i) => (
          <div
            className={"rrow" + (selected === s.id ? " on" : "") + dnd.stateClass(i)}
            key={s.id}
            {...dnd.itemProps(i)}
            onClick={() => onSelect(s.id)}
          >
            <span className="drag-handle" title="Drag to reorder" {...dnd.handleProps(i)}>
              <GripIcon />
            </span>
            <span className="rnum">{String(i + 2).padStart(2, "0")}</span>
            <span className="rname">{s.title || KIND_LABELS[s.kind]}</span>
            <span className="rcount">{s.entries.length}</span>
          </div>
        ))}
      </div>

      <div className="rail-foot">
        {adding && (
          <div className="kindmenu">
            {/* named for the section it makes: nobody goes looking for
                "Tags" when what they want is Skills */}
            {ADD_ORDER.map((k) => (
              <button key={k} onClick={() => add(k)}>
                <span className="kn">{k === "standard" ? KIND_LABELS[k] : NEW_TITLES[k]}</span>
                <span className="kf">{KIND_FIELDS[k]}</span>
              </button>
            ))}
          </div>
        )}
        <button className={"rrow add" + (adding ? " open" : "")} onClick={() => setAdding(!adding)}>
          <PlusIcon />
          {adding ? "Cancel" : "Add a section"}
        </button>

        {/* not a section: this changes the page, never a word of the résumé */}
        <button className="rrow fixed settings" onClick={onOpenLook}>
          <SlidersIcon />
          Look &amp; feel
        </button>
      </div>
    </aside>
  );
}
