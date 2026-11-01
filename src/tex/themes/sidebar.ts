/* Two-column layout: sections marked `side` flow into a tinted narrow
 * left column (paracol paints the tint per page, so multi-page works). */
import type { DesignSettings, ResumeData } from "../../types";
import { docStart, header, packages, sectionsBody, settings } from "../base";
import type { Theme } from "../design";
import { num } from "../helpers";

export const sidebar: Theme = {
  id: "sidebar",
  name: "Sidebar",
  defaults: { accent: "#2b6cb0", margins: 1.6 },
  render(data: ResumeData, design: DesignSettings): string {
    const personal = data.personal || { name: "", contacts: [] };
    const sections = data.sections || [];
    const side = sections.filter((s) => s.side);
    const main = sections.filter((s) => !s.side);
    return [
      packages(design, personal.name || ""),
      settings(design),
      "\\colorlet{sidebg}{primaryColor!8}\n",
      docStart(),
      header(personal, design),
      // real space before the columns: the tinted background expands a few
      // points past the column region and must not touch the contact line
      "\n    \\vspace{0.30 cm}\n",
      `
    \\columnratio{0.32}
    \\setlength{\\columnsep}{${num(0.35 * design.density)} cm}
    \\backgroundcolor{c[0](4pt,4pt)(4pt,4pt)}{sidebg}
    \\begin{paracol}{2}
`,
      sectionsBody(side, design, { narrow: true }),
      "\n    \\switchcolumn\n",
      sectionsBody(main, design, { tabularDates: true }),
      "\n    \\end{paracol}\n",
      "\n\\end{document}\n",
    ].join("");
  },
};
