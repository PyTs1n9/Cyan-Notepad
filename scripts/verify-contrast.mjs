/**
 * WCAG contrast audit for the colour blocks that carry text.
 *
 * The palette is parsed out of `src/index.css` instead of being copied here:
 * a hard-coded copy would pass while the sheet drifted away from it, which is
 * exactly the failure this script exists to catch.
 *
 * `/90` style Tailwind opacity utilities are modelled as alpha compositing over
 * the surface they are drawn on. That matters for the danger/90 hovers: a 90%
 * block over a light background is *lighter* than the solid block, so the solid
 * value passing does not mean the hover passes.
 *
 * Run: node scripts/verify-contrast.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src", "index.css"), "utf8");

/** Extracts `--name: #hex;` declarations from the body of one selector block. */
function readBlock(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out = {};
  for (const [, name, value] of body.matchAll(/--(color-[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[name] = value;
  }
  return out;
}

const base = readBlock("@theme {");
const themes = {
  blue: { ...base, ...readBlock(".theme-blue {") },
  dark: { ...base, ...readBlock(".theme-dark {") },
  yellow: { ...base, ...readBlock(".theme-yellow {") },
  green: { ...base, ...readBlock(".theme-green {") },
};

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance([r, g, b]) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg, bg) {
  const a = luminance(channels(fg));
  const b = luminance(channels(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Source-over compositing of `fg` at `alpha` onto opaque `bg`. */
function over(fg, alpha, bg) {
  const f = channels(fg);
  const b = channels(bg);
  return `#${f
    .map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}

const rows = [];
const fail = [];

for (const [theme, palette] of Object.entries(themes)) {
  // `warning` joined the audit when the yellow blocks stopped painting white
  // text: it is a light ground in all four themes, so its foreground has to be
  // measured like the other three. Only the solid block carries text - the
  // `/10` variants are hover washes with no glyphs on them.
  for (const kind of ["accent", "success", "danger", "warning"]) {
    const on = palette[`color-on-${kind}`];
    if (!on) {
      fail.push(`${theme}: missing --color-on-${kind}`);
      continue;
    }
    // Solid block, plus the translucent variants the app actually paints text
    // on. `/90` and `/80` are modelled as alpha compositing over the surface
    // the block sits on: a 90% danger block over a light background is
    // *lighter* than the solid one, so the solid value passing says nothing
    // about the hover. Accent and success are never used translucent under
    // text (their translucent uses are resize guides with no glyphs).
    const variants = [{ label: `bg-${kind}`, block: palette[`color-${kind}`], alpha: 1, gating: true }];
    if (kind === "danger") {
      variants.push({ label: "bg-danger/90", block: palette["color-danger"], alpha: 0.9, gating: true });
      // `disabled:bg-danger/80` is the only 80% site. WCAG 1.4.3 exempts
      // inactive controls, so it is reported but does not gate the batch.
      variants.push({ label: "bg-danger/80 (disabled)", block: palette["color-danger"], alpha: 0.8, gating: false });
    }
    if (kind === "accent") {
      variants.push({ label: "bg-accent-hover", block: palette["color-accent-hover"], alpha: 1 });
    }

    for (const variant of variants) {
      for (const ground of ["color-bg-primary", "color-bg-secondary"]) {
        const block =
          variant.alpha === 1 ? variant.block : over(variant.block, variant.alpha, palette[ground]);
        const ratio = contrast(on, block);
        const entry = {
          theme,
          block: `${variant.label} over ${ground.replace("color-", "")}`,
          hex: block,
          on,
          ratio,
        };
        rows.push(entry);
        if (ratio < 4.5 && variant.gating) fail.push(entry);
      }
    }
  }
}

const pad = (v, n) => String(v).padEnd(n);
console.log(`${pad("theme", 8)}${pad("block", 40)}${pad("bg", 10)}${pad("on", 10)}${pad("ratio", 8)}verdict`);
for (const r of rows) {
  console.log(
    `${pad(r.theme, 8)}${pad(r.block, 40)}${pad(r.hex, 10)}${pad(r.on, 10)}${pad(r.ratio.toFixed(2), 8)}${
      r.ratio >= 4.5 ? "pass" : "exempt"
    }`,
  );
}

console.log(`\n${rows.length} combinations, ${fail.length} below 4.5:1`);
if (fail.length) process.exit(1);
