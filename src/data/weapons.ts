// 武器数值表。每把武器一条配置，逻辑实现统一 Weapon 接口。
// 围绕「月」母题：月镰横扫 / 飞镰回旋 / 使魔环绕。

// 月镰 Moonscythe：起手武器，自动朝最近敌人扇形横扫，刀光为月牙
export const MOONSCYTHE = {
  baseDamage: 11,
  damagePerLevel: 5,
  cooldown: 0.72,
  baseRange: 46,
  rangePerLevel: 4,
  arc: Math.PI * 1.2, // 扇形角宽
  knockback: 28,
};

// 飞镰 CrescentThrow：飞掷的弯月，飞出去再回旋，沿途割怪（投射物）
export const CRESCENT = {
  baseDamage: 10,
  damagePerLevel: 5,
  cooldown: 1.5,
  speed: 130, // 世界单位/秒
  outTime: 0.5, // 外飞秒数，之后回旋
  radius: 15, // 命中半径
  knockback: 14,
  life: 2.4, // 最长存活秒
};

// 使魔 Familiar：月之精灵，环绕玩家飞行并自动扑咬近敌（月下夜想曲式）
export const FAMILIAR = {
  baseDamage: 5,
  damagePerLevel: 3,
  orbitRadius: 34, // 环绕半径
  orbitSpeed: 2.4, // 角速度 rad/s
  attackCooldown: 0.45,
  attackRadius: 16, // 扑咬半径
  knockback: 8,
};
