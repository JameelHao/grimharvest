// 敌方投射物（吐息者的远程抛射）。走对象池。命中玩家造成伤害后消失。
export class EnemyShot {
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  damage = 0;
  radius = 0;
  life = 0;
  alive = false;

  spawn(x: number, y: number, vx: number, vy: number, damage: number, radius: number, life: number): void {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.radius = radius;
    this.life = life;
    this.alive = true;
  }
}
