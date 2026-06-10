import type { Weapon } from './weapon';
import type { World } from '../systems/world';
import { FAMILIAR } from '../data/weapons';

// 使魔：月之精灵，环绕玩家飞行并按冷却扑咬环绕点附近的敌人（月下夜想曲式）。
// 高等级增加使魔数量。渲染层读 count 与 ox/oy（含上一帧 opx/opy 供插值）。
export class Familiar implements Weapon {
  readonly id = 'familiar' as const;
  readonly name = '使魔';
  level = 0;

  count = 0;
  angle = 0;
  private atkCd = 0;
  readonly ox: number[] = [];
  readonly oy: number[] = [];
  readonly opx: number[] = [];
  readonly opy: number[] = [];

  get damage(): number {
    return FAMILIAR.baseDamage + FAMILIAR.damagePerLevel * Math.max(0, this.level - 1);
  }

  levelUp(): void {
    this.level++;
    this.count = 1 + Math.floor((this.level - 1) / 2);
  }

  update(dt: number, world: World): void {
    if (this.level <= 0) return;
    const p = world.player;
    this.angle += dt * FAMILIAR.orbitSpeed;

    for (let k = 0; k < this.count; k++) {
      const a = this.angle + (k / this.count) * Math.PI * 2;
      this.opx[k] = this.ox[k] ?? p.x;
      this.opy[k] = this.oy[k] ?? p.y;
      this.ox[k] = p.x + Math.cos(a) * FAMILIAR.orbitRadius;
      this.oy[k] = p.y + Math.sin(a) * FAMILIAR.orbitRadius;
    }

    this.atkCd -= dt;
    if (this.atkCd <= 0) {
      this.atkCd += FAMILIAR.attackCooldown;
      for (let k = 0; k < this.count; k++) {
        const token = world.nextHitToken();
        world.damageEnemiesInCircle(
          this.ox[k],
          this.oy[k],
          FAMILIAR.attackRadius,
          this.damage,
          FAMILIAR.knockback,
          token,
        );
      }
    }
  }
}
