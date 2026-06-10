// 零依赖精灵预览工具：把 src/data 里的精灵渲染成放大的 PNG，便于肉眼校对像素图。
// 仅用 Node 内置 zlib，不需要 npm install。运行：npm run sprites
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PLAYER, HUSK, BAT_A, BAT_B, ICON_LIST, CHARGER, SPITTER, RINGER, ELITE, BOSS } from '../src/data/sprite-data.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'preview');

// —— 最小 PNG 编码器（真彩 + alpha）——
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// —— 简易 RGBA 画布 ——
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function makeImage(w, h, bgHex) {
  const buf = Buffer.alloc(w * h * 4);
  const [r, g, b] = hexToRgb(bgHex);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return { w, h, buf };
}
function fillRect(img, x0, y0, w, h, r, g, b) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = (y * img.w + x) * 4;
      img.buf[i] = r;
      img.buf[i + 1] = g;
      img.buf[i + 2] = b;
      img.buf[i + 3] = 255;
    }
  }
}
// 画放大后的精灵；返回占用的像素宽高
function drawSprite(img, def, ox, oy, scale, gridHex) {
  const { rows, palette, w, h } = def;
  // 可选像素网格（淡描边），帮助校对
  if (gridHex) {
    const [gr, gg, gb] = hexToRgb(gridHex);
    for (let y = 0; y <= h; y++) fillRect(img, ox, oy + y * scale, w * scale + 1, 1, gr, gg, gb);
    for (let x = 0; x <= w; x++) fillRect(img, ox + x * scale, oy, 1, h * scale + 1, gr, gg, gb);
  }
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.';
      const hex = palette[ch];
      if (!hex) continue;
      const [r, g, b] = hexToRgb(hex);
      fillRect(img, ox + x * scale + (gridHex ? 1 : 0), oy + y * scale + (gridHex ? 1 : 0), scale - (gridHex ? 1 : 0), scale - (gridHex ? 1 : 0), r, g, b);
    }
  }
  return { w: w * scale, h: h * scale };
}

mkdirSync(outDir, { recursive: true });

// 单体（无网格，纯外观）
for (const def of [PLAYER, HUSK, BAT_A, BAT_B]) {
  const scale = 16;
  const pad = scale;
  const img = makeImage(def.w * scale + pad * 2, def.h * scale + pad * 2, '#1a1622');
  drawSprite(img, def, pad, pad, scale, null);
  writeFileSync(join(outDir, `${def.name}.png`), encodePng(img.w, img.h, img.buf));
}

// 带像素网格的校对版（便于逐格检查）
for (const def of [PLAYER, HUSK, BAT_A, BAT_B]) {
  const scale = 18;
  const pad = scale;
  const img = makeImage(def.w * scale + pad * 2 + 1, def.h * scale + pad * 2 + 1, '#101019');
  drawSprite(img, def, pad, pad, scale, '#2a2a3a');
  writeFileSync(join(outDir, `${def.name}-grid.png`), encodePng(img.w, img.h, img.buf));
}

// 同台对比图（按真实比例并排，看尺寸关系）
{
  const scale = 12;
  const pad = 24;
  const gap = 36;
  const maxH = Math.max(PLAYER.h, HUSK.h) * scale;
  const totalW = PLAYER.w * scale + HUSK.w * scale + gap + pad * 2;
  const img = makeImage(totalW, maxH + pad * 2, '#161320');
  // 地面阴影线
  fillRect(img, 0, pad + maxH, totalW, 1, 40, 34, 52);
  drawSprite(img, PLAYER, pad, pad + (maxH - PLAYER.h * scale), scale, null);
  drawSprite(img, HUSK, pad + PLAYER.w * scale + gap, pad + (maxH - HUSK.h * scale), scale, null);
  writeFileSync(join(outDir, 'showcase.png'), encodePng(img.w, img.h, img.buf));
}

// 图标接触表（3 列网格，便于一眼校对 9 个图标）
{
  const scale = 9;
  const cell = 16 * scale;
  const gap = 10;
  const cols = 3;
  const rows = Math.ceil(ICON_LIST.length / cols);
  const pad = 14;
  const img = makeImage(cols * cell + (cols - 1) * gap + pad * 2, rows * cell + (rows - 1) * gap + pad * 2, '#1c1830');
  ICON_LIST.forEach((def, i) => {
    const cx = pad + (i % cols) * (cell + gap);
    const cy = pad + Math.floor(i / cols) * (cell + gap);
    fillRect(img, cx, cy, cell, cell, 16, 18, 30);
    drawSprite(img, def, cx, cy, scale, null);
  });
  writeFileSync(join(outDir, 'icons.png'), encodePng(img.w, img.h, img.buf));
}

// 敌人对照表（按真实相对比例并排）
{
  const scale = 6;
  const pad = 16;
  const gap = 14;
  const list = [HUSK, CHARGER, SPITTER, RINGER, ELITE, BOSS];
  const maxH = Math.max(...list.map((d) => d.h)) * scale;
  let totalW = pad * 2 + gap * (list.length - 1);
  for (const d of list) totalW += d.w * scale;
  const img = makeImage(totalW, maxH + pad * 2, '#161320');
  fillRect(img, 0, pad + maxH, totalW, 1, 40, 34, 52);
  let cx = pad;
  for (const d of list) {
    drawSprite(img, d, cx, pad + (maxH - d.h * scale), scale, null);
    cx += d.w * scale + gap;
  }
  writeFileSync(join(outDir, 'enemies.png'), encodePng(img.w, img.h, img.buf));
}

console.log('已生成预览 PNG ->', outDir);
