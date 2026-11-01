import type { DesignSettings, ResumeData } from "../types";

export interface Theme {
  id: string;
  name: string;
  /* Applied on first use of the theme or explicit reset — never on switch. */
  defaults: Partial<DesignSettings>;
  render: (data: ResumeData, design: DesignSettings) => string;
}

export interface FontChoice {
  id: string;
  label: string;
  /* Preamble lines that select the family (files must be vendored). */
  setup: string;
}

/* Every id here must have its TeX files vendored in public/texlive/. */
export const FONTS: FontChoice[] = [
  { id: "charter", label: "Charter", setup: "\\usepackage{charter}" },
  { id: "lmodern", label: "Latin Modern", setup: "% text font: Latin Modern (loaded above)" },
  { id: "palatino", label: "Palatino", setup: "\\renewcommand{\\rmdefault}{ppl}" },
  { id: "times", label: "Times", setup: "\\renewcommand{\\rmdefault}{ptm}" },
];

export const FONT_SIZES = [10, 11, 12];

/* Classic defaults reproduce the original hardcoded template exactly. */
export const DESIGN_DEFAULTS: DesignSettings = {
  themeId: "classic",
  accent: "#000000",
  font: "charter",
  fontSize: 10,
  margins: 2,
  density: 1,
  paper: "letter",
  nameSize: 25,
  dateColWidth: 4.5,
};

function clamp(x: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/* Total + defensive: any imported/stored design degrades to defaults
 * instead of producing LaTeX that can't compile. */
export function normalizeDesign(raw: unknown): DesignSettings {
  const d = (raw ?? {}) as Partial<DesignSettings>;
  return {
    themeId: typeof d.themeId === "string" && d.themeId ? d.themeId : DESIGN_DEFAULTS.themeId,
    accent: /^#[0-9a-fA-F]{6}$/.test(String(d.accent)) ? String(d.accent) : DESIGN_DEFAULTS.accent,
    font: FONTS.some((f) => f.id === d.font) ? String(d.font) : DESIGN_DEFAULTS.font,
    fontSize: FONT_SIZES.includes(Number(d.fontSize)) ? Number(d.fontSize) : DESIGN_DEFAULTS.fontSize,
    margins: clamp(d.margins, DESIGN_DEFAULTS.margins, 1, 3),
    density: clamp(d.density, DESIGN_DEFAULTS.density, 0.75, 1.5),
    paper: d.paper === "a4" ? "a4" : "letter",
    nameSize: clamp(d.nameSize, DESIGN_DEFAULTS.nameSize, 18, 32),
    dateColWidth: clamp(d.dateColWidth, DESIGN_DEFAULTS.dateColWidth, 3, 6),
  };
}

export function fontSetup(design: DesignSettings): string {
  return (FONTS.find((f) => f.id === design.font) ?? FONTS[0]).setup;
}

/* "#1a56a0" -> "26, 86, 160" for \definecolor{...}{RGB}{...} */
export function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(", ");
}
