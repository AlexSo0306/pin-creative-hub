# 实施计划：spec 与现状收敛

> 建立时间：2026-09-21
> 前置：`docs/specs/as-built-2026-09-21.md`（现状基线）、`docs/specs/README.md`（权威顺序）
> 执行约定：每完成一 Task 更新 `docs/AI-COLLAB.md` 共享日志；改 `AGENTS.md` 前先在日志认领

---

## Overview

仓库里有 10 份规格类文档，与已实现的代码大面积脱节：`README-产品总览.md` 把 5 个已实现的模块标成"待开发"，6 处引用已失效，而 `AGENTS.md` 要求的跨机器共享开发日志**一条都没有**。

本计划**不写新功能**，只做一件事：**让文档重新可信，并建立防止再次漂移的机制**。

三个阶段：**止血**（消除误导）→ **归位**（规格出代码目录 + 定义权威）→ **机制**（让交接真的跑起来）。

---

## 非目标

- ❌ 不改任何 `src/` 或 `public/` 代码
- ❌ 不删除任何历史 spec（它们描述目标态，仍有价值）
- ❌ 不重写 6 份 Feature Spec 的正文
- ❌ 不核对 `docs/PRD-…-现状与流程评审.md` 与 `DEVELOPMENT-PLAN.md`（各 25 KB，单独一轮）
- ❌ 不处理"今日工作台六区块"的实施（属 `feature/dev-dashboard-today` 分支）

---

## Architecture Decisions

| 决策 | 理由 |
|---|---|
| **只加不改**：过期文档加状态标记，不重写正文 | 重写会丢失目标态信息；且无法验证重写是否引入新失真 |
| **权威顺序落纸**：代码 > AGENTS.md > as-built > Feature Spec > README | 现在没有任何地方写清楚冲突时听谁的，这是漂移的根因 |
| **规格与代码分离**：6 份 Feature Spec 移入 `docs/specs/` | 规格混在代码目录根下，是"顺手改一下"的诱因 |
| **Task 按文件串行**：同一文件的改动合并进一个 Task | 并发改同一文件会静默丢改动（已踩过），本计划全程遵守 |
| **验证用 grep 断言**，不靠人眼 | 文档任务的验收必须是机械可检的 |

---

## Task List

### Phase 1 · 止血

#### Task 1: 修正 `README-产品总览.md`

**Description：** 该文件最后更新 2026-08-04，早于 SQLite 迁移，是当前误导性最强的一份。修正四处：§2 成熟度列（5 个模块从"待开发"改为实际状态）、§6 技术概要（`workbench.json` → SQLite）、§2/§7 失效引用、§3 断点表述。

**Acceptance criteria：**
- [ ] §2 模块表的"成熟度"列与 as-built §3 一致，不再出现"待开发"
- [ ] §6 不再出现 `workbench.json` / `WorkbenchStore`
- [ ] §2 表尾与 §7 不再出现 `模块PRD-v1.0/`
- [ ] §2/§7 中 `灵感雷达v2-Feature-Spec.md` 改为实际文件名
- [ ] 文件头加一行：`> ⚠️ 本文件为历史快照，现状以 docs/specs/as-built-2026-09-21.md 为准`

**Verification：**
- [ ] `grep -c "workbench.json" README-产品总览.md` → `0`
- [ ] `grep -c "模块PRD-v1.0" README-产品总览.md` → `0`
- [ ] `grep -c "待开发" README-产品总览.md` → `0`
- [ ] 人眼复核：成熟度列 6 行与 as-built §3 逐行对齐

**Dependencies：** None
**Files likely touched：** `拼好家内容创作中心/README-产品总览.md`
**Estimated scope：** S（1 文件）

---

#### Task 2: 修正根 `README.md` 的文档导航

**Description：** 根 README 的项目结构与文档导航未提及 `docs/specs/`、`docs/plans/`，且未指向 as-built。

**Acceptance criteria：**
- [ ] 项目结构表新增 `docs/specs/` 一行（说明：规格与现状基线）
- [ ] 文档导航表新增 as-built 与 spec 索引两行
- [ ] 不新增"权威顺序"的副本，只引用 `docs/specs/README.md`（避免双份真相）

**Verification：**
- [ ] `grep -c "docs/specs" README.md` → `≥2`
- [ ] 人眼复核：无重复的权威顺序表

**Dependencies：** Task 1
**Files likely touched：** `README.md`
**Estimated scope：** XS（1 文件）

---

### Checkpoint: Phase 1 · 止血

- [ ] 全库 `grep -rn "模块PRD-v1.0\|workbench.json\|灵感雷达v2-Feature" --include="*.md"` → 零命中
- [ ] 新接手的人只读 README 不会再得到"5 个模块待开发"的错误认知
- [ ] **人工确认后进入 Phase 2**

---

### Phase 2 · 归位与建立权威

#### Task 3: 把 Feature Spec 移入 `docs/specs/` ✅ **已完成 2026-09-21**

> **执行记录（2026-09-21）：**
> 1. **范围扩大**：除 6 份 `*-v2.0-Feature-Spec.md`，`设计规范-v2.0.md` 与 `brand-spec.md` **一并移入**，共 **8 份**。触发源：用户指令「整理所有模块的 spec 单独存放在一个文件夹里面」。
> 2. **未用 `git mv`**：本机有后台进程反复重建 `.git/index.lock`，`git mv` 报 `Unable to create index.lock`。改用文件系统 `mv` + `git add -A`；git 按内容识别为 **8 个 `R`（rename）**，历史同样保留，未丢失。
> 3. **Task 4 已一并执行**（引用修正与移动同批次完成，无中间态）。

**Description：** 8 份规格文档从 `拼好家内容创作中心/` 根目录移到 `docs/specs/`。

**Acceptance criteria：**
- [x] 8 份文件在 `docs/specs/` 下，`拼好家内容创作中心/` 根目录不再有 `*-Feature-Spec.md` / `设计规范-v2.0.md` / `brand-spec.md`
- [x] 文件内容零改动（`git status --short` 显示为 `R`，非 delete+add）
- [ ] `git log --follow` 能追到移动前的历史（**待提交后验证**）

**Verification：**
- [x] `git status --short` 显示 8 个 `R`（rename）
- [x] `ls 拼好家内容创作中心/*-Feature-Spec.md` → 无匹配
- [x] `git add -A` 后 `git diff --cached -M --stat` 中每份文件无内容变更

**Dependencies：** Task 2
**Files likely touched：** 8 个规格文件（移动）
**Estimated scope：** L（8 文件，但纯机械、零逻辑风险——不拆）

---

#### Task 4: 更新全部指向旧路径的引用 ✅ **已完成 2026-09-21**

**Description：** 移动后，`AGENTS.md` §3、根 `README.md`、`README-产品总览.md` §2/§7、`docs/specs/README.md` §2/§3、`docs/specs/as-built-2026-09-21.md`、`docs/specs/mobile-usability-v1.0.md`、`docs/adr/0001`、`docs/plans/2026-09-21-mobile-usability.md`、`拼好家内容创作中心/设计走查-计划.md` 中的路径全部失效，统一修正。
**实际改动范围比原计划大**（原计划只列 4 个文件），因为 2 份规范文档一并移动，波及面扩大。

**Acceptance criteria：**
- [x] 全库不再有指向 `拼好家内容创作中心/*-Feature-Spec.md` 的路径
- [x] `AGENTS.md` §3 目录地图中该行更新为 `docs/specs/`
- [x] `docs/specs/README.md` §2 状态表的位置列更新
- [x] 8 份文档**自身**的内部链接一并修正（4 份 spec 的 `模块PRD-v1.0/` 死链、灵感雷达的 Desktop 绝对路径）

**Verification：**
- [x] `grep -rn "拼好家内容创作中心/[^/]*Feature-Spec" --include="*.md" .` → 零命中
- [x] 逐个点开被改文件，确认路径可解析（文件真实存在）

**Dependencies：** Task 3（与 Task 3 同一批次）
**Files likely touched：** `AGENTS.md`、`README.md`、`拼好家内容创作中心/README-产品总览.md`、`拼好家内容创作中心/设计走查-计划.md`、`docs/specs/README.md`、`docs/specs/as-built-2026-09-21.md`、`docs/specs/mobile-usability-v1.0.md`、`docs/adr/0001-frontend-react-migration.md`、`docs/plans/2026-09-21-mobile-usability.md`、8 份被移动的文档
**Estimated scope：** L（实际 14 文件，远超原估 M）

---

#### Task 5: `AGENTS.md` 增加两条 spec 铁律

**Description：** 在 `AGENTS.md` 新增一节，写死两件事：① spec 冲突时的权威顺序；② **任何 spec 变更必须同轮回写 as-built**。这是防止再次漂移的唯一机制。

**Acceptance criteria：**
- [ ] 新增 §「spec 与文档权威」小节，含权威顺序（5 级）与回写规则
- [ ] 指向 `docs/specs/README.md` 与 `docs/specs/as-built-2026-09-21.md`
- [ ] 不与 `docs/specs/README.md` §1 产生措辞冲突（该文件指向 AGENTS.md 为准）

**Verification：**
- [ ] 人眼复核：两条规则各≤3 行，可被机械理解
- [ ] 在 `docs/AI-COLLAB.md` 日志中认领本文件（避免与另一台机器同时编辑）

**Dependencies：** Task 4（同文件串行）
**Files likely touched：** `AGENTS.md`
**Estimated scope：** S（1 文件）

---

### Checkpoint: Phase 2 · 归位

- [ ] `docs/specs/` 下无重复真相：索引说权威、as-built 说现状、Feature Spec 说目标态
- [ ] 全库无失效路径
- [ ] `AGENTS.md` 已写死回写规则
- [ ] **人工确认后进入 Phase 3**

---

### Phase 3 · 让机制真的跑起来

#### Task 6: 补写共享开发日志 + 加空转校验

**Description：** `docs/AI-COLLAB.md` 的「SHARED DEV LOG」目前零条记录。补上本轮条目（含分支状态、本次做了什么、下一步），并在「合入 main 前 check」中新增一条"共享日志至少 1 条且含下一步"。

**Acceptance criteria：**
- [ ] 日志区新增 1 条，格式符合文件内注释的模板（时间 / 机器 / 主题 / 做了什么 / 卡点 / 下一步）
- [ ] 条目中写明当前分支 `feature/dev-dashboard-today` 领先 main 1 个 commit
- [ ] 「合入 main 前 check」新增 1 条日志非空校验

**Verification：**
- [ ] `grep -c "^### 2026-" docs/AI-COLLAB.md` → `≥1`
- [ ] 人眼复核：新条目含"下一步"字段

**Dependencies：** Task 5
**Files likely touched：** `docs/AI-COLLAB.md`
**Estimated scope：** XS（1 文件）

---

### Checkpoint: Complete

- [ ] `npm test` 通过（本计划不动代码，应保持全绿——同时验证没有误伤）
- [ ] `docs/specs/` 三件套齐备：索引 / 基线 / 计划
- [ ] 共享日志非空
- [ ] 提交信息写明"做了什么 + 为什么"，合入 main

---

## Risks and Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| **`git mv` 后另一台机器的 AI 找不到 spec** | 高 | Task 3 与 Task 4 **必须同一提交**，并在共享日志首条写明路径变更 |
| **两机同时改 `AGENTS.md`** | 高 | `AGENTS.md` §5.3 已定"先 push 先 pull 沟通"；Task 5 执行前先在日志认领 |
| 修正 README 时引入新的失真 | 中 | 只改有证据支持的字段（成熟度 / 技术概要 / 路径）；其余一律不动 |
| 6 份 Feature Spec 实为"目标态"而非"过期" | 中 | 本计划不重写其正文，只移动位置 + 在索引中标注性质 → 误判成本为零 |
| 文档改动与 `feature/dev-dashboard-today` 的进行中工作冲突 | 低 | 该分支只动了 `docs/`，本计划 Phase 1-2 动的是 `拼好家内容创作中心/` 与根目录，路径不重叠 |

---

## Open Questions

1. **`feature/dev-dashboard-today` 是否先合入 main？** —— 影响 as-built §7 的"现状"定义。若该分支的工作已实质完成，基线需重写。
2. **`docs/PRD-…-现状与流程评审.md` 与 `DEVELOPMENT-PLAN.md` 是否同轮核对？** —— 各 25 KB，本次刻意排除。建议单独一轮，否则本计划会膨胀到 10+ 任务。
3. **6 份 Feature Spec 的定位确认** —— 它们是"尚未实现的目标态"还是"已实现的应然描述"？本计划按**目标态**处理（只移动不改写）。若实为后者，需追加一轮逐条差异核对。
4. ~~**`设计规范-v2.0.md` / `brand-spec.md` 是否也移入 `docs/specs/`？**~~ —— ✅ **已解决（2026-09-21）**：用户明确「所有模块的 spec 单独存放一个文件夹」，两份规范已随 6 份 Feature Spec 一并移入，共 8 份。见 Task 3 执行记录。
5. **`README-产品总览.md` / `DEVELOPMENT-PLAN.md` / `设计走查-计划.md` 仍留在 `拼好家内容创作中心/` 根目录** —— 三者均**不属**「模块 spec」，本轮按范围纪律**未移动**。但由此产生一个副作用：8 份 spec 现在必须反向引用代码目录（`../../拼好家内容创作中心/README-产品总览.md`），与"规格与代码分离"的初衷相悖。**建议下一轮把 `README-产品总览.md` 移入 `docs/`**，另两份待定性。

---

*制定人：白灵 🎬 · 2026-09-21*
