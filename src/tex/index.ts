import type { ResumeData } from "../types";
import { normalizeDesign, type Theme } from "./design";
import { banner } from "./themes/banner";
import { classic } from "./themes/classic";
import { sidebar } from "./themes/sidebar";

/* Ordered as shown in the theme picker. */
export const THEMES: Theme[] = [classic, sidebar, banner];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function renderTex(data: ResumeData): string {
  const design = normalizeDesign(data.design);
  const theme = BY_ID.get(design.themeId) ?? classic;
  return theme.render(data, design);
}

export { extractErrors, pageStats, type PageStats } from "./helpers";
export { DESIGN_DEFAULTS, FONTS, FONT_SIZES, normalizeDesign, type Theme } from "./design";
