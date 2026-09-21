# spec 索引与权威顺序

> 建立时间：2026-09-21
> 最后更新：2026-09-21（完成规格文档归位）
> 用途：本仓库有多份规格类文档散落各处，且互相冲突。本文件定义**谁说了算**，以及**哪些内容已过期**。
> 本文件是 spec 目录的入口，不承载需求细节。

---

## 1 · 权威顺序（冲突时以此为准，从高到低）

| 顺位 | 来源 | 说明 |
|---|---|---|
| 1 | **已提交的代码** | `src/` `public/` 是唯一事实。与任何文档冲突时，代码赢 |
| 2 | `AGENTS.md` | 跨机器铁律：技术栈 / 目录地图 / 命令 / Git 公约 |
| 3 | `docs/specs/as-built-2026-09-21.md` | **现状基线**。描述"现在是什么" |
| 4 | 各模块 `*-v2.0-Feature-Spec.md` | 描述"应该是什么"。**与现状有差异时，不代表现状** |
| 5 | `README-产品总览.md` / `DEVELOPMENT-PLAN.md` / `docs/PRD-*.md` | 历史文档。仅供参考，已知多处过期 |

**推论：任何 spec 变更都必须回写 as-built。** 否则第 3 顺位立刻失真，整套权威顺序失效。

---

## 2 · 文档状态表

| 文档 | 位置 | 性质 | 状态 |
|---|---|---|---|
| `AGENTS.md` | 根 | 跨机器铁律 | ✅ 有效 |
| `as-built-2026-09-21.md` | `docs/specs/` | 现状基线 | ✅ 有效（本次新建） |
| `capability-module-map.md` | `docs/specs/` | 能力栈 ↔ 模块映射 | ✅ 有效（本次新建） |
| `mobile-usability-v1.0.md` | `docs/specs/` | 移动端可用性 spec | ✅ 有效（本次新建） |
| `docs/AI-COLLAB.md` | `docs/` | 分工 + 共享开发日志 | ⚠️ **机制空转**：日志零条，但 `AGENTS.md` §6 要求每次收工必写 |
| `PRD-…-现状与流程评审.md` | `docs/` | 架构 / API / 数据模型总述 | ⚠️ **未核对**（25 KB，建议单独一轮） |
| `今日工作台-v2.0-Feature-Spec.md` | `docs/specs/` | 模块目标态 | ⚠️ 目标态，非现状 |
| `内容计划-v2.0-Feature-Spec.md` | `docs/specs/` | 模块目标态 | ⚠️ 目标态，非现状 |
| `数据复盘-v2.0-Feature-Spec.md` | `docs/specs/` | 模块目标态 | ⚠️ 目标态，非现状 |
| `灵感雷达-v2.0-Feature-Spec.md` | `docs/specs/` | 模块目标态 | ⚠️ 目标态，非现状 |
| `账号矩阵-v2.0-Feature-Spec.md` | `docs/specs/` | 模块目标态 | ⚠️ 目标态，非现状 |
| `知识资产-v2.0-Feature-Spec.md` | `docs/specs/` | 模块目标态 | ⚠️ 目标态，非现状 |
| `设计规范-v2.0.md` | `docs/specs/` | 视觉与结构契约 | ✅ 保留（**未与 `app.css` 核对**，已知 §2.3 断点 / §4 主题数两处漂移） |
| `brand-spec.md` | `docs/specs/` | 品牌规范 | ✅ 保留 |
| `README-产品总览.md` | `拼好家内容创作中心/` | 产品总览 | ❌ **过期最严重**（最后更新 2026-08-04，早于 SQLite 迁移） |
| `DEVELOPMENT-PLAN.md` | `拼好家内容创作中心/` | NAS 部署 / 数据模型 / API | ⚠️ **未核对**（25 KB，建议单独一轮） |
| `设计走查-计划.md` | `拼好家内容创作中心/` | 全站设计走查计划 | ⚠️ 计划待评审 |
| `docs/plans/*.md` | `docs/plans/` | 实施计划 | ✅ 保留 |
| `docs/adr/*.md` | `docs/adr/` | 架构决策记录 | ✅ 保留 |

**归位记录（2026-09-21）**：原先 6 份 Feature Spec 与 `设计规范` / `brand-spec` **混在代码目录根下**，而 `AGENTS.md` §3 与根 `README.md` 都声明"`docs/` 放 PRD 与开发计划"。规格与代码同层是漂移的温床。
→ 已全部移入 `docs/specs/`（共 **8 份**，git 记录为 rename，历史保留）。

**仍未归位的 3 份**：`README-产品总览.md`、`DEVELOPMENT-PLAN.md`、`设计走查-计划.md` 仍在 `拼好家内容创作中心/` 根目录。三者均**不属**"模块 spec"，本轮未移动。
→ 副作用：spec 需反向引用代码目录（`../../拼好家内容创作中心/README-产品总览.md`）。**建议下一轮把 `README-产品总览.md` 移入 `docs/`。**

---

## 3 · 已确认失效的引用（改文档时逐条修）

| # | 位置 | 失效内容 | 实际 |
|---|---|---|---|
| R1 | `README-产品总览.md` §2 表尾 | 指向 `模块PRD-v1.0/` 文件夹 | **该目录不存在**（`拼好家内容创作中心/docs/` 下只有 `plans/`） |
| R2 | ~~`README-产品总览.md` §2 / §7~~ | ~~引用 `灵感雷达v2-Feature-Spec.md`~~ | ✅ **已修**（2026-09-21 归位时一并改为 `docs/specs/灵感雷达-v2.0-Feature-Spec.md`） |
| R3 | `README-产品总览.md` §6 | 存储写 `WorkbenchStore → data/workbench.json` | 已迁 SQLite（`data/workbench.db`） |
| R4 | `README-产品总览.md` §2 | 5 个模块标"待开发" | **6 个模块前后端全部已实现**（见 as-built §3） |
| R5 | `README-产品总览.md` §3 | 写"当前断点：只有灵感雷达形成了真实数据能力" | 待复核（其余模块代码已完整，缺的是**真实数据**而非功能） |
| R6 | ~~根 `README.md` §项目结构~~ | ~~未提及 `docs/specs/`、`docs/plans/`、`docs/adr/`~~ | ✅ **已修**（2026-09-21） |
| R7 | `README-产品总览.md` §2 / §7 与 `灵感雷达-v2.0-Feature-Spec.md` 第 9 行 | 4 份 spec 的 `模块PRD-v1.0/*` 死链；灵感雷达的 `/Users/alexso/Desktop/…` 绝对路径 | ✅ **已修**（2026-09-21 归位时一并处理；Desktop 路径实际应为 `docs/PRD-…-现状与流程评审.md`） |

**残留观察（非失效，属不一致）**：`知识资产-v2.0-Feature-Spec.md` 是 6 份中**唯一没有"前置文档"行**的（只有"视觉参考"），也未链向 `README-产品总览.md`。建议下一轮补齐格式一致性。

---

## 4 · 相关文件

- 现状基线：`docs/specs/as-built-2026-09-21.md`
- 能力栈映射：`docs/specs/capability-module-map.md`
- 移动端 spec：`docs/specs/mobile-usability-v1.0.md`
- 收敛计划：`docs/plans/2026-09-21-spec-reconciliation.md`
- 跨机器铁律：`AGENTS.md`

---

*维护人：白灵 🎬 · 2026-09-21*
