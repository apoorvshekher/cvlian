import { useEffect, useState } from "react";
import type { Contact, EditData, Entry, ResumeData, Store } from "../types";
import { PersonalCard } from "./PersonalCard";
import { SectionEditor } from "./SectionEditor";
import { SectionRail, type Sel } from "./SectionRail";

export function EditorPane({
  data,
  store,
  branchId,
  onAddFromLibrary,
  onAddContact,
  editData,
  focusName,
  onNameFocused,
  onOpenLook,
  goTo,
}: {
  data: ResumeData;
  /* the whole workspace, so a section can offer what other copies hold */
  store: Store | null;
  branchId: string;
  onAddFromLibrary: (sectionIndex: number, entry: Entry) => void;
  onAddContact: (contact: Contact) => void;
  editData: EditData;
  /* "Make it mine" on the first-run strip puts the cursor in the name box */
  focusName?: boolean;
  onNameFocused?: () => void;
  /* Look & feel lives beside the page now; the rail's row opens it there */
  onOpenLook: () => void;
  /* a section something outside asked to show — the page check's flags */
  goTo?: { id: string; n: number } | null;
}) {
  const [selected, setSelected] = useState<Sel>("header");
  useEffect(() => {
    if (goTo) setSelected(goTo.id);
  }, [goTo]);

  // a deleted section falls back to the header pane
  const index = data.sections.findIndex((s) => s.id === selected);
  const view: Sel = selected === "header" || index >= 0 ? selected : "header";

  return (
    <div className="workspace">
      <SectionRail
        sections={data.sections}
        contactCount={data.personal.contacts.length}
        selected={view}
        onSelect={setSelected}
        onOpenLook={onOpenLook}
        editData={editData}
      />
      <main className="editor">
        {view === "header" && (
          <PersonalCard
            personal={data.personal}
            store={store}
            branchId={branchId}
            onAddContact={onAddContact}
            editData={editData}
            focusName={focusName}
            onNameFocused={onNameFocused}
          />
        )}
        {index >= 0 && view === data.sections[index].id && (
          <SectionEditor
            key={data.sections[index].id}
            section={data.sections[index]}
            index={index}
            store={store}
            branchId={branchId}
            onAddFromLibrary={onAddFromLibrary}
            editData={editData}
            sidebarMode={data.design.themeId === "sidebar"}
            onRemoved={() => setSelected("header")}
          />
        )}
      </main>
    </div>
  );
}
