import type { Camera } from '../core/camera';
import { TILE, CHUNK, GEN, TERRAIN, type TerrainKind, type TerrainDef } from '../data/terrain';

// 地形系统：无限田野按区块确定性生成（种子 + 区块坐标），离屏预渲染 + 视野裁剪 + 缓存回收。
// terrainAt 走纯函数 + 数值 key 查询，O(1) 零分配（架构红线）。

const CHUNK_PX = CHUNK * TILE; // 区块像素边长（1 世界单位 = 1px）
const CACHE_LIMIT = 32;

// —— 确定性哈希值噪声 ——
function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

// —— 区块像素绘制（写入 ImageData，一次 putImageData，避免逐像素 fillRect 卡顿）——
type RGB = [number, number, number];

// 麦田调色（立体感：暗底层 + 前后两档明暗 + 麦穗高光）
const EARTH: RGB = [26, 22, 12];
const SOIL: RGB[] = [[18, 15, 8], [40, 34, 18]];
const STALK_SHADOW: RGB = [12, 10, 5];
const TIER = [
  { sd: [54, 46, 22] as RGB, sm: [82, 70, 34] as RGB, sl: [110, 94, 42] as RGB, gd: [104, 84, 36] as RGB, gm: [140, 112, 48] as RGB, gl: [178, 144, 60] as RGB, gh: [200, 168, 84] as RGB },
  { sd: [72, 60, 26] as RGB, sm: [106, 90, 40] as RGB, sl: [144, 120, 50] as RGB, gd: [138, 108, 44] as RGB, gm: [184, 148, 60] as RGB, gl: [226, 186, 76] as RGB, gh: [250, 220, 116] as RGB },
];

function setPx(data: Uint8ClampedArray, dim: number, x: number, y: number, c: RGB): void {
  x |= 0;
  y |= 0;
  if (x < 0 || y < 0 || x >= dim || y >= dim) return;
  const i = (y * dim + x) * 4;
  data[i] = c[0];
  data[i + 1] = c[1];
  data[i + 2] = c[2];
  data[i + 3] = 255;
}
function fillR(data: Uint8ClampedArray, dim: number, x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(data, dim, xx, yy, c);
}

const STALKS = 22;
function drawWheatTile(data: Uint8ClampedArray, dim: number, ox: number, oy: number, gtx: number, gty: number, seed: number): void {
  // 土壤底纹
  for (let i = 0; i < 6; i++) {
    const px = ox + Math.floor(hash2(gtx * 3 + i, gty, seed) * TILE);
    const py = oy + Math.floor(hash2(gtx, gty * 3 + i, seed) * TILE);
    setPx(data, dim, px, py, SOIL[hash2(i, gtx + gty, seed) > 0.5 ? 1 : 0]);
  }
  // 暗色底层麦草填满空隙
  for (let i = 0; i < 10; i++) {
    const x = ox + hash2(gtx * 31 + i, gty * 11, seed) * TILE;
    const baseY = oy + 8 + hash2(gtx * 11, gty * 31 + i, seed) * (TILE - 8);
    const ih = 4 + Math.round(hash2(gtx + i * 2, gty, seed) * 4);
    for (let yy = 0; yy < ih; yy++) setPx(data, dim, x, baseY - yy, TIER[0].sd);
  }
  // 麦秆：按基部 y 排序，后排先画 → 前排叠上 = 景深
  const stalks: { x: number; baseY: number; h: number; lean: number }[] = [];
  for (let i = 0; i < STALKS; i++) {
    stalks.push({
      x: ox + hash2(gtx * 23 + i, gty * 7, seed) * TILE,
      baseY: oy + 7 + hash2(gtx * 7, gty * 23 + i, seed) * (TILE - 6),
      h: 9 + hash2(gtx + i, gty + i * 3, seed) * 9,
      lean: (hash2(gtx * 5 + i, gty * 5 + i, seed) - 0.5) * 5,
    });
  }
  stalks.sort((a, b) => a.baseY - b.baseY);
  for (const s of stalks) {
    const T = TIER[(s.baseY - oy) / TILE < 0.5 ? 0 : 1];
    const ih = Math.round(s.h);
    setPx(data, dim, s.x, s.baseY, STALK_SHADOW);
    for (let yy = 1; yy <= ih; yy++) {
      const t = yy / ih;
      setPx(data, dim, s.x + s.lean * t, s.baseY - yy, t < 0.34 ? T.sd : t < 0.72 ? T.sm : T.sl);
    }
    const gx = s.x + s.lean;
    const gy = s.baseY - ih;
    setPx(data, dim, gx, gy - 1, T.gl);
    setPx(data, dim, gx, gy, T.gm);
    setPx(data, dim, gx, gy + 1, T.gd);
    setPx(data, dim, gx + 1, gy - 1, T.gm);
    setPx(data, dim, gx + 1, gy, T.gl);
    setPx(data, dim, gx + 1, gy + 1, T.gm);
    setPx(data, dim, gx, gy - 2, T.gh);
  }
}

// —— 各地形立体画法（与 tools/render-tiles.mjs 校对一致）——
function drawPlain(d: Uint8ClampedArray, m: number, ox: number, oy: number, gx: number, gy: number, s: number): void {
  fillR(d, m, ox, oy, TILE, TILE, [21, 19, 31]);
  for (let i = 0; i < 5; i++) {
    const x = ox + hash2(gx * 9 + i, gy * 5, s) * TILE;
    const by = oy + 9 + hash2(gx, gy * 9 + i, s) * (TILE - 9);
    const h = 3 + Math.round(hash2(gx + i, gy, s) * 4);
    for (let yy = 0; yy < h; yy++) setPx(d, m, x, by - yy, yy >= h - 1 ? [60, 66, 82] : [36, 40, 52]);
  }
  for (let i = 0; i < 2; i++) {
    const x = ox + 2 + hash2(gx * 7 + i, gy, s) * (TILE - 4);
    const y = oy + 2 + hash2(gx, gy * 7 + i, s) * (TILE - 4);
    fillR(d, m, x, y, 2, 2, [42, 40, 52]);
    setPx(d, m, x, y, [60, 58, 72]);
    setPx(d, m, x + 1, y + 1, [12, 11, 18]);
  }
}
function drawBog(d: Uint8ClampedArray, m: number, ox: number, oy: number, gx: number, gy: number, s: number): void {
  // 沼泽：murky 绿水/泥 噪声底（冒泡在 drawOverlay 里逐帧叠加动画）
  for (let yy = 0; yy < TILE; yy++) {
    for (let xx = 0; xx < TILE; xx++) {
      const n = vnoise((gx * TILE + xx) * 0.16, (gy * TILE + yy) * 0.16, s ^ 0x33);
      setPx(d, m, ox + xx, oy + yy, n < 0.4 ? [13, 19, 14] : n > 0.62 ? [30, 36, 22] : [20, 27, 18]);
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = ox + hash2(gx * 9 + i, gy, s) * TILE;
    const y = oy + hash2(gx, gy * 9 + i, s) * TILE;
    fillR(d, m, x, y, 2, 2, [44, 58, 32]);
    setPx(d, m, x, y, [64, 84, 44]);
  }
}
function drawBoneyard(d: Uint8ClampedArray, m: number, ox: number, oy: number, gx: number, gy: number, s: number): void {
  fillR(d, m, ox, oy, TILE, TILE, [29, 28, 34]);
  for (let i = 0; i < 3; i++) {
    const x = ox + hash2(gx * 9 + i, gy, s) * (TILE - 6);
    const y = oy + 4 + hash2(gx, gy * 9 + i, s) * (TILE - 6);
    const len = 4 + Math.round(hash2(gx + i, gy, s) * 4);
    fillR(d, m, x, y + 2, len, 1, [18, 17, 22]);
    fillR(d, m, x, y, len, 2, [82, 78, 60]);
    for (let k = 0; k < len; k++) setPx(d, m, x + k, y, [110, 105, 84]);
  }
  if (hash2(gx, gy, s) > 0.5) {
    const x = ox + 4 + hash2(gx * 3, gy, s) * 12;
    const y = oy + 6 + hash2(gx, gy * 3, s) * 10;
    fillR(d, m, x, y + 4, 5, 1, [16, 15, 20]);
    fillR(d, m, x, y, 5, 4, [92, 88, 68]);
    for (let k = 0; k < 5; k++) setPx(d, m, x + k, y, [120, 114, 90]);
    setPx(d, m, x + 1, y + 2, [22, 20, 24]);
    setPx(d, m, x + 3, y + 2, [22, 20, 24]);
  }
}
function drawBlight(d: Uint8ClampedArray, m: number, ox: number, oy: number, gx: number, gy: number, s: number): void {
  fillR(d, m, ox, oy, TILE, TILE, [26, 16, 36]);
  for (let i = 0; i < 3; i++) {
    let x = ox + hash2(gx * 9 + i, gy, s) * TILE;
    let y = oy + hash2(gx, gy * 9 + i, s) * TILE;
    for (let k = 0; k < 6; k++) {
      setPx(d, m, x, y, [8, 4, 12]);
      setPx(d, m, x + 1, y, [150, 56, 170]);
      x += (hash2(gx + k, gy + i, s) - 0.5) * 2;
      y += 1;
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = ox + hash2(gx * 5 + i, gy * 3, s) * TILE;
    const y = oy + hash2(gx * 3, gy * 5 + i, s) * TILE;
    fillR(d, m, x, y, 2, 2, [58, 30, 62]);
    setPx(d, m, x, y, [92, 52, 100]);
    setPx(d, m, x + 1, y + 1, [14, 8, 18]);
  }
}
function drawRuins(d: Uint8ClampedArray, m: number, ox: number, oy: number, gx: number, gy: number, s: number): void {
  // 石头山：圆润巨岩，上亮下暗 + 投影，叠成挡路岩堆
  fillR(d, m, ox, oy, TILE, TILE, [18, 19, 25]);
  const b: { bx: number; by: number; rad: number }[] = [];
  for (let i = 0; i < 3; i++) {
    b.push({
      bx: ox + 3 + hash2(gx * 13 + i, gy * 5, s) * (TILE - 6),
      by: oy + 3 + hash2(gx * 5, gy * 13 + i, s) * (TILE - 6),
      rad: 4 + Math.round(hash2(gx + i, gy, s) * 4),
    });
  }
  b.sort((p, q) => p.by - q.by);
  for (const { bx, by, rad } of b) {
    for (let xx = -rad; xx <= rad; xx++) setPx(d, m, bx + xx, by + rad + 1, [10, 10, 14]); // 投影
    for (let yy = -rad; yy <= rad; yy++) {
      for (let xx = -rad; xx <= rad; xx++) {
        if (xx * xx + yy * yy > rad * rad) continue;
        const t = (yy + rad) / (2 * rad);
        setPx(d, m, bx + xx, by + yy, t < 0.22 ? [80, 83, 94] : t < 0.5 ? [54, 56, 65] : t < 0.78 ? [36, 37, 45] : [22, 23, 29]);
      }
    }
    setPx(d, m, bx - 1, by - rad + 1, [100, 104, 116]); // 顶高光
  }
}
function drawHallowed(d: Uint8ClampedArray, m: number, ox: number, oy: number, gx: number, gy: number, s: number): void {
  // 圣地：苍白大理石 + 中央柔光 + 双符文环
  const cx = ox + TILE / 2;
  const cy = oy + TILE / 2;
  for (let yy = 0; yy < TILE; yy++) {
    for (let xx = 0; xx < TILE; xx++) {
      const n = vnoise((gx * TILE + xx) * 0.2, (gy * TILE + yy) * 0.2, s ^ 0x77);
      const dist = Math.hypot(ox + xx - cx, oy + yy - cy);
      let c: RGB = dist < 8 ? [54, 62, 84] : dist < 12 ? [44, 52, 72] : [34, 40, 56];
      if (n > 0.66) c = [60, 70, 92];
      setPx(d, m, ox + xx, oy + yy, c);
    }
  }
  const rings: [number, RGB][] = [[6, [152, 184, 230]], [9, [104, 130, 176]]];
  for (const [R, col] of rings) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      setPx(d, m, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, col);
    }
  }
  setPx(d, m, cx, cy, [184, 210, 244]);
}
function drawMoonwell(d: Uint8ClampedArray, m: number, ox: number, oy: number, gx: number, gy: number, s: number): void {
  // 水：无缝纹理（用全局像素坐标，对角波纹跨格连续）
  for (let yy = 0; yy < TILE; yy++) {
    for (let xx = 0; xx < TILE; xx++) {
      const wx = gx * TILE + xx;
      const wy = gy * TILE + yy;
      const n = vnoise(wx * 0.13, wy * 0.13, s ^ 0x55);
      const n2 = vnoise(wx * 0.34 + 9, wy * 0.31 + 3, s ^ 0xaa);
      const wave = Math.sin(wx * 0.45 + wy * 0.28 + n * 4);
      let c: RGB = [12, 20, 38];
      if (n > 0.4) c = [20, 32, 56];
      if (n > 0.58) c = [28, 46, 74];
      if (wave > 0.5) c = [42, 66, 102];
      if (wave > 0.82 && n2 > 0.6) c = [80, 118, 160];
      setPx(d, m, ox + xx, oy + yy, c);
    }
  }
}

function paintTileData(data: Uint8ClampedArray, dim: number, lx: number, ly: number, kind: TerrainKind, gtx: number, gty: number, seed: number): void {
  switch (kind) {
    case 'crop':
      fillR(data, dim, lx, ly, TILE, TILE, EARTH);
      drawWheatTile(data, dim, lx, ly, gtx, gty, seed);
      break;
    case 'bog':
      drawBog(data, dim, lx, ly, gtx, gty, seed);
      break;
    case 'boneyard':
      drawBoneyard(data, dim, lx, ly, gtx, gty, seed);
      break;
    case 'blight':
      drawBlight(data, dim, lx, ly, gtx, gty, seed);
      break;
    case 'ruins':
      drawRuins(data, dim, lx, ly, gtx, gty, seed);
      break;
    case 'hallowed':
      drawHallowed(data, dim, lx, ly, gtx, gty, seed);
      break;
    case 'moonwell':
      drawMoonwell(data, dim, lx, ly, gtx, gty, seed);
      break;
    default:
      drawPlain(data, dim, lx, ly, gtx, gty, seed);
      break;
  }
}

export class Terrain {
  private readonly seed: number;
  private readonly harvested = new Set<number>(); // 已割麦浪格（数值 key，无分配）
  private readonly cache = new Map<string, HTMLCanvasElement>();

  constructor(seed: number) {
    this.seed = seed | 0;
  }

  reset(): void {
    this.harvested.clear();
    this.cache.clear();
  }

  private tileKey(tx: number, ty: number): number {
    // 24-bit 有符号偏移打包，|t| < 8M 内无碰撞，落在安全整数范围
    return (tx + 0x800000) * 0x1000000 + (ty + 0x800000);
  }

  // 基础地形（不含已割状态）
  private baseKindAt(tx: number, ty: number): TerrainKind {
    if (Math.abs(tx) <= GEN.safeRadiusTiles && Math.abs(ty) <= GEN.safeRadiusTiles) return 'plain';
    if (vnoise(tx * GEN.specialFreq, ty * GEN.specialFreq, this.seed ^ 0x7abcdef) > GEN.hallowed) return 'hallowed';
    if (vnoise(tx * GEN.specialFreq, ty * GEN.specialFreq, this.seed ^ 0x1234567) > GEN.moonwell) return 'moonwell';
    if (vnoise(tx * GEN.specialFreq, ty * GEN.specialFreq, this.seed ^ 0x5f5f5f) > GEN.ruins) return 'ruins';
    const b = vnoise(tx * GEN.biomeFreq, ty * GEN.biomeFreq, this.seed);
    for (let i = 0; i < GEN.bands.length; i++) if (b < GEN.bands[i].max) return GEN.bands[i].k;
    return 'plain';
  }

  /** 世界坐标 → 地形类型（已割麦浪视为 plain）。O(1) */
  kindAt(wx: number, wy: number): TerrainKind {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    const k = this.baseKindAt(tx, ty);
    if (k === 'crop' && this.harvested.has(this.tileKey(tx, ty))) return 'plain';
    return k;
  }

  defAt(wx: number, wy: number): TerrainDef {
    return TERRAIN[this.kindAt(wx, wy)];
  }
  speedMulAt(wx: number, wy: number): number {
    return TERRAIN[this.kindAt(wx, wy)].speedMul;
  }
  enemySpeedMulAt(wx: number, wy: number): number {
    return TERRAIN[this.kindAt(wx, wy)].enemySpeedMul;
  }
  blocksAt(wx: number, wy: number): boolean {
    return TERRAIN[this.kindAt(wx, wy)].blocks;
  }

  /** 尝试收割该点麦浪：成功返回 true（调用方掉魂），并更新缓存区块的该格渲染 */
  tryHarvest(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (this.baseKindAt(tx, ty) !== 'crop') return false;
    const key = this.tileKey(tx, ty);
    if (this.harvested.has(key)) return false;
    this.harvested.add(key);
    this.repaintTile(tx, ty); // 把已缓存区块里这格改画成已割地面
    return true;
  }

  // —— 渲染 ——

  // 收割后把该格重画成已割地面（plain），直接改活动区块画布的这一格
  private repaintTile(tx: number, ty: number): void {
    const cx = Math.floor(tx / CHUNK);
    const cy = Math.floor(ty / CHUNK);
    const canvas = this.cache.get(`${cx},${cy}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const lx = (tx - cx * CHUNK) * TILE;
    const ly = (ty - cy * CHUNK) * TILE;
    const def = TERRAIN.plain;
    ctx.fillStyle = def.base;
    ctx.fillRect(lx, ly, TILE, TILE);
    ctx.fillStyle = def.accent;
    for (let i = 0; i < 3; i++) {
      const px = lx + Math.floor(hash2(tx * 3 + i, ty, this.seed) * TILE);
      const py = ly + Math.floor(hash2(tx, ty * 3 + i, this.seed) * TILE);
      ctx.fillRect(px, py, 1, 1);
    }
  }

  private getChunk(cx: number, cy: number): HTMLCanvasElement {
    const id = `${cx},${cy}`;
    const cached = this.cache.get(id);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_PX;
    canvas.height = CHUNK_PX;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(CHUNK_PX, CHUNK_PX);
    const data = img.data;
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const gtx = cx * CHUNK + tx;
        const gty = cy * CHUNK + ty;
        let kind = this.baseKindAt(gtx, gty);
        if (kind === 'crop' && this.harvested.has(this.tileKey(gtx, gty))) kind = 'plain';
        paintTileData(data, CHUNK_PX, tx * TILE, ty * TILE, kind, gtx, gty, this.seed);
      }
    }
    ctx.putImageData(img, 0, 0);
    this.cache.set(id, canvas);
    return canvas;
  }

  /** 绘制可见区块（主循环只 drawImage 区块画布） */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, scale: number, viewW: number, viewH: number): void {
    const minCx = Math.floor(cam.x / CHUNK_PX);
    const maxCx = Math.floor((cam.x + viewW) / CHUNK_PX);
    const minCy = Math.floor(cam.y / CHUNK_PX);
    const maxCy = Math.floor((cam.y + viewH) / CHUNK_PX);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const canvas = this.getChunk(cx, cy);
        const sxp = Math.round((cx * CHUNK_PX - cam.x) * scale);
        const syp = Math.round((cy * CHUNK_PX - cam.y) * scale);
        ctx.drawImage(canvas, sxp, syp, CHUNK_PX * scale, CHUNK_PX * scale);
      }
    }
    // 缓存回收：超额时清掉视野外的区块
    if (this.cache.size > CACHE_LIMIT) {
      for (const id of this.cache.keys()) {
        const [icx, icy] = id.split(',');
        const ncx = Number(icx);
        const ncy = Number(icy);
        if (ncx < minCx - 1 || ncx > maxCx + 1 || ncy < minCy - 1 || ncy > maxCy + 1) {
          this.cache.delete(id);
          if (this.cache.size <= CACHE_LIMIT) break;
        }
      }
    }
  }

  /** 逐帧动画覆盖层（沼泽冒泡 / 水面微光），画在静态地形之上、实体之下 */
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera, scale: number, viewW: number, viewH: number, time: number): void {
    const t0x = Math.floor(cam.x / TILE) - 1;
    const t1x = Math.floor((cam.x + viewW) / TILE) + 1;
    const t0y = Math.floor(cam.y / TILE) - 1;
    const t1y = Math.floor((cam.y + viewH) / TILE) + 1;
    for (let ty = t0y; ty <= t1y; ty++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const k = this.baseKindAt(tx, ty);
        if (k === 'bog') this.drawBubbles(ctx, tx, ty, cam, scale, time);
        else if (k === 'moonwell') this.drawGlints(ctx, tx, ty, cam, scale, time);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, tx: number, ty: number, cam: Camera, scale: number, time: number): void {
    for (let i = 0; i < 3; i++) {
      const hx = hash2(tx * 7 + i, ty * 3, this.seed);
      const sp = 0.35 + hash2(tx + i, ty, this.seed) * 0.45;
      const phase = (time * sp + hx) % 1;
      const px = (tx * TILE + 4 + hx * (TILE - 8) - cam.x) * scale;
      const py = (ty * TILE + TILE - 3 - phase * (TILE - 7) - cam.y) * scale;
      const r = (1 + phase * 2.2) * scale * 0.5;
      if (phase < 0.82) {
        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(phase * Math.PI);
        ctx.fillStyle = '#5a7e44';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9ad078';
        ctx.beginPath();
        ctx.arc(px - r * 0.3, py - r * 0.3, Math.max(1, r * 0.32), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = ((1 - phase) / 0.18) * 0.55;
        ctx.strokeStyle = '#7a9a58';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, r * 1.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawGlints(ctx: CanvasRenderingContext2D, tx: number, ty: number, cam: Camera, scale: number, time: number): void {
    for (let i = 0; i < 2; i++) {
      const hx = hash2(tx * 5 + i, ty, this.seed);
      const hy = hash2(tx, ty * 5 + i, this.seed);
      const wx = tx * TILE + hx * TILE;
      const wy = ty * TILE + hy * TILE + Math.sin(time * 1.8 + hx * 6) * 1.5;
      ctx.globalAlpha = 0.16 + 0.18 * (0.5 + 0.5 * Math.sin(time * 2.4 + hy * 7));
      ctx.fillStyle = '#9fc4e8';
      ctx.fillRect((wx - cam.x) * scale, (wy - cam.y) * scale, scale, scale);
    }
  }
}
