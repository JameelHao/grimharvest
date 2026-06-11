import type { EnemyKind } from './enemies';

// 刷怪节奏 = 恐惧潮汐（支柱三）。恐惧由击杀速率驱动，越高刷得越密。
export const DREAD = {
  max: 100,
  perKill: 1.05,
  decay: 9,
  calmInterval: 0.95,
  peakInterval: 0.26,
  calmPerWave: 1,
  peakPerWave: 4,
  calmAlive: 45,
  peakAlive: 170,
};

// 敌人组成随时间演进：到达 t 秒后采用该 mix（加权随机刷新普通杂兵）。
export interface SpawnMix {
  t: number;
  mix: { kind: EnemyKind; w: number }[];
}
export const WAVE_SCHEDULE: SpawnMix[] = [
  { t: 0, mix: [{ kind: 'husk', w: 1 }] },
  { t: 40, mix: [{ kind: 'husk', w: 5 }, { kind: 'charger', w: 1 }] },
  { t: 78, mix: [{ kind: 'husk', w: 5 }, { kind: 'charger', w: 1 }, { kind: 'spitter', w: 1 }] },
  { t: 115, mix: [{ kind: 'husk', w: 4 }, { kind: 'charger', w: 1 }, { kind: 'spitter', w: 1 }, { kind: 'ringer', w: 2 }] },
  { t: 160, mix: [{ kind: 'husk', w: 3 }, { kind: 'charger', w: 2 }, { kind: 'spitter', w: 2 }, { kind: 'ringer', w: 2 }] },
];

export const ELITE_START = 80; // 多少秒后开始刷精英
export const ELITE_INTERVAL = 52; // 精英间隔秒
export const BOSS_TIME = 180; // Boss 镰影降临时间（秒）；正式版可调到 900（15 分钟）
