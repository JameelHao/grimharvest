// 像素精灵原始数据：调色板 + 逐行字符网格。
// 美术数据与逻辑分离（CLAUDE.md 数值/逻辑分离原则）——调外观只改这里，不动渲染代码。
// 约定：'.' 或空格 = 透明像素；其余字符在 palette 中映射到颜色。
// 同时被游戏（src/core/sprite.ts）与离屏预览工具（tools/render-sprites.mjs）引用，保持唯一来源。

// —— 主角：最后的收割者（Reaper）——
// 八方旅人式风格取向：偏高的人形剪影 + 每种材质三档明暗（暗/中/高光），营造 HD-2D 立体感。
// 兜帽长袍、苍白面孔、幽蓝双眼、胸前猩红绶带、皮质束带与金属扣。
export const PLAYER = {
  name: 'reaper',
  w: 24,
  h: 28,
  // 收割者站立朝向（朝下/朝镜头），便于俯视割草视角辨识
  anchor: { x: 12, y: 27 }, // 脚底中心，作为世界坐标的落点
  palette: {
    K: '#14121a', // 描边/最暗
    d: '#2b3142', // 长袍暗部
    c: '#3c4660', // 长袍中间调
    h: '#586a8c', // 长袍高光/边缘光
    f: '#e0b48a', // 皮肤亮部
    g: '#b07d52', // 皮肤暗部
    e: '#6fe0c8', // 幽光双眼
    r: '#6e1f2a', // 绶带暗部
    R: '#a83244', // 绶带亮部
    l: '#4a3526', // 皮革暗部
    L: '#6b4a30', // 皮革亮部
    m: '#c9cdd6', // 金属扣
  },
  rows: [
    '........................',
    '.........KKKKKK.........',
    '........KddddddK........',
    '.......KdccccccdK.......',
    '.......KdcccccchK.......',
    '.......KdcffffchK.......',
    '.......KdffffffhK.......',
    '.......KdfeggefhK.......',
    '.......KdffggffhK.......',
    '.......KddffffdhK.......',
    '......KdccdrrdcchK......',
    '.....KdcccrRRrccchK.....',
    '.....KdcccRRRRccchK.....',
    '.....KdlcccRRcccLhK.....',
    '.....KdlccccccccLhK.....',
    '.....KdcccccccccchK.....',
    '.....KdfccccccccfhK.....',
    '.....KdlllmllmlllhK.....',
    '.....KdcccccccccchK.....',
    '.....KdccdccccdcchK.....',
    '....KdcccccccccccchK....',
    '....KdccdcccccccdchK....',
    '....KdccccccccccccdK....',
    '....KdcKcccKcccKccdK....',
    '.......KLlK..KlLK.......',
    '.......KllK..KllK.......',
    '.......KLLK..KLLK.......',
    '......KLLLKKKLLLK.......',
  ],
};

// —— 最初级小怪：腐生子（Husk）——
// 整个波次表里最低级的杂兵：矮胖、佝偻、绿皮腐尸，黄色凶光、参差牙、小爪子。
// 黄眼与主角的蓝眼形成敌我对比，便于战场快速识别。
export const HUSK = {
  name: 'husk',
  w: 14,
  h: 13,
  anchor: { x: 7, y: 12 },
  palette: {
    K: '#14121a', // 描边
    g: '#3f6b3a', // 绿皮暗部
    G: '#5c8f4e', // 绿皮中间调
    h: '#7fb061', // 绿皮高光
    b: '#b8c98a', // 腹部苍白
    e: '#ffd24a', // 黄色凶光眼
    w: '#e8e8d0', // 牙
    c: '#cfc7a8', // 爪
  },
  rows: [
    '..............',
    '....KK..KK....',
    '...KGGGGGGK...',
    '..KGhhhhhhGK..',
    '..KGeeggeeGK..',
    '..KGGggggGGK..',
    '.KGbwKwKwwbGK.',
    '.KGbbbbbbbbGK.',
    'KcGbbbbbbbbGcK',
    '.KGbbbbbbbbGK.',
    '.KGGbbbbbbGGK.',
    '..KGgg..ggGK..',
    '..Kcc....ccK..',
  ],
};

// —— 使魔：月夜蝙蝠（Bat）——
// 收割者召唤的小蝙蝠，环绕飞行自动扑咬近敌。配色沿用收割者的冷蓝长袍色系 +
// 同款幽蓝双眼，暗示「主角的造物」。两帧振翅动画：翅下(A) / 翅上(B)。
const BAT_PALETTE = {
  K: '#15131c', // 描边/最暗
  c: '#3c4660', // 翼膜中间调
  h: '#586a8c', // 翼膜/绒毛高光
  b: '#20242f', // 躯干暗部
  e: '#6fe0c8', // 幽蓝双眼
};

export const BAT_A = {
  name: 'bat-a',
  w: 16,
  h: 8,
  anchor: { x: 8, y: 4 }, // 躯干中心，作为环绕点对齐
  palette: BAT_PALETTE,
  rows: [
    '......b..b......',
    '.....bebbeb.....',
    '...KKbbbbbbKK...',
    '.KKcchbbbbhccKK.',
    'KcchhbbbbbbhhccK',
    'Kc..ch.bb.hc..cK',
    '.......bb.......',
    '................',
  ],
};

export const BAT_B = {
  name: 'bat-b',
  w: 16,
  h: 8,
  anchor: { x: 8, y: 4 },
  palette: BAT_PALETTE,
  rows: [
    'Kcc..........ccK',
    '.Kchh......hhcK.',
    '..Khhbb..bbhhK..',
    '...KbebbebK.....',
    '....KbbbbK......',
    '.....KbbK.......',
    '......bb........',
    '................',
  ],
};

// —— 升级技能图标（16×16，命运轮盘老虎机用）——
// 以「月」为母题：武器多为月牙/蝙蝠；诅咒用血红/紫；被动用直观符号(磁铁/心/闪电/金币)。
const PAL_BLADE = { w: '#eaf6ff', c: '#7fb6ff', b: '#3c4660' }; // 蓝月刃
const PAL_RED = { w: '#ff9aa8', c: '#d83b50', b: '#6e1f2a' }; // 血月刃
const PAL_BAT = { K: '#15131c', c: '#48587c', h: '#6a7ea0', b: '#272c3a', e: '#6fe0c8' };
const PAL_BAT_RED = { K: '#15131c', c: '#5a2a3a', h: '#7a3a4a', b: '#241018', e: '#ff5a5a' };

const ICON_BASE = { w: 16, h: 16, anchor: { x: 8, y: 8 } };

// 蓝月牙（月镰）
export const ICON_MOONSCYTHE = {
  ...ICON_BASE, name: 'icon-moonscythe', palette: PAL_BLADE,
  rows: [
    '................',
    '...wccccb.......',
    '..wccccccb......',
    '.wcccccccb......',
    '.wcccccb........',
    '.wcccb..........',
    '.wccb...........',
    '.wccb...........',
    '.wccb...........',
    '.wccb...........',
    '.wcccb..........',
    '.wcccccb........',
    '.wcccccccb......',
    '..wccccccb......',
    '...wccccb.......',
    '................',
  ],
};

// 飞掷的弯月（飞镰）：横月牙 + 运动残影点
export const ICON_CRESCENT = {
  ...ICON_BASE, name: 'icon-crescent', palette: PAL_BLADE,
  rows: [
    '................',
    '................',
    '.bc........cb...',
    '.wcc......ccw...',
    '..wcc....ccw....',
    '..wccc..cccw....',
    '...wcccccccw....',
    '....wcccccw.....',
    '.....wcccw......',
    '......www.......',
    '................',
    '.b..............',
    'b...............',
    '................',
    '................',
    '................',
  ],
};

// 蝙蝠使魔（幽蓝眼）
export const ICON_FAMILIAR = {
  ...ICON_BASE, name: 'icon-familiar', palette: PAL_BAT,
  rows: [
    '................',
    '................',
    '................',
    '......b..b......',
    '.....bebbeb.....',
    '...KKbbbbbbKK...',
    '.KKcchbbbbhccKK.',
    'KcchhbbbbbbhhccK',
    'Kc..ch.bb.hc..cK',
    '.......bb.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

// 月华牵引（吸附）：红色马蹄磁铁
export const ICON_PICKUP = {
  ...ICON_BASE, name: 'icon-pickup', palette: { R: '#d83b50', m: '#6e1f2a', s: '#c0c6d2' },
  rows: [
    '................',
    '..RRRR..RRRR....',
    '.RRRRRRRRRRRR...',
    'RRRRRRRRRRRRRR..',
    'RRRR......RRRR..',
    'RRR........RRR..',
    'RRR........RRR..',
    'RRR........RRR..',
    'RRR........RRR..',
    'RRR........RRR..',
    'RRR........RRR..',
    'sss........sss..',
    'sss........sss..',
    '................',
    '................',
    '................',
  ],
};

// 不朽之躯（生命）：红心
export const ICON_HP = {
  ...ICON_BASE, name: 'icon-hp', palette: { R: '#e0596a', r: '#ff8a98' },
  rows: [
    '................',
    '...RR....RR.....',
    '..RrRR..RRRR....',
    '.RrRRRRRRRRRR...',
    '.RRRRRRRRRRRR...',
    '.RRRRRRRRRRRR...',
    '.RRRRRRRRRRRR...',
    '..RRRRRRRRRR....',
    '...RRRRRRRR.....',
    '....RRRRRR......',
    '.....RRRR.......',
    '......RR........',
    '................',
    '................',
    '................',
    '................',
  ],
};

// 疾风步（速度）：黄色闪电
export const ICON_SPEED = {
  ...ICON_BASE, name: 'icon-speed', palette: { y: '#ffd24a', w: '#fff2b0' },
  rows: [
    '................',
    '.......wyy......',
    '......wyy.......',
    '.....wyy........',
    '....wyy.........',
    '...wyyyyyy......',
    '......wyy.......',
    '.....wyy........',
    '....wyy.........',
    '...wyy..........',
    '..wyy...........',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

// 饕餮之镰（诅咒）：血红月牙滴血
export const ICON_GLUT = {
  ...ICON_BASE, name: 'icon-glut', palette: PAL_RED,
  rows: [
    '................',
    '...wccccb.......',
    '..wccccccb......',
    '.wcccccccb......',
    '.wcccccb........',
    '.wcccb..........',
    '.wccb...........',
    '.wccb...........',
    '.wccb...........',
    '.wccb...........',
    '.wcccb..........',
    '.wcccccb........',
    '.wcccccccb......',
    '..wccccccb......',
    '...wccccb.......',
    '....cc..........',
  ],
};

// 噬血蝠群（诅咒）：红眼血蝙蝠
export const ICON_SWARM = {
  ...ICON_BASE, name: 'icon-swarm', palette: PAL_BAT_RED,
  rows: [
    '................',
    '................',
    '................',
    '......b..b......',
    '.....bebbeb.....',
    '...KKbbbbbbKK...',
    '.KKcchbbbbhccKK.',
    'KcchhbbbbbbhhccK',
    'Kc..ch.bb.hc..cK',
    '.......bb.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

// 贪婪之握（诅咒）：金币堆
export const ICON_GREED = {
  ...ICON_BASE, name: 'icon-greed', palette: { y: '#caa12e', Y: '#ffe07a', m: '#7a5a18' },
  rows: [
    '................',
    '................',
    '...yyyyyyyyy....',
    '..yYYYYYYYYYy...',
    '...yyyyyyyyy....',
    '..yYYYYYYYYYy...',
    '...yyyyyyyyy....',
    '..yYYYYYYYYYy...',
    '...yyyyyyyyy....',
    '..yYYYYYYYYYy...',
    '...yyyyyyyyy....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

// 按升级 id 映射图标（id 见 data/upgrades.ts）
export const ICONS = {
  w_moonscythe: ICON_MOONSCYTHE,
  w_crescent: ICON_CRESCENT,
  w_familiar: ICON_FAMILIAR,
  p_pickup: ICON_PICKUP,
  p_hp: ICON_HP,
  p_speed: ICON_SPEED,
  c_glut: ICON_GLUT,
  c_swarm: ICON_SWARM,
  c_greed: ICON_GREED,
};

export const ICON_LIST = [
  ICON_MOONSCYTHE, ICON_CRESCENT, ICON_FAMILIAR,
  ICON_PICKUP, ICON_HP, ICON_SPEED,
  ICON_GLUT, ICON_SWARM, ICON_GREED,
];

// —— 新敌人精灵 ——

// 冲撞者 Charger：铁甲蛮兵，红色面甲横条，宽肩重甲，两条粗腿
export const CHARGER = {
  name: 'charger', w: 18, h: 16, anchor: { x: 9, y: 14 },
  palette: { K: '#15131c', d: '#343a46', c: '#4a5260', h: '#6b7588', e: '#ff5a4a', L: '#5a5260' },
  rows: [
    '..................',
    '......KKKKKK......',
    '....KKddddddKK....',
    '...KdccccccccdK...',
    '..KdccccccccccdK..',
    '..KdceeeeeeeecdK..',
    '.KdcchccccccchcdK.',
    '.KdcchccccccchcdK.',
    '.KdccccccccccccdK.',
    '..KdccccccccccdK..',
    '..KddccccccccddK..',
    '...KddccccccddK...',
    '....KddK..KddK....',
    '....KddK..KddK....',
    '....KLLK..KLLK....',
    '..................',
  ],
};

// 吐息者 Spitter：肿胀腐尸，黄眼，大张的尖牙口
export const SPITTER = {
  name: 'spitter', w: 16, h: 16, anchor: { x: 8, y: 13 },
  palette: { K: '#15131c', g: '#4e6b32', G: '#6e9148', b: '#aec07e', m: '#140f0a', w: '#ddd6c0', e: '#ffd24a' },
  rows: [
    '................',
    '.....KGGGGK.....',
    '....KGggggGK....',
    '...KGeGGGGeGK...',
    '..KGGGGGGGGGGK..',
    '.KGGbbbbbbbbGGK.',
    '.KGbbbbbbbbbbGK.',
    'KGbbwwmmmmwwbbGK',
    'KGbbbbbbbbbbbbGK',
    '.KGbbbbbbbbbbGK.',
    '.KGGbbbbbbbbGGK.',
    '..KGGGGGGGGGGK..',
    '...KGGK..KGGK...',
    '...KggK..KggK...',
    '................',
    '................',
  ],
};

// 环绕者 Ringer：飘浮幽灵，幽蓝眼，下摆撕裂飘散
export const RINGER = {
  name: 'ringer', w: 14, h: 14, anchor: { x: 7, y: 10 },
  palette: { K: '#1a2230', c: '#8a9eb4', h: '#c4d6e6', e: '#7fe0c8' },
  rows: [
    '.....KKKK.....',
    '...KKhhhhKK...',
    '..KhcccccchK..',
    '..KccccccccK..',
    '..KceccccecK..',
    '..KhcccccchK..',
    '..KccccccccK..',
    '...KccccccK...',
    '...KhcccchK...',
    '...KccccccK...',
    '....KccccK....',
    '...KcK.KcK....',
    '..............',
    '..............',
  ],
};

// 精英 · 收尸人：复用收割者剪影 + 暗甲金饰红眼配色
export const ELITE = {
  name: 'elite', w: PLAYER.w, h: PLAYER.h, anchor: PLAYER.anchor, rows: PLAYER.rows,
  palette: {
    K: '#15131c', d: '#2a2636', c: '#3c3850', h: '#56506e', f: '#cfc6b0', g: '#9a917e',
    e: '#ff6a4a', r: '#8a6a2a', R: '#c8a24a', l: '#3a2a1a', L: '#5a4326', m: '#d8dde6',
  },
};

// Boss · 镰影：收割者的暗黑巨大镜像——近黑长袍 + 幽光双眼
export const BOSS = {
  name: 'boss', w: PLAYER.w, h: PLAYER.h, anchor: PLAYER.anchor, rows: PLAYER.rows,
  palette: {
    K: '#08080e', d: '#14121e', c: '#1f1c2c', h: '#322c46', f: '#5a5468', g: '#403a4e',
    e: '#9ff0d8', r: '#3a1020', R: '#5a1a2e', l: '#221812', L: '#322318', m: '#5a5a66',
  },
};

export const SPRITES = {
  reaper: PLAYER, husk: HUSK, 'bat-a': BAT_A, 'bat-b': BAT_B,
  charger: CHARGER, spitter: SPITTER, ringer: RINGER, elite: ELITE, boss: BOSS,
};
