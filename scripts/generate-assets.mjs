/**
 * Generates Night Courier's app artwork.
 *
 * The bat, the moon and the night sky are defined here as vector paths and
 * rasterised by a small renderer written for this project: cubic Béziers are
 * flattened adaptively, filled with the non-zero winding rule, and encoded to
 * PNG through `node:zlib`. No image library is required, no binary asset is
 * hand-edited, and the output is byte-for-byte reproducible.
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
/* Palette — kept in sync by hand with src/constants/theme.ts                   */
/* -------------------------------------------------------------------------- */

const NIGHT_TOP = [0x18, 0x20, 0x38];
const NIGHT_BOTTOM = [0x06, 0x09, 0x12];
const MOONLIGHT = [0xe9, 0xef, 0xfa];
const MOON = [0xf6, 0xef, 0xdb];
const STAR = [0xdc, 0xe4, 0xf4];
const WHITE = [0xff, 0xff, 0xff];

/* -------------------------------------------------------------------------- */
/* Path building                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Builds a flattened outline from cubic Bézier and line segments.
 *
 * Curves are subdivided until the control polygon is flat to within a
 * tolerance, so a small icon and a 1024px icon both get exactly as many
 * segments as they need.
 */
class Path {
  constructor(start) {
    this.points = [start];
    this.cursor = start;
  }

  lineTo(to) {
    this.points.push(to);
    this.cursor = to;
    return this;
  }

  curveTo(c1, c2, to) {
    flattenCubic(this.cursor, c1, c2, to, this.points);
    this.points.push(to);
    this.cursor = to;
    return this;
  }
}

const FLATNESS = 0.0004;

function flattenCubic(p0, c1, c2, p3, out, depth = 0) {
  if (depth > 16 || isFlat(p0, c1, c2, p3)) return;

  // de Casteljau split at t = 0.5
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = mid(p0, c1);
  const b = mid(c1, c2);
  const c = mid(c2, p3);
  const d = mid(a, b);
  const e = mid(b, c);
  const f = mid(d, e);

  flattenCubic(p0, a, d, f, out, depth + 1);
  out.push(f);
  flattenCubic(f, e, c, p3, out, depth + 1);
}

function isFlat(p0, c1, c2, p3) {
  // Distance of each control point from the chord, squared and unnormalised.
  const dx = p3[0] - p0[0];
  const dy = p3[1] - p0[1];
  const d1 = Math.abs((c1[0] - p3[0]) * dy - (c1[1] - p3[1]) * dx);
  const d2 = Math.abs((c2[0] - p3[0]) * dy - (c2[1] - p3[1]) * dx);
  const sum = d1 + d2;
  return sum * sum <= FLATNESS * (dx * dx + dy * dy);
}

/** Mirrors a half-outline across x = 0 to close a symmetric silhouette. */
function mirrorClosed(half) {
  const reflected = half
    .slice(1, -1)
    .reverse()
    .map(([x, y]) => [-x, y]);
  return [...half, ...reflected];
}

function circle(cx, cy, r, segments = 192) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

/* -------------------------------------------------------------------------- */
/* The bat                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Right half of the bat, in a unit space where the full wingspan is x in
 * [-1, 1] and +y points down.
 *
 * The silhouette is drawn rather than plotted: the ear is a pair of opposing
 * curves, the leading edge is one long sweep out to the tip, and the membrane
 * between the finger tips bows back up toward that leading edge, which is what
 * makes the shape read as a bat instead of a moth.
 */
function batHalf() {
  return new Path([0.0, -0.3]) // crown of the head
    .curveTo([0.03, -0.36], [0.055, -0.4], [0.085, -0.42]) // up the inner ear
    .curveTo([0.108, -0.37], [0.128, -0.32], [0.15, -0.28]) // down the outer ear
    .curveTo([0.172, -0.262], [0.196, -0.25], [0.22, -0.245]) // shoulder
    .curveTo([0.44, -0.37], [0.72, -0.5], [0.97, -0.56]) // leading edge, sweeping up to the tip
    .curveTo([1.015, -0.44], [0.968, -0.3], [0.88, -0.2]) // around the tip
    .curveTo([0.83, -0.33], [0.7, -0.27], [0.615, 0.005]) // membrane, first scallop
    .curveTo([0.555, -0.13], [0.44, -0.1], [0.365, 0.135]) // second scallop
    .curveTo([0.31, 0.005], [0.235, 0.005], [0.17, 0.1]) // third scallop, into the body
    .curveTo([0.145, 0.2], [0.11, 0.25], [0.075, 0.3]) // flank
    .curveTo([0.058, 0.35], [0.03, 0.385], [0.0, 0.4]).points; // base of the body
}

/* -------------------------------------------------------------------------- */
/* Canvas                                                                      */
/* -------------------------------------------------------------------------- */

function createCanvas(width, height) {
  return { width, height, data: new Float64Array(width * height * 4) };
}

function fillVerticalGradient(canvas, top, bottom) {
  const { width, height, data } = canvas;
  for (let y = 0; y < height; y++) {
    const t = height === 1 ? 0 : y / (height - 1);
    // Eased so the horizon darkens faster than the zenith.
    const e = t * t * (3 - 2 * t);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = top[c] + (bottom[c] - top[c]) * e;
      data[i + 3] = 255;
    }
  }
}

/** Source-over compositing of a single colour at a given alpha. */
function blendPixel(data, i, color, a) {
  if (a <= 0) return;
  const dstA = data[i + 3] / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c++) {
    data[i + c] = (color[c] * a + data[i + c] * dstA * (1 - a)) / outA;
  }
  data[i + 3] = outA * 255;
}

/**
 * Rasterises a polygon using the non-zero winding rule, with analytic
 * horizontal coverage and `samples`x vertical supersampling.
 */
function rasterise(points, width, height, samples = 6) {
  const coverage = new Float64Array(width * height);
  const weight = 1 / samples;

  const addSpan = (row, xa, xb) => {
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
      // Half-open on y so shared vertices are not counted twice.
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        crossings.push({ x: x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), dir: y1 > y0 ? 1 : -1 });
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

  for (let i = 0; i < coverage.length; i++) if (coverage[i] > 1) coverage[i] = 1;
  return coverage;
}

function fill(canvas, points, color, opacity = 1) {
  const coverage = rasterise(points, canvas.width, canvas.height);
  for (let p = 0; p < coverage.length; p++) {
    blendPixel(canvas.data, p * 4, color, coverage[p] * opacity);
  }
}

/** A soft halo, falling off smoothly from `innerR` to `outerR`. */
function glow(canvas, cx, cy, innerR, outerR, color, maxAlpha) {
  const { width, height, data } = canvas;
  const x0 = Math.max(0, Math.floor(cx - outerR));
  const x1 = Math.min(width - 1, Math.ceil(cx + outerR));
  const y0 = Math.max(0, Math.floor(cy - outerR));
  const y1 = Math.min(height - 1, Math.ceil(cy + outerR));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d >= outerR) continue;
      const t = d <= innerR ? 0 : (d - innerR) / (outerR - innerR);
      // Smootherstep, then squared, so the halo fades out rather than banding.
      const falloff = 1 - t * t * t * (t * (t * 6 - 15) + 10);
      blendPixel(data, (y * width + x) * 4, color, falloff * falloff * maxAlpha);
    }
  }
}

/** Maps unit-space artwork onto the canvas; `span` is the wingspan in pixels. */
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

  const raw = Buffer.alloc(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter type: None
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
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, canvas) {
  writeFileSync(resolve(OUT, name), encodePng(canvas));
  console.log(`  ${name}  ${canvas.width}x${canvas.height}`);
}

/* -------------------------------------------------------------------------- */
/* Compositions                                                                */
/* -------------------------------------------------------------------------- */

const BAT = mirrorClosed(batHalf());

/**
 * Fixed star field, in unit coordinates over the icon square. Hand-placed so
 * that nothing collides with the moon or the wings, and so the output stays
 * deterministic without seeding a generator.
 */
const STARS = [
  [0.13, 0.12, 0.0055, 0.9],
  [0.28, 0.22, 0.0035, 0.55],
  [0.2, 0.35, 0.0026, 0.42],
  [0.42, 0.1, 0.004, 0.7],
  [0.86, 0.12, 0.003, 0.5],
  [0.9, 0.46, 0.0042, 0.68],
  [0.12, 0.58, 0.0032, 0.5],
  [0.55, 0.28, 0.0024, 0.36],
  [0.72, 0.62, 0.0028, 0.4],
  [0.32, 0.78, 0.0036, 0.52],
  [0.62, 0.86, 0.003, 0.45],
  [0.84, 0.79, 0.0025, 0.36],
];

/** The full mark: a bat crossing a night sky beneath a haloed moon. */
function markCanvas(size) {
  const canvas = createCanvas(size, size);
  fillVerticalGradient(canvas, NIGHT_TOP, NIGHT_BOTTOM);

  for (const [x, y, r, alpha] of STARS) {
    fill(canvas, circle(x * size, y * size, r * size), STAR, alpha);
  }

  const moonX = size * 0.715;
  const moonY = size * 0.255;
  const moonR = size * 0.108;
  glow(canvas, moonX, moonY, moonR, moonR * 3.4, MOON, 0.3);
  fill(canvas, circle(moonX, moonY, moonR), MOON, 0.96);

  fill(canvas, place(BAT, size * 0.5, size * 0.6, size * 0.74), MOONLIGHT);
  return canvas;
}

/** Bat only. Android crops adaptive icons hard, so it sits inside the safe zone. */
function batOnlyCanvas(size, color, span) {
  const canvas = createCanvas(size, size);
  fill(canvas, place(BAT, size * 0.5, size * 0.5, size * span), color);
  return canvas;
}

function backgroundCanvas(size) {
  const canvas = createCanvas(size, size);
  fillVerticalGradient(canvas, NIGHT_TOP, NIGHT_BOTTOM);
  for (const [x, y, r, alpha] of STARS) {
    fill(canvas, circle(x * size, y * size, r * size), STAR, alpha);
  }
  return canvas;
}

mkdirSync(OUT, { recursive: true });
console.log('Generating Night Courier artwork:');

write('icon.png', markCanvas(1024));
write('favicon.png', markCanvas(96));
write('splash-icon.png', batOnlyCanvas(512, MOONLIGHT, 0.88));
write('android-icon-background.png', backgroundCanvas(1024));
write('android-icon-foreground.png', batOnlyCanvas(1024, MOONLIGHT, 0.54));
write('android-icon-monochrome.png', batOnlyCanvas(1024, WHITE, 0.54));

console.log('Done.');
