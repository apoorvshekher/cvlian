/* Shared LaTeX building blocks used by every theme: the package block,
 * global settings + environments, the header, and per-entry-kind
 * renderers. Themes compose these and add their own layout around them. */
import type { DateVal, DesignSettings, Entry, Personal, ResumeSection } from "../types";
import { fontSetup, hexToRgb } from "./design";
import { SEP, contactItem, esc, escUrl, md, mdBlock, num } from "./helpers";

export function packages(d: DesignSettings, name: string, opts: { topMargin?: number } = {}): string {
  const n = esc(name);
  return `\\documentclass[${d.fontSize}pt, ${d.paper === "a4" ? "a4paper" : "letterpaper"}]{article}

% Packages:
\\usepackage[
    ignoreheadfoot, % set margins without considering header and footer
    top=${num(opts.topMargin ?? d.margins)} cm,
    bottom=${num(d.margins)} cm,
    left=${num(d.margins)} cm,
    right=${num(d.margins)} cm,
    footskip=1.0 cm,
]{geometry} % for adjusting page geometry
\\usepackage{titlesec} % for customizing section titles
\\usepackage{tabularx} % for making tables with fixed width columns
\\usepackage{array} % tabularx requires this
\\usepackage[dvipsnames]{xcolor} % for coloring text
\\definecolor{primaryColor}{RGB}{${hexToRgb(d.accent)}} % define primary color
\\usepackage{enumitem} % for customizing lists
\\usepackage{fontawesome5} % for using icons
\\usepackage{amsmath} % for math
\\usepackage[
    pdftitle={${n}'s CV},
    pdfauthor={${n}},
    colorlinks=true,
    urlcolor=primaryColor
]{hyperref} % for links, metadata and bookmarks
\\usepackage[pscoord]{eso-pic} % for floating text on the page
\\usepackage{calc} % for calculating lengths
\\usepackage{bookmark} % for bookmarks
\\usepackage{lastpage} % for getting the total number of pages
\\usepackage{changepage} % for one column entries (adjustwidth environment)
\\usepackage{paracol} % for two and three column entries
\\usepackage{ifthen} % for conditional statements
\\usepackage{needspace} % for avoiding page brake right after the section title
\\usepackage{iftex} % check if engine is pdflatex, xetex or luatex

% Ensure that generate pdf is machine readable/ATS parsable:
\\ifPDFTeX
    \\input{glyphtounicode}
    \\pdfgentounicode=1
    \\usepackage[T1]{fontenc}
    \\usepackage[utf8]{inputenc}
    \\usepackage{lmodern}
\\fi

${fontSetup(d)}
`;
}

export function settings(d: DesignSettings): string {
  const dens = d.density;
  return `
% Some settings:
\\raggedright
\\AtBeginEnvironment{adjustwidth}{\\partopsep0pt} % remove space before adjustwidth environment
\\pagestyle{empty} % no header or footer
\\setcounter{secnumdepth}{0} % no section numbering
\\setlength{\\parindent}{0pt} % no indentation
\\setlength{\\topskip}{0pt} % no top skip
\\setlength{\\columnsep}{0.15cm} % set column seperation
\\pagenumbering{gobble} % no page numbering

\\titleformat{\\section}{\\needspace{4\\baselineskip}\\bfseries\\large\\color{primaryColor}}{}{0pt}{}[\\vspace{1pt}{\\color{primaryColor}\\titlerule}]

\\titlespacing{\\section}{-1pt}{${num(0.3 * dens)} cm}{${num(0.2 * dens)} cm}

\\renewcommand\\labelitemi{$\\vcenter{\\hbox{\\small$\\bullet$}}$} % custom bullet points
\\newenvironment{highlights}{
    \\begin{itemize}[
        topsep=${num(0.1 * dens)} cm,
        parsep=${num(0.1 * dens)} cm,
        partopsep=0pt,
        itemsep=0pt,
        leftmargin=0 cm + 10pt
    ]
}{
    \\end{itemize}
} % new environment for highlights

\\newenvironment{onecolentry}{
    \\begin{adjustwidth}{
        0 cm + 0.00001 cm
    }{
        0 cm + 0.00001 cm
    }
}{
    \\end{adjustwidth}
} % new environment for one column entries

\\newenvironment{twocolentry}[2][]{
    \\onecolentry
    \\def\\secondColumn{#2}
    \\setcolumnwidth{\\fill, ${num(d.dateColWidth)} cm}
    \\begin{paracol}{2}
}{
    \\switchcolumn \\raggedleft \\secondColumn
    \\end{paracol}
    \\endonecolentry
} % new environment for two column entries

% paracol hands its columns back through the output routine and leaves a
% place to break behind it that no penalty reaches, so an entry with a
% two-column head could still lose its bullets to the next page. The room
% the whole entry needs is claimed before it starts instead: glue that nets
% to nothing and vanishes at a page break, with a breakpoint TeX only takes
% when the entry would not fit -- and then it moves all of it.
\\newsavebox{\\entryroomleft}
\\newsavebox{\\entryroomright}
\\newsavebox{\\entryroomrest}
\\newlength{\\entryroomneed}
\\newcommand{\\entryroom}[3]{%
    \\setbox\\entryroomleft\\vbox{\\everypar{}\\hsize\\dimexpr\\linewidth-${num(d.dateColWidth)} cm-\\columnsep\\relax #1\\par}%
    \\setbox\\entryroomright\\vbox{\\everypar{}\\hsize ${num(d.dateColWidth)} cm\\raggedleft #2\\par}%
    \\setbox\\entryroomrest\\vbox{\\everypar{}\\hsize\\linewidth #3\\par}%
    \\setlength{\\entryroomneed}{\\dimexpr\\ht\\entryroomleft+\\dp\\entryroomleft\\relax}%
    \\ifdim\\dimexpr\\ht\\entryroomright+\\dp\\entryroomright\\relax>\\entryroomneed
        \\setlength{\\entryroomneed}{\\dimexpr\\ht\\entryroomright+\\dp\\entryroomright\\relax}%
    \\fi
    \\addtolength{\\entryroomneed}{\\dimexpr\\ht\\entryroomrest+\\dp\\entryroomrest+\\topsep+.25\\baselineskip\\relax}%
    \\vskip\\entryroomneed\\penalty9999\\vskip-\\entryroomneed\\vskip0pt\\relax
}

\\newenvironment{header}{
    \\setlength{\\topsep}{0pt}\\par\\kern\\topsep\\centering\\linespread{1.5}
}{
    \\par\\kern\\topsep
} % new environment for the header

% how much of the last page is used, for the page check beside the preview:
% the penalty makes TeX move what it has onto the page before it is measured
\\AtEndDocument{\\par\\penalty10000\\typeout{CVLIAN-ROOM \\the\\pagetotal\\space\\the\\pagegoal\\space\\the\\baselineskip}}

% save the original href command in a new command:
\\let\\hrefWithoutArrow\\href
`;
}

export function docStart(): string {
  return `
\\begin{document}
    \\newcommand{\\AND}{\\unskip
        \\cleaders\\copy\\ANDbox\\hskip\\wd\\ANDbox
        \\ignorespaces
    }
    \\newsavebox\\ANDbox
    \\sbox\\ANDbox{$|$}
`;
}

export function header(p: Personal, d: DesignSettings, opts: { boldName?: boolean } = {}): string {
  const items = (p.contacts || []).filter((c) => c.text).map(contactItem);
  const contact = items.length ? items.join(SEP) + "%" : "%";
  const name = opts.boldName ? `\\textbf{${md(p.name)}}` : md(p.name);
  return `
    \\begin{header}
        \\fontsize{${num(d.nameSize)} pt}{${num(d.nameSize)} pt}\\selectfont ${name}

        \\vspace{0 pt}

        \\normalsize
        ${contact}
    \\end{header}
`;
}

/* ---------- entries ---------- */

export interface EntryOpts {
  /* Sidebar column: stack the date under the content instead of beside it. */
  narrow?: boolean;
  /* Inside a paracol column (which can't nest): dates via tabularx. */
  tabularDates?: boolean;
}

/* One entry reduced to the three things every theme lays out: the lines of
 * the main block, the date/right-hand text, and the bullet list — each
 * already LaTeX, escaped field by field. */
interface Pieces {
  leftLines: string[];
  right: string;
  bullets: string[];
}

function fmtDate(d: DateVal | undefined): string {
  if (!d) return "";
  return [d.month, d.year].filter((x) => x && x.trim()).join(" ").trim();
}

/* "Sept 2018 -- May 2022", "June 2022 -- Present", or a single date. */
function dateRange(start: DateVal, end: DateVal, current: boolean): string {
  const a = fmtDate(start);
  const b = current ? "Present" : fmtDate(end);
  if (a && b) return `${md(a)} -- ${md(b)}`;
  return md(a || b);
}

/* Join a value onto a line with an em dash when both sides exist. */
function dash(a: string, b: string): string {
  if (a && b) return `${a} --- ${b}`;
  return a || b;
}

/* A line break inside an entry. The page is set ragged-right, and there
 * LaTeX's \\ does not break the line, it ends the paragraph — and a page
 * may break between paragraphs whatever \samepage says, which is how a
 * project's title stayed on one page and its description went to the next.
 * The starred form forbids that break. */
const BR = "\\\\*";

function textLines(text: string): string[] {
  return String(text || "")
    .split("\n")
    .filter((l) => l.trim())
    .map(md);
}

function bulletTex(bullets: { text: string }[] | undefined): string[] {
  return (bullets || []).map((b) => b.text).filter((t) => t.trim()).map(md);
}

function pieces(e: Entry): Pieces {
  switch (e.kind) {
    case "experience": {
      const first = e.role ? `\\textbf{${md(e.role)}}` : "";
      const org = dash(md(e.company), md(e.location));
      const second = org ? `\\textit{${org}}` : "";
      return {
        leftLines: [first, second].filter(Boolean),
        right: dateRange(e.start, e.end, e.current),
        bullets: bulletTex(e.bullets),
      };
    }
    case "education": {
      const first = dash(e.school ? `\\textbf{${md(e.school)}}` : "", md(e.location));
      const study = e.degree && e.field ? `${md(e.degree)} in ${md(e.field)}` : md(e.degree || e.field);
      const detail = [study, e.gpa ? `GPA ${md(e.gpa)}` : ""].filter(Boolean).join(" $\\cdot$ ");
      const second = detail ? `\\textit{${detail}}` : "";
      return {
        leftLines: [first, second].filter(Boolean),
        right: dateRange(e.start, e.end, e.current),
        bullets: bulletTex(e.bullets),
      };
    }
    case "project": {
      const label = e.name ? `\\textbf{${md(e.name)}}` : "";
      const linked = e.link && label ? `\\href{${escUrl(e.link)}}{${label}}` : label;
      const desc = e.description ? `\\textit{${md(e.description)}}` : "";
      return {
        leftLines: [linked, desc].filter(Boolean),
        right: dateRange(e.start, e.end, e.current),
        bullets: bulletTex(e.bullets),
      };
    }
    case "certification": {
      const label = e.name ? `\\textbf{${md(e.name)}}` : "";
      const linked = e.link && label ? `\\href{${escUrl(e.link)}}{${label}}` : label;
      const issuer = e.issuer ? `\\textit{${md(e.issuer)}}` : "";
      /* one line, the way certifications are listed: what it is, who issued it */
      const line = [linked, issuer].filter(Boolean).join(", ");
      return {
        leftLines: line ? [line] : [],
        right: md(fmtDate(e.date)),
        bullets: bulletTex(e.bullets),
      };
    }
    case "publication": {
      const label = e.title ? `\\textbf{${md(e.title)}}` : "";
      const linked = e.link && label ? `\\href{${escUrl(e.link)}}{${label}}` : label;
      const venue = e.venue ? `\\textit{${md(e.venue)}}` : "";
      /* who wrote it, then where it appeared: "A. Doe, B. Roe --- NeurIPS 2024" */
      return {
        leftLines: [linked, dash(md(e.authors), venue)].filter(Boolean),
        right: md(fmtDate(e.date)),
        bullets: bulletTex(e.bullets),
      };
    }
    case "item": {
      const label = e.title ? `\\textbf{${md(e.title)}}` : "";
      const linked = e.link && label ? `\\href{${escUrl(e.link)}}{${label}}` : label;
      const sub = e.subtitle ? `\\textit{${md(e.subtitle)}}` : "";
      return {
        leftLines: [linked, sub].filter(Boolean),
        right: dateRange(e.start, e.end, e.current),
        bullets: bulletTex(e.bullets),
      };
    }
    case "paragraph":
      return { leftLines: textLines(e.text), right: "", bullets: [] };
    case "tags": {
      /* one line per group, the way skills are listed: "Languages: Python,
       * SQL". Shaded chips spent two lines a group and read as interface,
       * not print; a run-in list costs a line and parses as plain text. */
      const tags = (e.tags || []).filter((t) => t.trim());
      if (!tags.length) return { leftLines: [], right: "", bullets: [] };
      const list = tags.map(md).join(", ");
      const group = tagGroup(e.group);
      return { leftLines: [group ? `\\textbf{${md(group)}:} ${list}` : list], right: "", bullets: [] };
    }
    case "levels": {
      const items = (e.items || []).filter((it) => it.name.trim());
      if (!items.length) return { leftLines: [], right: "", bullets: [] };
      const rows = items
        .map((it) => `                ${md(it.name)} & ${levelDots(it.level)} \\\\`)
        .join("\n");
      return {
        leftLines: [`\\begin{tabularx}{\\linewidth}{@{}X r@{}}\n${rows}\n            \\end{tabularx}`],
        right: "",
        bullets: [],
      };
    }
    default:
      return {
        leftLines: textLines(e.left),
        right: mdBlock(e.right, "            ", BR),
        bullets: bulletTex(e.bullets),
      };
  }
}

/* The label prints with its own colon, so one typed into it must not double. */
export function tagGroup(group: string): string {
  return String(group || "").trim().replace(/\s*:$/, "");
}

function levelDots(level: number): string {
  const dots: string[] = [];
  for (let i = 1; i <= 5; i++) {
    dots.push(i <= level ? "\\textcolor{primaryColor}{$\\bullet$}" : "\\textcolor{gray}{$\\circ$}");
  }
  return dots.join("\\kern 2.5pt ");
}

export function entry(e: Entry, d: DesignSettings, opts: EntryOpts = {}): string {
  const { leftLines, right, bullets } = pieces(e);
  const parts: string[] = [];
  const items = bullets.map((b) => `                \\item ${b}`).join("\n");
  const list = bullets.length
    ? `        \\begin{onecolentry}
            \\begin{highlights}
${items}
            \\end{highlights}
        \\end{onecolentry}`
    : "";
  const gap = `\n\n        \\vspace{${num(0.1 * d.density)} cm}\n`;

  if (right && opts.narrow) {
    // no room for a date column: stack the date under the main block
    const stacked = [...leftLines, `{\\small ${right}}`].join(`${BR}\n            `);
    parts.push(`        \\begin{onecolentry}
            ${stacked}
        \\end{onecolentry}`);
  } else if (right && opts.tabularDates) {
    // twocolentry is paracol-based and paracol cannot nest
    parts.push(`        \\begin{onecolentry}
            \\begin{tabularx}{\\linewidth}{@{}X r@{}}
                {${leftLines.join("\\newline ")}} & {${right}} \\\\
            \\end{tabularx}
        \\end{onecolentry}`);
  } else if (right) {
    /* the whole entry's room first: see \entryroom in the preamble */
    const head = leftLines.join(`${BR}\n            `);
    parts.push(`        \\entryroom{${head}}{${right}}{${list ? gap + list : ""}}
        \\begin{twocolentry}{
            ${right}
        }
            ${head}\\end{twocolentry}`);
  } else if (leftLines.length) {
    parts.push(`        \\begin{onecolentry}
            ${leftLines.join(`${BR}\n            `)}
        \\end{onecolentry}`);
  }

  if (list) parts.push(`${parts.length ? gap : ""}${list}`);

  if (!parts.length) return "";
  /* An entry is all on one page or all on the next: inside it every break
   * is forbidden — between its lines, between the head and its bullets,
   * between bullets — and the break it took away from its end (LaTeX's
   * -\@lowpenalty after a list) is put back after it, so pages still break
   * between entries exactly where they used to. */
  return `        \\begingroup\\samepage
${parts.join("\n")}
        \\par\\endgroup\\penalty -51`;
}

export function section(s: ResumeSection, d: DesignSettings, opts: EntryOpts = {}): string {
  const entries = (s.entries || []).map((e) => entry(e, d, opts)).filter((e) => e.trim());
  const body = entries.join(`\n\n        \\vspace{${num(0.2 * d.density)} cm}\n\n`);
  return `
    \\section{${md(s.title)}}

${body}
`;
}

export function sectionsBody(sections: ResumeSection[], d: DesignSettings, opts: EntryOpts = {}): string {
  return (sections || [])
    .filter((s) => s.title || (s.entries || []).length)
    .map((s) => section(s, d, opts))
    .join("");
}
