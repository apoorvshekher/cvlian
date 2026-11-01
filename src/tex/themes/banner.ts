/* Full-bleed accent band behind a white header on page 1; the body is
 * the classic single-column layout. */
import type { DesignSettings, ResumeData } from "../../types";
import { docStart, header, packages, sectionsBody, settings } from "../base";
import type { Theme } from "../design";
import { num } from "../helpers";

export const banner: Theme = {
  id: "banner",
  name: "Banner",
  defaults: { accent: "#2b5876" },
  render(data: ResumeData, design: DesignSettings): string {
    const personal = data.personal || { name: "", contacts: [] };
    // top margin + name line (linespread 1.5, pt -> cm) + contact line + padding
    const bandHeight = 1.1 + design.nameSize * 0.0353 * 1.5 + 0.95;
    return [
      packages(design, personal.name || "", { topMargin: 1.1 }),
      settings(design),
      `\\AddToShipoutPictureBG*{\\AtPageUpperLeft{\\color{primaryColor}\\raisebox{-${num(bandHeight)} cm}{\\rule{\\paperwidth}{${num(bandHeight)} cm}}}}\n`,
      docStart(),
      `    {\\color{white}\\hypersetup{urlcolor=white}`,
      header(personal, design, { boldName: true }),
      "    }\n",
      "\n    \\vspace{0.7 cm}\n",
      sectionsBody(data.sections, design),
      "\n\\end{document}\n",
    ].join("");
  },
};
