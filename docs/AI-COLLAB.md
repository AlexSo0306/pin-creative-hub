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
### 2026-09-21 17:05 · 机器B · 挂件引擎按参考站点 clean-room 重写为 v2（39 状态 / 8 形状 / 25 眼型 / 11 墨色）

- **背景**：Alex 给了参考站点 `https://grok-icon-study.vercel.app/`，要求「不用自己发挥，照现成的参考对齐」。
  上一版（v1，单文件 19 KB）的引擎是自己拍的；这版按参考的**架构**重写。
- **法律边界（先划清）**：参考仓库的 `geometry-data.js` 头部写着
  `Extracted from Grok Bot.app v0.18.0 app.asar` —— 里面的 `blobPath` / `shapes` / `eyes` / `palette`
  是 xAI 资产，**只学结构与算法，一个坐标一个色值都不搬**。
  本版 8 形状、25 眼型、11 墨色**全部自绘**；从参考只取**比例**当标定基准
  （眼半宽/R=0.1373、眼半高/R=0.1836、眼心偏移/R=0.1937 与 −0.4141）。
  实测默认眼 31×40.3 px，参考基准 30.1×38.6 —— 比例对上了，形状是原创的。
- **学到的架构（这版的核心，逐条都验过）**：
  1. 半隐式欧拉弹簧 `v += (−2ζω·v − ω²(x−t))·dt`，参数写成 `[频率, 阻尼比]`；
     **固定 1/120 s 子步进**（`steps = ceil(dt/DT)`）—— 帧率无关的关键，不是可选项。
  2. 所有形状统一转成**96 点等角度极坐标环**（从中心 (R,R) 出发）。形状共享角度索引
     → 逐点 lerp 形变不打旋。这是「换形状不扭曲」的全部原因。
  3. `buildSpan`：预计算 160 段水平跨度表，让眼睛自动贴合任意剪影。
  4. **眼睛是「挖空」** —— 填**背景色**，不是墨色。这是整个角色的视觉身份。
     （v1 我填的是墨色，眼睛直接看不见了。）
  5. 墨色渐变必须 `gradientUnits="userSpaceOnUse"` + 在 JS 里把颜色**解析成实色**；
     `light-dark()` 在 SVG `<stop>` 上不可靠，`objectBoundingBox` 也不行。
- **文件变化（认领 `public/js/components/mascot*` + `public/css/mascot.css`）**：
  - `public/js/components/mascot.js`：19 KB 单文件 → **5442 B 转发 shim**（保住旧 import 路径不断链）
  - **新增** `public/js/components/mascot/`：`core.js`(14 KB 数学) / `art.js`(15 KB 资产) /
    `pose.js`(20 KB 状态表 + applyPose) / `overlay.js`(11 KB，14 种覆盖动效) /
    `character.js`(29 KB 引擎) / `index.js`(1.8 KB 公开入口)
  - `mascot-dock.js` 重写（路由→状态表、点击转圈）；`mascot.css` 重写
  - **`public/index.html` 一行没动** —— 两条路径没变，所以 v1→v2 对页面零改动
- ⚠️ **破坏性变更（v1 → v2），对侧务必注意**：
  `MASCOT_STATES` 没了（改 `GROUPS` / `ALL_STATES`，39 状态分 4 组）；
  **`setEnergy(0..1)` 没了**（v2 没有「精力」维度，用状态表达）；
  `pulse()` → `spin()`。**若页面里已写了 `setEnergy`，会静默失效。**
- **实测证据**（无头 Chrome + CDP，全部真实事件，非读代码推断）：
  - 引擎自测 **30/30**：8 形状可切、互不相同、不出画框（最大 131.8，上限 132.5）/
    25 眼型互不相同（宽 13–43.2，高 1.9–55.6）/ 39 状态全可切且无 NaN /
    每状态眼睛可见率 ≥ 0.88 / 14 种覆盖动效都有图元且不出画框 /
    同一墨色随主题换端点 / **每帧同步耗时 0.103 ms**
  - 工作台集成 **25/25**：真实 `Input.dispatchMouseEvent` 点击钉住气泡（v1 栽的那个 bug 已回归测试）/
    `elementFromPoint` 命中 `path.gb-body` / 6 路由全部映射到合法状态 /
    浅色主题下眼睛 `rgb(0,0,0)` → `rgb(243,245,248)` /
    移动端 390×844 实测 76×76 且在视口内、真实 `dispatchTouchEvent` 能开能关
  - `npm test` 18/18（本次未动后端）
- 🐞 **本轮最贵的坑：实例字段遮蔽了同名原型方法。**
  `character.js` 里写了 `this.spin = spring(0)`，而类上又有 `spin()` 方法。
  → 外部调 `c.spin(1)` 抛 `TypeError: c.spin is not a function`，
  但 `typeof c.spin` 是 **`"object"`**（不是 `undefined`）—— 报错文本看着像「模块没加载」，
  于是我先怀疑浏览器缓存：查服务端字节、`shasum` 比对、换端口重启，**方向错了半个多小时**。
  → 真正的定位动作是**在页面里打印 `typeof`**，一次就出来了。
  → 已改名 `this.spinSpring`（与 `spinTurn` 成对），并在 `verify.mjs` 加了一道**静态护栏**：
  剥掉注释后扫「2 空格缩进的类方法名」∩「`this.X =` 字段名」，有交集就红。
  已用注入对照验证它真抓得到（把 `spinSpring` 改回 `spin` → 报 `冲突: spin`）。
  → **教训：这类遮蔽完全静默，光靠「跑起来看看」测不出来，必须静态查。**
- 🐞 **另一处：接触表暴露 `pot` 和 `capsule` 长得几乎一样。**
  `pot` 原本是「圆 + 正水平方向一点点凸起」，在 112px 挂件尺寸下**整体仍读作一个圆**，
  而它是挂件默认形状、账号就叫「锅宝」。已重做剪影：耳抬到水平线上方约 29°、幅度 0.26、
  锅身压扁 `[1.05, 0.95]`、底部压平。放大对比见 `放大-形状组.png`。
  → **教训：默认形状必须在真实尺寸（112px）下肉眼验收，光看 96 点环的数字不算。**
- **下一步（接续点）**：
  1. 驱动仍是「路由 + 本地时间（23:00–07:00 强制 sleeping）」占位。接真实业务
     **不要改 mascot-dock.js**，由页面调：`window.mascotDock.setState('celebrate', { say: '…' })` /
     `setShape('pot')` / `setInk('soda')` / `say('数据已同步', 2600)`。
     最自然的接入点是 `pages/dashboard.js` 拿到今日排期之后。
  2. 逃生口：`localStorage['phj-workbench-mascot'] = 'off'` 永久隐藏。
  3. **待 Alex 定**：移动端挂件固定 76px（占屏宽 19%），是否改成「默认隐藏 + 可拖拽」？
  4. 品牌规范规则 1 写的是「不使用渐变」，所以挂件走 `inkFlat: 'var(--fg)'` 纯色；
     参考引擎的墨色是渐变 —— **要不要为角色开个例外**？这是产品决定，我没擅自改。
  5. 引擎源码与验证脚本在 `拼好家创作运营中心/mascot/v2/`（另一个仓库），
     插件里的是**逐字节相同**的副本（`shasum -a 256` 已比对）。
- ⚠ **合并顺序提醒（沿用上一条）**：`feature/dev-dashboard-today` 也在改本文件。
  本分支从 `main`(41023fe) 切出，两边都是**纯追加**，冲突时取两边新增即可。

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
- 🐞 **补记（同日 16:0x，修掉一个自测漏掉的真 bug）**：`mascot.css` 里写的是
  `.pm-dock > .pm-mascot`（**直接**子元素），但实际 DOM 是 `.pm-dock > div > .pm-mascot`
  —— 引擎自己创建根节点，外面还套了一层挂载容器。选择器不匹配 →
  `.pm-mascot` 从 `.pm-dock` 继承到 `pointer-events: none` → **挂件完全点不动**。
  **为什么上一轮没测出来**：只验了 `window.mascotDock.setState()` 这个 JS API，
  没做真实点击。而 `el.click()` 绕过 hit-test 仍然能通 → 单看 JS 层一切正常。
  → **教训：验收必须打「真实指针/触摸事件」这一层**（`Input.dispatchMouseEvent` /
  `Input.dispatchTouchEvent`），程序化 `.click()` 不能替代它。
  → 已改为后代选择器 `.pm-dock .pm-mascot`（两处：主规则 + `prefers-reduced-motion`）。
  桌面真实点击、移动端 `dispatchTouchEvent` 三连点（开→关→开）均已实测通过。
- 📱 **移动端实测（`Emulation.setDeviceMetricsOverride` 390×844，不是靠 `--window-size`）**：
  挂件 92px 时占屏宽 24%、会压住卡片右下角内容 → **已缩到 76px（19%）**；
  距右 10px、距底 66px（让开居中 toast）；与 toast 不重叠、页面零横向溢出、零控制台错误。
