// 地形生成预览：复刻 systems/terrain.ts 的纯生成逻辑，渲染一张俯视地图 PNG 以校对分布。
// 注意：此处常量需与 data/terrain.ts 的 GEN 保持一致（仅预览用）。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'preview');

const GEN = {
  biomeFreq: 0.16, specialFreq: 0.21,
  bands: [['bog', 0.1], ['boneyard', 0.22], ['crop', 0.38], ['blight', 0.46]],
  ruins: 0.9, moonwell: 0.93, hallowed: 0.965, safeRadiusTiles: 2,
};
const COLOR = {
  plain: [42, 39, 64], crop: [122, 106, 46], bog: [44, 33, 20], boneyard: [74, 70, 54],
  blight: [106, 42, 110], ruins: [106, 108, 118], hallowed: [138, 166, 200], moonwell: [74, 126, 208],
};

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = a + (b - a) * sx, bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}
function kindAt(tx, ty, seed) {
  if (Math.abs(tx) <= GEN.safeRadiusTiles && Math.abs(ty) <= GEN.safeRadiusTiles) return 'plain';
  if (vnoise(tx * GEN.specialFreq, ty * GEN.specialFreq, seed ^ 0x7abcdef) > GEN.hallowed) return 'hallowed';
  if (vnoise(tx * GEN.specialFreq, ty * GEN.specialFreq, seed ^ 0x1234567) > GEN.moonwell) return 'moonwell';
  if (vnoise(tx * GEN.specialFreq, ty * GEN.specialFreq, seed ^ 0x5f5f5f) > GEN.ruins) return 'ruins';
  const b = vnoise(tx * GEN.biomeFreq, ty * GEN.biomeFreq, seed);
  for (const [k, max] of GEN.bands) if (b < max) return k;
  return 'plain';
}

// —— 最小 PNG 编码 ——
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const tb = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0); return Buffer.concat([len, tb, data, crc]); }
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 渲染 -90..90 格范围，每格 3px
const seed = 0x12345678 | 0;
const R = 90, px = 3, W = (R * 2 + 1) * px;
const buf = Buffer.alloc(W * W * 4);
const counts = {};
for (let ty = -R; ty <= R; ty++) {
  for (let tx = -R; tx <= R; tx++) {
    const k = kindAt(tx, ty, seed);
    counts[k] = (counts[k] || 0) + 1;
    let [r, g, b] = COLOR[k];
    if (tx === 0 && ty === 0) { r = 255; g = 80; b = 220; } // 出生点
    for (let yy = 0; yy < px; yy++) for (let xx = 0; xx < px; xx++) {
      const X = (tx + R) * px + xx, Y = (ty + R) * px + yy, i = (Y * W + X) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'terrain-map.png'), encodePng(W, W, buf));
const total = (R * 2 + 1) ** 2;
console.log('地形分布占比:');
for (const k of Object.keys(COLOR)) console.log(`  ${k}: ${(((counts[k] || 0) / total) * 100).toFixed(1)}%`);
