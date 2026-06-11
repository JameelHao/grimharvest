// 入口：M3 魂收割 + 升级 + 三武器。组装 World（逻辑）+ 渲染（离屏精灵 + Canvas）。
// 机制蓝图见 docs/DESIGN.md。WASD 移动；月镰自动横扫；吸魂升级三选一(月镰/飞镰/使魔)；
// 没吸到的魂会就地复生成亡者。被围死按 R 重开。
import { PLAYER, HUSK, BAT_A, BAT_B, CHARGER, SPITTER, RINGER, ELITE, BOSS, PLAYER_WALK_A, PLAYER_WALK_B } from './data/sprite-data.js';
import { prerenderSprite, prerenderSilhouette, drawSprite, type Sprite } from './core/sprite';
import { startLoop } from './core/loop';
import { Input } from './core/input';
import { Camera } from './core/camera';
import { World } from './systems/world';
import { rollReels } from './systems/upgrades';
import { showSlot, isSlotOpen } from './ui/levelup';
import { MOONSCYTHE } from './data/weapons';
import type { EnemyKind } from './data/enemies';
import type { Player } from './entities/player';
import type { Enemy } from './entities/enemy';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const PIXEL_SCALE = 3;
const VIEW_W = canvas.width / PIXEL_SCALE;
const VIEW_H = canvas.height / PIXEL_SCALE;

const reaperSprite = prerenderSprite(PLAYER);
const reaperWalkA = prerenderSprite(PLAYER_WALK_A); // 行走帧
const reaperWalkB = prerenderSprite(PLAYER_WALK_B);
const huskSprite = prerenderSprite(HUSK);
const reaperFlash = prerenderSilhouette(PLAYER, '#ffffff');
const huskFlash = prerenderSilhouette(HUSK, '#ffffff');
const batA = prerenderSprite(BAT_A); // 使魔蝙蝠：振翅两帧
const batB = prerenderSprite(BAT_B);

// 每种敌人的专属精灵 + 受击白闪 + 绘制缩放（risen 复用腐生子 + 紫染；boss 放大）
interface EnemyArt {
  spr: Sprite;
  flash: Sprite;
  scale: number;
  tint?: Sprite;
  tintA?: number;
  warn?: Sprite;
}
const ENEMY_SPR: Record<EnemyKind, EnemyArt> = {
  husk: { spr: huskSprite, flash: huskFlash, scale: 3 },
  risen: { spr: huskSprite, flash: huskFlash, scale: 3, tint: prerenderSilhouette(HUSK, '#7a3a8c'), tintA: 0.5 },
  charger: { spr: prerenderSprite(CHARGER), flash: prerenderSilhouette(CHARGER, '#ffffff'), scale: 3, warn: prerenderSilhouette(CHARGER, '#ff3a2a') },
  spitter: { spr: prerenderSprite(SPITTER), flash: prerenderSilhouette(SPITTER, '#ffffff'), scale: 3 },
  ringer: { spr: prerenderSprite(RINGER), flash: prerenderSilhouette(RINGER, '#ffffff'), scale: 3 },
  elite: { spr: prerenderSprite(ELITE), flash: prerenderSilhouette(ELITE, '#ffffff'), scale: 3 },
  boss: { spr: prerenderSprite(BOSS), flash: prerenderSilhouette(BOSS, '#ffffff'), scale: 6 },
};

// 玩家柔光 + 暗角（离屏预渲染一次，主循环只 drawImage）
const GLOW_R = 80;
const playerGlow = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = GLOW_R * 2;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(GLOW_R, GLOW_R, 0, GLOW_R, GLOW_R, GLOW_R);
  grad.addColorStop(0, 'rgba(130,200,230,0.32)');
  grad.addColorStop(1, 'rgba(130,200,230,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_R * 2, GLOW_R * 2);
  return c;
})();
const vignette = (() => {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.height * 0.32,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.72,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = grad;
  g.fillRect(0, 0, canvas.width, canvas.height);
  return c;
})();

const input = new Input();
const camera = new Camera(VIEW_W, VIEW_H);

// 每日种子挑战：种子由当日 UTC 日期派生；?seed=xxx 可覆盖（用于复现/分享）
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const params = new URLSearchParams(location.search);
const d = new Date();
const dailyKey = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const seedLabel = params.get('seed') ?? dailyKey;
const world = new World(hashStr(seedLabel));

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && (world.player.dead || world.won)) world.reset();
  if (e.code === 'KeyP') world.debugSpawn(2000); // 性能压测
});

// FPS 计数
let fpsT = performance.now();
let fpsN = 0;
let fps = 0;

// 渲染可排序缓冲（预分配）
type Mover = Player | Enemy;
const drawBuf: Mover[] = [];
let renderAlpha = 0;
function footY(m: Mover): number {
  return m.py + (m.y - m.py) * renderAlpha;
}
function byFootY(a: Mover, b: Mover): number {
  return footY(a) - footY(b);
}

// world → screen（相机以世界单位计）
function sx(wx: number): number {
  return Math.round((wx - camera.x) * PIXEL_SCALE);
}
function sy(wy: number): number {
  return Math.round((wy - camera.y) * PIXEL_SCALE);
}

// 命运轮盘的弹出/续弹
function presentSlot(): void {
  const reels = rollReels(world, world.rng, 3);
  showSlot(reels, (opt, stacks) => {
    opt.apply(world, stacks);
    if (stacks >= 3) world.applyJackpot(); // 三连额外奖励
    world.pendingLevelUps--;
    if (world.pendingLevelUps > 0) presentSlot();
    else world.paused = false;
  });
}

function update(dt: number): void {
  world.update(dt, input);
  if (!world.paused && world.pendingLevelUps > 0 && !isSlotOpen()) {
    world.paused = true;
    presentSlot();
  }
}

// —— 绘制辅助 ——
function drawField(): void {
  const TILE = 64;
  const startX = Math.floor(camera.x / TILE) * TILE;
  const startY = Math.floor(camera.y / TILE) * TILE;
  for (let wy = startY; wy < camera.y + VIEW_H + TILE; wy += TILE) {
    for (let wx = startX; wx < camera.x + VIEW_W + TILE; wx += TILE) {
      const even = (Math.floor(wx / TILE) + Math.floor(wy / TILE)) % 2 === 0;
      ctx.fillStyle = even ? '#171326' : '#1a1730';
      ctx.fillRect(sx(wx), sy(wy), TILE * PIXEL_SCALE + 1, TILE * PIXEL_SCALE + 1);
    }
  }
}

// 弯月（两圆相减，evenodd）。dir 决定缺口朝向
function crescentPath(cx: number, cy: number, r: number, dir: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + Math.cos(dir) * r * 0.55, cy + Math.sin(dir) * r * 0.55, r * 0.92, 0, Math.PI * 2, true);
}

function drawSouls(alpha: number): void {
  for (let i = 0; i < world.souls.length; i++) {
    const s = world.souls[i];
    if (!s.alive) continue;
    const ix = s.px + (s.x - s.px) * alpha;
    const iy = s.py + (s.y - s.py) * alpha;
    const x = sx(ix);
    const y = sy(iy);
    // 临近复生(life<1.5)闪红警示
    const danger = !s.attracting && s.life < 1.5;
    const pulse = 0.6 + 0.4 * Math.sin(world.time * 8 + i);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 8;
    if (danger) {
      ctx.fillStyle = '#ff6a6a';
      ctx.shadowColor = '#ff6a6a';
    } else {
      ctx.fillStyle = s.fromRisen ? '#d98cff' : '#bfe8ff';
      ctx.shadowColor = ctx.fillStyle;
    }
    const r = (s.attracting ? 4 : 3) * PIXEL_SCALE * (0.7 + 0.3 * pulse);
    crescentPath(x, y, r, world.time * 2 + i);
    ctx.fill('evenodd');
    ctx.restore();
  }
}

function drawProjectiles(alpha: number): void {
  for (let i = 0; i < world.projectiles.length; i++) {
    const pr = world.projectiles[i];
    if (!pr.alive) continue;
    const ix = pr.px + (pr.x - pr.px) * alpha;
    const iy = pr.py + (pr.y - pr.py) * alpha;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#cfe8ff';
    ctx.fillStyle = '#eaf6ff';
    crescentPath(sx(ix), sy(iy), pr.radius * PIXEL_SCALE, pr.spin);
    ctx.fill('evenodd');
    ctx.restore();
  }
}

function drawFamiliars(alpha: number): void {
  const f = world.familiar;
  if (!f) return;
  // 整体同步振翅（翅下/翅上两帧切换）
  const flap = Math.floor(world.time * 11) % 2 === 0 ? batA : batB;
  for (let k = 0; k < f.count; k++) {
    const ox = f.ox[k];
    if (ox === undefined) continue;
    const oy = f.oy[k] ?? 0;
    const opx = f.opx[k] ?? ox;
    const opy = f.opy[k] ?? oy;
    const ix = opx + (ox - opx) * alpha;
    const iy = opy + (oy - opy) * alpha;
    const flip = ox - opx < -0.01; // 向左飞则水平翻转
    drawSprite(ctx, flap, sx(ix), sy(iy), PIXEL_SCALE, flip);
  }
}

// 月牙刀光：沿挥砍扇形画一道「弯月」——两端收成尖、中间最宽的月牙形。
function drawMoonSlash(): void {
  const ms = world.moonscythe;
  if (!ms.swingActive) return;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 12 * PIXEL_SCALE;
  const prog = ms.swingT / ms.swingDur; // 1 → 0
  const R = ms.range * PIXEL_SCALE;
  const a0 = ms.swingAngle - MOONSCYTHE.arc / 2;
  const a1 = ms.swingAngle + MOONSCYTHE.arc / 2;
  const N = 18;
  const maxW = R * 0.5; // 月牙最宽处
  ctx.save();
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#bfe6ff';
  ctx.globalAlpha = prog * 0.9;
  ctx.fillStyle = '#c4e2ff';
  ctx.beginPath();
  // 外缘 a0 → a1（半径 R）
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    const px = cx + Math.cos(a) * R;
    const py = cy + Math.sin(a) * R;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  // 内缘 a1 → a0（半径随位置收窄，两端归零 = 月牙尖角）
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const w = maxW * Math.sin(t * Math.PI);
    const a = a0 + (a1 - a0) * t;
    ctx.lineTo(cx + Math.cos(a) * (R - w), cy + Math.sin(a) * (R - w));
  }
  ctx.closePath();
  ctx.fill();
  // 外缘亮边
  ctx.globalAlpha = prog;
  ctx.strokeStyle = '#eaf6ff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    const px = cx + Math.cos(a) * R;
    const py = cy + Math.sin(a) * R;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

function drawHud(): void {
  const p = world.player;
  // 血条
  const bw = 180;
  const hpFrac = p.hp / p.maxHp;
  ctx.fillStyle = '#2a2438';
  ctx.fillRect(12, 14, bw, 12);
  ctx.fillStyle = hpFrac > 0.3 ? '#b23a48' : '#e0596a';
  ctx.fillRect(12, 14, Math.round(bw * hpFrac), 12);
  ctx.strokeStyle = '#4a4360';
  ctx.strokeRect(12.5, 14.5, bw, 12);
  ctx.fillStyle = '#cfc7e0';
  ctx.font = '13px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.ceil(p.hp)}/${p.maxHp}`, 16, 24);

  // 经验条
  const xw = 180;
  const xpFrac = world.xp / world.xpToNext;
  ctx.fillStyle = '#241f3c';
  ctx.fillRect(12, 32, xw, 6);
  ctx.fillStyle = '#7fb6ff';
  ctx.fillRect(12, 32, Math.round(xw * xpFrac), 6);
  ctx.fillStyle = '#9a93b4';
  ctx.fillText(`Lv ${world.level}`, 12, 52);

  // 连击
  if (world.combo > 1) {
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(`连击 x${world.combo}`, 70, 52);
  }

  // 怨魂（诅咒货币）
  ctx.fillStyle = '#d98cff';
  ctx.fillText(`怨魂 ${world.chaff}`, 12, 70);
  // 激活中的诅咒反噬提示
  if (world.damageMult > 1.001 || world.drainPerSec > 0) {
    ctx.fillStyle = '#a86a98';
    let s = '';
    if (world.damageMult > 1.001) s += `伤害 x${world.damageMult.toFixed(2)} `;
    if (world.drainPerSec > 0) s += `失血 ${world.drainPerSec}/s`;
    ctx.fillText(s, 90, 70);
  }

  // 恐惧潮汐条（顶部居中）：平静蓝灰 → 高潮血红
  const f = world.dreadFrac();
  const dw = 160;
  const dx = (canvas.width - dw) / 2;
  ctx.fillStyle = '#2a2438';
  ctx.fillRect(dx, 14, dw, 8);
  const rr = Math.round(120 + 135 * f);
  const gg = Math.round(120 - 92 * f);
  const bb = Math.round(140 - 112 * f);
  ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
  ctx.fillRect(dx, 14, Math.round(dw * f), 8);
  ctx.strokeStyle = '#4a4360';
  ctx.strokeRect(dx + 0.5, 14.5, dw, 8);
  ctx.textAlign = 'center';
  ctx.fillStyle = f > 0.66 ? '#ff7a7a' : '#8a84a0';
  ctx.fillText(f > 0.66 ? '恐惧 · 高潮' : '恐惧', canvas.width / 2, 34);

  // 右上
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9fc07a';
  ctx.fillText(`击杀 ${world.kills}`, canvas.width - 12, 24);
  ctx.fillStyle = '#8a84a0';
  ctx.fillText(`${world.time.toFixed(1)}s`, canvas.width - 12, 42);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#6f6a85';
  ctx.fillText('WASD 移动 · 吸魂升级 · 慢一步魂会复活', 12, canvas.height - 14);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#5a5570';
  ctx.fillText(`种子 ${seedLabel} · ${world.aliveCount()} 敌 · ${fps} FPS`, canvas.width - 12, canvas.height - 14);
}

function drawGameOver(): void {
  ctx.fillStyle = 'rgba(8,6,12,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d8607a';
  ctx.font = '28px ui-monospace, monospace';
  ctx.fillText('你倒下了', canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillStyle = '#cfc7e0';
  ctx.font = '15px ui-monospace, monospace';
  ctx.fillText(
    `Lv ${world.level} · 收割 ${world.kills} · ${world.time.toFixed(1)} 秒`,
    canvas.width / 2,
    canvas.height / 2 + 22,
  );
  ctx.fillStyle = '#8a84a0';
  ctx.fillText('按 R 重新开始', canvas.width / 2, canvas.height / 2 + 48);
}

// 漂浮的尘埃/萤火，向上缓缓飘动，营造夜色氛围
function drawAmbient(): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#7a8aac';
  for (let i = 0; i < 28; i++) {
    const seed = i * 97.3;
    const x = ((Math.sin(seed) * 0.5 + 0.5) * canvas.width + Math.sin(world.time * 0.25 + seed) * 18) % canvas.width;
    let y = (Math.cos(seed) * 0.5 + 0.5) * canvas.height - world.time * 8 - seed * 13;
    y = ((y % canvas.height) + canvas.height) % canvas.height;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

function drawParticles(): void {
  for (let i = 0; i < world.particles.length; i++) {
    const p = world.particles[i];
    if (!p.alive) continue;
    const k = p.life / p.maxLife; // 1 → 0
    const s = Math.max(1, p.size * PIXEL_SCALE * k);
    ctx.globalAlpha = Math.min(1, k);
    ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
    ctx.fillRect(sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawEnemyShots(alpha: number): void {
  for (let i = 0; i < world.enemyShots.length; i++) {
    const sh = world.enemyShots[i];
    if (!sh.alive) continue;
    const ix = sh.px + (sh.x - sh.px) * alpha;
    const iy = sh.py + (sh.y - sh.py) * alpha;
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#b06aff';
    ctx.fillStyle = '#c89aff';
    ctx.beginPath();
    ctx.arc(sx(ix), sy(iy), sh.radius * PIXEL_SCALE, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBossBar(): void {
  const boss = world.boss;
  if (!boss) return;
  const bw = 360;
  const bx = (canvas.width - bw) / 2;
  const by = canvas.height - 40;
  ctx.fillStyle = '#2a1a2a';
  ctx.fillRect(bx, by, bw, 12);
  ctx.fillStyle = '#b03a6a';
  ctx.fillRect(bx, by, Math.round((bw * Math.max(0, boss.hp)) / boss.maxHp), 12);
  ctx.strokeStyle = '#6a3a5a';
  ctx.strokeRect(bx + 0.5, by + 0.5, bw, 12);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0a0c0';
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText('镰影 THE HARVESTMAN', canvas.width / 2, by - 6);
}

function drawVictory(): void {
  ctx.fillStyle = 'rgba(8,6,12,0.74)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24a';
  ctx.font = '30px ui-monospace, monospace';
  ctx.fillText('斩 落 镰 影', canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillStyle = '#cfc7e0';
  ctx.font = '15px ui-monospace, monospace';
  ctx.fillText(
    `Lv ${world.level} · 收割 ${world.kills} · ${world.time.toFixed(1)} 秒`,
    canvas.width / 2,
    canvas.height / 2 + 22,
  );
  ctx.fillStyle = '#8a84a0';
  ctx.fillText('按 R 再战一局', canvas.width / 2, canvas.height / 2 + 48);
}

function render(alpha: number): void {
  renderAlpha = alpha;
  const player = world.player;

  // FPS
  fpsN++;
  const now = performance.now();
  if (now - fpsT >= 500) {
    fps = Math.round((fpsN * 1000) / (now - fpsT));
    fpsN = 0;
    fpsT = now;
  }

  const pix = player.px + (player.x - player.px) * alpha;
  const piy = player.py + (player.y - player.py) * alpha;
  // 屏幕震动（确定性，不用随机）
  const shk = world.shake;
  const shx = shk > 0 ? Math.sin(world.time * 47) * shk : 0;
  const shy = shk > 0 ? Math.cos(world.time * 59) * shk : 0;
  camera.centerOn(pix + shx, piy + shy);

  drawField();
  drawAmbient();
  // 玩家柔光（加色混合）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(playerGlow, sx(pix) - GLOW_R, sy(piy) - 12 * PIXEL_SCALE - GLOW_R);
  ctx.restore();
  drawSouls(alpha);

  // 实体按脚底 Y 排序
  drawBuf.length = 0;
  drawBuf.push(player);
  for (let i = 0; i < world.enemies.length; i++) {
    if (world.enemies[i].alive) drawBuf.push(world.enemies[i]);
  }
  drawBuf.sort(byFootY);

  for (let i = 0; i < drawBuf.length; i++) {
    const m = drawBuf[i];
    const ix = m.px + (m.x - m.px) * alpha;
    const iy = footY(m);
    const x = sx(ix);
    const y = sy(iy);

    const shadowScale = m.kind === 'enemy' ? m.radius / 7 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, 9 * PIXEL_SCALE * shadowScale, 2.5 * PIXEL_SCALE * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    if (m.kind === 'player') {
      const bob = m.moving ? Math.abs(Math.sin(m.stepPhase)) * -2 * PIXEL_SCALE : 0;
      // 行走时左右迈步两帧切换，站立用基础帧
      const frame = m.moving ? (Math.sin(m.stepPhase) > 0 ? reaperWalkA : reaperWalkB) : reaperSprite;
      ctx.globalAlpha = m.invuln > 0 ? 0.55 : 1;
      drawSprite(ctx, frame, x, y + bob, PIXEL_SCALE, m.facing < 0);
      ctx.globalAlpha = 1;
      if (m.hurtFlash > 0) {
        ctx.globalAlpha = (m.hurtFlash / 0.15) * 0.85;
        drawSprite(ctx, reaperFlash, x, y + bob, PIXEL_SCALE, m.facing < 0);
        ctx.globalAlpha = 1;
      }
    } else {
      const def = ENEMY_SPR[m.type];
      const es = def.scale;
      const bob = Math.abs(Math.sin(m.stepPhase)) * -1.2 * PIXEL_SCALE;
      drawSprite(ctx, def.spr, x, y + bob, es, m.facing < 0);
      if (def.tint) {
        ctx.globalAlpha = def.tintA ?? 0.5;
        drawSprite(ctx, def.tint, x, y + bob, es, m.facing < 0);
        ctx.globalAlpha = 1;
      }
      if (m.aiming && def.warn) {
        // 冲撞者蓄力告警：红闪
        ctx.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(world.time * 18));
        drawSprite(ctx, def.warn, x, y + bob, es, m.facing < 0);
        ctx.globalAlpha = 1;
      }
      if (m.hitFlash > 0) {
        ctx.globalAlpha = Math.min(1, m.hitFlash / 0.12);
        drawSprite(ctx, def.flash, x, y + bob, es, m.facing < 0);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawParticles();
  drawEnemyShots(alpha);
  drawProjectiles(alpha);
  drawFamiliars(alpha);
  drawMoonSlash();

  ctx.drawImage(vignette, 0, 0); // 暗角

  drawHud();
  if (world.bossActive()) drawBossBar();
  if (player.dead) drawGameOver();
  if (world.won) drawVictory();
}

startLoop({ update, render });
