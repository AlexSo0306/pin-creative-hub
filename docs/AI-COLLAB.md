# AI 协作手册 & 共享开发日志（两机共同维护）

> 硬性公约在 `AGENTS.md`。本文件是**两只 AI 的共享记忆**：
> 每次收工都在下面的「共享开发日志」追加一行，另一台机器 `git pull` 后即可恢复上下文。
> 本文件应始终留在 main 分支 —— 它本身就是跨机器的同步媒介。

---

## 1. 分工约定（两机如何不冲突）

| 机器 | 默认负责（建议） | 改文件前留意 |
|---|---|---|
| 电脑 A（后端优先） | `server.js`、`src/`、`test/`、`data/` | 跑 `npm test` |
| 电脑 B（前端优先） | `public/index.html`、`public/js/`、`public/css/` | 逐屏自查 |

- 两人都要碰的文件（如 `src/schema.sql`、`public/index.html`）：提前在开发日志里认领，避免同时编辑。
- 分支命名：前端 `feature/fe-*`，后端 `feature/dev-*`，一眼区分归属。

## 2. 一次完整的协同步骤

```
A、B 开工前：git checkout main && git pull origin main   # 两边都在最新
A 建分支 → 改后端 → npm test → 更新日志 → push
B 建分支 → 改前端 → 自查 → 更新日志 → push
合入 main 前：git pull 解决冲突 → review → merge → 删本地分支
```

## 3. 合入 main 前 check（逐条确认）

- [ ] `npm test` 通过
- [ ] 未提交文件不含 `.env` / `*.db` / `node_modules/`
- [ ] 共享开发日志已更新（含"下一步"）
- [ ] 无强推（force push）

---

## SHARED DEV LOG（共享开发日志）— 最新在上

<!-- 约定格式：
---
### YYYY-MM-DD HH:MM · 机器A/B · 主题
- 做了什么 / 改到哪
- 卡在哪 / 踩过的坑
- 决策依据（为什么这么写）
- 下一步（供对侧接续）
-->

---
### 2026-09-21 15:51 · 机器B · 新增「锅宝」角色挂件（前端，零侵入）
- **认领 `public/index.html`**（按 §1 约定，两人都要碰的文件需先认领）。本机只加了 2 行：
  `<link rel="stylesheet" href="/css/mascot.css">` 与 `<script type="module" src="/js/components/mascot-dock.js">`。
  **未改 `public/js/app.js`、未改 `public/css/app.css`** —— 挂件自挂载，对既有代码零侵入。
- 新增 3 个文件：`public/js/components/mascot.js`（引擎，19 KB）、
  `public/js/components/mascot-dock.js`（挂载 + 路由驱动）、`public/css/mascot.css`（3 KB）。
- 配色全部走既有 token（`--surface-raised` / `--accent` / `--fg` / `--meta`），
  因此 `framer`（深）与 `fluent`（浅）两套主题自动跟随，**没有新增主题分支**。
- **实测证据**（无头 Chrome + CDP，非读代码推断）：
  挂载成功 / 路由驱动生效（dashboard→focus、inspiration→curious、knowledge→sleepy，
  每次 blob path 均变化）/ `window.mascotDock.setState()` 与 `setEnergy()` 生效 /
  浅色主题下锅身 `rgb(16,16,16)→rgb(255,255,255)` / 页面零横向溢出 / 与 `.toast` 不重叠 /
  **控制台零报错**。`npm test` 18/18 通过（本次未动后端）。
- **性能口径（重要，别被数字骗）**：无头软件渲染下 rAF 帧率读数只有 5–9 fps，
  但用 `performance.now()` 包住 rAF 回调实测**每帧同步耗时仅 0.088 ms（2 实例）**，
  且「空转基线」比「带 2 个实例」还慢 —— 说明帧率读数是无头环境的调度伪影，
  与代码无关。**排查性能问题要先怀疑测量方法**。
- 已完成的两处有据可依的优化：path 生成 `toFixed(2)` → `Math.round`；
  控制点 24 → 18（最高角频率只有 4，Nyquist 只需 >8）。path 字符串 957 → 698 字符（−27%）。
- **下一步（接续点）**：默认状态驱动是「路由 + 本地时间（23:00–07:00 强制 sleepy）」，
  这是占位驱动。接真实业务数据**不要改 mascot-dock.js**，改由页面调用：
  `window.mascotDock.setState('celebrate', { say: '今天的排期都发完了' })` /
  `window.mascotDock.setEnergy(0..1)`。最自然的接入点是 `pages/dashboard.js`
  拿到今日排期数据之后。逃生口：`localStorage['phj-workbench-mascot'] = 'off'` 即永久隐藏。
- ⚠ **合并顺序提醒**：本分支从 `main`(41023fe) 切出，`feature/dev-dashboard-today`
  也在改本文件（110 行 vs main 46 行）。若两者都合 main，**本文件的日志段会冲突**，
  解决时取两边新增内容即可（纯追加，无逻辑冲突）。
