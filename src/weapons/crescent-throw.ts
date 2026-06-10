import type { Weapon } from './weapon';
import type { World } from '../systems/world';
import { CRESCENT } from '../data/weapons';

// 飞镰：飞掷的弯月。按冷却朝最近敌人投出（高等级多刃齐发），投射物逻辑见 entities/projectile.ts。
export class CrescentThrow implements Weapon {
  readonly id = 'crescent' as const;
  readonly name = '飞镰';
  level = 0;

  private cd = 0;

  get damage(): number {
    return CRESCENT.baseDamage + CRESCENT.damagePerLevel * Math.max(0, this.level - 1);
  }
  get blades(): number {
    return 1 + Math.floor((this.level - 1) / 2);
  }

  levelUp(): void {
    this.level++;
    if (this.level === 1) this.cd = 0.2; // 刚获得很快投第一发
  }

  update(dt: number, world: World): void {
    if (this.level <= 0) return;
    this.cd -= dt;
    if (this.cd <= 0) {
      this.cd += CRESCENT.cooldown;
      this.throw(world);
    }
  }

  private throw(world: World): void {
    const p = world.player;
    const base = world.nearestEnemyAngle(p.x, p.y) ?? (p.facing > 0 ? 0 : Math.PI);
    const n = this.blades;
    const spread = 0.32;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      world.spawnProjectile(
        p.x,
        p.y,
        Math.cos(a) * CRESCENT.speed,
        Math.sin(a) * CRESCENT.speed,
        this.damage,
        CRESCENT.radius,
        CRESCENT.knockback,
      );
    }
  }
}
