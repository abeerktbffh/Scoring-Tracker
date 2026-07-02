// Generates the Bragboard PWA icon set from the brand "4-tile" mark:
// a 2x2 grid of rounded puzzle tiles (amber solved / cream partial) on a
// pine background — echoing the app's daily-puzzle Tile component.
//
// Pure pixel-fill rendering via pngjs (no native deps, no canvas).
// Run with: node scripts/gen-icons.mjs
import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const PINE = hex("#10756a");
const AMBER = hex("#e0952f");
const CREAM = hex("#fffdf7");

function hex(h) {
  const n = h.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function setPixel(png, x, y, { r, g, b }, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(png, x0, y0, w, h, color, opts = {}) {
  const { radius = 0 } = opts;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (radius > 0 && isOutsideRoundedRect(x - x0, y - y0, w, h, radius)) continue;
      setPixel(png, x, y, color);
    }
  }
}

// Returns true if point (px,py) falls outside a rounded-rect of size w x h
// with corner radius r (used to carve rounded corners out of a filled rect).
function isOutsideRoundedRect(px, py, w, h, r) {
  const cx = px < r ? r : px > w - r - 1 ? w - r - 1 : px;
  const cy = py < r ? r : py > h - r - 1 ? h - r - 1 : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy > r * r;
}

function fillBackground(png, color) {
  fillRect(png, 0, 0, png.width, png.height, color);
}

// Draws the 4-tile mark: a 2x2 grid of rounded tiles, three "solved" (amber)
// and one "partial" (cream), matching the app's Tile states, centered in a
// pine square. `padPct` controls the safe-zone margin (bigger for maskable).
function drawMark(size, { padPct = 0.18 } = {}) {
  const png = new PNG({ width: size, height: size });
  fillBackground(png, PINE);

  const pad = Math.round(size * padPct);
  const gap = Math.max(1, Math.round(size * 0.045));
  const gridSize = size - pad * 2;
  const tile = Math.round((gridSize - gap) / 2);
  const radius = Math.max(1, Math.round(tile * 0.22));

  const positions = [
    { x: pad, y: pad, color: AMBER },
    { x: pad + tile + gap, y: pad, color: AMBER },
    { x: pad, y: pad + tile + gap, color: CREAM },
    { x: pad + tile + gap, y: pad + tile + gap, color: AMBER },
  ];

  for (const { x, y, color } of positions) {
    fillRect(png, x, y, tile, tile, color, { radius });
  }

  return png;
}

function writePng(png, filename) {
  const buf = PNG.sync.write(png);
  const outPath = path.join(outDir, filename);
  writeFileSync(outPath, buf);
  console.log(`wrote ${filename} (${buf.byteLength} bytes)`);
}

// Standard icons: default padding.
writePng(drawMark(192), "icon-192.png");
writePng(drawMark(512), "icon-512.png");

// Maskable icon: content must stay inside the ~40% safe-zone circle, so use
// a larger padding percentage to keep the mark clear of platform masking.
writePng(drawMark(512, { padPct: 0.28 }), "icon-maskable-512.png");

// Apple touch icon: iOS applies its own corner rounding, so keep padding
// modest and avoid transparency (Apple ignores alpha and shows it as black).
writePng(drawMark(180, { padPct: 0.16 }), "apple-touch-icon.png");
