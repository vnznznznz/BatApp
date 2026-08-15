/**
 * Generates Night Courier's app artwork.
 *
 * Everything here is drawn from vector data defined in this file and rasterised
 * with a small scanline renderer, so the artwork is original to this project and
 * reproducible from source. No binary assets are hand-edited, and no image
 * library is required.
 *
 * Run with: npm run generate:assets
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/images');

/* -------------------------------------------------------------------------- */
/* Palette                                                                     */
/* -------------------------------------------------------------------------- */

/** Kept in sync by hand with `src/constants/theme.ts`. */
const NIGHT_TOP = [0x16, 0x1d, 0x33];
const NIGHT_BOTTOM = [0x07, 0x0a, 0x14];
const MOONLIGHT = [0xe9, 0xef, 0xfa];
const MOON = [0xf3, 0xea, 0xd2];
const WHITE = [0xff, 0xff, 0xff];

/* -------------------------------------------------------------------------- */
/* Vector artwork                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Right half of the bat silhouette, walking from the crown of the head, out
 * along the leading edge of the wing to the tip, then back along the scalloped
 * trailing edge to the base of the body.
 *
 * Coordinates are in a unit space where the full wingspan is x in [-1, 1] and
 * +y points down. The left half is mirrored from these points at render time.
 */
const BAT_HALF = [
  [0.0, -0.32], // crown of the head
  [0.05, -0.36], // inner base of the ear
  [0.085, -0.5], // ear tip
  [0.135, -0.34], // outer base of the ear
  [0.19, -0.28], // shoulder
  [0.36, -0.37], // leading edge of the wing
  [0.58, -0.44],
  [0.8, -0.49],
  [0.97, -0.5], // wing tip
  [0.9, -0.16], // outermost finger, trailing edge heading back in
  [0.78, -0.3], // notch
  [0.7, -0.02], // finger
  [0.56, -0.16], // notch
  [0.48, 0.12], // finger
  [0.34, -0.02], // notch
  [0.26, 0.2], // finger
  [0.15, 0.06], // notch, where the membrane meets the body
  [0.11, 0.22], // flank
  [0.055, 0.34],
  [0.0, 0.4], // base of the body
];

/** Closes the half-outline into a full symmetric silhouette. */
function batOutline() {
  const mirrored = BAT_HALF.slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y]);
  return [...BAT_HALF, ...mirrored];
}

function circle(cx, cy, r, segments = 160) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

/* -------------------------------------------------------------------------- */
/* Canvas                                                                      */
/* -------------------------------------------------------------------------- */

/** A non-premultiplied RGBA float canvas. */
function createCanvas(width, height) {
  return { width, height, data: new Float64Array(width * height * 4) };
}

function fillVerticalGradient(canvas, top, bottom) {
  const { width, height, data } = canvas;
  for (let y = 0; y < height; y++) {
    const t = height === 1 ? 0 : y / (height - 1);
    const r = top[0] + (bottom[0] - top[0]) * t;
    const g = top[1] + (bottom[1] - top[1]) * t;
    const b = top[2] + (bottom[2] - top[2]) * t;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

/**
 * Rasterises a polygon into a coverage mask using the non-zero winding rule,
 * with analytic horizontal coverage and `samples`x vertical supersampling.
 */
function rasterise(points, width, height, samples = 5) {
  const coverage = new Float64Array(width * height);
  const weight = 1 / samples;

  const addSpan = (row, xa, xb) => {
    if (xb <= xa) return;
    const a = Math.max(0, xa);
    const b = Math.min(width, xb);
    if (b <= a) return;

    const base = row * width;
    const first = Math.floor(a);
    const last = Math.min(Math.floor(b), width - 1);

    if (first === last) {
      coverage[base + first] += (b - a) * weight;
      return;
    }
    coverage[base + first] += (first + 1 - a) * weight;
    for (let i = first + 1; i < last; i++) coverage[base + i] += weight;
    coverage[base + last] += (b - last) * weight;
  };

  const crossings = [];
  for (let sy = 0; sy < height * samples; sy++) {
    const y = (sy + 0.5) / samples;
    const row = Math.min(Math.floor(y), height - 1);

    crossings.length = 0;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if (y0 === y1) continue;
      // Half-open interval on y keeps shared vertices from double-counting.
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        crossings.push({
          x: x0 + ((y - y0) / (y1 - y0)) * (x1 - x0),
          dir: y1 > y0 ? 1 : -1,
        });
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a.x - b.x);

    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i].dir;
      if (winding !== 0) addSpan(row, crossings[i].x, crossings[i + 1].x);
    }
  }

  for (let i = 0; i < coverage.length; i++) {
    if (coverage[i] > 1) coverage[i] = 1;
  }
  return coverage;
}

/** Composites a solid colour through a coverage mask, source-over. */
function compositePolygon(canvas, points, color, opacity = 1) {
  const { width, height, data } = canvas;
  const coverage = rasterise(points, width, height);

  for (let p = 0; p < coverage.length; p++) {
    const a = coverage[p] * opacity;
    if (a <= 0) continue;

    const i = p * 4;
    const dstA = data[i + 3] / 255;
    const outA = a + dstA * (1 - a);
    if (outA <= 0) continue;

    for (let c = 0; c < 3; c++) {
      data[i + c] = (color[c] * a + data[i + c] * dstA * (1 - a)) / outA;
    }
    data[i + 3] = outA * 255;
  }
}

/** Maps unit-space artwork onto the canvas: `span` is the wingspan in pixels. */
function place(points, cx, cy, span) {
  const s = span / 2;
  return points.map(([x, y]) => [cx + x * s, cy + y * s]);
}

/* -------------------------------------------------------------------------- */
/* PNG encoding                                                                */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(canvas) {
  const { width, height, data } = canvas;

  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        raw[o++] = Math.max(0, Math.min(255, Math.round(data[i + c])));
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, canvas) {
  const file = resolve(OUT, name);
  writeFileSync(file, encodePng(canvas));
  console.log(`  ${name}  ${canvas.width}x${canvas.height}`);
}

/* -------------------------------------------------------------------------- */
/* Compositions                                                                */
/* -------------------------------------------------------------------------- */

const bat = batOutline();

/** The full mark: a bat crossing a night sky, moon low behind its right wing. */
function markCanvas(size, { background = true } = {}) {
  const canvas = createCanvas(size, size);
  if (background) fillVerticalGradient(canvas, NIGHT_TOP, NIGHT_BOTTOM);

  compositePolygon(canvas, circle(size * 0.72, size * 0.25, size * 0.12), MOON, 0.92);
  compositePolygon(canvas, place(bat, size * 0.5, size * 0.6, size * 0.78), MOONLIGHT);
  return canvas;
}

/** Bat only, sized for Android's adaptive-icon safe zone (inner ~66%). */
function batOnlyCanvas(size, color, span = 0.52) {
  const canvas = createCanvas(size, size);
  compositePolygon(canvas, place(bat, size * 0.5, size * 0.5, size * span), color);
  return canvas;
}

function backgroundCanvas(size) {
  const canvas = createCanvas(size, size);
  fillVerticalGradient(canvas, NIGHT_TOP, NIGHT_BOTTOM);
  return canvas;
}

mkdirSync(OUT, { recursive: true });
console.log('Generating Night Courier artwork:');

write('icon.png', markCanvas(1024));
write('favicon.png', markCanvas(96));
write('splash-icon.png', batOnlyCanvas(512, MOONLIGHT, 0.86));
write('android-icon-background.png', backgroundCanvas(1024));
write('android-icon-foreground.png', batOnlyCanvas(1024, MOONLIGHT));
write('android-icon-monochrome.png', batOnlyCanvas(1024, WHITE));

console.log('Done.');
