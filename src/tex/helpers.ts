/* Shared LaTeX text helpers used by every theme.
 *
 * Text fields support minimal inline markdown: **bold**, *italic*,
 * [label](url). Newlines become LaTeX line breaks. Everything else is
 * escaped, so any content is safe.
 */
import type { Contact } from "../types";

const SPECIALS: Record<string, string> = {
  "&": "\\&",
  "%": "\\%",
  "$": "\\$",
  "#": "\\#",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "\\": "\\textbackslash{}",
};
const SPECIALS_RE = /[&%$#_{}~^\\]/g;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/;
const EMPH_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/;

/* Characters no font sets, and each one stopped the compile: NUL, DEL, ESC
 * and the rest of C0 are invalid or unprintable to pdfTeX. Vertical tab and
 * form feed are line separators (VT is PowerPoint's soft return, and it comes
 * along on a paste), as are U+2028/2029, so those read as a space. So does a
 * newline: every field that means one per line is split before it gets here,
 * so a newline that reaches this is inside one line, where TeX would read a
 * blank line as \par, and \par inside \section or a package option ends the
 * compile. A single newline was already just a space to TeX. */
const SEPARATOR_RE = /[\n\r\v\f\u2028\u2029]+/g;
const CONTROL_RE = /[\x00-\x08\x0E-\x1F\x7F]/g;

export function esc(text: unknown): string {
  return String(text || "")
    .replace(CONTROL_RE, "")
    .replace(SEPARATOR_RE, " ")
    .replace(SPECIALS_RE, (m) => SPECIALS[m]);
}

/* Where a link actually goes. hyperref reads a target with no scheme as a
 * file beside the PDF: "linkedin.com/in/alex" became a link to the local file
 * linkedin.com/in/alex.pdf, which opens nothing, drawn in hyperref's
 * file-link cyan instead of the accent. The "Goes to" field takes whatever
 * is typed, so the scheme is supplied here — which also mends links already
 * saved without one. A "#anchor" is a link inside the document and stays. */
function linkTarget(url: string): string {
  const u = url.trim();
  /* no dots allowed in the scheme, so "example.com:8080/x" reads as a host */
  if (!u || u.startsWith("#") || /^[a-z][a-z0-9+-]*:/i.test(u)) return u;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return "mailto:" + u;
  if (/^\+?[\d\s()-]{7,}$/.test(u)) return "tel:" + u.replace(/[^\d+]/g, "");
  return "https://" + u.replace(/^\/+/, "");
}

/* A URL is NOT ordinary text: it goes in as the argument of \href, where
 * hyperref makes most characters literal but TeX has already tokenized the
 * line. A % swallows the rest of it and a # is a parameter character, so an
 * everyday percent-encoded link took the whole compile down. Backslashes and
 * braces are not legal in a URL at all, so they are dropped rather than
 * escaped into something that would resolve differently. Nor is a bare ^,
 * and it is the dangerous one: TeX reads "^^5c" as a backslash and "^^7d" as
 * a closing brace before \href ever sees them, so dropping the real ones was
 * not enough — an imported link could close the argument and run any pdfTeX
 * primitive. It is percent-encoded, which is what a browser sends anyway,
 * and the % that makes is escaped below like any other. Every link site
 * goes through here, so this is also where a missing scheme is supplied.
 * Control characters, newlines and tabs are dropped first, which is what a
 * browser's URL parser does with them too; a blank line here was a \par
 * inside \href's argument. */
export function escUrl(url: unknown): string {
  return linkTarget(String(url || "").replace(/[\x00-\x1F\x7F\u2028\u2029]/g, ""))
    .replace(/[\\{}]/g, "")
    .replace(/\^/g, "%5E")
    .replace(/[%#]/g, (m) => "\\" + m);
}

function emph(text: string): string {
  const out: string[] = [];
  for (const tok of text.split(EMPH_RE)) {
    if (tok.startsWith("**") && tok.endsWith("**")) {
      out.push(`\\textbf{${esc(tok.slice(2, -2))}}`);
    } else if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2) {
      out.push(`\\textit{${esc(tok.slice(1, -1))}}`);
    } else {
      out.push(esc(tok));
    }
  }
  return out.join("");
}

export function md(text: unknown): string {
  const parts = String(text || "").split(LINK_RE);
  const out: string[] = [];
  // parts alternate: text, label, url, text, label, url, ... text
  for (let i = 0; i < parts.length; i += 3) {
    out.push(emph(parts[i]));
    if (i + 2 < parts.length) {
      out.push(`\\href{${escUrl(parts[i + 2])}}{${emph(parts[i + 1])}}`);
    }
  }
  return out.join("");
}

export function mdBlock(text: unknown, indent = "            ", sep = "\\\\"): string {
  const lines = String(text || "")
    .split("\n")
    .filter((l) => l.trim())
    .map(md);
  return lines.join(sep + "\n" + indent);
}

export const SEP =
  "%\n        \\kern 5.0 pt%\n        \\AND%\n        \\kern 5.0 pt%\n        ";

/* The icon name is the one thing that goes into the page raw — it is the
 * argument of \faIcon — and an imported file can say anything there, not
 * just what the picker offers. Every FontAwesome name is lowercase letters,
 * digits and hyphens, so that is all that is let through; anything else is
 * not a name, and the contact prints without an icon rather than as TeX.
 * A well-formed name FontAwesome lacks still fails the compile, which
 * explainCompileFailure() names. */
const ICON_NAME_RE = /^[a-z0-9-]+$/;

export function contactItem(c: Contact): string {
  let inner = md(c.text);
  if (c.url) {
    inner = `\\hrefWithoutArrow{${escUrl(c.url)}}{${inner}}`;
  }
  if (c.icon && ICON_NAME_RE.test(c.icon)) {
    inner = `\\faIcon[solid]{${c.icon}} ${inner}`;
  }
  return `\\mbox{${inner}}`;
}

/* Format a length so LaTeX always gets a plain decimal (no exponents). */
export function num(x: number): string {
  return (Math.round(x * 100) / 100).toFixed(2);
}

/* Pull the interesting error lines out of a LaTeX log. */
/* What the page check beside the preview reports, read from the compile's
 * log: pdfTeX names the page count, and the preamble has TeX type out how
 * much of the last page is used (CVLIAN-ROOM, at \end{document}). */
export interface PageStats {
  pages: number;
  /* points of the last page taken, and available */
  used: number;
  goal: number;
  /* one line of body text, in points */
  line: number;
}

export function pageStats(logText: unknown): PageStats | null {
  const log = String(logText || "");
  const pages = /Output written on .*?\((\d+) pages?/.exec(log);
  const room = [...log.matchAll(/CVLIAN-ROOM (-?[\d.]+)pt (-?[\d.]+)pt ([\d.]+)pt/g)].pop();
  if (!pages || !room) return null;
  const goal = Number(room[2]);
  /* a document that ends exactly on a page break leaves an empty page under
   * construction, whose goal is TeX's \maxdimen: the last page is full */
  const full = goal > 16000;
  return {
    pages: Number(pages[1]),
    used: full ? 1 : Math.max(0, Number(room[1])),
    goal: full ? 1 : goal,
    line: Number(room[3]) || 12,
  };
}

export function extractErrors(logText: unknown): string {
  const lines = String(logText || "").split("\n");
  const errors: string[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("!")) {
      errors.push(...lines.slice(i, i + 3));
    }
  });
  return errors.length ? errors.join("\n") : String(logText || "").slice(-2000);
}
