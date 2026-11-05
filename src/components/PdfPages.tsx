import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFWorker, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DocumentIcon } from "./icons";

/* Android's Chrome has no PDF viewer of its own. A PDF in an iframe there is
 * a grey box with an Open button that downloads the file — so on a tablet the
 * preview was a download link, not a page. Where the browser says it cannot
 * show a PDF (`navigator.pdfViewerEnabled === false`), the pages are drawn
 * here with PDF.js instead. Everywhere else the native viewer stays, with its
 * zoom, search and text selection.
 *
 * PDF.js is bundled, not fetched from a CDN, so the guest path still asks
 * nobody else for anything; and it is imported only on this path, so a
 * browser with a viewer never parses it. The legacy build is deliberate: the
 * browsers that land here are phones, tablets and webviews, which trail the
 * desktop engines the modern build is written for. */
export const hasPdfViewer = () => typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;

/* Room around the pages, and the most device pixels per CSS pixel worth
 * painting: past 2 a résumé reads no better, and each page is a bitmap held
 * twice over while the next compile's copy takes its place. */
const PAD = 12;
const MAX_DPR = 2;
const RESIZE_SETTLE_MS = 150;

type Lib = { pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs"); worker: PDFWorker };
let lib: Promise<Lib> | null = null;

/* One worker for the life of the page: each compile is a new document, and
 * starting a worker per document would re-parse a megabyte of script each
 * time. A failed load is forgotten so the next compile tries again (it fails
 * when the network is off and this path has never run online). */
function loadPdfjs(): Promise<Lib> {
  lib ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(
    ([pdfjs, src]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = src.default;
      return { pdfjs, worker: new pdfjs.PDFWorker() };
    },
    (e) => {
      lib = null;
      throw e;
    },
  );
  return lib;
}

async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const [{ pdfjs, worker }, bytes] = await Promise.all([
    loadPdfjs(),
    fetch(url).then((r) => r.arrayBuffer()),
  ]);
  /* Nothing here may reach the network: a résumé embeds every font it uses,
   * and has no images for the WebAssembly decoders to decode. */
  return pdfjs.getDocument({ data: new Uint8Array(bytes), worker, useWasm: false }).promise;
}

/* The page as canvases, one per page, fitted to the width of the column.
 * Like the iframe pair it stands in for, it never blinks: a new compile is
 * painted onto canvases that are not in the page yet, and they replace the
 * old ones in one step, so the scroll position survives a compile too. */
export function PdfPages({ url }: { url: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<{ url: string; doc: PDFDocumentProxy } | null>(null);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState<{ url: string; pages: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      /* the first measurement is taken at once; a drag or a rotation is
       * redrawn when it settles, and the old bitmap stretches until then */
      const w = Math.floor(box.clientWidth);
      if (!sheetRef.current?.childElementCount) setWidth(w);
      else t = setTimeout(() => setWidth(w), RESIZE_SETTLE_MS);
    });
    ro.observe(box);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!url || width <= PAD * 2) return;
    let cancelled = false;
    const tasks: RenderTask[] = [];
    let fresh: PDFDocumentProxy | null = null;

    (async () => {
      let doc = docRef.current?.url === url ? docRef.current.doc : null;
      if (!doc) {
        const opened = await openPdf(url);
        if (cancelled) return void opened.loadingTask.destroy();
        doc = fresh = opened;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const canvases: HTMLCanvasElement[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (cancelled) return;
        const fit = (width - PAD * 2) / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale: fit * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Page ${n} of ${doc.numPages}`);
        const task = page.render({ canvas, viewport });
        tasks.push(task);
        await task.promise;
        if (cancelled) return;
        canvases.push(canvas);
      }
      sheetRef.current?.replaceChildren(...canvases);
      if (fresh) {
        const old = docRef.current?.doc;
        docRef.current = { url, doc: fresh };
        fresh = null;
        void old?.loadingTask.destroy();
      }
      setShown({ url, pages: canvases.length });
      setFailed(false);
    })().catch((e) => {
      if (cancelled) return;
      console.warn("PDF preview could not be drawn", e);
      setFailed(true);
    });

    return () => {
      cancelled = true;
      for (const t of tasks) t.cancel();
      /* a document opened for a compile that was overtaken never shows */
      void fresh?.loadingTask.destroy();
    };
  }, [url, width]);

  useEffect(() => () => void docRef.current?.doc.loadingTask.destroy(), []);

  return (
    <div className="pdf-pages" ref={boxRef} data-src={shown?.url} data-pages={shown?.pages}>
      {!shown && !failed && (
        <div className="preview-empty">
          <DocumentIcon />
          <p>{url ? "Drawing the page…" : "Your typeset PDF will appear here"}</p>
        </div>
      )}
      {failed && !shown && (
        <div className="preview-empty">
          <DocumentIcon />
          <p>This browser cannot draw the page here.</p>
          {url && (
            <a className="quietlink" href={url} target="_blank" rel="noreferrer">
              Open the PDF
            </a>
          )}
        </div>
      )}
      <div className="pdf-sheet" ref={sheetRef} role="document" aria-label="Resume PDF preview" />
    </div>
  );
}
