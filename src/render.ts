/* Facade kept so callers don't care about the theme module layout.
 * The JSON -> LaTeX renderers live in src/tex/ (one file per theme). */
export { renderTex, extractErrors, pageStats, type PageStats } from "./tex";
