# Grimharvest 开发规范

中世纪风格割草生存游戏（Vampire Survivors-like）。游戏设计机制见 [README.md](README.md)。

## 技术栈

- **TypeScript（strict 模式）+ 原生 Canvas 2D**，不引入游戏引擎
- 构建工具：Vite
- 零运行时依赖优先：能自己写的不引包（数学、碰撞、随机数都自己实现）
- 部署：GitHub Pages（通过 GitHub Actions 自动部署 `dist/`）

## 常用命令

```bash
npm run dev        # 本地开发服务器
npm run build      # 生产构建到 dist/
npm run typecheck  # tsc --noEmit
```

## 目录结构约定

```
src/
  core/      # 引擎层：游戏循环、对象池、空间哈希、输入、相机（不含任何游戏逻辑）
  entities/  # 玩家、敌人、投射物、掉落物
  weapons/   # 每把武器一个文件，实现统一的 Weapon 接口
  systems/   # 刷怪波次、升级三选一、碰撞、伤害结算
  data/      # 纯数据配置：武器数值表、敌人数值表、波次时间表
  ui/        # HUD、升级面板、菜单（DOM 覆盖层，不画在游戏 Canvas 上）
main.ts      # 入口，只做组装
```

**核心原则：数值与逻辑分离。** 所有平衡性数值（伤害、血量、刷怪节奏、升级权重）必须放在 `src/data/` 的配置表里，禁止硬编码在逻辑代码中——调平衡只改 data，不动逻辑。

## 架构红线（性能）

割草游戏的命脉是同屏几千个实体跑满 60fps，以下规则不可妥协：

1. **对象池**：敌人、投射物、伤害数字、经验宝石一律走对象池，游戏循环内禁止 `new` 实体对象
2. **空间哈希**：碰撞检测必须走空间哈希网格，禁止 O(n²) 两两遍历
3. **游戏循环内零分配**：update/render 热路径中不创建数组、对象、闭包；复用预分配的缓冲
4. **固定时间步长**：逻辑更新用 fixed timestep（如 60Hz）+ 渲染插值，保证不同刷新率下手感一致
5. **渲染**：用离屏 Canvas 预渲染精灵，主循环只做 `drawImage`；按类型分批绘制减少状态切换

## 代码风格

- 实体用 **组合优于继承**：不搞深继承树，用接口 + 数据组件
- 武器实现统一接口：`update(dt, world)` / `onLevelUp()` / 进化条件声明在 data 表中
- 随机数必须走自实现的**可种子化 PRNG**（为每日种子挑战铺路），禁止直接用 `Math.random()`
- 文件名小写连字符（`spatial-hash.ts`），类型/类 PascalCase，其余 camelCase
- 注释和文档用中文，代码标识符用英文

## Git 约定

- 提交信息用英文，格式：`<type>: <description>`（type: feat / fix / balance / perf / refactor / docs）
- 数值调整单独提交，用 `balance:` 前缀，方便回溯手感变化
- `main` 分支保持随时可玩：每次提交后游戏必须能正常开局、不报错

## 验收习惯

- 改动核心循环或碰撞后，跑一局到 3 分钟以上确认无卡顿、无报错再提交
- 性能验证标准：同屏 2000 敌人 + 500 投射物不低于 60fps（Chrome DevTools Performance 面板验证）
