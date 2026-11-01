import { Fragment, useState } from "react";
import type { EditData, Entry, EntryKind, ResumeSection, Store } from "../types";
import { libraryFor, masterOf } from "../master";
import { makeEntry } from "../storage";
import { arrayMove, useDnDList } from "./dnd";
import { ConfirmStrip, UndoRow, restoreAt } from "./controls";
import { EntryCard, KIND_FIELDS, KIND_LABELS } from "./EntryCard";
import { entryTitle, isEmpty } from "./EntryCard";
import { fmtDate, fmtRange } from "./controls";
import { LayersIcon, MoreIcon, PlusIcon, SidebarIcon, TrashIcon } from "./icons";

const ADD_ORDER: EntryKind[] = ["experience", "education", "project", "certification", "publication", "item", "tags", "levels", "paragraph", "standard"];

function entryMeta(e: Entry): string {
  switch (e.kind) {
    case "experience": return [e.company, fmtRange(e.start, e.end, e.current)].filter(Boolean).join(" · ");
    case "education": return [e.school, fmtRange(e.start, e.end, e.current)].filter(Boolean).join(" · ");
    case "project":
    case "item": return fmtRange(e.start, e.end, e.current) || "no dates";
    case "certification": return [e.issuer, fmtDate(e.date)].filter(Boolean).join(" · ");
    case "publication": return [e.venue, fmtDate(e.date)].filter(Boolean).join(" · ");
    default: return "";
  }
}

export function SectionEditor({
  section,
  index,
  store,
  branchId,
  onAddFromLibrary,
  editData,
  sidebarMode,
  onRemoved,
}: {
  section: ResumeSection;
  index: number;
  store: Store | null;
  branchId: string;
  onAddFromLibrary: (sectionIndex: number, entry: Entry) => void;
  editData: EditData;
  sidebarMode: boolean;
  onRemoved: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [asking, setAsking] = useState(false);
  const [library, setLibrary] = useState(false);
  /* the entry deleted last, held where it was until Undo or the next delete */
  const [undo, setUndo] = useState<{ entry: Entry; index: number } | null>(null);
  /* everything of this kind written in another copy that is missing here */
  const shelf = store && library ? libraryFor(store, branchId, section.kind) : [];
  /* the master IS the library — offering it to itself would always be empty */
  const isMaster = !!store && masterOf(store)?.id === branchId;
  const dnd = useDnDList(`entries:${section.id}`, (from, to) =>
    editData((d) => arrayMove(d.sections[index].entries, from, to)),
  );

  const undoRow = undo && (
    <UndoRow
      what={entryTitle(undo.entry) || "an untitled entry"}
      onUndo={() => {
        const { entry, index: at } = undo;
        editData((d) => restoreAt(d.sections[index].entries, entry, at));
        setUndo(null);
      }}
    />
  );

  const addEntry = (kind: EntryKind) => {
    editData((d) => { d.sections[index].entries.push(makeEntry(kind)); });
    setPicking(false);
  };

  return (
    <div className="pane">
      <div className="pane-head">
        <span className="pnum">{String(index + 2).padStart(2, "0")}</span>
        <input
          type="text"
          className="ptitle"
          placeholder="Section title"
          value={section.title}
          onChange={(e) => editData((d) => { d.sections[index].title = e.target.value; })}
        />
        <span className="pkind">{KIND_LABELS[section.kind]}</span>
        {sidebarMode && (
          <button
            className={"pbtn" + (section.side ? " on" : "")}
            title={section.side ? "In the sidebar — click for the main column" : "In the main column — click for the sidebar"}
            onClick={() => editData((d) => { d.sections[index].side = !d.sections[index].side; })}
          >
            <SidebarIcon />
          </button>
        )}
        <button className="pbtn del" title="Delete section" onClick={() => setAsking(true)}>
          <TrashIcon />
        </button>
      </div>

      {asking && (
        <ConfirmStrip
          question={`Delete the "${section.title || "untitled"}" section and everything in it?`}
          onConfirm={() => {
            editData((d) => { d.sections.splice(index, 1); }, true);
            onRemoved();
          }}
          onCancel={() => setAsking(false)}
        />
      )}

      <div className="pane-body">
        {section.entries.map((entry, i) => (
          <Fragment key={entry.id}>
            {undo?.index === i && undoRow}
            <EntryCard
              entry={entry}
              index={i}
              count={section.entries.length}
              onEdit={(mutate, deleting) => editData((d) => mutate(d.sections[index].entries[i]), deleting)}
              onMove={(from, to) => editData((d) => arrayMove(d.sections[index].entries, from, to))}
              onDelete={() => {
                /* a blank entry is not worth an undo line */
                setUndo(isEmpty(entry) ? null : { entry, index: i });
                editData((d) => { d.sections[index].entries.splice(i, 1); }, true);
              }}
              onReplace={(next) => editData((d) => { d.sections[index].entries[i] = next; })}
              dnd={dnd}
            />
          </Fragment>
        ))}
        {undo && undo.index >= section.entries.length && undoRow}

        <div className="addrow">
          <button className="add-btn" onClick={() => addEntry(section.kind)}>
            <PlusIcon />
            Add {KIND_LABELS[section.kind].toLowerCase()}
          </button>
          {!isMaster && (
            <button
              className={"add-btn library" + (library ? " on" : "")}
              title="Something your master already holds"
              onClick={() => { setLibrary(!library); setPicking(false); }}
            >
              <LayersIcon />
              From your library
            </button>
          )}
          <button className="add-btn narrow" title="Add another type" onClick={() => setPicking(!picking)}>
            <MoreIcon />
          </button>
        </div>

        {library && (
          <div className="lib">
            <div className="lib-head">
              <span className="lib-h">In your master, not in this copy</span>
              <span className="lib-s">{shelf.length === 1 ? "1 thing" : `${shelf.length} things`}</span>
            </div>
            {shelf.map(({ entry, fromName }) => (
              <div className="lib-row" key={entry.id}>
                <span className="lib-tx">
                  <span className="lib-t">{entryTitle(entry) || "Untitled"}</span>
                  <span className="lib-m">{entryMeta(entry)}</span>
                </span>
                <span className="lib-from">from {fromName}</span>
                <button
                  className="lib-add"
                  title="Add it to this copy"
                  onClick={() => onAddFromLibrary(index, entry)}
                >
                  <PlusIcon />
                </button>
              </div>
            ))}
            <div className="lib-foot">
              {shelf.length
                ? "Adding brings the words across; the master keeps them too."
                : "Nothing yet. Everything you write in any copy joins the master, and turns up here."}
            </div>
          </div>
        )}
        {picking && (
          <div className="kindmenu inline">
            {ADD_ORDER.filter((k) => k !== section.kind).map((k) => (
              <button key={k} onClick={() => addEntry(k)}>
                <span className="kn">{KIND_LABELS[k]}</span>
                <span className="kf">{KIND_FIELDS[k]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
