import type { SpriteDef } from '../data/sprite-data';

// 精灵预渲染：把字符网格一次性烘焙到离屏 canvas。
// 架构红线：主循环热路径只做 drawImage，绝不在每帧逐像素绘制精灵。

export interface Sprite {
  /** 预渲染好的离屏画布，主循环直接 drawImage */
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** 锚点（脚底/落点），绘制时用来对齐世界坐标 */
  anchor: { x: number; y: number };
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** 把精灵定义烘焙成离屏 canvas（1x 原始像素，绘制时再整体缩放） */
export function prerenderSprite(def: SpriteDef): Sprite {
  const { w, h, rows, palette } = def;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法获取 2D 上下文');

  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.';
      const hex = palette[ch];
      if (!hex) continue; // 透明像素
      const [r, g, b] = hexToRgb(hex);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, w, h, anchor: def.anchor };
}

// 纯色剪影：把所有不透明像素染成同一颜色。用于受击闪白、尸壳变暗等。
export function prerenderSilhouette(def: SpriteDef, hex: string): Sprite {
  const { w, h, rows, palette } = def;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法获取 2D 上下文');

  const [r, g, b] = hexToRgb(hex);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.';
      if (!palette[ch]) continue;
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, w, h, anchor: def.anchor };
}

// 把预渲染精灵画到屏幕：(footX, footY) 为脚底落点屏幕坐标，按锚点对齐；flipX 水平翻转朝向。
// 热路径只做 drawImage / 整数缩放，不逐像素绘制。
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  footX: number,
  footY: number,
  scale: number,
  flipX = false,
): void {
  const dw = s.w * scale;
  const dh = s.h * scale;
  const dx = Math.round(footX - s.anchor.x * scale);
  const dy = Math.round(footY - s.anchor.y * scale);
  if (flipX) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(s.canvas, 0, 0, s.w, s.h, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(s.canvas, 0, 0, s.w, s.h, dx, dy, dw, dh);
  }
}
