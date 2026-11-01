import { useState, type DragEvent, type HTMLAttributes } from "react";

/* Splice-based move — correct for any distance, not just adjacent. */
export function arrayMove<T>(list: T[], from: number, to: number): void {
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}

/* The active drag, shared across all hook instances so a list can tell its
 * own items from a child/parent list's (dataTransfer is unreadable during
 * dragover, so this can't live there). */
let current: { scope: string; index: number } | null = null;

/* Native HTML5 drag-and-drop for one vertical list, identified by a unique
 * `scope` (e.g. "sections", `entries:${sectionId}`). Spread handleProps(i)
 * on the drag handle only (keeps text selection and nested lists working)
 * and itemProps(i) on the row/card root; append stateClass(i) to the root's
 * className for drop-indicator styling. */
export function useDnDList(scope: string, onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [over, setOver] = useState<{ index: number; after: boolean } | null>(null);

  const handleProps = (index: number): HTMLAttributes<HTMLElement> => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      current = { scope, index };
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", ""); // some browsers need data to start a drag
      const item = (e.currentTarget as HTMLElement).closest("[data-dnd-item]");
      if (item) e.dataTransfer.setDragImage(item, 16, 16);
    },
    onDragEnd: () => {
      current = null;
      setDragIndex(null);
      setOver(null);
    },
  });

  const itemProps = (index: number): HTMLAttributes<HTMLElement> => ({
    // @ts-expect-error data attribute used by setDragImage lookup
    "data-dnd-item": true,
    onDragOver: (e: DragEvent) => {
      if (!current || current.scope !== scope) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setOver({ index, after: e.clientY > r.top + r.height / 2 });
    },
    onDragLeave: () => {
      setOver((o) => (o?.index === index ? null : o));
    },
    onDrop: (e: DragEvent) => {
      if (!current || current.scope !== scope) return;
      e.preventDefault();
      e.stopPropagation();
      const from = current.index;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      let to = index + (after ? 1 : 0);
      if (from < to) to -= 1;
      if (to !== from) onMove(from, to);
      current = null;
      setDragIndex(null);
      setOver(null);
    },
  });

  const stateClass = (index: number): string => {
    if (dragIndex === index) return " dragging";
    if (over?.index === index) return over.after ? " drop-after" : " drop-before";
    return "";
  };

  return { handleProps, itemProps, stateClass };
}

export type DnDList = ReturnType<typeof useDnDList>;
