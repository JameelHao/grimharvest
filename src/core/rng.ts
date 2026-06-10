// 可种子化 PRNG（mulberry32）。为每日种子挑战铺路——刷怪/掉落/三选一都吃它。
// 架构约定：禁止直接用 Math.random，所有游戏性随机走这里。
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [min, maxInclusive] 整数 */
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  /** 概率 p 命中 */
  chance(p: number): boolean {
    return this.next() < p;
  }
}
