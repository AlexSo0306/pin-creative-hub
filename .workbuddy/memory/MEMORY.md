# 拼好家创作运营中心 · 长期记忆

## 工作台（pin-creative-hub）部署事实
- NAS 地址 `192.168.124.77:4174`，SSH `admin@192.168.124.77 -p 8090`（key-based 免密）。
- **NAS 仓库路径 `/vol1/1000/Docker/Workbench` 不是 git 仓库**，部署方式是 **scp 文件 + `docker compose down && up -d --build` 重建镜像**（public/ 在构建时 COPY 进镜像，必须重建）。
- 本地代码库在 `/Users/alexso/WorkBuddy/pin-creative-hub`，应用子目录 `拼好家内容创作中心/`（Mac）↔ NAS `Workbench/`（顶层）路径对应。
- NAS 实跑分支 `feature/fe-mascot-widget`；本地 4174 是开发预览，数据与 NAS 各自独立 SQLite。
- 安全遗留：pin-creative-hub 旧 `.git/config` 曾内嵌 GitHub PAT 明文，已在本地删除改用 osxkeychain，但服务端 token 需去 GitHub 吊销。

## 本工作区（ops-center）约定
- 这是运营知识库工作区，已推 GitHub `pin-creative-hub` 仓库的 `ops-center` 分支（非 main，避免污染应用代码）。
- 记忆只写 `.workbuddy/memory/`（曾误散在 `.workbuddy-ai/memory/`，已合并）。
