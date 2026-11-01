import { useEffect, useRef, useState } from "react";
import type { PageStats } from "../render";
import type { DateVal, EditData, ResumeData } from "../types";
import { DesignCard } from "./DesignCard";
import { entryTitle } from "./EntryCard";
import { AlertIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PageCheckIcon, SlidersIcon } from "./icons";

/* The column beside the page. A full-width preview frame left the page
 * floating in a wide card on any large screen, so the room goes to the two
 * things that are about the page itself: what it measures (Check) and how
 * it looks (Look — the design card, which used to take the editor's place
 * and hide the words while you tried a theme). It folds to a strip, and on
 * a narrow screen, where everything stacks, it sits under the page. */

export type BesideTab = "check" | "look";

/* what the last successful compile measured, and when */
export interface Checked {
  stats: PageStats | null;
  at: number;
  seconds: number;
}

/* the editor stacks at this width (style.css), and the panel stacks with it */
const STACKED = "(max-width: 980px)";

function useStacked(): boolean {
  const [stacked, setStacked] = useState(() => matchMedia(STACKED).matches);
  useEffect(() => {
    const mq = matchMedia(STACKED);
    const on = () => setStacked(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return stacked;
}

interface Flag {
  tone: "warn" | "info";
  title: string;
  detail: string;
  sectionId?: string;
}

const hasDate = (d: DateVal) => !!(d.year.trim() || d.month);

/* Only what the data can say for certain. A page that spills a few lines,
 * a heading printed over nothing, a job with no dates — each is something a
 * reader of the PDF would notice, and each says where to go to fix it. */
function worthALook(data: ResumeData, s: PageStats | null): Flag[] {
  const out: Flag[] = [];
  if (s && s.pages > 1 && s.used / s.goal < 0.3) {
    const lines = Math.max(1, Math.round(s.used / s.line));
    const fewer = s.pages - 1;
    out.push({
      tone: "warn",
      title: `Page ${s.pages} holds only about ${lines} line${lines === 1 ? "" : "s"}`,
      detail: `Cut about that much and it should fit on ${fewer} page${fewer === 1 ? "" : "s"}.`,
    });
  }
  for (const sec of data.sections) {
    const name = sec.title.trim() || "An untitled section";
    if (!sec.entries.length && sec.title.trim()) {
      out.push({ tone: "warn", title: `${name} is empty`, detail: "It prints a heading with nothing under it.", sectionId: sec.id });
      continue;
    }
    const undated = sec.entries.filter(
      (e) => (e.kind === "experience" || e.kind === "education") && !e.current && !hasDate(e.start) && !hasDate(e.end),
    );
    if (undated.length) {
      out.push({
        tone: "info",
        title: undated.length === 1 ? `${entryTitle(undated[0]) || "An entry"} has no dates` : `${undated.length} entries have no dates`,
        detail: name,
        sectionId: sec.id,
      });
    }
  }
  return out;
}

function PageCheck({
  data,
  checked,
  stale,
  failed,
  onGoTo,
}: {
  data: ResumeData;
  checked: Checked | null;
  stale: boolean;
  failed: boolean;
  onGoTo: (sectionId: string) => void;
}) {
  const s = checked?.stats ?? null;
  const flags = worthALook(data, s);
  const pct = s ? Math.min(100, Math.round((s.used / s.goal) * 100)) : 0;
  const spare = s ? Math.floor((s.goal - s.used) / s.line) : 0;

  return (
    <div className="pcheck">
      {failed ? (
        <p className="ck-note bad">The last compile failed, so these figures are from the one before it.</p>
      ) : stale ? (
        <p className="ck-note">Edited since the last compile — the figures catch up when you compile.</p>
      ) : null}

      <div className="ck-card">
        {s ? (
          <>
            <div className="ck-big">
              <b>{s.pages} {s.pages === 1 ? "page" : "pages"}</b>
              {s.pages === 1 && <span className="ck-ok">fits</span>}
            </div>
            <div className="ck-meter" role="img" aria-label={`The last page is ${pct}% full`}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="ck-sub">
              {s.pages === 1 ? (
                spare >= 1 ? (
                  <>About <b>{spare} line{spare === 1 ? "" : "s"}</b> to spare before anything moves to a second page.</>
                ) : (
                  <>Full to the last line — one more and an entry moves to a second page.</>
                )
              ) : (
                <>Page {s.pages} is <b>{pct}% full</b>.</>
              )}
            </p>
          </>
        ) : (
          <p className="ck-sub">Compile once and the page is measured here.</p>
        )}
      </div>

      <div className="ck-label">Worth a look</div>
      {flags.length ? (
        flags.map((f) =>
          f.sectionId ? (
            <button key={f.title + f.sectionId} type="button" className={"ck-flag " + f.tone} onClick={() => onGoTo(f.sectionId!)}>
              <AlertIcon />
              <span className="ft"><b>{f.title}</b><span className="fw">{f.detail}</span></span>
            </button>
          ) : (
            <div key={f.title} className={"ck-flag " + f.tone}>
              <AlertIcon />
              <span className="ft"><b>{f.title}</b><span className="fw">{f.detail}</span></span>
            </div>
          ),
        )
      ) : (
        <p className="ck-clear"><CheckIcon />Nothing to flag</p>
      )}

      {checked && (
        <p className="ck-foot">
          Compiled at {new Date(checked.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · typeset in {checked.seconds.toFixed(1)} s
        </p>
      )}
    </div>
  );
}

export function Beside({
  open,
  tab,
  onOpen,
  onFold,
  reveal,
  data,
  editData,
  checked,
  stale,
  failed,
  onGoTo,
}: {
  open: boolean;
  tab: BesideTab;
  onOpen: (tab: BesideTab) => void;
  onFold: () => void;
  /* bumped when something asks for the panel, so a stacked layout can bring
   * it into view rather than open it somewhere below the fold */
  reveal: number;
  data: ResumeData;
  editData: EditData;
  checked: Checked | null;
  stale: boolean;
  failed: boolean;
  onGoTo: (sectionId: string) => void;
}) {
  const stacked = useStacked();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reveal) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [reveal]);

  if (!open && !stacked) {
    return (
      <aside className="beside folded" ref={ref} aria-label="Beside the page">
        <button type="button" className="bs-icon" title="Unfold" aria-label="Unfold the panel" onClick={() => onOpen(tab)}>
          <ChevronLeftIcon />
        </button>
        <button type="button" className="bs-icon" title="Check the page" aria-label="Check the page" onClick={() => onOpen("check")}>
          <PageCheckIcon />
        </button>
        <button type="button" className="bs-icon" title="Look & feel" aria-label="Look and feel" onClick={() => onOpen("look")}>
          <SlidersIcon />
        </button>
      </aside>
    );
  }

  return (
    <aside className="beside" ref={ref} aria-label="Beside the page">
      <div className="bs-head">
        <div className="bs-tabs" role="tablist" aria-label="Beside the page">
          <button type="button" role="tab" aria-selected={tab === "check"} className={"bs-tab" + (tab === "check" ? " on" : "")} onClick={() => onOpen("check")}>
            <PageCheckIcon />Check
          </button>
          <button type="button" role="tab" aria-selected={tab === "look"} className={"bs-tab" + (tab === "look" ? " on" : "")} onClick={() => onOpen("look")}>
            <SlidersIcon />Look
          </button>
        </div>
        <button type="button" className="bs-icon bs-fold" title="Fold away" aria-label="Fold the panel away" onClick={onFold}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="bs-body" role="tabpanel">
        {tab === "check" ? (
          <PageCheck data={data} checked={checked} stale={stale} failed={failed} onGoTo={onGoTo} />
        ) : (
          <DesignCard design={data.design} editData={editData} />
        )}
      </div>
    </aside>
  );
}
