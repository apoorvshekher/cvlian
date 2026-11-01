import { tagGroup } from "../tex/base";
import type { Entry, ResumeData } from "../types";
import { fmtDate, fmtRange, plain } from "./controls";

/* Two ways of showing a résumé you are not currently editing.
 *
 * Neither is the typeset PDF: re-typesetting three résumés to open a panel
 * would take seconds and hammer the engine. The sketch answers "which one is
 * this?" from the shape alone; the preview answers "what does it say?" by
 * reading the same data the renderer reads. The real thing stays in the
 * editor, one click away. */

/* Bars, at the size of a postage stamp — length and shape, nothing more. */
export function PageSketch({ data }: { data: ResumeData }) {
  const rows = data.sections.slice(0, 6).map((s) => Math.min(s.entries.length || 1, 3));
  return (
    <div className="pgsk">
      <i className="n" />
      <i className="c" />
      {rows.map((n, i) => (
        <span key={i} className="pgs-sec">
          <i className="h" />
          {Array.from({ length: n }, (_, j) => <i key={j} />)}
        </span>
      ))}
    </div>
  );
}

function EntryLines({ e }: { e: Entry }) {
  switch (e.kind) {
    case "experience":
      return (
        <div className="rent">
          <div className="rtop"><span><b>{e.role}</b></span><span>{fmtRange(e.start, e.end, e.current)}</span></div>
          <div className="rsub">{[e.company, e.location].filter(Boolean).join(" — ")}</div>
          {e.bullets.slice(0, 3).map((b) => <div className="rb" key={b.id}>{plain(b.text)}</div>)}
        </div>
      );
    case "education":
      return (
        <div className="rent">
          <div className="rtop"><span><b>{e.school}</b>{e.location ? ` — ${e.location}` : ""}</span><span>{fmtRange(e.start, e.end, e.current)}</span></div>
          <div className="rsub">{[[e.degree, e.field].filter(Boolean).join(" in "), e.gpa && `GPA ${e.gpa}`].filter(Boolean).join(" · ")}</div>
          {e.bullets.slice(0, 2).map((b) => <div className="rb" key={b.id}>{plain(b.text)}</div>)}
        </div>
      );
    case "project":
      return (
        <div className="rent">
          <div className="rtop"><span><b>{e.name}</b></span><span>{fmtRange(e.start, e.end, e.current)}</span></div>
          {e.description && <div className="rsub">{plain(e.description)}</div>}
          {e.bullets.slice(0, 2).map((b) => <div className="rb" key={b.id}>{plain(b.text)}</div>)}
        </div>
      );
    case "item":
      return (
        <div className="rent">
          <div className="rtop"><span><b>{e.title}</b></span><span>{fmtRange(e.start, e.end, e.current)}</span></div>
          {e.subtitle && <div className="rsub">{plain(e.subtitle)}</div>}
          {e.bullets.slice(0, 2).map((b) => <div className="rb" key={b.id}>{plain(b.text)}</div>)}
        </div>
      );
    case "certification":
      return (
        <div className="rent">
          <div className="rtop"><span><b>{e.name}</b>{e.issuer && `, ${plain(e.issuer)}`}</span><span>{fmtDate(e.date)}</span></div>
          {e.bullets.slice(0, 2).map((b) => <div className="rb" key={b.id}>{plain(b.text)}</div>)}
        </div>
      );
    case "publication":
      return (
        <div className="rent">
          <div className="rtop"><span><b>{e.title}</b></span><span>{fmtDate(e.date)}</span></div>
          {(e.authors || e.venue) && (
            <div className="rsub">{[plain(e.authors), plain(e.venue)].filter(Boolean).join(" — ")}</div>
          )}
          {e.bullets.slice(0, 2).map((b) => <div className="rb" key={b.id}>{plain(b.text)}</div>)}
        </div>
      );
    case "paragraph":
      return <div className="rp">{plain(e.text)}</div>;
    case "tags": {
      const group = tagGroup(e.group);
      return (
        <div className="rp">
          {group && <b>{plain(group)}: </b>}
          {e.tags.filter((t) => t.trim()).map(plain).join(", ")}
        </div>
      );
    }
    case "levels":
      return (
        <div className="rent">
          {e.items.filter((i) => i.name.trim()).map((i, k) => (
            <div className="rtop" key={k}>
              <span>{i.name}</span>
              <span className="rdots">{Array.from({ length: 5 }, (_, d) => <u key={d} className={d < i.level ? "" : "o"} />)}</span>
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div className="rent">
          <div className="rtop"><span><b>{plain(e.left)}</b></span><span>{plain(e.right)}</span></div>
          {e.bullets.slice(0, 2).map((b) => <div className="rb" key={b.id}>{plain(b.text)}</div>)}
        </div>
      );
  }
}

export function PagePreview({ data }: { data: ResumeData }) {
  return (
    <div className="rpage">
      <div className="rname">{data.personal.name || "Untitled"}</div>
      {!!data.personal.contacts.length && (
        <div className="rcon">
          {data.personal.contacts.map((c, i) => (
            <span key={i}>
              {i > 0 && <i className="sep">·</i>}
              {c.text}
            </span>
          ))}
        </div>
      )}
      {data.sections.map((s) => (
        <div className="rsec" key={s.id}>
          <div className="rsh">{s.title}</div>
          {s.entries.map((e) => <EntryLines key={e.id} e={e} />)}
        </div>
      ))}
    </div>
  );
}
