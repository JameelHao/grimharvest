import type { World } from './world';
import type { Rng } from '../core/rng';
import { UPGRADES, CURSES, type UpgradeDef, type CurseDef } from '../data/upgrades';

// 升级系统：解释 data/upgrades.ts 的纯数据目录，生成轮盘符号并应用效果。
// 老虎机：三个卷轴「带放回」抽取（可重复）→ 命中相同符号给 stacks 倍率（双连 ×2 / 三连 ×3）。
export interface UpgradeOption {
  id: string;
  title: string;
  desc: string;
  cursed: boolean;
  apply: (world: World, stacks: number) => void;
}

const CURSE_WEIGHT = 7;

function weaponLevel(world: World, id: 'moonscythe' | 'crescent' | 'familiar'): number {
  if (id === 'moonscythe') return world.moonscythe.level;
  if (id === 'crescent') return world.crescent ? world.crescent.level : 0;
  return world.familiar ? world.familiar.level : 0;
}

function available(world: World, def: UpgradeDef): boolean {
  if (def.weaponId) return weaponLevel(world, def.weaponId) < (def.maxLevel ?? 99);
  return true;
}

function toOption(world: World, def: UpgradeDef): UpgradeOption {
  let title = def.title;
  if (def.weaponId) {
    const lv = weaponLevel(world, def.weaponId);
    title = lv === 0 ? `获得 · ${def.title}` : `${def.title} Lv${lv}`;
  }
  return { id: def.id, title, desc: def.desc, cursed: false, apply: (w, s) => applyUpgrade(w, def, s) };
}

function curseOption(c: CurseDef): UpgradeOption {
  return {
    id: c.id,
    title: `☾ ${c.title}`,
    desc: `${c.desc}（耗 ${c.chaffCost} 怨魂）`,
    cursed: true,
    apply: (w, s) => applyCurse(w, c, s),
  };
}

interface Candidate {
  weight: number;
  make: () => UpgradeOption;
}

/** 老虎机卷轴：带放回加权抽取 n 个符号（可重复 → 可凑三连） */
export function rollReels(world: World, rng: Rng, n = 3): UpgradeOption[] {
  const cands: Candidate[] = [];
  for (let i = 0; i < UPGRADES.length; i++) {
    const d = UPGRADES[i];
    if (available(world, d)) cands.push({ weight: d.weight, make: () => toOption(world, d) });
  }
  for (let i = 0; i < CURSES.length; i++) {
    const c = CURSES[i];
    if (world.chaff >= c.chaffCost) cands.push({ weight: CURSE_WEIGHT, make: () => curseOption(c) });
  }
  if (cands.length === 0) return [];

  let total = 0;
  for (let i = 0; i < cands.length; i++) total += cands[i].weight;

  const out: UpgradeOption[] = [];
  for (let k = 0; k < n; k++) {
    let r = rng.next() * total;
    let idx = 0;
    for (; idx < cands.length; idx++) {
      r -= cands[idx].weight;
      if (r <= 0) break;
    }
    if (idx >= cands.length) idx = cands.length - 1;
    out.push(cands[idx].make());
  }
  return out;
}

function applyUpgrade(world: World, def: UpgradeDef, stacks: number): void {
  if (def.weaponId) {
    for (let i = 0; i < stacks; i++) world.acquireOrLevelWeapon(def.weaponId);
    return;
  }
  const p = world.player;
  const amt = (def.amount ?? 0) * stacks;
  if (def.stat === 'maxHp') {
    p.maxHp += amt;
    p.hp = Math.min(p.maxHp, p.hp + amt);
  } else if (def.stat === 'speed') {
    p.speed += amt;
  } else if (def.stat === 'pickupRadius') {
    p.pickupRadius += amt;
  }
}

function applyCurse(world: World, c: CurseDef, stacks: number): void {
  world.chaff -= c.chaffCost; // 三连不额外加价：祝福即折扣
  const p = world.player;
  if (c.damageMult) world.damageMult += c.damageMult * stacks;
  if (c.maxHpDelta) {
    p.maxHp = Math.max(1, p.maxHp + c.maxHpDelta * stacks);
    p.hp = Math.max(1, Math.min(p.maxHp, p.hp));
  }
  if (c.drainPerSec) world.drainPerSec += c.drainPerSec * stacks;
  if (c.pickupDelta) p.pickupRadius += c.pickupDelta * stacks;
  if (c.soulWindowDelta) world.soulWindow = Math.max(1, world.soulWindow + c.soulWindowDelta * stacks);
  if (c.familiarLevels) {
    const n = c.familiarLevels * stacks;
    for (let i = 0; i < n; i++) world.acquireOrLevelWeapon('familiar');
  }
}
