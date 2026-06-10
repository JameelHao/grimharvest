import type { EnemyStats, EnemyKind, EnemyBehavior } from '../data/enemies';
import { HUSK_STATS } from '../data/enemies';
import type { World } from '../systems/world';

// 敌人：用 behavior 区分行为（追击/冲撞/吐息/环绕/Boss）。走对象池，循环内禁止 new（架构红线 1）。
const DASH_TIME = 0.32; // 冲撞者冲刺持续秒

export class Enemy {
  readonly kind = 'enemy' as const;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  speed = 0;
  radius = 0;
  contactDamage = 0;
  hp = 0;
  maxHp = 0;
  facing: 1 | -1 = 1;
  stepPhase = 0;
  kx = 0;
  ky = 0;
  hitFlash = 0;
  lastHit = -1;
  aiming = false; // 冲撞者蓄力中（渲染告警用）
  alive = false;

  // 类型与行为
  type: EnemyKind = 'husk';
  behavior: EnemyBehavior = 'chase';
  corrupt = false;
  souls = 1;
  stats: EnemyStats = HUSK_STATS;

  // 行为状态机
  private phase = 0; // 0 接近 / 1 蓄力 / 2 冲刺
  private timer = 0; // 阶段计时
  private cd = 0; // 行为冷却
  private dvx = 0; // 冲刺速度向量
  private dvy = 0;
  orbitDir: 1 | -1 = 1; // 环绕方向

  spawn(x: number, y: number, stats: EnemyStats): void {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.speed = stats.speed;
    this.radius = stats.radius;
    this.contactDamage = stats.contactDamage;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.type = stats.kind;
    this.behavior = stats.behavior;
    this.corrupt = stats.corrupt;
    this.souls = stats.souls;
    this.stats = stats;
    this.facing = 1;
    this.stepPhase = 0;
    this.kx = 0;
    this.ky = 0;
    this.hitFlash = 0;
    this.lastHit = -1;
    this.phase = 0;
    this.timer = 0;
    this.cd = stats.cooldown ?? 0;
    this.dvx = 0;
    this.dvy = 0;
    this.aiming = false;
    this.alive = true;
  }

  /** 返回是否被打死 */
  takeDamage(dmg: number, kbx: number, kby: number): boolean {
    this.hp -= dmg;
    // 冲刺中的冲撞者抗击退；Boss/精英减半
    const resist = this.phase === 2 ? 0 : this.type === 'boss' || this.type === 'elite' ? 0.3 : 1;
    this.kx += kbx * resist;
    this.ky += kby * resist;
    this.hitFlash = 0.12;
    return this.hp <= 0;
  }

  update(dt: number, world: World): void {
    this.px = this.x;
    this.py = this.y;

    // 击退位移 + 衰减
    this.x += this.kx * dt;
    this.y += this.ky * dt;
    const damp = Math.min(1, dt * 10);
    this.kx -= this.kx * damp;
    this.ky -= this.ky * damp;

    const p = world.player;
    switch (this.behavior) {
      case 'chase':
        this.moveToward(dt, p.x, p.y, this.speed, 14);
        break;
      case 'charge':
        this.doCharge(dt, p.x, p.y);
        break;
      case 'spit':
        this.doSpit(dt, world, p.x, p.y);
        break;
      case 'orbit':
        this.doOrbit(dt, p.x, p.y);
        break;
      case 'boss':
        this.doBoss(dt, world, p.x, p.y);
        break;
    }

    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  private moveToward(dt: number, tx: number, ty: number, speed: number, stop: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    if (d > stop) {
      this.x += (dx / d) * speed * dt;
      this.y += (dy / d) * speed * dt;
      this.stepPhase += dt * 7;
    }
  }

  // 冲撞者：接近 → 蓄力 → 直线冲刺 → 冷却
  private doCharge(dt: number, tx: number, ty: number): void {
    const s = this.stats;
    this.aiming = this.phase === 1;
    if (this.cd > 0) this.cd -= dt;
    if (this.phase === 0) {
      this.moveToward(dt, tx, ty, this.speed, 0);
      const dx = tx - this.x;
      const dy = ty - this.y;
      if (this.cd <= 0 && dx * dx + dy * dy < (s.dashRange ?? 150) ** 2) {
        this.phase = 1;
        this.timer = s.windup ?? 0.6;
      }
    } else if (this.phase === 1) {
      // 蓄力：站定瞄准（锁定方向）
      if (tx !== this.x) this.facing = tx > this.x ? 1 : -1;
      this.timer -= dt;
      if (this.timer <= 0) {
        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.dvx = (dx / d) * (s.dashSpeed ?? 300);
        this.dvy = (dy / d) * (s.dashSpeed ?? 300);
        this.phase = 2;
        this.timer = DASH_TIME;
      }
    } else {
      // 冲刺
      this.x += this.dvx * dt;
      this.y += this.dvy * dt;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 0;
        this.cd = s.cooldown ?? 2;
      }
    }
  }

  // 吐息者：保持射程，定期远程抛射；过近则风筝后撤
  private doSpit(dt: number, world: World, tx: number, ty: number): void {
    const s = this.stats;
    const range = s.shootRange ?? 175;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    if (d > range * 0.95) {
      this.x += (dx / d) * this.speed * dt;
      this.y += (dy / d) * this.speed * dt;
    } else if (d < range * 0.5) {
      this.x -= (dx / d) * this.speed * dt;
      this.y -= (dy / d) * this.speed * dt;
    }
    this.stepPhase += dt * 6;
    if (this.cd > 0) this.cd -= dt;
    if (this.cd <= 0 && d < range) {
      const sp = s.projSpeed ?? 115;
      world.spawnEnemyShot(this.x, this.y, (dx / d) * sp, (dy / d) * sp, s.projDamage ?? 9, 5, 4);
      this.cd = s.cooldown ?? 1.8;
    }
  }

  // 环绕者：绕着玩家切向飞行 + 缓慢内收，形成包夹
  private doOrbit(dt: number, tx: number, ty: number): void {
    const dx = this.x - tx;
    const dy = this.y - ty;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const tgx = -ny * this.orbitDir; // 切向
    const tgy = nx * this.orbitDir;
    const inward = d > 34 ? -1 : 0.25; // 收到 ~34 半径再外推一点
    this.x += (tgx * this.speed + nx * inward * 22) * dt;
    this.y += (tgy * this.speed + ny * inward * 22) * dt;
    if (tx !== this.x) this.facing = tx > this.x ? 1 : -1;
    this.stepPhase += dt * 9;
  }

  // Boss · 镰影：追击 + 周期性召唤亡者壮大自己
  private doBoss(dt: number, world: World, tx: number, ty: number): void {
    this.moveToward(dt, tx, ty, this.speed, 18);
    if (this.cd > 0) this.cd -= dt;
    if (this.cd <= 0) {
      world.summonRisen(this.x, this.y, 3);
      this.cd = this.stats.cooldown ?? 3;
    }
  }
}
