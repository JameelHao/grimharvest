// 玩家与全局战斗/节奏数值。调平衡只改这里，逻辑不碰数值（CLAUDE.md）。

export const PLAYER_STATS = {
  maxHp: 100,
  speed: 70, // 世界单位/秒
  radius: 6,
  invuln: 0.6, // 受击后无敌秒数
  pickupRadius: 34, // 魂吸附半径（可被升级提升）
};

// —— 魂收割（支柱一，见 docs/DESIGN.md）——
export const SOUL_WINDOW = 5; // 魂收割窗口秒，超时就地复生为亡者
export const SOUL_ATTRACT = 13; // 进入吸附后每秒接近系数（lerp 强度）
export const SOUL_COLLECT_DIST = 6; // 判定收取的距离
export const COMBO_WINDOW = 1.6; // 连击保持窗口秒，超时断连

// —— 等级 ——
export const XP_BASE = 4; // 升 1 级所需魂数基数
export const XP_PER_LEVEL = 3; // 每级递增

// —— 刷怪 —— 节奏/密度由恐惧潮汐决定，配置见 data/waves.ts
export const SPAWN_RADIUS = 150; // 在玩家四周此半径外刷新
