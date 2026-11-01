/* The theme, font and font-size ids the app offers, read from its source.
 * Shared by make-prefetch (which compiles every combination) and smoke
 * (which checks the prefetch list still covers each one), so a theme or
 * font added later is one neither of them can overlook. */
import { readFileSync, globSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;

export function themeIds() {
  return globSync(join(SRC, "tex/themes/*.ts"))
    .map((f) => readFileSync(f, "utf8").match(/^\s*id: "([\w-]+)"/m)?.[1])
    .filter(Boolean)
    .sort();
}

export function fontIds() {
  const src = readFileSync(join(SRC, "tex/design.ts"), "utf8");
  const block = src.slice(src.indexOf("export const FONTS"), src.indexOf("];", src.indexOf("export const FONTS")));
  return [...block.matchAll(/\{\s*id: "([\w-]+)"/g)].map((m) => m[1]);
}

export function fontSizes() {
  const src = readFileSync(join(SRC, "tex/design.ts"), "utf8");
  return src.match(/FONT_SIZES\s*=\s*\[([^\]]+)\]/)[1].split(",").map(Number);
}
