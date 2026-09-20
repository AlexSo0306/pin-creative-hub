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
