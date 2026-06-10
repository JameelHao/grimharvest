// 固定时间步长 + 渲染插值（架构红线 4：保证不同刷新率下手感一致）。
// 逻辑以 hz（默认 60Hz）固定步长推进，渲染传入插值系数 alpha ∈ [0,1)。

export interface LoopHandlers {
  /** 固定步长逻辑更新，dt 恒为 1/hz 秒 */
  update(dt: number): void;
  /** 渲染，alpha 为「距上一逻辑帧的插值比例」 */
  render(alpha: number): void;
}

export function startLoop(handlers: LoopHandlers, hz = 60): () => void {
  const step = 1 / hz;
  let acc = 0;
  let last = performance.now() / 1000;
  let raf = 0;

  const tick = (nowMs: number): void => {
    const now = nowMs / 1000;
    let frame = now - last;
    last = now;
    if (frame > 0.25) frame = 0.25; // 标签页切回等长卡顿后，防止「死亡螺旋」
    acc += frame;
    while (acc >= step) {
      handlers.update(step);
      acc -= step;
    }
    handlers.render(acc / step);
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
