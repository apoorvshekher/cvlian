import { Fragment, useEffect, useRef, useState } from "react";
import type { Contact, EditData, Personal, Store } from "../types";
import { contactKey, contactsFor, masterOf } from "../master";
import { HeadButtons, UndoRow } from "./controls";
import { arrayMove, useDnDList } from "./dnd";
import {
  CONTACT_ICONS, CONTACT_ICON_IDS, ChevronDownIcon, GripIcon, LayersIcon, PlusIcon, contactIcon,
} from "./icons";

/* Turn what someone typed into somewhere it can go. An address becomes a
 * mailto:, a handle becomes a real link — so the second field stops being a
 * chore and mostly fills itself in. */
export function autoUrl(text: string): string {
  const t = (text || "").trim();
  if (!t) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "mailto:" + t;
  if (/^\+?[\d\s()-]{7,}$/.test(t)) return "tel:" + t.replace(/[^\d+]/g, "");
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return "https://" + t;
  return "";
}

function IconPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const custom = !!value && !CONTACT_ICON_IDS.has(value);

  return (
    <div className="iconpick">
      <button
        className={"ip-btn" + (open ? " on" : "")}
        title="The little mark shown before the text"
        onClick={() => setOpen(!open)}
      >
        {value ? contactIcon(value) : <i className="ip-none" />}
        <ChevronDownIcon />
      </button>
      {open && (
        <>
          <div className="ip-scrim" onClick={() => setOpen(false)} />
          <div className="ip-menu">
            <div className="ip-grid">
              <button className={value ? "" : "on"} onClick={() => { onChange(""); setOpen(false); }}>
                <i className="ip-none" />
                <span>No icon</span>
              </button>
              {CONTACT_ICONS.map((i) => (
                <button
                  key={i.id}
                  className={i.id === value ? "on" : ""}
                  onClick={() => { onChange(i.id); setOpen(false); }}
                >
                  {i.node}
                  <span>{i.label}</span>
                </button>
              ))}
            </div>
            <div className="ip-custom">
              <label>Something else</label>
              <input
                type="text"
                value={custom ? value : ""}
                placeholder="a FontAwesome name"
                onChange={(e) => onChange(e.target.value)}
              />
              <span className="ip-warn">
                Only the ones above are known to render; anything else may stop the page building.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PersonalCard({
  personal,
  store,
  branchId,
  onAddContact,
  editData,
  focusName,
  onNameFocused,
}: {
  personal: Personal;
  /* the whole workspace, so Your details can offer what the master holds */
  store: Store | null;
  branchId: string;
  onAddContact: (contact: Contact) => void;
  editData: EditData;
  focusName?: boolean;
  onNameFocused?: () => void;
}) {
  const [library, setLibrary] = useState(false);
  /* every way of reaching you the master holds that this copy has dropped */
  const shelf = store && library ? contactsFor(store, branchId) : [];
  /* the master IS the library — offering it to itself would always be empty */
  const isMaster = !!store && masterOf(store)?.id === branchId;
  const dnd = useDnDList("contacts", (from, to) =>
    editData((d) => arrayMove(d.personal.contacts, from, to)),
  );
  const nameRef = useRef<HTMLInputElement>(null);
  /* the contact deleted last, held where it was until Undo or the next delete */
  const [undo, setUndo] = useState<{ contact: Contact; index: number } | null>(null);
  const undoRow = undo && (
    <UndoRow
      what={undo.contact.text || undo.contact.url}
      onUndo={() => {
        const { contact, index } = undo;
        editData((d) => {
          const list = d.personal.contacts;
          /* contacts have no ids: "already back" means "goes to the same place" */
          if (!list.some((x) => contactKey(x) === contactKey(contact))) {
            list.splice(Math.min(index, list.length), 0, structuredClone(contact));
          }
        });
        setUndo(null);
      }}
    />
  );

  useEffect(() => {
    if (!focusName) return;
    nameRef.current?.focus();
    nameRef.current?.select();
    onNameFocused?.();
  }, [focusName, onNameFocused]);

  return (
    <div className="pane">
      <div className="pane-head">
        <span className="pnum">01</span>
        <span className="ptitle static">Your details</span>
        <span className="pkind">Top of the page</span>
      </div>

      <div className="pane-body">
        <div className="namefield">
          <label htmlFor="resume-name">Your name, as it should appear</label>
          <input
            id="resume-name"
            ref={nameRef}
            type="text"
            placeholder="Your name"
            value={personal.name}
            onChange={(e) => editData((d) => { d.personal.name = e.target.value; })}
          />
        </div>

        <div className="blabel">
          <span>Ways to reach you</span>
          <span className="hint">shown in one line under your name</span>
        </div>

        {personal.contacts.map((c, i) => (
          <Fragment key={i}>
            {undo?.index === i && undoRow}
            <div className={"contact-row" + dnd.stateClass(i)} {...dnd.itemProps(i)}>
              <span className="drag-handle" title="Drag to reorder" {...dnd.handleProps(i)}>
                <GripIcon />
              </span>
              <IconPick
                value={c.icon}
                onChange={(v) => editData((d) => { d.personal.contacts[i].icon = v; })}
              />
              <div className="c-stack">
                <div className="c-line">
                  <label>Shows as</label>
                  <input
                    type="text"
                    placeholder="alex@example.com"
                    value={c.text}
                    onChange={(e) => {
                      const next = e.target.value;
                      editData((d) => {
                        const row = d.personal.contacts[i];
                        /* the link follows the text until someone edits it themselves */
                        if (!row.url || row.url === autoUrl(row.text)) row.url = autoUrl(next);
                        row.text = next;
                      });
                    }}
                  />
                </div>
                <div className="c-line">
                  <label>Goes to</label>
                  <input
                    type="text"
                    className="dim"
                    placeholder="nowhere — it is just text"
                    value={c.url}
                    onChange={(e) => editData((d) => { d.personal.contacts[i].url = e.target.value; })}
                  />
                </div>
              </div>
              <HeadButtons
                index={i}
                count={personal.contacts.length}
                kind="contact item"
                onMove={(from, to) => editData((d) => arrayMove(d.personal.contacts, from, to))}
                onDelete={() => {
                  setUndo(c.text.trim() || c.url.trim() ? { contact: c, index: i } : null);
                  editData((d) => { d.personal.contacts.splice(i, 1); }, true);
                }}
              />
            </div>
          </Fragment>
        ))}
        {undo && undo.index >= personal.contacts.length && undoRow}

        <div className="addrow">
          <button
            className="add-btn"
            onClick={() => editData((d) => { d.personal.contacts.push({ text: "", url: "", icon: "" }); })}
          >
            <PlusIcon />
            Add a way to reach you
          </button>
          {!isMaster && (
            <button
              className={"add-btn library" + (library ? " on" : "")}
              title="Something your master already holds"
              onClick={() => setLibrary(!library)}
            >
              <LayersIcon />
              From your library
            </button>
          )}
        </div>

        {library && (
          <div className="lib">
            <div className="lib-head">
              <span className="lib-h">In your master, not in this copy</span>
              <span className="lib-s">{shelf.length === 1 ? "1 way" : `${shelf.length} ways`}</span>
            </div>
            {shelf.map(({ contact, fromName }) => (
              <div className="lib-row" key={contactKey(contact)}>
                {contact.icon ? contactIcon(contact.icon) : <i className="ip-none" />}
                <span className="lib-tx">
                  <span className="lib-t">{contact.text || contact.url}</span>
                  <span className="lib-m">{contact.url === contact.text ? "" : contact.url}</span>
                </span>
                <span className="lib-from">from {fromName}</span>
                <button className="lib-add" title="Add it to this copy" onClick={() => onAddContact(contact)}>
                  <PlusIcon />
                </button>
              </div>
            ))}
            <div className="lib-foot">
              {shelf.length
                ? "Adding brings it across; the master keeps it too."
                : "Nothing yet. Every way of reaching you that you write in any copy joins the master, and turns up here."}
            </div>
          </div>
        )}

        <div className="pane-note">
          <p className="notetx">
            Everything in a section is typed into its own box, so you never need markup for
            structure. <code>**bold**</code> and <code>*italic*</code> are for emphasis inside a
            sentence, and nothing else is treated as code.
          </p>
        </div>
      </div>
    </div>
  );
}
