import { useState } from "react";
import type { ResumeData } from "../types";
import { CONTACT_ICON_IDS, XIcon } from "./icons";

export interface Notice {
  kind: "error" | "info";
  title: string;
  body?: string;
  /* the raw log, behind a disclosure — never the first thing anyone reads */
  log?: string;
}

/* What can actually break a compile, which is not what you would guess.
 * Every word a person types is escaped by the renderer, so prose cannot take
 * LaTeX down. The fields that go in raw are the ones to explain: the icon
 * name, which becomes an undefined control sequence, and the URL, which used
 * to do the same until escUrl started escaping it. */
export function explainCompileFailure(log: string, data: ResumeData): Notice {
  const unknown = data.personal.contacts.filter((c) => c.icon && !CONTACT_ICON_IDS.has(c.icon));
  if (unknown.length && /undefined control sequence|faicon|fontawesome/i.test(log)) {
    const names = unknown.map((c) => `"${c.icon}"`).join(", ");
    return {
      kind: "error",
      title:
        unknown.length === 1
          ? `There is no contact icon called ${names}.`
          : `There are no contact icons called ${names}.`,
      body: "Pick one from the list in Your details, or clear the icon and show the text on its own.",
      log,
    };
  }
  return {
    kind: "error",
    title: "Something in this résumé stopped the page from building.",
    body: "The page on the right is the last one that worked. Nothing you have written is lost — it is all still saved.",
    log,
  };
}

export function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={"notice " + notice.kind}>
      <div className="notice-row">
        <svg className="icon notice-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.8" />
          <path d="M8 5.2v3.4M8 10.6v.4" />
        </svg>
        <div className="notice-text">
          <strong>{notice.title}</strong>
          {notice.body && <p>{notice.body}</p>}
        </div>
        {notice.log && (
          <button className="hact" onClick={() => setOpen(!open)}>
            {open ? "Hide the details" : "Technical details"}
          </button>
        )}
        <button className="iconbtn" title="Dismiss" onClick={onClose}>
          <XIcon />
        </button>
      </div>
      {open && notice.log && <pre className="notice-log">{notice.log}</pre>}
    </div>
  );
}
