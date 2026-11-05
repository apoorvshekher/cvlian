import { useEffect, useState } from "react";
import { DocumentIcon, ExternalIcon } from "./icons";
import { PdfPages, hasPdfViewer } from "./PdfPages";

/* Decided once: whether this browser can show a PDF at all does not change
 * while the page is open. */
const NATIVE = hasPdfViewer();

/* PDF viewers are inconsistent about firing load on an iframe. If it never
 * arrives, show the new page anyway rather than sitting on a stale one. */
const SWAP_FALLBACK_MS = 1500;

interface Buf {
  slot: 0 | 1;
  url: string;
}

export function Preview({ url, name }: { url: string | null; name?: string }) {
  return (
    <section className="preview">
      <div className="preview-chrome">
        <span className="preview-label">Preview</span>
        {name && <span className="preview-name">{name}</span>}
        {url && (
          <a className="iconbtn" href={url} target="_blank" rel="noreferrer" title="Open the PDF in a new tab">
            <ExternalIcon />
          </a>
        )}
      </div>
      <div className="preview-stage">{NATIVE ? <PdfFrames url={url} /> : <PdfPages url={url} />}</div>
    </section>
  );
}

/* Two frames in fixed positions. A freshly compiled PDF loads in the spare
 * one and only becomes visible once it has painted, so the page never blinks
 * white between compiles — which is what makes waiting two seconds for a
 * redraw bearable. Promotion is a class change on an element that is already
 * loaded; the frames never swap places in the DOM, because moving an iframe
 * makes it reload and that is the flash we are here to avoid. */
function PdfFrames({ url }: { url: string | null }) {
  const [front, setFront] = useState<Buf | null>(null);
  const [back, setBack] = useState<Buf | null>(null);

  useEffect(() => {
    if (!url) {
      setFront(null);
      setBack(null);
      return;
    }
    /* Already on screen: nothing to load. Without this the effect re-runs on
     * its own promotion, hands the url straight back to the spare slot, and
     * the two frames reload each other forever. */
    if (front?.url === url) {
      setBack(null);
      return;
    }
    setBack((cur) => (cur?.url === url ? cur : { slot: front?.slot === 0 ? 1 : 0, url }));
  }, [url, front]);

  const promote = (b: Buf) => {
    setFront(b);
    setBack((cur) => (cur?.url === b.url ? null : cur));
  };

  useEffect(() => {
    if (!back) return;
    const t = setTimeout(() => promote(back), SWAP_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [back]);

  /* front and back keep their own slot for as long as they live, so each
   * iframe stays put in the child list */
  const slots: (Buf | null)[] = [null, null];
  if (front) slots[front.slot] = front;
  if (back && (!front || back.slot !== front.slot)) slots[back.slot] = back;

  return (
    <>
      {!front && (
        <div className="preview-empty">
          <DocumentIcon />
          <p>Your typeset PDF will appear here</p>
        </div>
      )}
      {slots.map((buf, i) =>
        buf ? (
          <iframe
            key={i}
            className={buf === front ? "pdf-page" : "pdf-page pdf-incoming"}
            title={buf === front ? "Resume PDF preview" : "Next version of the PDF, loading"}
            aria-hidden={buf === front ? undefined : true}
            src={buf.url + "#toolbar=0&navpanes=0"}
            onLoad={buf === front ? undefined : () => promote(buf)}
          />
        ) : null,
      )}
    </>
  );
}
