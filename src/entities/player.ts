import type { Input } from '../core/input';
import type { World } from '../systems/world';
import { PLAYER_STATS } from '../data/balance';

// 玩家（收割者）。x/y 为脚底落点世界坐标；px/py 为上一逻辑帧位置，供渲染插值。
// 数值字段可变：升级时被被动强化修改。
export class Player {
  readonly kind = 'player' as const;
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  speed = PLAYER_STATS.speed;
  radius = PLAYER_STATS.radius;
  maxHp = PLAYER_STATS.maxHp;
  hp = PLAYER_STATS.maxHp;
  pickupRadius = PLAYER_STATS.pickupRadius;
  facing: 1 | -1 = 1; // 1 朝右，-1 朝左
  stepPhase = 0;
  moving = false;
  invuln = 0; // 无敌帧剩余秒数
  hurtFlash = 0; // 受击闪白剩余秒数
  dead = false;

  update(dt: number, input: Input, world: World): void {
    this.px = this.x;
    this.py = this.y;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; // 斜向不加速
      my /= len;
      this.moving = true;
      if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
      this.stepPhase += dt * 9;
      this.x += mx * this.speed * dt;
      this.y += my * this.speed * dt;
    } else {
      this.moving = false;
      this.stepPhase = 0;
    }

    // 地形减速 + 阻挡（轴分离滑动）
    const mul = world.terrain.speedMulAt(this.px, this.py);
    this.x = this.px + (this.x - this.px) * mul;
    this.y = this.py + (this.y - this.py) * mul;
    if (world.terrain.blocksAt(this.x, this.py)) this.x = this.px;
    if (world.terrain.blocksAt(this.x, this.y)) this.y = this.py;
  }

  takeDamage(dmg: number): void {
    if (this.dead || this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = PLAYER_STATS.invuln;
    this.hurtFlash = 0.15;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.speed = PLAYER_STATS.speed;
    this.maxHp = PLAYER_STATS.maxHp;
    this.hp = PLAYER_STATS.maxHp;
    this.pickupRadius = PLAYER_STATS.pickupRadius;
    this.dead = false;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.moving = false;
    this.stepPhase = 0;
  }
}
