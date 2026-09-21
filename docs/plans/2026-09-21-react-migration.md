# 实施计划：前端迁移到 React

> 建立时间：2026-09-21
> 决策记录：`docs/adr/0001-frontend-react-migration.md`（已接受）
> 前置 spec：`docs/specs/mobile-usability-v1.0.md`
> 执行约定：每完成一 Task 更新 `docs/AI-COLLAB.md`；**Phase 1 是硬门禁，不达标即回滚**

---

## Overview

把工作台前端从「原生 ESM + 整页 `innerHTML` 重建」迁移到 React。

**核心策略：不许"6 页一起迁"。** 先迁**一个**页面做试点，用 ADR §5 的 5 条回滚触发条件判定成败，
达标才继续。理由是这次迁移的收益（组件复用、生态、长期架构）**尚未被验证**，而成本（构建链、
两机协作重建、6 页重写）是确定的。**用一个页面的成本买一个可验证的结论。**

**并行约束**：迁移期间手机端的 D1 导航问题**必须先定方案**（决策），但**不在原生里实现**——
在原生里写一遍再在 React 里重写一遍是纯浪费。

---

## 非目标

- ❌ 不改 `src/` 后端（52 个端点、`{ ok, data }` 契约原样复用）
- ❌ 不重写 `app.css`（90 KB / 5294 行**原样保留**，见 Architecture Decisions）
- ❌ 不引入 CSS-in-JS / Tailwind
- ❌ 不做 PWA、不做原生 App（另立 ADR）
- ❌ 不在 Phase 1 之前动任何既有页面

---

## Architecture Decisions

| 决策 | 理由 |
|---|---|
| **`app.css` 90 KB 原样搬，零重写** | 视觉规范已落地在 CSS 里，重写 = 丢掉 5294 行已验证的成果 + 引入新漂移。React 只接管 DOM 生成，样式层不动 |
| **不引 CSS-in-JS / Tailwind** | 同上。省掉重写成本，且视觉零变化（便于截图比对回归） |
| **增量双轨，不做大爆炸切换** | 保留 `index.html` 的 hash 外壳，**逐页**把 `renderXxxPage(root)` 换成 React 挂载点。每迁完一页，其余页照常可用 |
| **先迁最小的页（账号矩阵）** | 16.1 KB、纯 CRUD、无拖拽、无复杂交互，且后端已有测试覆盖 |
| **最后迁内容计划** | 30.9 KB + 拖拽，D2 在此解决，风险最高 → 放最后（fail fast 的例外：它的失败不阻塞其他页） |
| **试点页必须核算代码量** | ADR §5 T1：迁移后行数若没下降，说明组件化没带来收益 |

---

## Task List

### Phase 0 · 准备（不写业务代码）

#### Task 1: 前端技术选型 ADR

**Description：** 定案具体技术栈并落 ADR-0002：构建工具、React 版本、是否上 TypeScript、
路由方案、状态管理、拖拽库、测试工具。

**Acceptance criteria：**
- [ ] `docs/adr/0002-frontend-stack-choices.md` 落盘，含每个选择的理由与备选
- [ ] 明确「是否上 TypeScript」的结论（影响后续所有任务的验收标准）
- [ ] 明确「路由：react-router vs 保留 hash 路由」

**Verification：**
- [ ] 人眼复核：每个选择都有理由，不是罗列
- [ ] 与 ADR-0001 §6 的前置约束无冲突

**Dependencies：** None
**Files likely touched：** 新增 `docs/adr/0002-frontend-stack-choices.md`
**Estimated scope：** S（1 文件）

---

#### Task 2: 重写 `AGENTS.md` §2 技术栈铁律

**Description：** §2 现在写着「当前为原生 JS 前端，**不要未经协商引入 React/Vue/构建器**」。
迁移后必须重写该节，否则对面机器的 AI 会按旧铁律拒绝新代码。

**Acceptance criteria：**
- [ ] §2 前端行改为 React + 构建工具的实况
- [ ] §3 目录地图新增前端源码目录
- [ ] 保留一句迁移期说明：「旧页面仍在 `public/js/pages/`，新页面在 `<新目录>`」

**Verification：**
- [ ] `grep -n "不要未经协商引入" AGENTS.md` → `0`
- [ ] 人眼复核：新铁律与 Task 1 的选型一致

**Dependencies：** Task 1
**Files likely touched：** `AGENTS.md`
**Estimated scope：** S（1 文件）

---

#### Task 3: 重划两机分工

**Description：** 引入构建链后 `package.json` / `node_modules` / 构建产物会成为高频冲突点。
需在 `docs/AI-COLLAB.md` 重划分工：迁移期间前端全部归一台机器，另一台只碰 `src/`。

**Acceptance criteria：**
- [ ] `docs/AI-COLLAB.md` §1 分工表更新，写明迁移期的临时分工
- [ ] 写明迁移期结束时如何恢复原分工
- [ ] 共享开发日志新增本轮条目（含当前分支与迁移状态）

**Verification：**
- [ ] `grep -c "^### 2026-" docs/AI-COLLAB.md` → `≥1`
- [ ] 人眼复核：分工无重叠区

**Dependencies：** Task 1
**Files likely touched：** `docs/AI-COLLAB.md`
**Estimated scope：** XS（1 文件）

---

### Checkpoint: Phase 0 · 准备

- [ ] 选型 ADR 已落盘
- [ ] `AGENTS.md` 铁律已更新
- [ ] 另一台机器已被告知（写入共享日志）
- [ ] **人工确认后进入 Phase 1**

---

### Phase 1 · 试点页门禁 ⛔

#### Task 4: 搭构建脚手架（新旧并存）

**Description：** 加 Vite + React 构建链，**不删任何旧代码**。产物输出到 `public/` 下独立路径，
旧页面继续通过 hash 路由可用。

**Acceptance criteria：**
- [ ] `npm run dev` 与 `npm run build` 均可用
- [ ] 旧 6 个页面在 `npm start` 下**行为完全不变**
- [ ] 构建产物与旧前端文件不互相覆盖
- [ ] `npm test` 仍全绿（后端测试不受影响）

**Verification：**
- [ ] `npm run build` 成功且产物存在
- [ ] 6 个旧页面逐个点开，与改动前截图比对无差异
- [ ] `npm test` 全绿

**Dependencies：** Task 2、Task 3
**Files likely touched：** `package.json`、`vite.config.js`（新增）、`.gitignore`、`Dockerfile`
**Estimated scope：** M（4 文件）

---

#### Task 5: 迁移「账号矩阵」页（试点）

**Description：** 把 `public/js/pages/accounts.js`（16.1 KB）迁成 React 组件。
`app.css` 原样复用，视觉必须零变化。

**Acceptance criteria：**
- [ ] 账号 CRUD 全部可用（增 / 改 / 删 / 状态流转）
- [ ] 三平台信息编辑可用
- [ ] 视觉与旧版**逐像素一致**（同视口截图比对）
- [ ] **代码行数 ≤ 旧版**（ADR §5 T1 门禁）
- [ ] 在 375×812 下可用

**Verification：**
- [ ] `wc -l` 对比新旧实现行数，记录到试点报告
- [ ] 1280×800 截图与旧版比对
- [ ] 375×812 实测 CRUD 一轮
- [ ] 后端接口无改动（`git diff src/` 为空）

**Dependencies：** Task 4
**Files likely touched：** 新增 React 源码目录、`public/index.html`（挂载点）
**Estimated scope：** M（3–5 文件）

---

#### Task 6: 试点核算与门禁判定 ⛔

**Description：** 对 ADR §5 的 5 条回滚触发条件逐条判定，产出试点报告。
**这是硬门禁——不达标则回滚，不进入 Phase 2。**

**Acceptance criteria：**
- [ ] 报告逐条回答 ADR §5 的 T1–T5，每条给出证据
- [ ] 记录实际耗时（对照 T2：超 2 个工作日即触发回滚）
- [ ] 记录手机端首屏时间（原生版 vs React 版，对照 T3）
- [ ] 给出明确结论：**继续 / 回滚**

**Verification：**
- [ ] 报告落盘 `docs/specs/react-pilot-report.md`
- [ ] 5 条触发条件每条都有可复现的证据，不是主观描述
- [ ] **人工签字后才进入 Phase 2**

**Dependencies：** Task 5
**Files likely touched：** 新增 `docs/specs/react-pilot-report.md`
**Estimated scope：** S（1 文件）

---

### Checkpoint: Phase 1 · 试点门禁 ⛔

- [ ] 试点页功能完整、视觉零变化
- [ ] 代码行数下降
- [ ] 手机端首屏未变慢
- [ ] 耗时 ≤ 2 个工作日
- [ ] `src/` 零改动
- [ ] **任一条不满足 → 回滚，本计划终止**

---

### Phase 2 · 基础设施（门禁通过后才做）

#### Task 7: Docker 多阶段构建

**Acceptance criteria：**
- [ ] `Dockerfile` 改为 build + runtime 两阶段
- [ ] 镜像内不含 `node_modules` 源码目录与构建缓存
- [ ] `docker compose up` 在 NAS 上可用（端口 4174）

**Verification：**
- [ ] 本地 `docker build` 成功
- [ ] NAS 部署后 6 个页面全部可访问
- [ ] `docker images` 对比体积，记录变化

**Dependencies：** Task 6（门禁通过）
**Files likely touched：** `Dockerfile`、`docker-compose.yml`、`deploy.sh`
**Estimated scope：** S（3 文件）

---

#### Task 8: 前端测试基线

**Description：** 项目现有 17 个用例全是后端 `node --test`。为 React 组件建立最小测试网，
**只覆盖试点页**，不追求覆盖率。

**Acceptance criteria：**
- [ ] 测试框架接入，`npm test` 仍能一次跑完后端 + 前端
- [ ] 试点页有 ≥3 个用例（渲染 / 增 / 删）
- [ ] 测试不依赖真实数据库

**Verification：**
- [ ] `npm test` 输出同时包含前后端用例
- [ ] 故意改坏一处，确认测试会红

**Dependencies：** Task 7
**Files likely touched：** `package.json`、新增测试文件、`test/` 或新目录
**Estimated scope：** M（3–4 文件）

---

### Checkpoint: Phase 2 · 基础设施

- [ ] NAS 部署可用
- [ ] 前后端测试一条命令跑完
- [ ] **人工确认后进入 Phase 3**

---

### Phase 3 · 逐页迁移（风险升序）

> 每页一个 Task，验收标准同构：**功能等价 + 视觉零变化 + 行数不增 + 三视口可用**。
> 每迁完一页立即提交，保持系统始终可用。

| Task | 页面 | 旧文件 | 体积 | 风险点 |
|---|---|---|---|---|
| T9 | 知识资产 | `knowledge.js` | 22.6 KB | markdown 渲染（marked + dompurify） |
| T10 | 今日工作台 | `dashboard.js` | 19.5 KB | 日历 + 待办状态 |
| T11 | 数据复盘 | `data-review.js` | 27.2 KB | 表单 + 抽屉 |
| T12 | 灵感雷达 | `inspiration.js` | 35.5 KB | CSV 导入 + 图表 + 抽屉 |
| T13 | 内容计划 | `content-plan.js` | 30.9 KB | **拖拽（D2 在此解决，用 dnd-kit）** |

**T13 额外验收：**
- [ ] 375×812 下可推进/回退内容卡状态
- [ ] 看板横向滚动与拖拽手势不冲突
- [ ] ≥860px 鼠标拖拽行为与旧版一致

**Dependencies：** T13 依赖 T9–T12；其余各页相互独立，可并行
**Estimated scope：** 每页 M（3–5 文件）

---

### Checkpoint: Phase 3 · 全页迁移完成

- [ ] 6 个页面全部迁移完成
- [ ] 三视口 × 6 页 = 18 张截图核验通过
- [ ] 无横向溢出
- [ ] 手机端 6 个导航入口全部可达（D1 已解）
- [ ] `npm test` 全绿

---

### Phase 4 · 清理与收口

#### Task 14: 删除旧前端 + 更新文档引用

**Acceptance criteria：**
- [ ] `public/js/pages/` 下 6 个旧文件删除（`git rm`）
- [ ] 全库无指向旧文件的引用
- [ ] `AGENTS.md` §3 目录地图更新为最终形态
- [ ] `README-产品总览.md` 技术概要更新

**Verification：**
- [ ] `grep -rn "pages/content-plan\|pages/data-review" --include="*.md" .` → 零命中
- [ ] `npm test` 全绿

**Dependencies：** Phase 3 完成
**Files likely touched：** 删除 6 文件、`AGENTS.md`、`README.md`、`README-产品总览.md`
**Estimated scope：** M

---

#### Task 15: 回写 as-built + 关闭 ADR

**Acceptance criteria：**
- [ ] `as-built-2026-09-21.md` §4 第 11 条（前端实现方式）更新为 React 实况
- [ ] ADR-0001 状态改为「已落地」，并追加一节记录实际结果与预估的偏差
- [ ] `docs/specs/README.md` §2 状态表更新

**Verification：**
- [ ] 人眼复核：as-built 与实际代码一致
- [ ] ADR 的「实际结果 vs 预估」一节有具体数字

**Dependencies：** Task 14
**Files likely touched：** `docs/specs/as-built-2026-09-21.md`、`docs/adr/0001-*.md`、`docs/specs/README.md`
**Estimated scope：** S（3 文件）

---

## Risks and Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| **成本被低估，迁移失控** | 高 | Phase 1 硬门禁；ADR §5 T2（超 2 个工作日即回滚） |
| **两机协作断裂** | 高 | Task 3 重划分工；迁移期前端归一台机器；日志强制更新 |
| **双轨期维护两套前端** | 中 | 限定双轨时长（建议 ≤2 周），超期则要么加速要么回滚 |
| **视觉回归** | 中 | `app.css` 零改动 + 每页截图比对，让视觉变化可控可查 |
| **拖拽库选型错误（T13）** | 中 | 放最后迁，失败不阻塞其他页；先做一次手势可行性验证 |
| **`node_modules` 冲突** | 中 | `package-lock.json` 单一归属；`.gitignore` 已排除 |
| **沉没成本导致不肯回滚** | 高 | ADR §5 预设触发条件，把"回滚"变成事先约定的正常分支，而非失败 |

---

## Open Questions

1. **是否上 TypeScript？** 影响所有后续验收标准。收益：长期可维护；成本：对 vibe coding 节奏有摩擦。
2. **路由方案？** react-router（约 20 KB+）vs 保留现有 hash 路由（2.3 KB）——后者可与双轨策略更平滑衔接。
3. **状态管理？** Context 够用，还是上 zustand？6 页规模下 Context 大概率够。
4. **双轨期上限多久？** 建议 2 周，超期即触发重新评估。
5. **`feature/dev-dashboard-today` 分支怎么处理？** 它与迁移在同一批文件上冲突，必须先定。
6. **D1 导航方案定案**（阻塞 Task 2 之后的 React 实现）—— 见 `mobile-usability-v1.0.md` §6 问题 1。
7. **同期做 PWA 吗？** 迁到 React 后再加 manifest + service worker 成本很低，可考虑合并。

---

*制定人：白灵 🎬 · 2026-09-21*
