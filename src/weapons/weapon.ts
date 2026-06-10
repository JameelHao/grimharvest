import type { World } from '../systems/world';

// 武器统一接口（CLAUDE.md：每把武器一个文件，实现统一接口）。
// level 0 表示尚未获得；levelUp() 用于「获得」(0→1) 与「升级」。
export interface Weapon {
  readonly id: 'moonscythe' | 'crescent' | 'familiar';
  readonly name: string;
  level: number;
  update(dt: number, world: World): void;
  levelUp(): void;
}
