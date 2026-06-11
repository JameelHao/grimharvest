// 地形贴图立体画法预览：7 种地形各渲一片 3x3 patch，校对满意后把逻辑搬进 systems/terrain.ts。
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
function vnoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}
const mk = (w, h) => ({ w, h, buf: Buffer.alloc(w * h * 3) });
function set(img, x, y, c) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= img.w || y >= img.h) return; const i = (y * img.w + x) * 3; img.buf[i] = c[0]; img.buf[i + 1] = c[1]; img.buf[i + 2] = c[2]; }
function rect(img, x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(img, xx, yy, c); }

// —— 各地形画法 ——
function plain(img, ox, oy, gx, gy, s) {
  rect(img, ox, oy, TILE, TILE, [21, 19, 31]);
  for (let i = 0; i < 5; i++) { // 草丛
    const x = ox + hash2(gx * 9 + i, gy * 5, s) * TILE, by = oy + 9 + hash2(gx, gy * 9 + i, s) * (TILE - 9), h = 3 + Math.round(hash2(gx + i, gy, s) * 4);
    for (let yy = 0; yy < h; yy++) set(img, x, by - yy, yy >= h - 1 ? [60, 66, 82] : [36, 40, 52]);
  }
  for (let i = 0; i < 2; i++) { // 石子（高光+阴影=立体）
    const x = ox + 2 + hash2(gx * 7 + i, gy, s) * (TILE - 4), y = oy + 2 + hash2(gx, gy * 7 + i, s) * (TILE - 4);
    rect(img, x, y, 2, 2, [42, 40, 52]); set(img, x, y, [60, 58, 72]); set(img, x + 1, y + 1, [12, 11, 18]);
  }
}
function swamp(img, ox, oy, gx, gy, s) { // 沼泽（静态底；冒泡动画在游戏里叠加）
  for (let yy = 0; yy < TILE; yy++) for (let xx = 0; xx < TILE; xx++) {
    const wx = gx * TILE + xx, wy = gy * TILE + yy, n = vnoise(wx * 0.16, wy * 0.16, s ^ 0x33);
    set(img, ox + xx, oy + yy, n < 0.4 ? [13, 19, 14] : n > 0.62 ? [30, 36, 22] : [20, 27, 18]);
  }
  for (let i = 0; i < 5; i++) { const x = ox + hash2(gx * 9 + i, gy, s) * TILE, y = oy + hash2(gx, gy * 9 + i, s) * TILE; rect(img, x, y, 2, 2, [44, 58, 32]); set(img, x, y, [64, 84, 44]); }
}
function boneyard(img, ox, oy, gx, gy, s) {
  rect(img, ox, oy, TILE, TILE, [29, 28, 34]);
  for (let i = 0; i < 3; i++) { // 骨段（带投影）
    const x = ox + hash2(gx * 9 + i, gy, s) * (TILE - 6), y = oy + 4 + hash2(gx, gy * 9 + i, s) * (TILE - 6), len = 4 + Math.round(hash2(gx + i, gy, s) * 4);
    rect(img, x, y + 2, len, 1, [18, 17, 22]); // 投影
    rect(img, x, y, len, 2, [82, 78, 60]); for (let k = 0; k < len; k++) set(img, x + k, y, [110, 105, 84]);
  }
  if (hash2(gx, gy, s) > 0.5) { // 骷髅
    const x = ox + 4 + hash2(gx * 3, gy, s) * 12, y = oy + 6 + hash2(gx, gy * 3, s) * 10;
    rect(img, x, y + 4, 5, 1, [16, 15, 20]); rect(img, x, y, 5, 4, [92, 88, 68]); for (let k = 0; k < 5; k++) set(img, x + k, y, [120, 114, 90]);
    set(img, x + 1, y + 2, [22, 20, 24]); set(img, x + 3, y + 2, [22, 20, 24]);
  }
}
function blight(img, ox, oy, gx, gy, s) {
  rect(img, ox, oy, TILE, TILE, [26, 16, 36]);
  for (let i = 0; i < 3; i++) { // 发光裂缝
    let x = ox + hash2(gx * 9 + i, gy, s) * TILE, y = oy + hash2(gx, gy * 9 + i, s) * TILE;
    for (let k = 0; k < 6; k++) { set(img, x, y, [8, 4, 12]); set(img, x + 1, y, [150, 56, 170]); x += (hash2(gx + k, gy + i, s) - 0.5) * 2; y += 1; }
  }
  for (let i = 0; i < 3; i++) { const x = ox + hash2(gx * 5 + i, gy * 3, s) * TILE, y = oy + hash2(gx * 3, gy * 5 + i, s) * TILE; rect(img, x, y, 2, 2, [58, 30, 62]); set(img, x, y, [92, 52, 100]); set(img, x + 1, y + 1, [14, 8, 18]); }
}
function rock(img, ox, oy, gx, gy, s) { // 石头山：圆润巨岩，上亮下暗 + 投影，叠成挡路岩堆
  rect(img, ox, oy, TILE, TILE, [18, 19, 25]);
  const boulders = [];
  for (let i = 0; i < 3; i++) boulders.push({ bx: ox + 3 + hash2(gx * 13 + i, gy * 5, s) * (TILE - 6), by: oy + 3 + hash2(gx * 5, gy * 13 + i, s) * (TILE - 6), rad: 4 + Math.round(hash2(gx + i, gy, s) * 4) });
  boulders.sort((a, b) => a.by - b.by);
  for (const { bx, by, rad } of boulders) {
    for (let xx = -rad; xx <= rad; xx++) set(img, bx + xx, by + rad + 1, [10, 10, 14]); // 投影
    for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) {
      if (xx * xx + yy * yy > rad * rad) continue;
      const t = (yy + rad) / (2 * rad);
      set(img, bx + xx, by + yy, t < 0.22 ? [80, 83, 94] : t < 0.5 ? [54, 56, 65] : t < 0.78 ? [36, 37, 45] : [22, 23, 29]);
    }
    set(img, bx - 1, by - rad + 1, [100, 104, 116]); // 顶高光
  }
}
function hallowed(img, ox, oy, gx, gy, s) { // 圣地：苍白大理石 + 柔光 + 双符文环
  const cx = ox + TILE / 2, cy = oy + TILE / 2;
  for (let yy = 0; yy < TILE; yy++) for (let xx = 0; xx < TILE; xx++) {
    const wx = gx * TILE + xx, wy = gy * TILE + yy, n = vnoise(wx * 0.2, wy * 0.2, s ^ 0x77);
    const dist = Math.hypot(ox + xx - cx, oy + yy - cy);
    let c = dist < 8 ? [54, 62, 84] : dist < 12 ? [44, 52, 72] : [34, 40, 56];
    if (n > 0.66) c = [60, 70, 92];
    set(img, ox + xx, oy + yy, c);
  }
  for (const [R, col] of [[6, [152, 184, 230]], [9, [104, 130, 176]]]) for (let a = 0; a < 24; a++) { const ang = (a / 24) * Math.PI * 2; set(img, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, col); }
  set(img, cx, cy, [184, 210, 244]);
}
function water(img, ox, oy, gx, gy, s) { // 水：无缝纹理（用全局像素坐标，跨格连续）
  for (let yy = 0; yy < TILE; yy++) for (let xx = 0; xx < TILE; xx++) {
    const wx = gx * TILE + xx, wy = gy * TILE + yy;
    const n = vnoise(wx * 0.13, wy * 0.13, s ^ 0x55);
    const n2 = vnoise(wx * 0.34 + 9, wy * 0.31 + 3, s ^ 0xaa);
    const wave = Math.sin(wx * 0.45 + wy * 0.28 + n * 4);
    let c = [12, 20, 38];
    if (n > 0.4) c = [20, 32, 56];
    if (n > 0.58) c = [28, 46, 74];
    if (wave > 0.5) c = [42, 66, 102];
    if (wave > 0.82 && n2 > 0.6) c = [80, 118, 160];
    set(img, ox + xx, oy + yy, c);
  }
}

const LIST = [plain, swamp, boneyard, blight, rock, hallowed, water];

// —— PNG ——
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function ch(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const tb = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0); return Buffer.concat([len, tb, data, crc]); }
function png(w, h, rgb) { const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const st = w * 3, raw = Buffer.alloc((st + 1) * h); for (let y = 0; y < h; y++) { raw[y * (st + 1)] = 0; rgb.copy(raw, y * (st + 1) + 1, y * st, y * st + st); } return Buffer.concat([sig, ch('IHDR', ih), ch('IDAT', deflateSync(raw, { level: 9 })), ch('IEND', Buffer.alloc(0))]); }

const seed = 0x12345678 | 0, P = 3, S = 6, gap = 8, cols = 4;
const patch = P * TILE;
const rows = Math.ceil(LIST.length / cols);
const natW = cols * patch + (cols + 1) * gap, natH = rows * patch + (rows + 1) * gap;
const nat = mk(natW, natH);
rect(nat, 0, 0, natW, natH, [30, 28, 40]);
LIST.forEach((fn, idx) => {
  const cx0 = gap + (idx % cols) * (patch + gap), cy0 = gap + Math.floor(idx / cols) * (patch + gap);
  for (let ty = 0; ty < P; ty++) for (let tx = 0; tx < P; tx++) fn(nat, cx0 + tx * TILE, cy0 + ty * TILE, idx * 11 + tx, ty, seed);
});
const out = mk(natW * S, natH * S);
for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) { const i = (Math.floor(y / S) * nat.w + Math.floor(x / S)) * 3, o = (y * out.w + x) * 3; out.buf[o] = nat.buf[i]; out.buf[o + 1] = nat.buf[i + 1]; out.buf[o + 2] = nat.buf[i + 2]; }
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tiles.png'), png(out.w, out.h, out.buf));
console.log('地形贴图预览 -> assets/preview/tiles.png （顺序：plain bog boneyard blight / ruins hallowed moonwell）');
