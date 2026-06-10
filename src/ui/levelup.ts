import type { UpgradeOption } from '../systems/upgrades';
import { ICONS, ICON_LIST } from '../data/sprite-data.js';
import { prerenderSprite, type Sprite } from '../core/sprite';

// 升级 = 命运轮盘老虎机（DOM 覆盖层）。三个卷轴转动落定；落定后点击或按 1/2/3 选择。
// 三个相同 = JACKPOT；两个相同 = 双连。匹配数作为 stacks 倍率回传。
const iconById = new Map<string, Sprite>();
for (const id in ICONS) iconById.set(id, prerenderSprite(ICONS[id]));
const spinIcons = ICON_LIST.map((d) => prerenderSprite(d)); // 转动时循环展示

let overlay: HTMLDivElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
const timers: number[] = [];

export function isSlotOpen(): boolean {
  return overlay !== null;
}

function drawIcon(cv: HTMLCanvasElement, spr: Sprite): void {
  const ictx = cv.getContext('2d');
  if (!ictx) return;
  ictx.imageSmoothingEnabled = false;
  ictx.clearRect(0, 0, cv.width, cv.height);
  const s = Math.floor(cv.width / spr.w);
  const dw = spr.w * s;
  const dh = spr.h * s;
  ictx.drawImage(spr.canvas, 0, 0, spr.w, spr.h, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
}

export function showSlot(reels: UpgradeOption[], onPick: (opt: UpgradeOption, stacks: number) => void): void {
  hide();
  if (reels.length === 0) {
    onPick({ id: 'noop', title: '', desc: '', cursed: false, apply: () => {} }, 1);
    return;
  }

  const counts = new Map<string, number>();
  for (const r of reels) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);

  overlay = document.createElement('div');
  overlay.className = 'levelup';
  const panel = document.createElement('div');
  panel.className = 'levelup-panel';

  const title = document.createElement('div');
  title.className = 'levelup-title';
  title.textContent = '🎰 命 运 轮 盘';
  panel.appendChild(title);

  const row = document.createElement('div');
  row.className = 'slot-reels';

  const canvases: HTMLCanvasElement[] = [];
  const titles: HTMLDivElement[] = [];
  const descs: HTMLDivElement[] = [];
  const badges: HTMLDivElement[] = [];
  const cells: HTMLButtonElement[] = [];
  const stopped = [false, false, false];
  let allStopped = false;

  reels.forEach((opt, i) => {
    const cell = document.createElement('button');
    cell.className = opt.cursed ? 'slot-reel cursed' : 'slot-reel';
    const badge = document.createElement('div');
    badge.className = 'slot-badge';
    const cv = document.createElement('canvas');
    cv.width = 80;
    cv.height = 80;
    cv.className = 'slot-icon';
    const t = document.createElement('div');
    t.className = 'slot-title';
    const d = document.createElement('div');
    d.className = 'slot-desc';
    cell.appendChild(badge);
    cell.appendChild(cv);
    cell.appendChild(t);
    cell.appendChild(d);
    cell.onclick = () => {
      if (allStopped) choose(i);
    };
    row.appendChild(cell);
    canvases.push(cv);
    titles.push(t);
    descs.push(d);
    badges.push(badge);
    cells.push(cell);
  });
  panel.appendChild(row);

  const banner = document.createElement('div');
  banner.className = 'slot-banner';
  panel.appendChild(banner);
  const hint = document.createElement('div');
  hint.className = 'levelup-hint';
  hint.textContent = '转动中…';
  panel.appendChild(hint);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // 转动：各卷轴循环展示图标
  let tick = 0;
  const spin = window.setInterval(() => {
    tick++;
    for (let i = 0; i < reels.length; i++) {
      if (stopped[i]) continue;
      drawIcon(canvases[i], spinIcons[(tick + i * 3) % spinIcons.length]);
    }
  }, 70);
  timers.push(spin);

  // 逐个落定（错峰），最后一个落定后揭晓
  reels.forEach((opt, i) => {
    const stopT = window.setTimeout(
      () => {
        stopped[i] = true;
        drawIcon(canvases[i], iconById.get(opt.id) ?? spinIcons[0]);
        titles[i].textContent = opt.title;
        descs[i].textContent = opt.desc;
        if (i === reels.length - 1) {
          window.clearInterval(spin);
          allStopped = true;
          reveal();
        }
      },
      650 + i * 360,
    );
    timers.push(stopT);
  });

  function reveal(): void {
    hint.textContent = '点击或按 1 / 2 / 3 选择';
    let hasJackpot = false;
    let hasPair = false;
    reels.forEach((opt, i) => {
      const c = counts.get(opt.id) ?? 1;
      if (c === 3) {
        cells[i].classList.add('jackpot');
        badges[i].textContent = '三连!';
        hasJackpot = true;
      } else if (c === 2) {
        cells[i].classList.add('match');
        badges[i].textContent = '双连';
        hasPair = true;
      }
    });
    if (hasJackpot) {
      banner.textContent = '✦ JACKPOT 三连 · 三倍强化 + 回满血 + 怨魂 ×2 ✦';
      banner.classList.add('show', 'gold');
    } else if (hasPair) {
      banner.textContent = '双连 · 选中匹配项 = 双倍强化';
      banner.classList.add('show');
    }
  }

  function choose(i: number): void {
    const opt = reels[i];
    const stacks = counts.get(opt.id) ?? 1;
    hide();
    onPick(opt, stacks);
  }

  keyHandler = (e: KeyboardEvent) => {
    if (!allStopped) return;
    const i = e.code === 'Digit1' ? 0 : e.code === 'Digit2' ? 1 : e.code === 'Digit3' ? 2 : -1;
    if (i >= 0 && i < reels.length) choose(i);
  };
  window.addEventListener('keydown', keyHandler);
}

function hide(): void {
  for (let i = 0; i < timers.length; i++) {
    window.clearInterval(timers[i]);
    window.clearTimeout(timers[i]);
  }
  timers.length = 0;
  if (keyHandler) {
    window.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}
