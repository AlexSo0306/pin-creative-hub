# AGENTS.md — 拼好家运营创作工作台（AI 协作公约）

> 本文件是**每台电脑上的 AI（与人类开发者）进入本仓库的第一入口**。
> 目的：让两台电脑上的 AI 拥有**一致的项目认知**，从而产出风格一致、不互相冲突的代码。
> ⚠️ 此文件只放「跨机器、跨会话都必须遵守」的铁律；具体实现细节放进 `docs/AI-COLLAB.md`。

---

## 1. 项目一句话

本地单机的多平台自媒体运营工作台：把「灵感采集 → 内容计划 → 账号矩阵 → 数据复盘 → 知识沉淀」闭环集中在 Node + Express + SQLite 的 Web 应用里（端口 4174，Docker 可部署）。

## 2. 技术栈（改代码前必须确认，别引第三方重写）

| 环节 | 选型 | 铁律 |
|---|---|---|
| 运行时 | Node `>=22.13`、ESM（`"type": "module"`） | 不得降级 CommonJS |
| 后端 | Express 5 | 路由集中在 `src/routes/` |
| 数据 | SQLite + `src/schema.sql` | schema 变更需同步 `src/seed.js` 与迁移脚本 |
| 前端 | **原生 JS（无框架、无构建工具）** + `public/index.html` | 页面逻辑在 `public/js/pages/*.js`，状态在 `store.js`，组件在 `components/toast.js` |
| 样式 | 纯 CSS `public/css/app.css` | 无 Tailwind/预处理器 |
| 测试 | `node --test`（`npm test`） | 后端改动需配 node:test 测试 |
| 部署 | Docker（`Dockerfile` + `docker-compose.yml`，端口 4174） | 见 `DEVELOPMENT-PLAN.md` |

> 当前为原生 JS 前端，**不要未经协商引入 React/Vue/构建器**。

## 3. 目录地图（改哪看哪）

| 路径 | 是什么 | 分工归属建议 |
|---|---|---|
| `server.js` | 服务入口 | 后端 |
| `src/app.js` `src/db.js` | app/DB 装配 | 后端 |
| `src/routes/*.js` | 各模块 API（dashboard/inspiration/owned-accounts/performance/…） | 后端 |
| `src/schema.sql` `src/seed.js` | 数据模型与种子 | 后端 |
| `public/index.html` | 单页骨架 | 前端 |
| `public/js/pages/*.js` | 每模块页面逻辑（dashboard/inspiration/accounts/…） | 前端 |
| `public/js/store.js` `api.js` | 全局状态 / API 封装 | 前端 |
| `public/css/app.css` | 全局样式 | 前端 |
| `docs/` `拼好家内容创作中心/*-Feature-Spec.md` | PRD 与各模块 Feature Spec | 需求 / 产品 |

## 4. 开发循环（两台电脑都遵守）

```
开工前   git checkout main && git pull origin main   ← 先同步，别带旧代码
        AI 先读 docs/AI-COLLAB.md 的开发日志，恢复上下文
开发    开独立分支  git checkout -b feature/<模块>——只动自己模块
改完    后端跑 npm test；前端自查对应页面
收工    更新 docs/AI-COLLAB.md 开发日志 → 提交 → push 分支
        （分支：推 origin 后说明；main：仅经由 review 合并）
```

## 5. Git 协作铁律（防两机冲突）

1. **main 永远可部署**：不直接往 main 写；功能先进 `feature/*`。
2. **两机分工避免同时改同一文件**：默认按模块切（`src/routes/` vs `public/js/pages/` 天然可分）。
3. 若两人都要碰同一文件，**先 push 先 pull 沟通**，别硬 merge 强推。
4. 提交信息写清「做了什么 + 为什么」；合入 main 前确保 `npm test` 过。
5. `.env`、`*.db`、`node_modules/` 不进版本库（.gitignore 已配置）。

## 6. AI 上下文交接（本工作流的关键）

AI 的对话上下文是**机器私有的**，不会跟 git 走。因此所有「当前决策、进行到一半的改动、遇到的坑、下一步」**必须落盘到** `docs/AI-COLLAB.md` 的共享开发日志，另一台机器 pull 后就能恢复。

- 无新增内容时，开发日志照常更新（哪怕一行"本轮无实质改动"）。
- 大需求：先在 `docs/plans/` 写计划再动手。

## 7. 常用命令

```bash
npm install        # 安装依赖
npm start          # 启动（http://127.0.0.1:4174）
npm run dev        # 热重载
npm test           # 运行测试
npm run migrate:inspiration   # 灵感数据迁移
```
