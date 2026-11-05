import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* PDF.js draws the preview only where the browser has no PDF viewer of its
 * own (src/components/PdfPages.tsx), so its files go in a folder of their
 * own: scripts/stamp-sw.mjs leaves that folder out of the precached shell,
 * and it is cached on first use instead, like the TeX tree. Its worker ships
 * as `.mjs`, and a module worker is refused unless it is served as
 * JavaScript, which not every static host does for that extension — so it
 * is renamed `.js`. */
const PDFJS_DIR = "assets/pdfjs";
/* module ids are absolute, an asset's original file is relative to the root */
const fromPdfjs = (id: string) => /(^|\/)node_modules\/pdfjs-dist\//.test(id);

export default defineConfig({
  // relative base so the built app works from any GitHub Pages subpath
  base: "./",
  // no SPA fallback: the TeX engine probes /texlive/ for optional files and
  // must get real 404s, not index.html (which LaTeX would then try to parse)
  appType: "mpa",
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        chunkFileNames: (chunk) =>
          chunk.moduleIds.some(fromPdfjs) ? `${PDFJS_DIR}/[name]-[hash].js` : "assets/[name]-[hash].js",
        assetFileNames: (asset) =>
          asset.originalFileNames.some(fromPdfjs) ? `${PDFJS_DIR}/[name]-[hash].js` : "assets/[name]-[hash][extname]",
      },
    },
  },
});
