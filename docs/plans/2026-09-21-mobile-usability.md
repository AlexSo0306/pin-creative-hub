# 实施计划：移动端可用性修复

> 建立时间：2026-09-21
> 前置 spec：`docs/specs/mobile-usability-v1.0.md`（**待评审**）
> 执行约定：每完成一 Task 更新 `docs/AI-COLLAB.md` 共享日志；改 `app.css` / `index.html` 前先在日志认领
> ⚠️ **本计划在 spec §6 的两个开放问题定案前，不得开工 Task 2**

---

## Overview

让工作台在手机浏览器上**可用**。当前 CSS 层响应式已做完大半，但有 3 处缺陷导致实际不可用——
最严重的是 `≤640px` 下 `.main-nav a:nth-child(-n+4) { display:none }` 把 6 个导航项砍成 2 个，
且无任何替代入口。

**不引入框架**（`AGENTS.md` §2 协商结论：手机浏览器能用不需要 React）。
全部改动限定在 `public/` 与 `docs/`，`src/` 一行不动。

---

## 非目标

- ❌ 不引入 React / Vue / 构建工具
- ❌ 不做 PWA、不做原生 App
- ❌ 不改桌面端（≥860px）行为与视觉
- ❌ 不重构整页 `innerHTML` 渲染为局部更新（独立议题）
- ❌ 不改后端 `src/`

---

## Architecture Decisions

| 决策 | 理由 |
|---|---|
| **导航先走方案 A（恢复横向滚动）** | 规范 §2.3 原文就要求"导航横向滚动"，代码偏离了规范。删 `display:none` + 加 `overflow-x:auto`，约 5 行，不引入新交互模式 |
| **不引框架** | 手机浏览器能用 = 响应式问题。React 只解 D2/D3 的半个，代价是整套构建链 + 对面机器上下文作废 |
| **改动全部关在媒体查询块内** | 所有新增规则放进 `@media (max-width: 640px)`，桌面端零影响，天然可回滚 |
| **前端不假装有测试** | 项目只有后端 `node --test`。本次靠**无头 Chrome 三视口核验**兜底，不新造一套前端测试 |
| **先定手势方案再动 D2** | 看板横向滚动与拖拽是同一个手势，方案选错要重写 |

---

## Task List

### Phase 1 · 止血（让手机能用）

#### Task 1: 导航可达性修复（方案 A）

**Description：** 删除 `≤640px` 下隐藏前 4 项导航的规则，改为让 `.main-nav` 横向滚动。
这是规范 §2.3 原本要求的形态，属"修正偏离"而非"新增功能"。

**Acceptance criteria：**
- [ ] `≤640px` 下 6 个导航项全部存在且可点击（含当前页）
- [ ] `.main-nav` 可横向滚动，当前项自动滚入可视区
- [ ] 选中态 `.on` + `aria-current="page"` 语义保留
- [ ] `≥860px` 下 `.main-nav` 渲染结果与改动前一致

**Verification：**
- [ ] `grep -c "nth-child(-n+4)" public/css/app.css` → `0`
- [ ] 无头 Chrome 截 375×812：目检 6 项可见/可滚达
- [ ] 无头 Chrome 截 1280×800：与改动前截图逐像素比对无差异
- [ ] 逐个点击 6 项，确认路由正确

**Dependencies：** None
**Files likely touched：** `public/css/app.css`
**Estimated scope：** XS（1 文件，约 5 行）

---

#### Task 2: 看板触屏状态推进

**Description：** 让内容卡在触屏上能推进状态。实现方式**取决于 spec §6 问题 2 的决策**
（长按拖拽 / 按钮推进 / 断点分叉）。若选"长按拖拽"，需用 Pointer Events 替换现有 HTML5 DnD。

**Acceptance criteria：**
- [ ] `≤640px` 下能把卡片从「选题池」推进到「已发布」
- [ ] 能回退（已发布 → 制作中）
- [ ] 状态变更持久化（刷新后仍在）
- [ ] 看板仍可横向滚动浏览 5 个状态列
- [ ] `≥860px` 下拖拽行为与改动前一致

**Verification：**
- [ ] 375×812 实测：推进一次 + 回退一次，刷新确认持久化
- [ ] 375×812 实测：横向滑动看板不被误判为拖拽
- [ ] 1280×800 实测：鼠标拖拽仍可用
- [ ] `npm test` 全绿

**Dependencies：** Task 1；**且 spec §6 问题 2 已定案**
**Files likely touched：** `public/js/pages/content-plan.js`、`public/css/app.css`
**Estimated scope：** M（2 文件）

> ⚠️ 若采用 Pointer Events，注意 `touch-action` 只在**拖拽激活后**设为 `none`，
> 不要预先设在卡片上——否则会锁死页面纵向滚动。

---

### Checkpoint: Phase 1 · 手机可用

- [ ] 375×812 下 6 个模块全部可达
- [ ] 375×812 下能完成一次内容卡状态推进并持久化
- [ ] 1280×800 桌面端截图与改动前一致
- [ ] `npm test` 全绿
- [ ] **人工在真机（非模拟器）上试一次，确认后进入 Phase 2**

---

### Phase 2 · 体验（P1，可推迟）

#### Task 3: 输入焦点与光标保护

**Description：** 整页 `innerHTML` 重建会丢焦点，移动端软键盘随之收起。
在重建前保存 `document.activeElement` 与其 `selectionStart/selectionEnd`，重建后恢复。

**Acceptance criteria：**
- [ ] `≤640px` 下在标题输入框连续输入 10 个字符不中断、不失焦
- [ ] 光标位置在重建后保持在原处（不是跳回开头或结尾）
- [ ] `≥860px` 下输入行为无变化

**Verification：**
- [ ] 375×812 实测：连续输入 10 字符，检查字符数与光标位置
- [ ] 检查 4 个含输入框的页面各一次（内容计划 / 数据复盘 / 账号矩阵 / 知识资产）
- [ ] `npm test` 全绿

**Dependencies：** Task 2
**Files likely touched：** `public/js/pages/content-plan.js`、`public/js/pages/data-review.js`、`public/js/pages/accounts.js`、`public/js/pages/knowledge.js`
**Estimated scope：** M（4 文件）

---

### Checkpoint: Phase 2 · 体验

- [ ] 375×812 下连续输入不中断
- [ ] 桌面端无回归
- [ ] **人工确认后进入 Phase 3**

---

### Phase 3 · 核验与固化

#### Task 4: 三视口无头核验

**Description：** 用无头 Chrome 在 375×812 / 768×1024 / 1280×800 三个视口逐页截图，
核对布局溢出、导航可达性、元素重叠。产出核验报告。

**Acceptance criteria：**
- [ ] 3 个视口 × 6 个页面 = 18 张截图
- [ ] 每个视口 `document.documentElement.scrollWidth <= viewportWidth`（无横向溢出）
- [ ] 报告列出：每页每视口的结论 + 发现的问题 + 「符合项」清单

**Verification：**
- [ ] 18 张截图全部实际目检（不能只看文件名）
- [ ] 报告落盘 `docs/specs/mobile-verify-report.md`

**Dependencies：** Task 3（或 Task 2，若跳过 Phase 2）
**Files likely touched：** 新增 `docs/specs/mobile-verify-report.md`（不改代码）
**Estimated scope：** S（1 文件）
**工具：** 无头 Chrome + CDP（见 `headless-chrome-verify` 技能；注意收尾必须杀干净进程）

---

#### Task 5: 回写 as-built + 断点对齐

**Description：** 把本次移动端修复的结论回写现状基线；并对齐断点声明与实现的差异
（`docs/specs/设计规范-v2.0.md` §2.3 声明 ≤1100 / ≤920，实际 1180 / 1120 / 860 / 640）。

**Acceptance criteria：**
- [ ] as-built §4 第 14–17 条更新为"已修复"或标注修复进度
- [ ] 断点差异**二选一**并写明理由：改规范对齐代码（推荐，代码行为已验证）／改代码对齐规范
- [ ] `设计走查-计划.md` §5 中"5 套主题"的错误前提被标注（与 as-built 第 12 条冲突）

**Verification：**
- [ ] 人眼复核：as-built 与实际代码一致
- [ ] `grep -n "920px\|1100px" docs/specs/设计规范-v2.0.md` → 与 `app.css` 实际断点一致或已加注说明

**Dependencies：** Task 4
**Files likely touched：** `docs/specs/as-built-2026-09-21.md`、`docs/specs/设计规范-v2.0.md`、`拼好家内容创作中心/设计走查-计划.md`
**Estimated scope：** S（3 文件）

---

### Checkpoint: Complete

- [ ] spec §7 的 6 条成功判据逐条勾选
- [ ] `npm test` 全绿
- [ ] 核验报告落盘
- [ ] as-built 已回写
- [ ] 共享日志已更新（含"下一步"）
- [ ] 合入 main 前完成 `docs/AI-COLLAB.md` §3 checklist

---

## Risks and Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| **看板横向滚动与拖拽手势冲突** | 高 | spec §6 问题 2 先定案；Task 2 开工前先做一次最小手势可行性验证 |
| **`touch-action` 设置不当锁死页面滚动** | 高 | 只在拖拽激活后设 `none`，绝不预先设在卡片上；改完立即在真机试纵向滚动 |
| 改动波及桌面端 | 中 | 所有新规则关在 `@media (max-width: 640px)` 内；每 Task 做桌面截图比对 |
| 无前端测试网，回归靠人眼 | 中 | Task 4 的三视口核验兜底；不假装有测试 |
| 另一台机器同时改 `app.css` | 中 | `app.css` 属"两人都要碰的文件"（`AGENTS.md` §5.2），开工前在共享日志认领 |
| 真机与模拟器行为不一致（尤其 iOS DnD） | 中 | Checkpoint 1 要求**真机**确认，不只看模拟器 |

---

## Open Questions

**阻塞 Task 2，必须先答：**

1. **导航方案**（spec §6 问题 1）—— 推荐 A（恢复横向滚动）。若你选 B/C，Task 1 的验收标准需重写。
2. **看板手势方案**（spec §6 问题 2）—— 长按拖拽 / 按钮推进 / 断点分叉。三选一。
3. **D3（焦点保护）是否本轮做？** 属 P1，可推迟到 Phase 2 之后。

**不阻塞，但需记录：**

4. `feature/dev-dashboard-today` 分支是否先合入 main？（与收敛计划共用同一问题）
5. 断点对齐时改规范还是改代码？（Task 5 会提出推荐：改规范）

---

*制定人：白灵 🎬 · 2026-09-21*
