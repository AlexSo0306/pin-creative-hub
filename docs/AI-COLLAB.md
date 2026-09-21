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

> ⚠️ 本日志此前**零条记录**（`AGENTS.md` §6 要求每次收工必写）。以下为第一条。
> 机器代号用**电脑名**，避免 A/B 归属歧义：本机 = `MacBook Pro 2023`。

---
### 2026-09-21 15:20 · MacBook Pro 2023 · 规格文档归位 + 发布版本决策落定

**做了什么 / 改到哪**

- **8 份规格文档移入 `docs/specs/`**：6 份 `*-v2.0-Feature-Spec.md` + `设计规范-v2.0.md` + `brand-spec.md`。
  git 识别为 **8 个 `R`（R099/R100）**，历史保留。
- **`docs/specs/` 新增 4 份**：`README.md`（spec 索引与权威顺序）、`as-built-2026-09-21.md`（现状基线）、
  `capability-module-map.md`（能力栈 ↔ 模块映射）、`mobile-usability-v1.0.md`（移动端可用性 spec）。
- **新增 `docs/adr/0001-frontend-react-migration.md`**：React 迁移决策，含 §3 反方证据与 §5 五条反转触发条件。
- **新增 `docs/plans/` 3 份**：`2026-09-21-spec-reconciliation.md`、`-mobile-usability.md`、`-react-migration.md`。
- **修正 14 份文件的路径引用**（含根 `README.md`、`AGENTS.md` §3 目录地图、`README-产品总览.md`、`设计走查-计划.md`）。
- 验证：全库链接解析器 → 仅剩 **2 处既有死链**（`模块PRD-v1.0/`，非本次造成）。

**卡在哪 / 踩过的坑（⚠️ 两机都会遇到，务必先看这两条）**

1. **`git mv` / `git add` / `git reset` 在本机可能不可用。**
   现象：`fatal: Unable to create '.git/index.lock': File exists`，且 `rm` 后立刻又出现。
   根因：有**后台进程反复重建** `.git/index.lock`（WorkBuddy 等应用会做 git 快照），
   且**沙箱禁止 unlink `.git/`**（`unable to unlink ... Operation not permitted`）——
   git 能**创建**锁却**删不掉**，于是每个失败的写操作都留下陈旧锁，**下一个必然也失败**（症状自我强化）。
   → **绕过办法：文件系统 `mv` + `git add -A`。**
   ⚠️ 关键认知：**git 的 rename 识别是「内容相似度」在 diff/commit 时算的，不是 `git mv` 赋予的** ——
   普通 `mv` 同样得到 `R`，历史一样保留。「必须用 `git mv` 才保历史」是错的。
   → git **写**操作需在**无沙箱**下执行；读操作（`status`/`diff`/`log`）不受影响。
2. **中文 `grep` 的 `\|` 交替在本机 shell 会静默失败**（返回空、退出码 1，看起来像"没命中"）。
   查中文内容一律用 Grep 工具，**不要相信 shell `grep` 的空结果**。
3. ⚠️ **批量移动时绝不用数组下标遍历文件列表。** 本次写成 `git mv "$SRC/${FILES[0]}"`，
   而 **zsh 数组下标从 1 开始**、`${FILES[0]}` 是**空串** → 整条命令退化成 `git mv "$SRC/" "$DST/"`，
   **把整个代码目录搬进了 `docs/specs/`**，且**退出码 0、无任何报错**。
   已原地 `mv` 搬回，93 个文件计数核对无损（`mv` 是纯重命名，零数据损失）。
   → 用**字面量列表** `for f in "a" "b"` 或显式逐条命令，并**每移动一条立刻打印 + 复核**。

**决策依据（为什么这么写）**

- **发布版本**：Alex 决定「以后全部都是发正片」（原文「真片」，同音笔误）→ **快剪 / 纯享停做**。
  已回写 `capability-module-map.md` §6/§7/§9 与 `as-built` §4 第 6 条。
  连带效果：**「版本」维度彻底退出内容计划**，与一菜一发（`UNIQUE(content_card_id, platform)`）完全对齐。
- **移动范围**：只移动**「规格 / 契约」文档**（描述"应该是什么"）。`README-产品总览.md`（总览）、
  `DEVELOPMENT-PLAN.md`（部署）、`设计走查-计划.md`（走查计划）三者**非 spec，未移动**。
- **范围纪律**：只修**移动造成的**失效引用；**本来就不存在**的目标（`模块PRD-v1.0/`）**只登记不修** ——
  删行还是留行属内容决策，不是路径修复。见 `docs/specs/README.md` §3。

**下一步（供对侧接续）**

- ⚠️ **本分支尚未合入 `main`**。当前在 `feature/dev-dashboard-today`（领先 `main` 1 个提交）。
  按 `AGENTS.md` §5.1「不直接往 main 写」，合并需经 review。
- **建议下一轮**：把 `README-产品总览.md` 也移入 `docs/` —— 否则 8 份 spec 需反向引用代码目录
  （`../../拼好家内容创作中心/README-产品总览.md`），与「规格与代码分离」的初衷相悖。
- `docs/plans/2026-09-21-spec-reconciliation.md` 的 **Task 1 / 2 仍未做**（README 内容修正：
  `待开发` 标注失真 / `workbench.json` 已迁 SQLite / `模块PRD-v1.0` 两行）。
- `知识资产-v2.0-Feature-Spec.md` 是 6 份中**唯一没有「前置文档」行**的，建议补齐格式一致性。

**⚠️ 安全提醒**

本机 `origin` 的 remote URL **内嵌了 GitHub PAT 明文**（`https://x-access-token:ghp_…@github.com/...`）。
`.git/config` 不会随 push 外泄，但建议改用 credential helper / SSH，并**轮换该 token**。
对侧机器若有同样写法，一并处理。

---
