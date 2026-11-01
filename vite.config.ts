import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // relative base so the built app works from any GitHub Pages subpath
  base: "./",
  // no SPA fallback: the TeX engine probes /texlive/ for optional files and
  // must get real 404s, not index.html (which LaTeX would then try to parse)
  appType: "mpa",
  plugins: [react()],
});
