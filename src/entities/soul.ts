// 魂：敌人死亡掉落的灵魂（招牌机制「魂收割」的核心，见 docs/DESIGN.md）。
// 进入玩家吸附半径会被吸走 = 经验 + 连击；超时未收割则就地复生为亡者。
// 走对象池，更新逻辑在 World（需要玩家位置/吸附半径）。
export class Soul {
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  life = 0; // 剩余收割窗口
  fromRisen = false; // 是否由亡者掉落（后续做 Chaff 经济用）
  attracting = false; // 是否已进入吸附
  alive = false;

  spawn(x: number, y: number, life: number, fromRisen: boolean): void {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.life = life;
    this.fromRisen = fromRisen;
    this.attracting = false;
    this.alive = true;
  }
}
