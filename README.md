# 拼好家创作运营中心

> 更新：2026-09-28 · 本文件是工作区的「说明书」，30 秒看懂这里是什么、东西放哪。

## 这是什么

**抖音账号「苏师傅爱做饭」的运营知识库 + 工作台（pin-creative-hub）的原型沙盒。**
不是软件项目本体——工作台真身在另一个仓库（见下）。

目录名「拼好家」是矩阵品牌名；当前实际内容全部服务于「苏师傅爱做饭」单个账号。

## 目录契约（东西该放哪）

| 目录 | 放什么 | 规则 |
|---|---|---|
| `artifacts/` | 运营知识资产：诊断报告、对标拆解、逐帧分析、盘点文档 | 每条新片发布后的数据记录也回流到这里 |
| `prototype/` | 工作台模块的可交互原型 + 验收脚本 + 截图 | 原型验证通过 → 去 pin-creative-hub 落地 |
| `scripts/` | 可复用工具脚本（目前：抽帧） | 通用脚本，不写死单个视频 |
| `docs/` | 预留（规格/长文档） | 暂空 |
| `.workbuddy/memory/` | **唯一**记忆目录（工作日志 + 长期笔记） | 不要写到 `.workbuddy-ai/`（已废弃合并） |

## 相关仓库与外部位置

| 用途 | 路径 |
|---|---|
| 工作台真身（Express 5 + SQLite，端口 4174） | `/Users/alexso/WorkBuddy/pin-creative-hub` |
| 成片目录 | `/Users/alexso/Desktop/成品/` |
| 账号运营规则总览 v2.3 | `/Users/alexso/Desktop/苏师傅爱做饭-账号运营规则总览(1).md`（⚠️ 文件一度失踪，见 handoff 卡点 K2） |
| 相邻支线（转写文案分析，更活跃） | `/Users/alexso/WorkBuddy/苏师傅爱做饭内容/` |

## 当前状态快照

- 能力栈 A 诊断 / B 对标 / C 拆解 **已完成**；D 改造执行 **进行中**（产物在 Desktop）；E 验证闭环 **原型已验证**（09-23，77 断言全通过），待在工作台落地并跑第一轮真实数据。
- 核心结论：涨粉卡点 = 5s 完播（27% vs 健康线 60%），修复方案 = 六拍微预告片开头。
- 详细交接与卡点见 `handoff.md`。

## 工具环境

- Python venv：`/Users/alexso/.workbuddy/binaries/python/envs/default`（已装 imageio-ffmpeg、pypdf）
- 本机**无系统 ffmpeg**，抽帧靠 imageio-ffmpeg，别直接写 `ffmpeg` 命令
- GitHub 直连超时，走 Clash 代理 `http://127.0.0.1:7890`
