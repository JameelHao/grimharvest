// 整块地形渲染预览：复刻 systems/terrain.ts 的 typeAtWorld + baseColorAt + 特征散布，
// 渲一片世界区域看「有机区块 + 特征」的最终效果（校对后即弃）。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'preview');
const TILE = 24;
const GEN = { biomeFreq: 0.16, specialFreq: 0.21, bands: [['bog', 0.1], ['boneyard', 0.22], ['crop', 0.38], ['blight', 0.46]], ruins: 0.9, moonwell: 0.93, hallowed: 0.965, safe: 48 };
const BF = GEN.biomeFreq / TILE, SF = GEN.specialFreq / TILE;

function hash2(ix, iy, seed) { let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 0x9e3779b1)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, seed) { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0; const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed); const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const t = a + (b - a) * sx, bt = c + (d - c) * sx; return t + (bt - t) * sy; }
function typeAtWorld(wx, wy, seed) {
  if (wx >= -GEN.safe && wx <= GEN.safe && wy >= -GEN.safe && wy <= GEN.safe) return 'plain';
  if (vnoise(wx * SF, wy * SF, seed ^ 0x7abcdef) > GEN.hallowed) return 'hallowed';
  if (vnoise(wx * SF, wy * SF, seed ^ 0x1234567) > GEN.moonwell) return 'moonwell';
  if (vnoise(wx * SF, wy * SF, seed ^ 0x5f5f5f) > GEN.ruins) return 'ruins';
  const b = vnoise(wx * BF, wy * BF, seed);
  for (const [k, mx] of GEN.bands) if (b < mx) return k;
  return 'plain';
}
function baseColorAt(kind, wx, wy, seed) {
  switch (kind) {
    case 'crop': return [26, 22, 12];
    case 'bog': { const n = vnoise(wx * 0.16, wy * 0.16, seed ^ 0x33); return n < 0.4 ? [13, 19, 14] : n > 0.62 ? [30, 36, 22] : [20, 27, 18]; }
    case 'boneyard': { const n = vnoise(wx * 0.12, wy * 0.12, seed ^ 0x44); return n > 0.6 ? [33, 32, 38] : [29, 28, 34]; }
    case 'blight': { const n = vnoise(wx * 0.14, wy * 0.14, seed ^ 0x66); return n > 0.62 ? [32, 18, 42] : [26, 16, 36]; }
    case 'ruins': return [18, 19, 25];
    case 'hallowed': { const n = vnoise(wx * 0.2, wy * 0.2, seed ^ 0x77); const g = vnoise(wx * 0.045, wy * 0.045, seed ^ 0x88); const c = g > 0.55 ? [50, 58, 80] : [38, 44, 60]; return n > 0.66 ? [62, 72, 94] : c; }
    case 'moonwell': { const n = vnoise(wx * 0.13, wy * 0.13, seed ^ 0x55); const n2 = vnoise(wx * 0.34 + 9, wy * 0.31 + 3, seed ^ 0xaa); const wave = Math.sin(wx * 0.45 + wy * 0.28 + n * 4); let c = [12, 20, 38]; if (n > 0.4) c = [20, 32, 56]; if (n > 0.58) c = [28, 46, 74]; if (wave > 0.5) c = [42, 66, 102]; if (wave > 0.82 && n2 > 0.6) c = [80, 118, 160]; return c; }
    default: return [21, 19, 31];
  }
}

const img = { w: 0, h: 0, buf: null, ox: 0, oy: 0 };
function set(x, y, c) { x = Math.round(x) - img.ox; y = Math.round(y) - img.oy; if (x < 0 || y < 0 || x >= img.w || y >= img.h) return; const i = (y * img.w + x) * 3; img.buf[i] = c[0]; img.buf[i + 1] = c[1]; img.buf[i + 2] = c[2]; }
function fillR(x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c); }
const SH = [12, 10, 5];
const TIER = [{ sd: [54, 46, 22], sm: [82, 70, 34], sl: [110, 94, 42], gd: [104, 84, 36], gm: [140, 112, 48], gl: [178, 144, 60], gh: [200, 168, 84] }, { sd: [72, 60, 26], sm: [106, 90, 40], sl: [144, 120, 50], gd: [138, 108, 44], gm: [184, 148, 60], gl: [226, 186, 76], gh: [250, 220, 116] }];
function stalk(cx, by, s) { const ix = cx | 0, iy = by | 0, T = TIER[hash2(ix, iy, s) < 0.5 ? 0 : 1], ih = Math.round(8 + hash2(ix, iy + 3, s) * 9), ln = (hash2(ix + 5, iy, s) - 0.5) * 5; set(cx, by, SH); for (let yy = 1; yy <= ih; yy++) { const t = yy / ih; set(cx + ln * t, by - yy, t < 0.34 ? T.sd : t < 0.72 ? T.sm : T.sl); } const gx = cx + ln, gy = by - ih; set(gx, gy - 1, T.gl); set(gx, gy, T.gm); set(gx, gy + 1, T.gd); set(gx + 1, gy - 1, T.gm); set(gx + 1, gy, T.gl); set(gx + 1, gy + 1, T.gm); set(gx, gy - 2, T.gh); }
function grass(x, y, s) { const h = 3 + Math.round(hash2(x | 0, y | 0, s) * 3); for (let yy = 0; yy < h; yy++) set(x, y - yy, yy >= h - 1 ? [60, 66, 82] : [36, 40, 52]); }
function pebble(x, y) { fillR(x, y, 2, 2, [42, 40, 52]); set(x, y, [60, 58, 72]); set(x + 1, y + 1, [12, 11, 18]); }
function bone(x, y, s) { const len = 4 + Math.round(hash2(x | 0, y | 0, s) * 4); fillR(x, y + 2, len, 1, [18, 17, 22]); fillR(x, y, len, 2, [82, 78, 60]); for (let k = 0; k < len; k++) set(x + k, y, [110, 105, 84]); }
function scum(x, y) { fillR(x, y, 2, 2, [44, 58, 32]); set(x, y, [64, 84, 44]); }
function crust(x, y, s) { fillR(x, y, 2, 2, [58, 30, 62]); set(x, y, [92, 52, 100]); set(x + 1, y + 1, [14, 8, 18]); if (hash2(x | 0, y | 0, s) > 0.55) { let cx = x, cy = y; for (let k = 0; k < 4; k++) { set(cx, cy, [8, 4, 12]); set(cx + 1, cy, [150, 56, 170]); cx += (hash2(cx | 0, cy | 0, s) - 0.5) * 2; cy += 1; } } }
function boulder(bx, by, s) { const rad = 3 + Math.round(hash2(bx | 0, by | 0, s) * 3); for (let xx = -rad; xx <= rad; xx++) set(bx + xx, by + rad + 1, [10, 10, 14]); for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) { if (xx * xx + yy * yy > rad * rad) continue; const t = (yy + rad) / (2 * rad); set(bx + xx, by + yy, t < 0.22 ? [80, 83, 94] : t < 0.5 ? [54, 56, 65] : t < 0.78 ? [36, 37, 45] : [22, 23, 29]); } set(bx - 1, by - rad + 1, [100, 104, 116]); }
function sparkle(x, y) { set(x, y, [184, 210, 244]); set(x + 1, y, [120, 150, 200]); }
function feature(kind, x, y, s, h) {
  if (kind === 'crop') { if (h < 0.82) stalk(x, y, s); }
  else if (kind === 'plain') { if (h < 0.04) grass(x, y, s); else if (h < 0.06) pebble(x, y); }
  else if (kind === 'boneyard') { if (h < 0.16) bone(x, y, s); }
  else if (kind === 'bog') { if (h < 0.14) scum(x, y); }
  else if (kind === 'blight') { if (h < 0.2) crust(x, y, s); }
  else if (kind === 'ruins') { if (h < 0.24) boulder(x, y, s); }
  else if (kind === 'hallowed') { if (h < 0.1) sparkle(x, y); }
}

// PNG
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const tb = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0); return Buffer.concat([len, tb, data, crc]); }
function png(w, h, rgb) { const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const st = w * 3, raw = Buffer.alloc((st + 1) * h); for (let y = 0; y < h; y++) { raw[y * (st + 1)] = 0; rgb.copy(raw, y * (st + 1) + 1, y * st, y * st + st); } return Buffer.concat([sig, chk('IHDR', ih), chk('IDAT', deflateSync(raw, { level: 9 })), chk('IEND', Buffer.alloc(0))]); }

const seed = 0x12345678 | 0, S = 3;
const W = 300, H = 220, OX = 240, OY = 120;
img.w = W; img.h = H; img.ox = OX; img.oy = OY; img.buf = Buffer.alloc(W * H * 3);
for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const wx = OX + px, wy = OY + py; set(wx, wy, baseColorAt(typeAtWorld(wx, wy, seed), wx, wy, seed)); }
const FS = 4;
for (let py = OY; py < OY + H; py += FS) for (let px = OX; px < OX + W; px += FS) { const jx = px + (hash2(px, py, seed ^ 0x111) - 0.5) * FS * 1.6, jy = py + (hash2(py, px, seed ^ 0x222) - 0.5) * FS * 1.6; feature(typeAtWorld(jx, jy, seed), jx, jy, seed, hash2(jx | 0, jy | 0, seed ^ 0x333)); }
// 放大
const out = Buffer.alloc(W * S * H * S * 3);
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) { const i = (Math.floor(y / S) * W + Math.floor(x / S)) * 3, o = (y * W * S + x) * 3; out[o] = img.buf[i]; out[o + 1] = img.buf[i + 1]; out[o + 2] = img.buf[i + 2]; }
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'chunk.png'), png(W * S, H * S, out));
console.log('整块地形预览 -> assets/preview/chunk.png');
