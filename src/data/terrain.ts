// 地形数据表（M8，见 docs/WEATHER_TERRAIN.md）。调地形手感只改这里。

export type TerrainKind = 'plain' | 'crop' | 'bog' | 'boneyard' | 'blight' | 'ruins' | 'hallowed' | 'moonwell';

export interface TerrainDef {
  kind: TerrainKind;
  speedMul: number; // 玩家移动乘区
  enemySpeedMul: number; // 敌人移动乘区
  drainPerSec: number; // 玩家在此每秒掉血
  healPerSec: number; // 玩家在此每秒回血
  blocks: boolean; // 阻挡移动（残垣/月池）
  harvestable: boolean; // 可收割麦浪
  noSpawn: boolean; // 不在此刷怪
  spawnWeight: number; // 刷怪权重（保留给后续偏置）
  reviveMul: number; // 魂复生窗口乘区：<1 更快复生，极大=几乎不复生
  base: string; // 主色
  accent: string; // 点缀色
}

export const TILE = 24; // 每格世界单位
export const CHUNK = 16; // 每区块边长（格）

export const TERRAIN: Record<TerrainKind, TerrainDef> = {
  plain: { kind: 'plain', speedMul: 1, enemySpeedMul: 1, drainPerSec: 0, healPerSec: 0, blocks: false, harvestable: false, noSpawn: false, spawnWeight: 1, reviveMul: 1, base: '#15131f', accent: '#1d1a2c' },
  crop: { kind: 'crop', speedMul: 0.82, enemySpeedMul: 0.85, drainPerSec: 0, healPerSec: 0, blocks: false, harvestable: true, noSpawn: false, spawnWeight: 1, reviveMul: 1, base: '#211d10', accent: '#7a6a2e' },
  bog: { kind: 'bog', speedMul: 0.6, enemySpeedMul: 0.48, drainPerSec: 0, healPerSec: 0, blocks: false, harvestable: false, noSpawn: false, spawnWeight: 0.6, reviveMul: 1, base: '#1b160f', accent: '#2c2114' },
  boneyard: { kind: 'boneyard', speedMul: 1, enemySpeedMul: 1, drainPerSec: 0, healPerSec: 0, blocks: false, harvestable: false, noSpawn: false, spawnWeight: 2.2, reviveMul: 0.5, base: '#1d1c22', accent: '#4a4636' },
  blight: { kind: 'blight', speedMul: 0.95, enemySpeedMul: 1.1, drainPerSec: 4, healPerSec: 0, blocks: false, harvestable: false, noSpawn: false, spawnWeight: 1.2, reviveMul: 0.8, base: '#1a1024', accent: '#3a1a3e' },
  ruins: { kind: 'ruins', speedMul: 1, enemySpeedMul: 1, drainPerSec: 0, healPerSec: 0, blocks: true, harvestable: false, noSpawn: true, spawnWeight: 0, reviveMul: 1, base: '#22232a', accent: '#3a3c46' },
  hallowed: { kind: 'hallowed', speedMul: 1, enemySpeedMul: 0.6, drainPerSec: 0, healPerSec: 6, blocks: false, harvestable: false, noSpawn: true, spawnWeight: 0, reviveMul: 99999, base: '#1c2230', accent: '#5a7298' },
  moonwell: { kind: 'moonwell', speedMul: 1, enemySpeedMul: 1, drainPerSec: 0, healPerSec: 0, blocks: true, harvestable: false, noSpawn: true, spawnWeight: 0, reviveMul: 1, base: '#10182a', accent: '#6a8ec0' },
};

// 生成参数：低频值噪声分区，plain 占多数；特殊地形由独立噪声极值碾出稀疏簇
export const GEN = {
  biomeFreq: 0.16, // 地貌噪声频率（格）
  specialFreq: 0.21,
  // 地貌阈值带（噪声 < max → 该地形），其余为 plain
  bands: [
    { k: 'bog' as TerrainKind, max: 0.1 },
    { k: 'boneyard' as TerrainKind, max: 0.22 },
    { k: 'crop' as TerrainKind, max: 0.38 },
    { k: 'blight' as TerrainKind, max: 0.46 },
  ],
  ruins: 0.9, // ruins 噪声 > 此 → 残垣
  moonwell: 0.93,
  hallowed: 0.965,
  safeRadiusTiles: 2, // 出生点附近强制 plain
};
