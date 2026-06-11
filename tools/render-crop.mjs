// 麦田画法预览：在 Node 里复刻"立体麦田"算法渲成 PNG 校对，满意后把同样逻辑搬进 systems/terrain.ts。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'preview');
const TILE = 24;

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// —— 调色 ——
const EARTH = [26, 22, 12];
const SOIL_D = [18, 15, 8];
const SOIL_L = [40, 34, 18];
const SHADOW = [12, 10, 5];
// 两层景深：后排偏暗、前排偏亮
const TIER = [
  { sd: [54, 46, 22], sm: [82, 70, 34], sl: [110, 94, 42], gd: [104, 84, 36], gm: [140, 112, 48], gl: [178, 144, 60], gh: [200, 168, 84] },
  { sd: [72, 60, 26], sm: [106, 90, 40], sl: [144, 120, 50], gd: [138, 108, 44], gm: [184, 148, 60], gl: [226, 186, 76], gh: [250, 220, 116] },
];

function makeImg(w, h) {
  return { w, h, buf: Buffer.alloc(w * h * 3) };
}
function set(img, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 3;
  img.buf[i] = c[0]; img.buf[i + 1] = c[1]; img.buf[i + 2] = c[2];
}
function fillRect(img, x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(img, xx, yy, c);
}

const STALKS = 22;
function drawWheatTile(img, ox, oy, gtx, gty, seed) {
  // 土壤底纹
  for (let i = 0; i < 6; i++) {
    const px = ox + Math.floor(hash2(gtx * 3 + i, gty, seed) * TILE);
    const py = oy + Math.floor(hash2(gtx, gty * 3 + i, seed) * TILE);
    set(img, px, py, hash2(i, gtx + gty, seed) > 0.5 ? SOIL_L : SOIL_D);
  }
  // 暗色底层麦草（填满空隙、增加纵深）
  for (let i = 0; i < 10; i++) {
    const x = ox + hash2(gtx * 31 + i, gty * 11, seed) * TILE;
    const baseY = oy + 8 + hash2(gtx * 11, gty * 31 + i, seed) * (TILE - 8);
    const ih = 4 + Math.round(hash2(gtx + i * 2, gty, seed) * 4);
    for (let yy = 0; yy < ih; yy++) set(img, x, baseY - yy, TIER[0].sd);
  }
  // 收集麦秆，按基部 y 排序（后排先画 → 前排叠在上面 = 景深）
  const stalks = [];
  for (let i = 0; i < STALKS; i++) {
    const x = ox + hash2(gtx * 23 + i, gty * 7, seed) * TILE;
    const baseY = oy + 7 + hash2(gtx * 7, gty * 23 + i, seed) * (TILE - 6);
    const h = 9 + hash2(gtx + i, gty + i * 3, seed) * 9;
    const lean = (hash2(gtx * 5 + i, gty * 5 + i, seed) - 0.5) * 5;
    stalks.push({ x, baseY, h, lean });
  }
  stalks.sort((a, b) => a.baseY - b.baseY);
  for (const s of stalks) {
    const depth = (s.baseY - oy) / TILE; // 0 后 .. 1 前
    const T = TIER[depth < 0.5 ? 0 : 1];
    const ih = Math.round(s.h);
    set(img, s.x, s.baseY, SHADOW); // 基部阴影
    // 麦秆（底暗顶亮 = 顶光）
    for (let yy = 1; yy <= ih; yy++) {
      const t = yy / ih;
      const cx = s.x + s.lean * t;
      const cy = s.baseY - yy;
      set(img, cx, cy, t < 0.34 ? T.sd : t < 0.72 ? T.sm : T.sl);
    }
    // 麦穗头（双列错位 + 高光 + 麦芒）
    const gx = s.x + s.lean;
    const gy = s.baseY - ih;
    set(img, gx, gy - 1, T.gl);
    set(img, gx, gy, T.gm);
    set(img, gx, gy + 1, T.gd);
    set(img, gx + 1, gy - 1, T.gm);
    set(img, gx + 1, gy, T.gl);
    set(img, gx + 1, gy + 1, T.gm);
    set(img, gx, gy - 2, T.gh); // 顶端高光/麦芒
  }
}

// —— PNG ——
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const tb = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0); return Buffer.concat([len, tb, data, crc]); }
function encodePng(w, h, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // RGB
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 渲一片 6x4 麦田（native），再放大
const tilesX = 6, tilesY = 4, S = 7, seed = 0x12345678 | 0;
const nat = makeImg(tilesX * TILE, tilesY * TILE);
fillRect(nat, 0, 0, nat.w, nat.h, EARTH);
for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) drawWheatTile(nat, tx * TILE, ty * TILE, tx, ty, seed);
// 放大
const out = makeImg(nat.w * S, nat.h * S);
for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
  const i = (Math.floor(y / S) * nat.w + Math.floor(x / S)) * 3;
  const o = (y * out.w + x) * 3;
  out.buf[o] = nat.buf[i]; out.buf[o + 1] = nat.buf[i + 1]; out.buf[o + 2] = nat.buf[i + 2];
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'crop.png'), encodePng(out.w, out.h, out.buf));
console.log('麦田预览 -> assets/preview/crop.png');
