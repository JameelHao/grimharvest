import type { Camera } from '../core/camera';
import { TILE, CHUNK, GEN, TERRAIN, type TerrainKind, type TerrainDef } from '../data/terrain';

// 地形系统：无限田野按「连续世界坐标」确定性生成——地形边界跟随噪声等高线，是**有机不规则块**而非方格。
// 渲染：区块离屏预渲染（逐像素有机地表 + 特征散布），主循环只 drawImage；动画在 drawOverlay 逐帧叠加。
// 查询 kindAt 走纯函数，零分配（架构红线）。

const CHUNK_PX = CHUNK * TILE;
const CACHE_LIMIT = 32;
const FIELD_STEP = 6; // 粗采样噪声场步长（再双线性插值到每像素，省算力）
const FEATURE_STEP = 4; // 特征散布间距

type RGB = [number, number, number];
const BF = GEN.biomeFreq / TILE; // 转成「每世界单位」频率 → 连续
const SF = GEN.specialFreq / TILE;
const SAFE = GEN.safeRadiusTiles * TILE;

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
function bilerp(f: Float32Array, o: number, g: number, fx: number, fy: number): number {
  const a = f[o];
  const b = f[o + 1];
  const c = f[o + g];
  const d = f[o + g + 1];
  const t = a + (b - a) * fx;
  const bt = c + (d - c) * fx;
  return t + (bt - t) * fy;
}

/** 连续世界坐标 → 地形类型（不含已割状态）。组织成有机区块。 */
function typeAtWorld(wx: number, wy: number, seed: number): TerrainKind {
  if (wx >= -SAFE && wx <= SAFE && wy >= -SAFE && wy <= SAFE) return 'plain';
  if (vnoise(wx * SF, wy * SF, seed ^ 0x7abcdef) > GEN.hallowed) return 'hallowed';
  if (vnoise(wx * SF, wy * SF, seed ^ 0x1234567) > GEN.moonwell) return 'moonwell';
  if (vnoise(wx * SF, wy * SF, seed ^ 0x5f5f5f) > GEN.ruins) return 'ruins';
  const b = vnoise(wx * BF, wy * BF, seed);
  for (let i = 0; i < GEN.bands.length; i++) if (b < GEN.bands[i].max) return GEN.bands[i].k;
  return 'plain';
}

// —— 逐像素地表底色（水/沼泽/圣地带噪声纹理，其余近平色带轻微起伏）——
function baseColorAt(kind: TerrainKind, wx: number, wy: number, seed: number): RGB {
  switch (kind) {
    case 'crop':
      return [26, 22, 12];
    case 'bog': {
      const n = vnoise(wx * 0.16, wy * 0.16, seed ^ 0x33);
      return n < 0.4 ? [13, 19, 14] : n > 0.62 ? [30, 36, 22] : [20, 27, 18];
    }
    case 'boneyard': {
      const n = vnoise(wx * 0.12, wy * 0.12, seed ^ 0x44);
      return n > 0.6 ? [33, 32, 38] : [29, 28, 34];
    }
    case 'blight': {
      const n = vnoise(wx * 0.14, wy * 0.14, seed ^ 0x66);
      return n > 0.62 ? [32, 18, 42] : [26, 16, 36];
    }
    case 'ruins':
      return [18, 19, 25];
    case 'hallowed': {
      const n = vnoise(wx * 0.2, wy * 0.2, seed ^ 0x77);
      const g = vnoise(wx * 0.045, wy * 0.045, seed ^ 0x88);
      const c: RGB = g > 0.55 ? [50, 58, 80] : [38, 44, 60];
      return n > 0.66 ? [62, 72, 94] : c;
    }
    case 'moonwell': {
      const n = vnoise(wx * 0.13, wy * 0.13, seed ^ 0x55);
      const n2 = vnoise(wx * 0.34 + 9, wy * 0.31 + 3, seed ^ 0xaa);
      const wave = Math.sin(wx * 0.45 + wy * 0.28 + n * 4);
      let c: RGB = [12, 20, 38];
      if (n > 0.4) c = [20, 32, 56];
      if (n > 0.58) c = [28, 46, 74];
      if (wave > 0.5) c = [42, 66, 102];
      if (wave > 0.82 && n2 > 0.6) c = [80, 118, 160];
      return c;
    }
    default:
      return [21, 19, 31]; // plain（占比最大，扁平底 + 草丛特征，省逐像素噪声）
  }
}

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

// 麦穗景深调色
const STALK_SHADOW: RGB = [12, 10, 5];
const TIER = [
  { sd: [54, 46, 22] as RGB, sm: [82, 70, 34] as RGB, sl: [110, 94, 42] as RGB, gd: [104, 84, 36] as RGB, gm: [140, 112, 48] as RGB, gl: [178, 144, 60] as RGB, gh: [200, 168, 84] as RGB },
  { sd: [72, 60, 26] as RGB, sm: [106, 90, 40] as RGB, sl: [144, 120, 50] as RGB, gd: [138, 108, 44] as RGB, gm: [184, 148, 60] as RGB, gl: [226, 186, 76] as RGB, gh: [250, 220, 116] as RGB },
];

// —— 单点特征绘制（散布在对应有机区域里）——
function drawStalk(d: Uint8ClampedArray, m: number, cx: number, by: number, seed: number): void {
  const ix = cx | 0;
  const iy = by | 0;
  const T = TIER[hash2(ix, iy, seed) < 0.5 ? 0 : 1];
  const ih = Math.round(8 + hash2(ix, iy + 3, seed) * 9);
  const lean = (hash2(ix + 5, iy, seed) - 0.5) * 5;
  setPx(d, m, cx, by, STALK_SHADOW);
  for (let yy = 1; yy <= ih; yy++) {
    const t = yy / ih;
    setPx(d, m, cx + lean * t, by - yy, t < 0.34 ? T.sd : t < 0.72 ? T.sm : T.sl);
  }
  const gx = cx + lean;
  const gy = by - ih;
  setPx(d, m, gx, gy - 1, T.gl);
  setPx(d, m, gx, gy, T.gm);
  setPx(d, m, gx, gy + 1, T.gd);
  setPx(d, m, gx + 1, gy - 1, T.gm);
  setPx(d, m, gx + 1, gy, T.gl);
  setPx(d, m, gx + 1, gy + 1, T.gm);
  setPx(d, m, gx, gy - 2, T.gh);
}
function drawGrass(d: Uint8ClampedArray, m: number, x: number, y: number, seed: number): void {
  const h = 3 + Math.round(hash2(x | 0, y | 0, seed) * 3);
  for (let yy = 0; yy < h; yy++) setPx(d, m, x, y - yy, yy >= h - 1 ? [60, 66, 82] : [36, 40, 52]);
}
function drawPebble(d: Uint8ClampedArray, m: number, x: number, y: number): void {
  fillR(d, m, x, y, 2, 2, [42, 40, 52]);
  setPx(d, m, x, y, [60, 58, 72]);
  setPx(d, m, x + 1, y + 1, [12, 11, 18]);
}
function drawBone(d: Uint8ClampedArray, m: number, x: number, y: number, seed: number): void {
  const len = 4 + Math.round(hash2(x | 0, y | 0, seed) * 4);
  fillR(d, m, x, y + 2, len, 1, [18, 17, 22]);
  fillR(d, m, x, y, len, 2, [82, 78, 60]);
  for (let k = 0; k < len; k++) setPx(d, m, x + k, y, [110, 105, 84]);
}
function drawScum(d: Uint8ClampedArray, m: number, x: number, y: number): void {
  fillR(d, m, x, y, 2, 2, [44, 58, 32]);
  setPx(d, m, x, y, [64, 84, 44]);
}
function drawCrust(d: Uint8ClampedArray, m: number, x: number, y: number, seed: number): void {
  fillR(d, m, x, y, 2, 2, [58, 30, 62]);
  setPx(d, m, x, y, [92, 52, 100]);
  setPx(d, m, x + 1, y + 1, [14, 8, 18]);
  if (hash2(x | 0, y | 0, seed) > 0.55) {
    let cx = x;
    let cy = y;
    for (let k = 0; k < 4; k++) {
      setPx(d, m, cx, cy, [8, 4, 12]);
      setPx(d, m, cx + 1, cy, [150, 56, 170]);
      cx += (hash2(cx | 0, cy | 0, seed) - 0.5) * 2;
      cy += 1;
    }
  }
}
function drawBoulder(d: Uint8ClampedArray, m: number, bx: number, by: number, seed: number): void {
  const rad = 3 + Math.round(hash2(bx | 0, by | 0, seed) * 3);
  for (let xx = -rad; xx <= rad; xx++) setPx(d, m, bx + xx, by + rad + 1, [10, 10, 14]);
  for (let yy = -rad; yy <= rad; yy++) {
    for (let xx = -rad; xx <= rad; xx++) {
      if (xx * xx + yy * yy > rad * rad) continue;
      const t = (yy + rad) / (2 * rad);
      setPx(d, m, bx + xx, by + yy, t < 0.22 ? [80, 83, 94] : t < 0.5 ? [54, 56, 65] : t < 0.78 ? [36, 37, 45] : [22, 23, 29]);
    }
  }
  setPx(d, m, bx - 1, by - rad + 1, [100, 104, 116]);
}
function drawSparkle(d: Uint8ClampedArray, m: number, x: number, y: number): void {
  setPx(d, m, x, y, [184, 210, 244]);
  setPx(d, m, x + 1, y, [120, 150, 200]);
}
function drawFeatureAt(d: Uint8ClampedArray, m: number, kind: TerrainKind, x: number, y: number, seed: number, h: number): void {
  switch (kind) {
    case 'crop':
      if (h < 0.82) drawStalk(d, m, x, y, seed);
      break;
    case 'plain':
      if (h < 0.04) drawGrass(d, m, x, y, seed);
      else if (h < 0.06) drawPebble(d, m, x, y);
      break;
    case 'boneyard':
      if (h < 0.16) drawBone(d, m, x, y, seed);
      break;
    case 'bog':
      if (h < 0.14) drawScum(d, m, x, y);
      break;
    case 'blight':
      if (h < 0.2) drawCrust(d, m, x, y, seed);
      break;
    case 'ruins':
      if (h < 0.24) drawBoulder(d, m, x, y, seed);
      break;
    case 'hallowed':
      if (h < 0.1) drawSparkle(d, m, x, y);
      break;
    default:
      break;
  }
}

export class Terrain {
  private readonly seed: number;
  private readonly harvested = new Set<number>();
  private readonly cache = new Map<string, HTMLCanvasElement>();

  constructor(seed: number) {
    this.seed = seed | 0;
  }

  reset(): void {
    this.harvested.clear();
    this.cache.clear();
  }

  private tileKey(tx: number, ty: number): number {
    return (tx + 0x800000) * 0x1000000 + (ty + 0x800000);
  }

  /** 世界坐标 → 地形类型（已割麦浪视为 plain）。O(1) */
  kindAt(wx: number, wy: number): TerrainKind {
    const k = typeAtWorld(wx, wy, this.seed);
    if (k === 'crop' && this.harvested.has(this.tileKey(Math.floor(wx / TILE), Math.floor(wy / TILE)))) return 'plain';
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

  /** 收割该点麦浪：成功返回 true，并把缓存区块该格重画成割后留茬 */
  tryHarvest(wx: number, wy: number): boolean {
    if (typeAtWorld(wx, wy, this.seed) !== 'crop') return false;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    const key = this.tileKey(tx, ty);
    if (this.harvested.has(key)) return false;
    this.harvested.add(key);
    this.repaintTile(tx, ty);
    return true;
  }

  private repaintTile(tx: number, ty: number): void {
    const cx = Math.floor(tx / CHUNK);
    const cy = Math.floor(ty / CHUNK);
    const canvas = this.cache.get(`${cx},${cy}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const lx = (tx - cx * CHUNK) * TILE;
    const ly = (ty - cy * CHUNK) * TILE;
    ctx.fillStyle = '#1c1a24'; // 割后留茬地面
    ctx.fillRect(lx, ly, TILE, TILE);
    ctx.fillStyle = '#3a3422';
    for (let i = 0; i < 8; i++) {
      const x = lx + Math.floor(hash2(tx * 3 + i, ty, this.seed) * TILE);
      const y = ly + Math.floor(hash2(tx, ty * 3 + i, this.seed) * TILE);
      ctx.fillRect(x, y, 1, 2);
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
    const seed = this.seed;
    const baseX = cx * CHUNK_PX;
    const baseY = cy * CHUNK_PX;

    // 粗采样 4 个噪声场（再每像素双线性插值，避免逐像素 4 次 vnoise）
    const G = Math.floor(CHUNK_PX / FIELD_STEP) + 2;
    const fb = new Float32Array(G * G);
    const fH = new Float32Array(G * G);
    const fM = new Float32Array(G * G);
    const fR = new Float32Array(G * G);
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const wx = baseX + gx * FIELD_STEP;
        const wy = baseY + gy * FIELD_STEP;
        const o = gy * G + gx;
        fb[o] = vnoise(wx * BF, wy * BF, seed);
        fH[o] = vnoise(wx * SF, wy * SF, seed ^ 0x7abcdef);
        fM[o] = vnoise(wx * SF, wy * SF, seed ^ 0x1234567);
        fR[o] = vnoise(wx * SF, wy * SF, seed ^ 0x5f5f5f);
      }
    }

    // 逐像素有机地表
    for (let py = 0; py < CHUNK_PX; py++) {
      for (let px = 0; px < CHUNK_PX; px++) {
        const wx = baseX + px;
        const wy = baseY + py;
        let kind: TerrainKind = 'plain';
        if (wx < -SAFE || wx > SAFE || wy < -SAFE || wy > SAFE) {
          const gxf = px / FIELD_STEP;
          const gyf = py / FIELD_STEP;
          const ixx = gxf | 0;
          const iyy = gyf | 0;
          const fx = gxf - ixx;
          const fy = gyf - iyy;
          const o = iyy * G + ixx;
          if (bilerp(fH, o, G, fx, fy) > GEN.hallowed) kind = 'hallowed';
          else if (bilerp(fM, o, G, fx, fy) > GEN.moonwell) kind = 'moonwell';
          else if (bilerp(fR, o, G, fx, fy) > GEN.ruins) kind = 'ruins';
          else {
            const b = bilerp(fb, o, G, fx, fy);
            for (let i = 0; i < GEN.bands.length; i++) {
              if (b < GEN.bands[i].max) {
                kind = GEN.bands[i].k;
                break;
              }
            }
          }
        }
        if (kind === 'crop' && this.harvested.has(this.tileKey(Math.floor(wx / TILE), Math.floor(wy / TILE)))) kind = 'plain';
        const c = baseColorAt(kind, wx, wy, seed);
        const di = (py * CHUNK_PX + px) * 4;
        data[di] = c[0];
        data[di + 1] = c[1];
        data[di + 2] = c[2];
        data[di + 3] = 255;
      }
    }

    // 特征散布（按精确类型，跟随有机区域；扫描序从上到下 → 下方覆盖上方 = 景深）
    for (let py = 0; py < CHUNK_PX; py += FEATURE_STEP) {
      for (let px = 0; px < CHUNK_PX; px += FEATURE_STEP) {
        const jx = px + (hash2(px, py, seed ^ 0x111) - 0.5) * FEATURE_STEP * 1.6;
        const jy = py + (hash2(py, px, seed ^ 0x222) - 0.5) * FEATURE_STEP * 1.6;
        const wx = baseX + jx;
        const wy = baseY + jy;
        let kind = typeAtWorld(wx, wy, seed);
        if (kind === 'crop' && this.harvested.has(this.tileKey(Math.floor(wx / TILE), Math.floor(wy / TILE)))) kind = 'plain';
        drawFeatureAt(data, CHUNK_PX, kind, jx, jy, seed, hash2(jx | 0, jy | 0, seed ^ 0x333));
      }
    }

    ctx.putImageData(img, 0, 0);
    this.cache.set(id, canvas);
    return canvas;
  }

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

  /** 逐帧动画覆盖层（沼泽冒泡 / 水面微光），按世界网格点采样，画在地表之上、实体之下 */
  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera, scale: number, viewW: number, viewH: number, time: number): void {
    const S = 14;
    const x0 = Math.floor(cam.x / S) * S - S;
    const y0 = Math.floor(cam.y / S) * S - S;
    const x1 = cam.x + viewW + S;
    const y1 = cam.y + viewH + S;
    for (let wy = y0; wy < y1; wy += S) {
      for (let wx = x0; wx < x1; wx += S) {
        const k = typeAtWorld(wx, wy, this.seed);
        if (k === 'bog') this.bubble(ctx, wx, wy, cam, scale, time);
        else if (k === 'moonwell') this.glint(ctx, wx, wy, cam, scale, time);
      }
    }
    ctx.globalAlpha = 1;
  }

  private bubble(ctx: CanvasRenderingContext2D, wx: number, wy: number, cam: Camera, scale: number, time: number): void {
    const hx = hash2(wx | 0, wy | 0, this.seed);
    const sp = 0.3 + hash2((wx | 0) + 1, wy | 0, this.seed) * 0.4;
    const phase = (time * sp + hx) % 1;
    const bx = wx + (hx - 0.5) * 6;
    const by = wy - phase * 13;
    const px = (bx - cam.x) * scale;
    const py = (by - cam.y) * scale;
    const r = (1 + phase * 2) * scale * 0.5;
    if (phase < 0.82) {
      ctx.globalAlpha = 0.4 + 0.35 * Math.sin(phase * Math.PI);
      ctx.fillStyle = '#5a7e44';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9ad078';
      ctx.beginPath();
      ctx.arc(px - r * 0.3, py - r * 0.3, Math.max(1, r * 0.32), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = ((1 - phase) / 0.18) * 0.5;
      ctx.strokeStyle = '#7a9a58';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, r * 1.7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private glint(ctx: CanvasRenderingContext2D, wx: number, wy: number, cam: Camera, scale: number, time: number): void {
    const hx = hash2(wx | 0, wy | 0, this.seed);
    const hy = hash2(wy | 0, wx | 0, this.seed);
    const gx = wx + (hx - 0.5) * 8;
    const gy = wy + Math.sin(time * 1.8 + hx * 6) * 1.5;
    ctx.globalAlpha = 0.14 + 0.18 * (0.5 + 0.5 * Math.sin(time * 2.4 + hy * 7));
    ctx.fillStyle = '#9fc4e8';
    ctx.fillRect((gx - cam.x) * scale, (gy - cam.y) * scale, scale, scale);
  }
}
