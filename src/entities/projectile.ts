// 投射物：当前用于飞镰（飞掷的弯月）。走对象池。
// 行为：先沿初速直飞 outT 秒，之后回旋飞向玩家；全程对范围内敌人造成伤害（同一发只命中每个敌人一次）。
export class Projectile {
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  damage = 0;
  radius = 0;
  knockback = 0;
  token = 0; // 命中去重令牌（同一发共用一个）
  outT = 0; // 外飞剩余秒数
  life = 0;
  homing = false; // 是否进入回旋
  spin = 0; // 渲染旋转相位
  alive = false;

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    radius: number,
    knockback: number,
    token: number,
    outT: number,
    life: number,
  ): void {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.radius = radius;
    this.knockback = knockback;
    this.token = token;
    this.outT = outT;
    this.life = life;
    this.homing = false;
    this.spin = 0;
    this.alive = true;
  }
}
