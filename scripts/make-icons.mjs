import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// --- icon design, in a normalized 0..1 coordinate space (y points down) ---
const MARGIN = 0.06;
const RADIUS = 0.24;
const TOP = [99, 102, 241];     // indigo-500
const BOTTOM = [79, 70, 229];   // indigo-600
const ROWS = [0.36, 0.52, 0.68];
const BAR_THICK = 0.052;
const TICK_THICK = 0.05;

function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// White checklist marks: a tick + a task bar per row.
function onMark(x, y) {
  const h = TICK_THICK / 2, b = BAR_THICK / 2;
  for (const r of ROWS) {
    if (distSeg(x, y, 0.21, r + 0.005, 0.265, r + 0.05) <= h) return true; // tick down-stroke
    if (distSeg(x, y, 0.265, r + 0.05, 0.37, r - 0.065) <= h) return true; // tick up-stroke
    if (distSeg(x, y, 0.45, r, 0.80, r) <= b) return true;                 // task bar
  }
  return false;
}

function sample(x, y) {
  const x1 = 1 - MARGIN, y1 = 1 - MARGIN;
  if (!insideRoundRect(x, y, MARGIN, MARGIN, x1, y1, RADIUS)) return [0, 0, 0, 0];
  if (onMark(x, y)) return [255, 255, 255, 255];
  const t = Math.min(1, Math.max(0, (y - MARGIN) / (1 - 2 * MARGIN)));
  return [
    Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
    Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
    Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
    255,
  ];
}

const SS = 4; // supersampling factor per axis for anti-aliasing

function png(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  for (let py = 0; py < size; py++) {
    raw[o++] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [sr, sg, sb, sa] = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          const af = sa / 255;
          r += sr * af; g += sg * af; b += sb * af; a += sa; // premultiplied accumulation
        }
      }
      const n = SS * SS;
      const af = a / (255 * n);
      raw[o++] = af ? Math.round(r / (n * af)) : 0;
      raw[o++] = af ? Math.round(g / (n * af)) : 0;
      raw[o++] = af ? Math.round(b / (n * af)) : 0;
      raw[o++] = Math.round(a / n);
    }
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("icons", { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(`icons/${size}.png`, png(size));
console.log("icons written");
