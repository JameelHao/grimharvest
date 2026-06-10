import type { Weapon } from './weapon';
import type { World } from '../systems/world';
import { MOONSCYTHE } from '../data/weapons';

// 月镰：起手武器。按冷却自动朝最近敌人扇形横扫，刀光为月牙（渲染层读 swing* 字段）。
export class Moonscythe implements Weapon {
  readonly id = 'moonscythe' as const;
  readonly name = '月镰';
  level = 1;

  private cd = MOONSCYTHE.cooldown * 0.5; // 开局稍快出第一刀
  swingActive = false;
  swingT = 0;
  readonly swingDur = 0.18;
  swingAngle = 0;

  get damage(): number {
    return MOONSCYTHE.baseDamage + MOONSCYTHE.damagePerLevel * (this.level - 1);
  }
  get range(): number {
    return MOONSCYTHE.baseRange + MOONSCYTHE.rangePerLevel * (this.level - 1);
  }

  levelUp(): void {
    this.level++;
  }

  update(dt: number, world: World): void {
    if (this.swingActive) {
      this.swingT -= dt;
      if (this.swingT <= 0) this.swingActive = false;
    }
    this.cd -= dt;
    if (this.cd <= 0) {
      this.cd += MOONSCYTHE.cooldown;
      this.fire(world);
    }
  }

  private fire(world: World): void {
    const p = world.player;
    const aim = world.nearestEnemyAngle(p.x, p.y);
    const angle = aim ?? (p.facing > 0 ? 0 : Math.PI);
    this.swingAngle = angle;
    this.swingActive = true;
    this.swingT = this.swingDur;
    const token = world.nextHitToken();
    world.damageEnemiesInArc(p.x, p.y, this.range, angle, MOONSCYTHE.arc, this.damage, MOONSCYTHE.knockback, token);
  }
}
