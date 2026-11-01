import { useState } from "react";
import { DESIGN_DEFAULTS, FONTS, FONT_SIZES, THEMES } from "../tex";
import type { DesignSettings, EditData } from "../types";
import { CheckIcon, ChevronDownIcon } from "./icons";

const SWATCHES = ["#0b0b0a", "#d8341f", "#1f5fd8", "#1a7f5a", "#8f2d56", "#b45309"];

/* The browser has none of the TeX faces, so a specimen here would be a
 * polite lie — Charter and Latin Modern would both come out as Georgia.
 * What each one is actually like, in words, and the preview does the rest. */
const FONT_NOTES: Record<string, string> = {
  charter: "Sturdy and a little narrow. Holds up at small sizes.",
  lmodern: "The classic TeX look — fine strokes, generous spacing.",
  palatino: "Calligraphic and open. Takes up more room.",
  times: "The one everyone knows. Compact and conservative.",
};

/* Little pictures of the three layouts, built from the same rules the
 * themes use: where the name sits, whether there is a column or a band. */
function ThemeThumb({ id }: { id: string }) {
  if (id === "sidebar") {
    return (
      <div className="tt-cols">
        <div className="tt-side">
          <i className="tl dark" /><i className="tl" /><i className="tl" />
          <i className="tl dark sp" /><i className="tl" />
        </div>
        <div className="tt-main">
          <i className="tl dark w50" /><i className="tl" /><i className="tl" /><i className="tl w70" />
          <i className="tl dark w40 sp" /><i className="tl" /><i className="tl w70" />
        </div>
      </div>
    );
  }
  if (id === "banner") {
    return (
      <div className="tt-stack">
        <i className="tt-banner" />
        <i className="tl dark w40" /><i className="tl" /><i className="tl" />
        <i className="tl dark w40 sp" /><i className="tl" /><i className="tl w70" />
      </div>
    );
  }
  return (
    <div className="tt-stack">
      <div className="tt-mid">
        <i className="tl dark w50" />
        <i className="tl w70 thin" />
      </div>
      <i className="tl dark w40 sp" /><i className="tl" /><i className="tl" />
      <i className="tl dark w40 sp" /><i className="tl" /><i className="tl w70" />
    </div>
  );
}

function Seg<T extends string | number>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" data-seg={name}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          data-v={String(o.v)}
          className={o.v === value ? "active" : ""}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label, name, value, min, max, step, display, onChange,
}: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fcell">
      <label>
        {label} <span className="range-val">{display}</span>
      </label>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function DesignCard({
  design,
  editData,
}: {
  design: DesignSettings;
  editData: EditData;
}) {
  const [tuning, setTuning] = useState(false);
  const set = <K extends keyof DesignSettings>(key: K, value: DesignSettings[K]) =>
    editData((d) => { d.design[key] = value; });

  return (
    <div className="pane design-grid">
      <div className="pane-body">
        <p className="pane-lede">
          Everything here changes the page, never a word of what you wrote.
        </p>

        <div className="blabel"><span>Layout</span></div>
        <div className="thumbs">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={"thumb" + (t.id === design.themeId ? " sel" : "")}
              onClick={() => set("themeId", t.id)}
            >
              <span className="tframe"><ThemeThumb id={t.id} /></span>
              <span className="tname">
                {t.id === design.themeId && <CheckIcon />}
                {t.name}
              </span>
            </button>
          ))}
        </div>

        <div className="blabel">
          <span>Typeface</span>
          <span className="hint">the preview shows the real thing</span>
        </div>
        <div className="specs">
          {FONTS.map((f) => (
            <button
              key={f.id}
              className={"spec" + (f.id === design.font ? " sel" : "")}
              onClick={() => set("font", f.id)}
            >
              <span className="sp-name">
                {f.id === design.font && <CheckIcon />}
                {f.label}
              </span>
              <span className="sp-note">{FONT_NOTES[f.id] ?? ""}</span>
            </button>
          ))}
        </div>

        <div className="blabel">
          <span>Accent</span>
          <span className="hint">rules, links and section headings</span>
        </div>
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={"swatch" + (design.accent === c ? " active" : "")}
              style={{ background: c }}
              title={c}
              onClick={() => set("accent", c)}
            />
          ))}
          <input
            type="color"
            value={design.accent}
            onChange={(e) => set("accent", e.target.value)}
            title="Any other colour"
          />
        </div>

        <div className="frow">
          <div className="fcell">
            <label>Text size</label>
            <Seg
              name="fontSize"
              options={FONT_SIZES.map((s) => ({ v: s, label: `${s} pt` }))}
              value={design.fontSize}
              onChange={(v) => set("fontSize", v)}
            />
          </div>
          <div className="fcell">
            <label>Paper</label>
            <Seg
              name="paper"
              options={[
                { v: "letter" as const, label: "Letter" },
                { v: "a4" as const, label: "A4" },
              ]}
              value={design.paper}
              onChange={(v) => set("paper", v)}
            />
          </div>
        </div>

        <button className={"fold" + (tuning ? " open" : "")} onClick={() => setTuning(!tuning)}>
          <ChevronDownIcon />
          <span className="fold-text">
            <span className="ft">Fine-tune</span>
            <span className="fs">Margins, line spacing, name size, width of the date column</span>
          </span>
        </button>

        {tuning && (
          <>
            <div className="frow">
              <Slider
                label="Margins" name="margins" value={design.margins}
                min={1} max={3} step={0.1}
                display={`${design.margins.toFixed(1)} cm`}
                onChange={(v) => set("margins", v)}
              />
              <Slider
                label="Spacing" name="density" value={design.density}
                min={0.75} max={1.5} step={0.05}
                display={`×${design.density.toFixed(2)}`}
                onChange={(v) => set("density", v)}
              />
            </div>
            <div className="frow">
              <Slider
                label="Name size" name="nameSize" value={design.nameSize}
                min={18} max={32} step={1}
                display={`${design.nameSize} pt`}
                onChange={(v) => set("nameSize", v)}
              />
              <Slider
                label="Date column" name="dateColWidth" value={design.dateColWidth}
                min={3} max={6} step={0.1}
                display={`${design.dateColWidth.toFixed(1)} cm`}
                onChange={(v) => set("dateColWidth", v)}
              />
            </div>
          </>
        )}

        <button
          className="quietlink"
          onClick={() =>
            editData((d) => {
              const theme = THEMES.find((t) => t.id === d.design.themeId);
              Object.assign(d.design, DESIGN_DEFAULTS, theme?.defaults, { themeId: d.design.themeId });
            })
          }
        >
          Put this layout back the way it came
        </button>
      </div>
    </div>
  );
}
