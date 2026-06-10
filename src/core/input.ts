// 键盘输入：WASD / 方向键。只读当前按键状态，移动逻辑在实体里做。

export class Input {
  private readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
  }

  has(code: string): boolean {
    return this.down.has(code);
  }

  /** 水平轴：-1 左 / 0 / 1 右 */
  get moveX(): number {
    return (
      (this.has('KeyD') || this.has('ArrowRight') ? 1 : 0) -
      (this.has('KeyA') || this.has('ArrowLeft') ? 1 : 0)
    );
  }

  /** 垂直轴：-1 上 / 0 / 1 下（屏幕坐标，下为正） */
  get moveY(): number {
    return (
      (this.has('KeyS') || this.has('ArrowDown') ? 1 : 0) -
      (this.has('KeyW') || this.has('ArrowUp') ? 1 : 0)
    );
  }
}
