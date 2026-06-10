// 升级三选一的候选目录（纯数据：只描述「是什么」，应用逻辑在 systems/upgrades.ts 解释）。
// weaponId 类：获得/升级某武器；stat 类：被动数值强化。

export interface UpgradeDef {
  id: string;
  title: string;
  desc: string;
  weight: number; // 抽取权重
  weaponId?: 'moonscythe' | 'crescent' | 'familiar';
  maxLevel?: number; // 武器封顶等级
  stat?: 'maxHp' | 'speed' | 'pickupRadius';
  amount?: number; // 被动数值增量
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'w_moonscythe', title: '月镰', desc: '强化横扫：伤害与范围提升', weight: 10, weaponId: 'moonscythe', maxLevel: 8 },
  { id: 'w_crescent', title: '飞镰', desc: '飞掷回旋的弯月，沿途割怪', weight: 8, weaponId: 'crescent', maxLevel: 8 },
  { id: 'w_familiar', title: '使魔', desc: '环绕的月夜蝙蝠，自动扑咬近敌', weight: 8, weaponId: 'familiar', maxLevel: 6 },
  { id: 'p_pickup', title: '月华牵引', desc: '灵魂吸附半径 +10', weight: 6, stat: 'pickupRadius', amount: 10 },
  { id: 'p_hp', title: '不朽之躯', desc: '最大生命 +20 并回复', weight: 6, stat: 'maxHp', amount: 20 },
  { id: 'p_speed', title: '疾风步', desc: '移动速度 +8', weight: 5, stat: 'speed', amount: 8 },
];

// 诅咒强化：用「怨魂 Chaff」（亡者掉的受污之魂）兑换——强力但带反噬（支柱二）。
// 仅在怨魂足够时才会出现在三选一里。effect 字段由 systems/upgrades.ts 解释。
export interface CurseDef {
  id: string;
  title: string;
  desc: string;
  chaffCost: number;
  damageMult?: number; // 全武器伤害乘区增量（加到 world.damageMult）
  maxHpDelta?: number; // 最大生命增量（负=反噬）
  drainPerSec?: number; // 每秒持续流失生命
  pickupDelta?: number; // 吸附半径增量
  soulWindowDelta?: number; // 魂收割窗口增量（负=更快复生）
  familiarLevels?: number; // 直接提升使魔等级
}

export const CURSES: CurseDef[] = [
  { id: 'c_glut', title: '饕餮之镰', desc: '全武器伤害 +40%，但最大生命 -20', chaffCost: 3, damageMult: 0.4, maxHpDelta: -20 },
  { id: 'c_swarm', title: '噬血蝠群', desc: '使魔 +1 级，但每秒流失 1 生命', chaffCost: 4, familiarLevels: 1, drainPerSec: 1 },
  { id: 'c_greed', title: '贪婪之握', desc: '吸附半径 +30，但魂收割窗口 -1.5 秒', chaffCost: 3, pickupDelta: 30, soulWindowDelta: -1.5 },
];
