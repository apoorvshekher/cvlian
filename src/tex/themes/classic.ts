/* The original single-column template, parameterized by DesignSettings.
 * With DESIGN_DEFAULTS this reproduces the pre-theme output exactly
 * (except that a non-black accent also colors section titles/rules). */
import type { DesignSettings, ResumeData } from "../../types";
import { docStart, header, packages, sectionsBody, settings } from "../base";
import type { Theme } from "../design";

export const classic: Theme = {
  id: "classic",
  name: "Classic",
  defaults: {},
  render(data: ResumeData, design: DesignSettings): string {
    const personal = data.personal || { name: "", contacts: [] };
    return [
      packages(design, personal.name || ""),
      settings(design),
      docStart(),
      header(personal, design),
      "\n    \\vspace{8 pt - 0.3 cm}\n",
      sectionsBody(data.sections, design),
      "\n\\end{document}\n",
    ].join("");
  },
};
