// 敌人数值表。用「行为 behavior」区分敌人，新增一种在此加一条（CLAUDE.md）。

export type EnemyKind = 'husk' | 'risen' | 'charger' | 'spitter' | 'ringer' | 'elite' | 'boss';
export type EnemyBehavior = 'chase' | 'charge' | 'spit' | 'orbit' | 'boss';

export interface EnemyStats {
  kind: EnemyKind;
  behavior: EnemyBehavior;
  hp: number;
  speed: number; // 世界单位/秒
  radius: number; // 碰撞半径
  contactDamage: number; // 接触玩家伤害（受无敌帧节流）
  corrupt: boolean; // 死亡掉「怨魂」(true) 还是「净魂」(false)
  souls: number; // 死亡掉魂数量
  // —— 行为参数（可选）——
  windup?: number; // 冲撞者：蓄力秒
  dashSpeed?: number; // 冲撞者：冲刺速度
  dashRange?: number; // 冲撞者：触发冲刺的距离
  cooldown?: number; // 冲撞/吐息/Boss：行为冷却秒
  shootRange?: number; // 吐息者：射程
  projSpeed?: number; // 吐息者：弹速
  projDamage?: number; // 吐息者：弹伤
}

// 腐生子：基础追击杂兵
export const HUSK_STATS: EnemyStats = {
  kind: 'husk', behavior: 'chase', hp: 13, speed: 33, radius: 7, contactDamage: 5, corrupt: false, souls: 1,
};

// 亡者：未被收割的魂复生而来——更快更硬更痛（掉怨魂）
export const RISEN_STATS: EnemyStats = {
  kind: 'risen', behavior: 'chase', hp: 30, speed: 42, radius: 8, contactDamage: 9, corrupt: true, souls: 1,
};

// 冲撞者：缓慢逼近 → 蓄力 → 直线猛冲，逼你侧身闪
export const CHARGER_STATS: EnemyStats = {
  kind: 'charger', behavior: 'charge', hp: 42, speed: 24, radius: 9, contactDamage: 12, corrupt: false, souls: 2,
  windup: 0.65, dashSpeed: 255, dashRange: 145, cooldown: 2.2,
};

// 吐息者：保持距离，远程抛射；近身则风筝后撤
export const SPITTER_STATS: EnemyStats = {
  kind: 'spitter', behavior: 'spit', hp: 22, speed: 26, radius: 7, contactDamage: 6, corrupt: false, souls: 2,
  shootRange: 175, cooldown: 2.0, projSpeed: 108, projDamage: 7,
};

// 环绕者：成群结环包夹，压缩你的收割空间
export const RINGER_STATS: EnemyStats = {
  kind: 'ringer', behavior: 'orbit', hp: 16, speed: 84, radius: 6, contactDamage: 6, corrupt: false, souls: 1,
};

// 精英 · 收尸人：高血厚甲，掉一大把净魂（暴富时刻）
export const ELITE_STATS: EnemyStats = {
  kind: 'elite', behavior: 'chase', hp: 200, speed: 30, radius: 12, contactDamage: 14, corrupt: false, souls: 10,
};

// Boss · 镰影：终局降临，周期性召唤亡者壮大自己
export const BOSS_STATS: EnemyStats = {
  kind: 'boss', behavior: 'boss', hp: 4200, speed: 36, radius: 20, contactDamage: 30, corrupt: false, souls: 50,
  cooldown: 3.0,
};

export const STATS_BY_KIND: Record<EnemyKind, EnemyStats> = {
  husk: HUSK_STATS,
  risen: RISEN_STATS,
  charger: CHARGER_STATS,
  spitter: SPITTER_STATS,
  ringer: RINGER_STATS,
  elite: ELITE_STATS,
  boss: BOSS_STATS,
};
