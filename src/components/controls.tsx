import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MONTHS, type DateVal } from "../types";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, TrashIcon } from "./icons";

/* A labelled block that owns a full row. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        {label}
        {hint && <span className="opt">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/* Fields sit in bordered rows; each Cell is one column of the row. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="frow">{children}</div>;
}

export function Cell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="fcell">
      <label>
        {label}
        {hint && <span className="opt">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function TextIn({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      className="cin"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* Month picker + free-text year, so structure stays typed but odd formats
 * ("Summer", "'18") still fit in the year box. */
export function DateIn({
  value,
  onChange,
  disabled,
}: {
  value: DateVal;
  onChange: (v: DateVal) => void;
  disabled?: boolean;
}) {
  return (
    <div className={"datein" + (disabled ? " off" : "")}>
      <select
        value={value.month}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, month: e.target.value })}
      >
        <option value="">—</option>
        {/* a resume written elsewhere may spell the month its own way */}
        {value.month && !MONTHS.includes(value.month) && (
          <option value={value.month}>{value.month}</option>
        )}
        {MONTHS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <input
        type="text"
        className="yr"
        value={value.year}
        placeholder="year"
        disabled={disabled}
        onChange={(e) => onChange({ ...value, year: e.target.value })}
      />
    </div>
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button className="check" type="button" onClick={() => onChange(!checked)}>
      <i className={"box" + (checked ? " on" : "")}>{checked && <CheckIcon />}</i>
      {label}
    </button>
  );
}

export function AutoGrowTextarea({
  value,
  onChange,
  rows = 1,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    // scrollHeight is 0 while an ancestor is display:none — leave the CSS
    // height alone rather than locking in a collapsed measurement
    if (ta.scrollHeight > 0) ta.style.height = ta.scrollHeight + 2 + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* Naming something, in the place the name is going to live. This is what
 * replaced prompt() — a browser dialog reads as the browser warning you about
 * the page, which is the wrong tone for "what shall we call this?". */
export function InlineName({
  action,
  initial,
  placeholder,
  onCommit,
  onCancel,
}: {
  action: string;
  initial?: string;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const commit = () => {
    const name = value.trim();
    if (name) onCommit(name);
  };
  return (
    <div className="inline-name">
      <input
        type="text"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
      />
      <button className="hact primary" disabled={!value.trim()} onClick={commit}>{action}</button>
      <button className="hact" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/* "Delete this copy? · Delete · Keep", where the thing itself is. Keep takes
 * the focus, so the safe answer is the one a stray Enter gives you. */
export function ConfirmStrip({
  question,
  action = "Delete",
  cancel = "Keep",
  onConfirm,
  onCancel,
}: {
  question: string;
  action?: string;
  cancel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-strip">
      <span className="cq">{question}</span>
      <button className="hact danger" onClick={onConfirm}>{action}</button>
      <button className="hact" autoFocus onClick={onCancel}>{cancel}</button>
    </div>
  );
}

/* What a one-click delete leaves where the thing was: what went, and the way
 * back. It replaces asking first — a question before every delete turned
 * clearing anything out into a hunt, and Undo costs the careful nothing. */
export function UndoRow({ what, onUndo }: { what: string; onUndo: () => void }) {
  return (
    <div className="undo-row">
      <span className="ut">Deleted <b>{what}</b></span>
      <button className="hact" onClick={onUndo}>Undo</button>
    </div>
  );
}

/* Put back what an UndoRow stands for, where it was — unless it is already
 * back. Ids are kept, so the master and the copies still agree about it. */
export function restoreAt<T extends { id: string }>(list: T[], item: T, index: number): void {
  if (!list.some((x) => x.id === item.id)) list.splice(Math.min(index, list.length), 0, structuredClone(item));
}

/* Move-up / move-down / delete buttons shared by rows. Delete is one click:
 * the row leaves an UndoRow behind instead of asking first. */
export function HeadButtons({
  index,
  count,
  kind,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  kind: string;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
}) {
  const move = (delta: number) => {
    const j = index + delta;
    if (j < 0 || j >= count) return;
    onMove(index, j);
  };
  return (
    <>
      <button title="Move up" onClick={() => move(-1)}><ChevronUpIcon /></button>
      <button title="Move down" onClick={() => move(1)}><ChevronDownIcon /></button>
      <button className="del" title={`Delete ${kind}`} onClick={onDelete}>
        <TrashIcon />
      </button>
    </>
  );
}

/* Strip markdown for display in row headers. */
export function plain(text: string): string {
  return (text || "")
    .split("\n")[0]
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*+/g, "");
}

/* "Sept 2018 – May 2022" for the UI (en dash, not LaTeX). */
export function fmtDate(d: DateVal): string {
  return [d.month, d.year].filter((x) => x && x.trim()).join(" ").trim();
}

export function fmtRange(start: DateVal, end: DateVal, current: boolean): string {
  const a = fmtDate(start);
  const b = current ? "Present" : fmtDate(end);
  return a && b ? `${a} – ${b}` : a || b;
}
