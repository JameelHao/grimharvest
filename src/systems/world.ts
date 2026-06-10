import { Player } from '../entities/player';
import { Enemy } from '../entities/enemy';
import { Soul } from '../entities/soul';
import { Projectile } from '../entities/projectile';
import { EnemyShot } from '../entities/enemy-shot';
import { SpatialHash } from '../core/spatial-hash';
import { Rng } from '../core/rng';
import type { Weapon } from '../weapons/weapon';
import { Moonscythe } from '../weapons/moonscythe';
import { CrescentThrow } from '../weapons/crescent-throw';
import { Familiar } from '../weapons/familiar';
import type { Input } from '../core/input';
import { HUSK_STATS, RISEN_STATS, ELITE_STATS, BOSS_STATS, STATS_BY_KIND, type EnemyStats, type EnemyKind } from '../data/enemies';
import { SOUL_ATTRACT, SOUL_COLLECT_DIST, SOUL_WINDOW, COMBO_WINDOW, XP_BASE, XP_PER_LEVEL, SPAWN_RADIUS } from '../data/balance';
import { DREAD, WAVE_SCHEDULE, ELITE_START, ELITE_INTERVAL, BOSS_TIME } from '../data/waves';

// 游戏世界：持有玩家、敌人/魂/投射物/敌弹对象池、空间哈希、武器与 RNG，
// 负责战斗结算、魂收割、等级、恐惧潮汐刷怪、敌人行为支持与 Boss 流程。
const MAX_ENEMIES = 1024;
const MAX_SOULS = 1024;
const MAX_PROJECTILES = 128;
const MAX_SHOTS = 256;
const SEARCH_R = 220;

export class World {
  readonly player = new Player();
  readonly enemies: Enemy[] = [];
  readonly souls: Soul[] = [];
  readonly projectiles: Projectile[] = [];
  readonly enemyShots: EnemyShot[] = [];
  readonly weapons: Weapon[] = [];
  readonly rng: Rng;

  moonscythe = new Moonscythe();
  crescent: CrescentThrow | null = null;
  familiar: Familiar | null = null;

  kills = 0;
  time = 0;
  xp = 0;
  level = 1;
  xpToNext = XP_BASE + 1 * XP_PER_LEVEL;
  combo = 0;
  comboTimer = 0;
  pendingLevelUps = 0;
  paused = false;

  chaff = 0;
  dread = 0;
  damageMult = 1;
  drainPerSec = 0;
  soulWindow = SOUL_WINDOW;

  // Boss / 终局
  boss: Enemy | null = null;
  bossSpawned = false;
  won = false;

  private readonly hash = new SpatialHash<Enemy>(48);
  private readonly scratch: Enemy[] = [];
  private spawnTimer = 1.0;
  private eliteTimer = ELITE_START;
  private hitToken = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    for (let i = 0; i < MAX_ENEMIES; i++) this.enemies.push(new Enemy());
    for (let i = 0; i < MAX_SOULS; i++) this.souls.push(new Soul());
    for (let i = 0; i < MAX_PROJECTILES; i++) this.projectiles.push(new Projectile());
    for (let i = 0; i < MAX_SHOTS; i++) this.enemyShots.push(new EnemyShot());
    this.weapons.push(this.moonscythe);
    this.spawnRing(12, 130);
  }

  reset(): void {
    this.player.reset();
    for (let i = 0; i < this.enemies.length; i++) this.enemies[i].alive = false;
    for (let i = 0; i < this.souls.length; i++) this.souls[i].alive = false;
    for (let i = 0; i < this.projectiles.length; i++) this.projectiles[i].alive = false;
    for (let i = 0; i < this.enemyShots.length; i++) this.enemyShots[i].alive = false;
    this.moonscythe = new Moonscythe();
    this.crescent = null;
    this.familiar = null;
    this.weapons.length = 0;
    this.weapons.push(this.moonscythe);
    this.kills = 0;
    this.time = 0;
    this.xp = 0;
    this.level = 1;
    this.xpToNext = XP_BASE + 1 * XP_PER_LEVEL;
    this.combo = 0;
    this.comboTimer = 0;
    this.pendingLevelUps = 0;
    this.paused = false;
    this.chaff = 0;
    this.dread = 0;
    this.damageMult = 1;
    this.drainPerSec = 0;
    this.soulWindow = SOUL_WINDOW;
    this.boss = null;
    this.bossSpawned = false;
    this.won = false;
    this.spawnTimer = 1.0;
    this.eliteTimer = ELITE_START;
    this.spawnRing(12, 130);
  }

  nextHitToken(): number {
    return ++this.hitToken;
  }
  dreadFrac(): number {
    return this.dread / DREAD.max;
  }
  bossActive(): boolean {
    return this.boss !== null && this.boss.alive;
  }
  aliveCount(): number {
    return this.aliveEnemyCount();
  }

  applyJackpot(): void {
    this.player.hp = this.player.maxHp;
    this.chaff += 2;
  }

  /** 性能压测：在玩家四周一次性投放 n 个杂兵（开发用，按 P 触发） */
  debugSpawn(n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = 50 + this.rng.next() * 420;
      this.spawnEnemy(this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r, HUSK_STATS);
    }
  }

  acquireOrLevelWeapon(id: 'moonscythe' | 'crescent' | 'familiar'): void {
    if (id === 'moonscythe') {
      this.moonscythe.levelUp();
    } else if (id === 'crescent') {
      if (!this.crescent) {
        this.crescent = new CrescentThrow();
        this.weapons.push(this.crescent);
      }
      this.crescent.levelUp();
    } else {
      if (!this.familiar) {
        this.familiar = new Familiar();
        this.weapons.push(this.familiar);
      }
      this.familiar.levelUp();
    }
  }

  update(dt: number, input: Input): void {
    if (this.player.dead || this.won || this.paused) return;
    this.time += dt;

    this.dread = Math.max(0, this.dread - DREAD.decay * dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // 刷怪导演
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer += this.spawnInterval();
      this.spawnWave();
    }
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0) {
      this.eliteTimer += ELITE_INTERVAL;
      this.spawnAtRing(ELITE_STATS);
    }
    if (!this.bossSpawned && this.time >= BOSS_TIME) this.spawnBoss();

    this.rebuildHash();

    this.player.update(dt, input);
    if (this.drainPerSec > 0) {
      this.player.hp -= this.drainPerSec * dt;
      if (this.player.hp <= 0) {
        this.player.hp = 0;
        this.player.dead = true;
      }
    }

    for (let i = 0; i < this.weapons.length; i++) this.weapons[i].update(dt, this);
    this.updateProjectiles(dt);
    this.updateEnemyShots(dt);

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      e.update(dt, this);
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const rr = this.player.radius + e.radius;
      if (dx * dx + dy * dy < rr * rr) this.player.takeDamage(e.contactDamage);
    }

    this.updateSouls(dt);
  }

  // —— 战斗查询（供武器调用）——

  nearestEnemyAngle(x: number, y: number): number | null {
    this.hash.queryCircle(x, y, SEARCH_R, this.scratch);
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.scratch.length; i++) {
      const e = this.scratch[i];
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return null;
    return Math.atan2(best.y - y, best.x - x);
  }

  damageEnemiesInArc(x: number, y: number, range: number, aim: number, arc: number, dmg: number, kb: number, token: number): void {
    this.hash.queryCircle(x, y, range, this.scratch);
    const half = arc / 2;
    for (let i = 0; i < this.scratch.length; i++) {
      const e = this.scratch[i];
      if (!e.alive || e.lastHit === token) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > range + e.radius) continue;
      let diff = Math.atan2(dy, dx) - aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > half) continue;
      e.lastHit = token;
      this.applyHit(e, dx, dy, dist, dmg, kb);
    }
  }

  damageEnemiesInCircle(x: number, y: number, r: number, dmg: number, kb: number, token: number): void {
    this.hash.queryCircle(x, y, r, this.scratch);
    for (let i = 0; i < this.scratch.length; i++) {
      const e = this.scratch[i];
      if (!e.alive || e.lastHit === token) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > r + e.radius) continue;
      e.lastHit = token;
      this.applyHit(e, dx, dy, dist, dmg, kb);
    }
  }

  spawnProjectile(x: number, y: number, vx: number, vy: number, dmg: number, radius: number, kb: number): void {
    for (let i = 0; i < this.projectiles.length; i++) {
      const pr = this.projectiles[i];
      if (!pr.alive) {
        pr.spawn(x, y, vx, vy, dmg, radius, kb, this.nextHitToken(), 0.5, 2.4);
        return;
      }
    }
  }

  spawnEnemyShot(x: number, y: number, vx: number, vy: number, dmg: number, radius: number, life: number): void {
    for (let i = 0; i < this.enemyShots.length; i++) {
      if (!this.enemyShots[i].alive) {
        this.enemyShots[i].spawn(x, y, vx, vy, dmg, radius, life);
        return;
      }
    }
  }

  /** Boss 召唤：在 (x,y) 周围生成 n 个亡者 */
  summonRisen(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = 26 + this.rng.next() * 18;
      this.spawnEnemy(x + Math.cos(a) * r, y + Math.sin(a) * r, RISEN_STATS);
    }
  }

  // —— 内部 ——

  private applyHit(e: Enemy, dx: number, dy: number, dist: number, dmg: number, kb: number): void {
    const inv = dist > 0.0001 ? 1 / dist : 0;
    if (e.takeDamage(dmg * this.damageMult, dx * inv * kb, dy * inv * kb)) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    e.alive = false;
    this.kills++;
    this.dread = Math.min(DREAD.max, this.dread + DREAD.perKill);
    this.spawnSouls(e.x, e.y, e.souls, e.corrupt);
    if (e === this.boss) {
      this.boss = null;
      this.won = true;
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (let i = 0; i < this.projectiles.length; i++) {
      const pr = this.projectiles[i];
      if (!pr.alive) continue;
      pr.px = pr.x;
      pr.py = pr.y;
      if (!pr.homing) {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.outT -= dt;
        if (pr.outT <= 0) pr.homing = true;
      } else {
        const dx = p.x - pr.x;
        const dy = p.y - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(pr.vx, pr.vy) * 1.25;
        pr.x += (dx / d) * sp * dt;
        pr.y += (dy / d) * sp * dt;
        if (d < 8) pr.alive = false;
      }
      pr.spin += dt * 16;
      this.damageEnemiesInCircle(pr.x, pr.y, pr.radius, pr.damage, pr.knockback, pr.token);
      pr.life -= dt;
      if (pr.life <= 0) pr.alive = false;
    }
  }

  private updateEnemyShots(dt: number): void {
    const p = this.player;
    for (let i = 0; i < this.enemyShots.length; i++) {
      const sh = this.enemyShots[i];
      if (!sh.alive) continue;
      sh.px = sh.x;
      sh.py = sh.y;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.life -= dt;
      const dx = p.x - sh.x;
      const dy = p.y - sh.y;
      const rr = p.radius + sh.radius;
      if (dx * dx + dy * dy < rr * rr) {
        p.takeDamage(sh.damage);
        sh.alive = false;
      } else if (sh.life <= 0) {
        sh.alive = false;
      }
    }
  }

  private updateSouls(dt: number): void {
    const p = this.player;
    const pickup2 = p.pickupRadius * p.pickupRadius;
    const collect2 = SOUL_COLLECT_DIST * SOUL_COLLECT_DIST;
    for (let i = 0; i < this.souls.length; i++) {
      const s = this.souls[i];
      if (!s.alive) continue;
      s.px = s.x;
      s.py = s.y;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (!s.attracting && d2 < pickup2) s.attracting = true;
      if (s.attracting) {
        const t = Math.min(1, dt * SOUL_ATTRACT);
        s.x += dx * t;
        s.y += dy * t;
        if (d2 < collect2) {
          s.alive = false;
          this.collectSoul(s.fromRisen);
        }
      } else {
        s.life -= dt;
        if (s.life <= 0) {
          s.alive = false;
          this.spawnEnemy(s.x, s.y, RISEN_STATS);
        }
      }
    }
  }

  private collectSoul(fromRisen: boolean): void {
    this.combo++;
    this.comboTimer = COMBO_WINDOW;
    if (fromRisen) {
      this.chaff++;
    } else {
      const gain = 1 + Math.floor(this.combo / 10);
      this.xp += gain;
      while (this.xp >= this.xpToNext) {
        this.xp -= this.xpToNext;
        this.level++;
        this.pendingLevelUps++;
        this.xpToNext = XP_BASE + this.level * XP_PER_LEVEL;
      }
    }
  }

  private rebuildHash(): void {
    this.hash.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) this.hash.insert(e.x, e.y, e);
    }
  }

  private aliveEnemyCount(): number {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) n++;
    return n;
  }

  // 恐惧潮汐曲线
  private spawnInterval(): number {
    const f = this.dreadFrac();
    return DREAD.calmInterval + (DREAD.peakInterval - DREAD.calmInterval) * f;
  }
  private spawnCount(): number {
    const f = this.dreadFrac();
    return Math.max(1, Math.round(DREAD.calmPerWave + (DREAD.peakPerWave - DREAD.calmPerWave) * f));
  }
  private maxAlive(): number {
    const f = this.dreadFrac();
    return Math.round(DREAD.calmAlive + (DREAD.peakAlive - DREAD.calmAlive) * f);
  }

  // 按时间表加权挑选普通杂兵类型
  private pickKind(): EnemyKind {
    let mix = WAVE_SCHEDULE[0].mix;
    for (let i = 0; i < WAVE_SCHEDULE.length; i++) {
      if (this.time >= WAVE_SCHEDULE[i].t) mix = WAVE_SCHEDULE[i].mix;
    }
    let total = 0;
    for (let i = 0; i < mix.length; i++) total += mix[i].w;
    let r = this.rng.next() * total;
    for (let i = 0; i < mix.length; i++) {
      r -= mix[i].w;
      if (r <= 0) return mix[i].kind;
    }
    return mix[mix.length - 1].kind;
  }

  private spawnEnemy(x: number, y: number, stats: EnemyStats): Enemy | null {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) {
        e.spawn(x, y, stats);
        if (stats.behavior === 'orbit') e.orbitDir = this.rng.next() < 0.5 ? 1 : -1;
        return e;
      }
    }
    return null;
  }

  private spawnRing(count: number, radius: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.spawnEnemy(this.player.x + Math.cos(a) * radius, this.player.y + Math.sin(a) * radius, HUSK_STATS);
    }
  }

  private spawnAtRing(stats: EnemyStats): void {
    const a = this.rng.next() * Math.PI * 2;
    const r = SPAWN_RADIUS + this.rng.next() * 40;
    this.spawnEnemy(this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r, stats);
  }

  private spawnWave(): void {
    if (this.aliveEnemyCount() >= this.maxAlive()) return;
    const n = this.spawnCount();
    for (let i = 0; i < n; i++) this.spawnAtRing(STATS_BY_KIND[this.pickKind()]);
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const a = this.rng.next() * Math.PI * 2;
    this.boss = this.spawnEnemy(this.player.x + Math.cos(a) * 180, this.player.y + Math.sin(a) * 180, BOSS_STATS);
  }

  private spawnSouls(x: number, y: number, n: number, corrupt: boolean): void {
    for (let k = 0; k < n; k++) {
      // 多颗魂时在死亡点周围撒开
      let sx = x;
      let sy = y;
      if (n > 1) {
        const a = this.rng.next() * Math.PI * 2;
        const r = this.rng.next() * 16;
        sx += Math.cos(a) * r;
        sy += Math.sin(a) * r;
      }
      this.spawnSoul(sx, sy, corrupt);
    }
  }

  private spawnSoul(x: number, y: number, fromRisen: boolean): void {
    for (let i = 0; i < this.souls.length; i++) {
      if (!this.souls[i].alive) {
        this.souls[i].spawn(x, y, this.soulWindow, fromRisen);
        return;
      }
    }
  }
}
