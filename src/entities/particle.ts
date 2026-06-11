// 粒子（打击火花 / 死亡碎屑 / 受击血点）。纯表现，走对象池。颜色用 rgb 数值避免解析。
export class Particle {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  maxLife = 0;
  size = 0;
  r = 255;
  g = 255;
  b = 255;
  alive = false;

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, r: number, g: number, b: number): void {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.r = r;
    this.g = g;
    this.b = b;
    this.alive = true;
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx -= this.vx * Math.min(1, dt * 4); // 阻尼
    this.vy -= this.vy * Math.min(1, dt * 4);
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
}
