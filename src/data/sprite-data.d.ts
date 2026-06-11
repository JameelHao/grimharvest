// sprite-data.js 的类型声明（数据用 .js 写以便游戏与 Node 工具共享同一份来源）
export interface SpriteDef {
  /** 精灵标识名 */
  name: string;
  /** 像素宽 */
  w: number;
  /** 像素高 */
  h: number;
  /** 锚点（脚底/落点），世界坐标对齐用 */
  anchor: { x: number; y: number };
  /** 字符 -> 颜色（#rgb 或 #rrggbb）；未出现的字符视为透明 */
  palette: Record<string, string>;
  /** 逐行像素网格，长度应为 h，每行长度应为 w */
  rows: string[];
}

export const PLAYER: SpriteDef;
export const HUSK: SpriteDef;
export const BAT_A: SpriteDef;
export const BAT_B: SpriteDef;
export const PLAYER_WALK_A: SpriteDef;
export const PLAYER_WALK_B: SpriteDef;
export const CHARGER: SpriteDef;
export const SPITTER: SpriteDef;
export const RINGER: SpriteDef;
export const ELITE: SpriteDef;
export const BOSS: SpriteDef;
export const ICONS: Record<string, SpriteDef>;
export const ICON_LIST: SpriteDef[];
export const SPRITES: Record<string, SpriteDef>;
