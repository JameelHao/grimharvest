// 相机：以世界坐标为单位，记录视口左上角。world→screen 由主循环统一换算。

export class Camera {
  x = 0;
  y = 0;

  constructor(
    public readonly viewW: number,
    public readonly viewH: number,
  ) {}

  /** 把视口中心对准世界坐标 (wx, wy) */
  centerOn(wx: number, wy: number): void {
    this.x = wx - this.viewW / 2;
    this.y = wy - this.viewH / 2;
  }
}
