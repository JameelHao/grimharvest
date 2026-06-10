// 均匀网格空间哈希（架构红线 2：碰撞/邻近查询禁止 O(n²)）。
// 每帧 clear + 重新 insert 所有存活敌人；查询时只看覆盖圆形 AABB 的格子。
// 哈希可能碰撞 → 查询「过包含」（返回多余项），调用方再做精确距离判定，因此结果只会偏多、不会漏。
export class SpatialHash<T> {
  private readonly cells = new Map<number, T[]>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) | 0;
  }

  /** 复用桶数组（length=0），避免每帧重建 Map 产生分配 */
  clear(): void {
    for (const bucket of this.cells.values()) bucket.length = 0;
  }

  insert(x: number, y: number, item: T): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(item);
  }

  /** 把圆形范围内的候选项填入复用数组 out（out.length 会被重置） */
  queryCircle(x: number, y: number, r: number, out: T[]): void {
    out.length = 0;
    const minx = Math.floor((x - r) / this.cellSize);
    const maxx = Math.floor((x + r) / this.cellSize);
    const miny = Math.floor((y - r) / this.cellSize);
    const maxy = Math.floor((y + r) / this.cellSize);
    for (let cy = miny; cy <= maxy; cy++) {
      for (let cx = minx; cx <= maxx; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
  }
}
