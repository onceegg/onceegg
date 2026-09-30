import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The desktop CSS is the source of truth for the paper contours and shadows.
// Run this after changing either, or use --check to verify generated CSS.
const sourcePath = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const outputPath = fileURLToPath(new URL("../app/tape-shadows.css", import.meta.url));
const css = readFileSync(sourcePath, "utf8");
const rootFontSize = 16;
const padding = 24;

const declaration = css.match(/--onceegg-tape-shadow:\s*([\s\S]*?);/)?.[1];
if (!declaration) throw new Error("Missing desktop tape shadow");
const shadows = [...declaration.matchAll(
  /drop-shadow\(([\d.]+)rem\s+([\d.]+)rem\s+([\d.]+)rem\s+rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\)\)/g,
)].map((match) => ({
  x: Number(match[1]) * rootFontSize,
  y: Number(match[2]) * rootFontSize,
  blur: Number(match[3]) * rootFontSize,
  color: `rgb(${match[4]},${match[5]},${match[6]})`,
  opacity: Number(match[7]) / 100,
}));
if (shadows.length !== 2) throw new Error("Expected two desktop shadow layers");

const contours = [...css.matchAll(
  /(\.incubatorWord(?:\[data-word="[^"]+"\])?)\s*\{[^{}]*?--tape-clip:\s*polygon\(([^)]+)\)/g,
)].map((match) => ({
  selector: match[1],
  points: match[2].trim().split(",").map((point) => point.trim().split(/\s+/).map((value) => {
    if (value !== "0" && !value.endsWith("%")) {
      throw new Error(`Expected a proportional contour coordinate: ${value}`);
    }
    return Number.parseFloat(value) / 100;
  }).join(",")).join(" "),
}));
if (contours.length !== 5 || contours[0].selector !== ".incubatorWord") {
  throw new Error("Expected the shared contour and four word-specific contours");
}

function shadowImage(points) {
  const [near, far] = shadows;
  // Like the two chained CSS drop-shadows, the second shadow includes the first
  // shadow's alpha. Output shadows only: the existing HTML renders the paper.
  // As an SVG image background this is rasterized before the button moves;
  // no filter is attached to a moving DOM element (the WebKit trail trigger).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs>` +
    `<clipPath id="p" clipPathUnits="objectBoundingBox"><polygon points="${points}"/></clipPath>` +
    `<filter id="s" filterUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${near.blur}" result="a"/>` +
    `<feOffset in="a" dx="${near.x}" dy="${near.y}" result="b"/>` +
    `<feFlood flood-color="${near.color}" flood-opacity="${near.opacity}" result="c"/>` +
    `<feComposite in="c" in2="b" operator="in" result="s1"/>` +
    `<feMerge result="first"><feMergeNode in="s1"/><feMergeNode in="SourceAlpha"/></feMerge>` +
    `<feGaussianBlur in="first" stdDeviation="${far.blur}" result="d"/>` +
    `<feOffset in="d" dx="${far.x}" dy="${far.y}" result="e"/>` +
    `<feFlood flood-color="${far.color}" flood-opacity="${far.opacity}" result="f"/>` +
    `<feComposite in="f" in2="e" operator="in" result="s2"/>` +
    `<feMerge><feMergeNode in="s2"/><feMergeNode in="s1"/></feMerge>` +
    `</filter></defs><g filter="url(#s)"><rect x="${padding}" y="${padding}" ` +
    `width="calc(100% - ${padding * 2}px)" height="calc(100% - ${padding * 2}px)" clip-path="url(#p)"/></g></svg>`;
}

const output = [
  "/* Generated from globals.css by scripts/generate-tape-shadows.mjs. Do not hand-edit.",
  "   Inline images avoid extra requests and keep mobile's first paint independent of JS. */",
  "@media (hover: none), (pointer: coarse) {",
  ...contours.map(({ selector, points }) => {
    const uri = `data:image/svg+xml,${encodeURIComponent(shadowImage(points))}`;
    return `  ${selector} {\n    --tape-shadow-image: url("${uri}");\n  }`;
  }),
  "}",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== output) {
    throw new Error("Tape shadows are stale. Run node scripts/generate-tape-shadows.mjs");
  }
  console.log("Tape shadow contours and both layers match the desktop CSS.");
} else {
  writeFileSync(outputPath, output);
  console.log("Generated mobile tape shadows from the desktop CSS.");
}
