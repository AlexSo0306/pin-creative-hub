# 拼好家运营创作中心

多平台自媒体运营工作台：灵感雷达 → 内容计划 → 账号矩阵 → 数据复盘 → 知识资产，形成「灵感 → 计划 → 发布 → 复盘 → 沉淀」的运营闭环。

## 项目结构

| 路径 | 说明 |
|------|------|
| `拼好家内容创作中心/` | **当前产品本体**（Node + Express + SQLite，Docker 部署，端口 4174） |
| `docs/` | PRD 文档与开发计划 |
| `deploy.sh` | NAS Docker 部署脚本 |
| `demo-*.png` | 界面设计走查截图 |

> 历史遗留的 JSON 版 MVP 已于 2026-08-07 移除，数据已迁移至 SQLite（`拼好家内容创作中心/data/workbench.db`）。

## 本地启动

```powershell
cd 拼好家内容创作中心
npm install
npm start
```

访问 <http://127.0.0.1:4174>

## 测试

```powershell
cd 拼好家内容创作中心
npm test
```

## 文档导航

| 用途 | 文档 |
|------|------|
| 产品总览 | `拼好家内容创作中心/README-产品总览.md` |
| 开发计划（当前） | `拼好家内容创作中心/DEVELOPMENT-PLAN.md` |
| 现状与流程评审 PRD | `docs/PRD文档/PRD-自媒体运营创作工作台-现状与流程评审.md` |
| 各模块 v2.0 Feature Spec | `拼好家内容创作中心/*-v2.0-Feature-Spec.md` |

## NAS 部署

见 `拼好家内容创作中心/DEVELOPMENT-PLAN.md` 第 8 节，或使用根目录 `deploy.sh`。
