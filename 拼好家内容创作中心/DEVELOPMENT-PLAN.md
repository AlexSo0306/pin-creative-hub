# 拼好家运营创作中心 — NAS Docker 开发计划

> 版本：v1.1 | 日期：2026-08-04 | 目标部署：NAS Docker Compose

---

## 1. 项目现状

**已有**：
- 前端：静态 HTML/CSS/JS（今日工作台 + 灵感雷达部分页面）
- 后端：Node.js HTTP API（6 个端点）
- 存储：`data/workbench.json`（单 JSON 文件，原子写入）
- 数据：137 条对标作品、1 位创作者、2 个平台账号

**目标**：将 5 个 v2.0 模块全部实现，部署到 NAS Docker，形成"灵感 → 计划 → 账号 → 发布 → 复盘"完整闭环。

---

## 2. 技术方案

### 2.1 技术栈

| 层 | 方案 | 原因 |
|----|------|------|
| 前端 | HTML + CSS + Vanilla JS（单页 SPA 路由） | 延续现有架构，零构建依赖 |
| 后端 | Node.js + Express | 延续现有技术栈 |
| 存储 | **SQLite**（从 JSON 升级） | 多表查询、并发读写、数据可靠性优于单 JSON |
| 容器 | Docker Compose | NAS 部署，与 hermes-agent 一致 |
| 端口 | `4174:4174` | 避免与 hermes-agent(8090) 冲突 |

### 2.2 从 JSON 升级到 SQLite 的理由

| 维度 | JSON（当前） | SQLite（目标） |
|------|:-----------:|:------------:|
| 多表关联查询 | ❌ 需手动遍历 | ✅ JOIN |
| 写入并发 | ❌ 单文件锁 | ✅ 事务隔离 |
| 数据量增长 | ❌ 全量加载 | ✅ 按需查询 |
| 去重/筛选 | ❌ 内存遍历 | ✅ SQL WHERE |
| Docker 持久化 | 需卷挂载单文件 | 卷挂载 .db 文件 |
| 迁移成本 | — | 低（better-sqlite3 零配置） |

### 2.3 Docker Compose 结构

```yaml
# docker-compose.yml
services:
  workbench:
    build: .
    ports:
      - "4174:4174"
    volumes:
      - ./data:/app/data          # SQLite 数据库持久化
      - ./uploads:/app/uploads    # CSV/ZIP 导入文件缓存
    restart: unless-stopped
```

**目标部署地址**：`http://192.168.124.77:4174`

---

## 3. 完整数据模型

> SQLite 建表语句、字段类型和索引在实现阶段补全，此处为逻辑模型。

### 3.1 现有表（从 JSON 迁移）

```sql
-- 选题空间
spaces (id, name, status, created_at, updated_at)

-- 参考创作者（灵感雷达）
creators (id, space_id, name, created_at)

-- 对标平台账号（灵感雷达）
ref_accounts (id, space_id, creator_id, platform, account_id, 
              profile_url, scrape_status, created_at)

-- 对标作品（灵感雷达）
posts (id, space_id, ref_account_id, creator_id, platform, post_id,
       title, publish_time, likes, bookmarks, plays, comments, shares,
       url, tags, content_body, content_bound_at, created_at)

-- 同步记录
sync_runs (id, space_id, started_at, ended_at, account_count, mode)
```

### 3.2 新增表（v2.0）

```sql
-- 自有账号（账号矩阵）
owned_accounts (
  id, space_id, name, direction, status, color,
  positioning, target_audience, cta, notes,
  -- 三平台信息（可内嵌 JSON 或分表）
  douyin_username, douyin_profile_url, douyin_publish_status,
  xiaohongshu_username, xiaohongshu_profile_url, xiaohongshu_publish_status,
  shipinhao_username, shipinhao_profile_url, shipinhao_publish_status,
  created_at, updated_at, deleted_at
)

-- 内容卡片（内容计划）
content_cards (
  id, space_id, title, account_id, status, production_tag,
  main_platform, category,
  script_body, script_updated_at,
  publish_plan_body, publish_plan_updated_at,
  -- 三平台发布记录（可内嵌 JSON）
  douyin_publish_url, douyin_publish_time, douyin_publish_title,
  xiaohongshu_publish_url, xiaohongshu_publish_time, xiaohongshu_publish_title,
  shipinhao_publish_url, shipinhao_publish_time, shipinhao_publish_title,
  created_at, updated_at, deleted_at
)

-- 内容表现数据（数据复盘）
content_performance (
  id, content_card_id, platform, record_date,
  plays, likes, comments, bookmarks, shares,
  followers_gained, leads, created_at,
  UNIQUE(content_card_id, platform, record_date)
)

-- 复盘结论（数据复盘）
review_conclusions (
  id, space_id, period_type, period_start, period_end,
  effective_titles, effective_openings, effective_ctas,
  abandon_topics, next_actions,
  created_at, updated_at,
  UNIQUE(space_id, period_type, period_start)
)

-- 知识资产（知识资产，P1）
knowledge_assets (
  id, space_id, title, category, body, tags,
  source_type, source_review_id, status, version,
  created_at, updated_at, deleted_at
)

-- 日历记录/备注（今日工作台）
calendar_notes (
  id, space_id, note_date, content, created_at
)
```

---

## 4. 完整 API 设计

> 所有接口前缀 `/api`，依赖 `space_id` 做数据隔离。

### 4.1 选题空间（现有，优化）

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/spaces` | 空间列表 |
| POST | `/api/spaces` | 创建空间 |
| PUT | `/api/spaces/:id` | 更新空间 |

### 4.2 灵感雷达（现有 + v2.0 新增）

| 方法 | 接口 | 说明 | 状态 |
|------|------|------|------|
| GET | `/api/posts` | 作品列表（含搜索/筛选/分页） | 已有 |
| POST | `/api/posts` | 手动新增作品 | 已有 API，缺前端 |
| POST | `/api/posts/import-csv` | CSV 批量导入作品 | v2.0 新增 |
| POST | `/api/posts/import-content` | ZIP 批量导入文案 | v2.0 新增 |
| GET | `/api/posts/:id/content` | 获取作品绑定的文案 | v2.0 新增 |
| GET | `/api/posts/export` | 导出筛选结果为 CSV | v2.0 新增 |
| GET | `/api/creators` | 参考创作者列表 | 已有 |
| POST | `/api/creators` | 创建创作者（含平台账号） | 已有 API，缺前端 |
| GET | `/api/dashboard/monitor` | 监控看板数据（趋势+排行） | v2.0 新增 |
| POST | `/api/sync` | 记录一次雷达检查 | 已有 |

### 4.3 账号矩阵（v2.0 新增）

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/owned-accounts` | 账号列表 |
| POST | `/api/owned-accounts` | 创建账号 |
| PUT | `/api/owned-accounts/:id` | 更新账号基本信息和平台信息 |
| PATCH | `/api/owned-accounts/:id/status` | 变更运营状态 |
| DELETE | `/api/owned-accounts/:id` | 删除账号（软删除） |

### 4.4 内容计划（v2.0 新增）

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/content-cards` | 卡片列表（支持 status/account_id 筛选） |
| POST | `/api/content-cards` | 创建卡片 |
| PUT | `/api/content-cards/:id` | 更新卡片基本信息 |
| PATCH | `/api/content-cards/:id/status` | 变更状态（拖动） |
| PATCH | `/api/content-cards/:id/script` | 更新录制稿 |
| PATCH | `/api/content-cards/:id/publish-plan` | 更新发布方案 |
| PATCH | `/api/content-cards/:id/publish-info` | 更新发布记录 |
| PATCH | `/api/content-cards/:id/production-tag` | 更新制作进度标签 |
| DELETE | `/api/content-cards/:id` | 删除卡片（软删除） |

### 4.5 数据复盘（v2.0 新增）

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/performance` | 按 content_card_id 获取表现数据 |
| POST | `/api/performance` | 录入/更新表现数据 |
| GET | `/api/performance/pending` | 待补数据清单 |
| GET | `/api/performance/review` | 周期聚合数据（period/account/platform 筛选） |
| PUT | `/api/review-conclusions/:id` | 更新复盘结论 |
| POST | `/api/review-conclusions` | 新建复盘结论 |
| GET | `/api/review-conclusions` | 按 period 获取复盘结论 |
| POST | `/api/content-cards/:id/reviewed` | 标记已复盘 |

### 4.6 今日工作台（聚合层，v2.0 新增）

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/dashboard` | 升级版总览（聚合所有模块数据） |
| GET | `/api/dashboard/todos` | 今日待办 |
| POST | `/api/dashboard/todos/:id/complete` | 标记完成 |
| POST | `/api/dashboard/todos/:id/postpone` | 推迟到明天 |
| GET | `/api/calendar/notes` | 日历记录列表 |
| POST | `/api/calendar/notes` | 添加日历记录 |
| DELETE | `/api/calendar/notes/:id` | 删除日历记录 |

### 4.7 知识资产（P1，v2.0 新增）

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/knowledge-assets` | 资产列表 |
| POST | `/api/knowledge-assets` | 创建资产 |
| PUT | `/api/knowledge-assets/:id` | 更新资产 |
| DELETE | `/api/knowledge-assets/:id` | 删除资产（软删除） |

---

## 5. 模块依赖与开发顺序

```
Phase 1（基础）          Phase 2（闭环）         Phase 3（聚合）
┌──────────┐           ┌──────────┐           ┌──────────┐
│ 账号矩阵  │           │ 数据复盘  │           │今日工作台 │
│          │           │          │           │          │
│ 无外部依赖│           │ 依赖内容 │           │ 依赖全部 │
│ 3个API   │           │ 计划数据 │           │ 7个API   │
└────┬─────┘           └────┬─────┘           └────┬─────┘
     │                      │                      │
     ▼                      ▼                      ▼
┌──────────┐           ┌──────────┐           ┌──────────┐
│ 内容计划  │ ────────→ │ 数据复盘  │ ────────→ │今日工作台 │
│          │           │          │           │          │
│ 依赖账号 │           │          │           │          │
│ 矩阵     │           │          │           │          │
│ 9个API   │           │ 7个API   │           │          │
└──────────┘           └──────────┘           └──────────┘
     ▲                                            │
     │              ┌──────────┐                  │
     └──────────────│ 灵感雷达  │ ←────────────────┘
                    │ (已有基座 │   灵感速递数据
                    │  升级v2) │
                    └──────────┘
```

### Phase 1：数据基础（账号矩阵 + 内容计划）

| # | 任务 | 依赖 | 预估 | 状态 |
|---|------|------|------|------|
| 1.1 | 搭建 Docker 项目骨架（Express + SQLite + Dockerfile） | — | 0.5d | 已完成 |
| 1.2 | 数据迁移：JSON → SQLite 脚本 + 验证 | — | 0.5d | 待完成 |
| 1.3 | `owned_accounts` 表建表 + CRUD API | — | 1d | 已完成 |
| 1.4 | 账号矩阵前端页面（卡片列表 + 表单） | 1.3 | 1.5d | 已完成 |
| 1.5 | `content_cards` 表建表 + CRUD API | 1.3 | 1.5d | 已完成 |
| 1.6 | 内容计划前端（五列看板 + 拖动 + 卡片详情 4 Tab） | 1.5 | 3d | 已完成 |
| 1.7 | Markdown 渲染（本地 marked.js） | 1.6 | 0.5d | 已完成 |

**Phase 1 验收**：能创建账号、创建内容卡片、在看板间拖动、粘贴和浏览 Markdown 文档。

### Phase 2：运营闭环（数据复盘 + 知识资产）

| # | 任务 | 依赖 | 预估 | 状态 |
|---|------|------|------|------|
| 2.1 | `content_performance` + `review_conclusions` 表建表 + API | 1.5 | 1.5d | 已完成 |
| 2.2 | 数据复盘前端（录入表单 + 看板 + 结论） | 2.1 | 2.5d | 已完成 |
| 2.3 | 内容计划"已发布→已复盘"状态回写 | 2.2 | 0.5d | 已完成 |
| 2.4 | `knowledge_assets` 表 + API | — | 1d | 已完成 |
| 2.5 | 知识资产前端（列表 + 创建/编辑） | 2.4 | 1.5d | 已完成 |
| 2.6 | 复盘结论→知识资产沉淀 | 2.2+2.5 | 0.5d | 已完成 |

**Phase 2 验收**：能录入三条平台数据、查看看板、写复盘结论、沉淀资产，内容卡片走到"已复盘"。

### Phase 3：指挥中心（今日工作台 + 灵感雷达 v2 补齐）

| # | 任务 | 依赖 | 预估 | 状态 |
|---|------|------|------|------|
| 3.1 | 今日工作台 Dashboard API（聚合查询） | Phase 2 | 1.5d | 已完成 |
| 3.2 | 今日工作台前端 7 区域（数据总览+日历+选题流水线+待办+表现速览+灵感+跳转） | 3.1 | 3d | 已完成 |
| 3.3 | 日历记录/备注 `calendar_notes` 表 + API | 3.1 | 0.5d | 已完成 |
| 3.4 | 灵感雷达 CSV 导入 + 文案导入 API | — | 1.5d | 待开发 |
| 3.5 | 灵感雷达监控看板前端（趋势图 Chart.js + 爆款排行） | 3.4 | 2d | 待开发 |
| 3.6 | Docker Compose NAS 部署配置 + 测试 | 全部 | 1d | 配置完成，待部署验证 |

**Phase 3 验收**：全部 5 模块在 NAS Docker 上运行，完成一条内容从灵感到复盘的全链路。

### 总预估

| Phase | 核心模块 | 预估人天 |
|-------|---------|:-------:|
| Phase 1 | 账号矩阵 + 内容计划 | 7d |
| Phase 2 | 数据复盘 + 知识资产 | 7d |
| Phase 3 | 今日工作台 + 灵感雷达升级 + 部署 | 9.5d |
| **合计** | | **~23.5d** |

---

## 6. 项目文件结构

```
workbench/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── server.js                    # Express 入口
├── src/
│   ├── db.js                    # SQLite 初始化 + 连接
│   ├── migrate.js               # JSON → SQLite 迁移脚本
│   ├── routes/
│   │   ├── spaces.js
│   │   ├── posts.js             # 灵感雷达
│   │   ├── creators.js
│   │   ├── owned-accounts.js    # 账号矩阵
│   │   ├── content-cards.js     # 内容计划
│   │   ├── performance.js       # 数据复盘
│   │   ├── review-conclusions.js
│   │   ├── knowledge-assets.js  # 知识资产
│   │   ├── dashboard.js         # 今日工作台
│   │   └── calendar-notes.js
│   └── middleware/
│       └── space-context.js     # space_id 提取中间件
├── public/                      # 静态前端
│   ├── index.html               # SPA 入口
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js               # 路由 + 模块加载
│       ├── api.js               # API 调用封装
│       ├── pages/
│       │   ├── dashboard.js     # 今日工作台 7 区域
│       │   ├── inspiration.js   # 灵感雷达
│       │   ├── content-plan.js  # 内容计划看板
│       │   ├── account-matrix.js
│       │   ├── data-review.js   # 数据复盘
│       │   └── knowledge.js     # 知识资产
│       └── components/
│           ├── card.js          # 可拖动卡片组件
│           ├── markdown.js      # Markdown 渲染
│           ├── calendar.js      # 日历组件
│           └── chart.js         # Chart.js 封装
├── data/                        # Docker 卷挂载
│   └── workbench.db             # SQLite 数据库
└── uploads/                     # CSV/ZIP 临时文件
```

---

## 7. Dockerfile

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# 确保数据目录存在
RUN mkdir -p /app/data /app/uploads

EXPOSE 4174

CMD ["node", "server.js"]
```

**docker-compose.yml**（完整）：

```yaml
version: '3.8'

services:
  workbench:
    build: .
    container_name: workbench-creator
    ports:
      - "4174:4174"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - PORT=4174
      - DB_PATH=/app/data/workbench.db
    restart: unless-stopped
```

---

## 8. NAS 部署步骤

```bash
# 1. 在 NAS 上创建项目目录
mkdir -p /vol1/1000/Docker/Workbench
cd /vol1/1000/Docker/Workbench

# 2. 上传开发完成的代码到此目录（或 git clone）

# 3. 如果有旧 JSON 数据，放入 data/ 目录

# 4. 构建并启动
docker compose up -d --build

# 5. 检查运行状态
docker compose ps
docker compose logs -f

# 6. 访问
# http://192.168.124.77:4174
```

---

## 9. 关键技术决策

| 决策 | 选项 A | 选项 B | 选择 | 理由 |
|------|--------|--------|:--:|------|
| 存储 | JSON 文件 | SQLite | B | 多表查询、事务安全、21 个 API 端点需要 |
| 前端框架 | React/Vue | Vanilla JS SPA | B | 延续现有架构，零构建，轻量 |
| Markdown | marked.js CDN | 自建渲染 | A | 1 行引入，零依赖 |
| 图表 | Chart.js CDN | ECharts | A | 轻量，满足折线图和排行需求 |
| 拖拽 | 原生 Drag & Drop | SortableJS | 原生 | 简单场景不需要引入库 |
| 包管理 | npm | pnpm | npm | Docker 内标准，Node 22 自带 |
| SQLite 驱动 | better-sqlite3 | sql.js | better-sqlite3 | 同步 API 更简洁，Docker 内性能好 |

---

## 10. 系统设计难点（开发前必读）

### 难点 1：跨模块状态同步 ⭐ 最高风险

这不是 5 个独立页面，而是一个**数据共享的状态网络**。典型链路：

```
账号矩阵改一个账号颜色
  → 内容计划所有卡片上的账号标记要变色
  → 今日工作台日历的 9 色图例要变色
  → 数据复盘看板的筛选器要变色
```

**开发规则**：
- 前端必须建全局状态对象 + 事件总线（`store.js`），所有模块从同一处读写
- 禁止各页面模块独立 fetch、独立缓存账号列表
- 账号矩阵写入后 emit `accounts:updated` 事件，内容计划和今日工作台监听并刷新
- 后端账号数据只通过 `/api/owned-accounts` 读取，任何模块不得硬编码账号名

```
store.js 结构（必须在开发任何页面之前完成）：

store = {
  spaces: [],
  ownedAccounts: [],       // 所有页面共用
  contentCards: [],        // 内容计划维护，今日工作台读取
  currentSpace: null,
  currentAccountFilter: null,
  emit(event, data) {},    // 事件总线
  on(event, callback) {}
}
```

**验收**：账号矩阵改名/改色/停用后，不刷新页面，内容计划切换栏和卡片标记立即同步。

### 难点 2：今日工作台的聚合查询

Dashboard 一页要从 5 张表实时计算（非定时快照）：

| 区域 | SQL 复杂度 | 风险 |
|------|:--:|------|
| 数据总览（SUM plays/likes） | 中 | 数据量大时慢 |
| 本周进度（COUNT + 时间范围） | 低 | — |
| 今日待办（3 条规则 + 去重） | **高** | N+1 查询高危区 |
| 表现速览（Top 3 + 爆款判定均值对比） | **很高** | 均值子查询 |
| 选题流水线（status 过滤排序） | 低 | — |

**开发规则**：
- Dashboard 用**一个 API 端点**（`GET /api/dashboard`）一次跑完所有查询，返回完整 JSON，前端直接渲染
- **禁止在循环里查询数据库**（N+1），关联数据必须 JOIN：

```sql
-- ✅ 正确：JOIN 一次查出
SELECT cc.*, cp.plays, cp.likes
FROM content_cards cc
LEFT JOIN content_performance cp ON cc.id = cp.content_card_id
WHERE cc.space_id = ? AND cp.record_date = ?

-- ❌ 错误：在 JS 循环里逐条查 performance（数据量大时首页 3 秒+）
```

- 爆款判定（超均值 2 倍）用 SQL 子查询或预计算均值，不在前端逐条比较
- 今日待办多规则（今日排期/逾期/待补数据）用 UNION 合并 + 去重，一次查询完成

### 难点 3：五列看板状态机 + 拖动持久化

拖动不只是 DOM 移动，还要：

1. 前端立即更新 DOM（用户体验）
2. 异步发 PATCH `/api/content-cards/:id/status`（持久化）
3. 失败时卡片回弹 + 错误提示（错误恢复）

**状态转换校验**（前端 + 后端都要做）：

| 转换 | 允许 |
|------|:--:|
| 选题池 → 脚本库 | ✅ |
| 脚本库 → 制作中 / 退回选题池 | ✅ |
| 制作中 → 已发布 / 退回脚本库 | ✅ |
| 已发布 → 已复盘 | ✅ |
| 脚本库 → 已复盘（跨级） | ❌ 禁止 |
| 已复盘 → 选题池（回退） | ❌ 禁止 |

**开发规则**：
- 后端校验状态转换合法性，非法转换返回 400
- 前端给"不可拖放"的列视觉提示（置灰/禁止光标）
- 快速连续拖动时 debounce（300ms），避免请求风暴
- 移动端降级：拖动不可用时，用卡片菜单"移动到"实现状态变更

### 难点 4：Markdown 文档承载

录制稿 ~63 行、发布方案 ~283 行。注意：

- **编辑/渲染切换**：粘贴 → 保存 → 渲染；点"编辑"回到 textarea。**必须保留原文**，禁止点编辑后清空
- **大文本渲染**：看板 10+ 张卡片时，Markdown 详情懒加载（点击才渲染）
- **XSS 安全 ⚠️**：marked.js 默认允许 HTML 标签，必须配置 sanitize 或使用 DOMPurify：

```js
marked.setOptions({
  sanitize: true        // 或使用 DOMPurify.sanitize(renderedHTML)
})
```

- 长文档默认折叠（>500 字显示"展开全文"）

### 难点 5：三平台数据录入表单

一条内容可能只发了 1-2 个平台。表单必须：

- 三平台独立填写，只填抖音也能保存（小红书/视频号留空不报错）
- 同平台同日期唯一（`content_card_id + platform + record_date` 唯一约束，防重复录入）
- 播放量为 0 时衍生指标显示"—"，**禁止除以零崩溃**
- 多次录入（第 1 天/第 7 天）按 record_date 区分，聚合时播放取最新、咨询累计

**开发规则**：每个平台字段组独立校验（无全局必填），后端对缺失字段宽容处理。

### 难点 6：JSON → SQLite 迁移

137 条作品、1 位创作者、2 个对标账号。最容易翻车的：

- **两套账号体系混淆**：旧 JSON 的 `Account` 是对标账号（灵感雷达），新表 `owned_accounts` 是自有账号（账号矩阵）。迁移时不得混为一谈
- 时间格式不一致（`2026-07-15` 和 `2026-07-15T14:30:00` 混用）
- 迁移后无校验，丢数据了才发现

**开发规则**：
- 迁移前备份原 JSON 到 `data/backup/`
- 迁移脚本输出统计：迁移前后各表条数对比
- 自动断言：`posts 迁移后条数 == 迁移前条数`，不一致直接报错停止

---

## 11. AI 开发硬性约束（交给 AI 时必须附带的规则）

> 以下规则直接复制进给 AI 的 prompt，防止 AI 写出"能跑但数据不流通"的代码。

### 11.1 架构约束（必须先做）

1. **先建基建，再写业务**：第一个任务必须是 `store.js`（全局状态）+ `api.js`（请求封装）+ `space-context` 中间件。这三个文件完成前禁止写任何页面。
2. **禁止硬编码账号**：账号数据只能来自 `/api/owned-accounts`，出现"苏师傅""英爱家38平"等账号名写死在代码里 = 代码不合格。
3. **单页 SPA 路由**：不允许每个页面独立 HTML 文件各自初始化。统一 `app.js` 做路由分发。

### 11.2 状态与数据约束

4. **全局状态单例**：所有页面从 `store` 读写，禁止在页面模块内独立缓存账号/内容列表。
5. **事件同步**：数据变更必须 `store.emit()`，关联页面 `store.on()` 监听。禁止"刷新页面才能看到新数据"。
6. **禁止 N+1 查询**：任何列表接口必须单条 SQL JOIN 完成，不准在 JS 循环里逐条查库。审查时看到 `for` 循环里出现 `db.query` 即打回。
7. **三状态验收**：每个页面必须处理"有数据 / 空数据 / 接口报错"三种状态，禁止白屏。

### 11.3 交互约束

8. **拖拽必须做错误恢复**：PATCH 失败时卡片回弹 + toast 提示，禁止静默失败。
9. **状态转换后端校验**：非法转换（如脚本库 → 已复盘）返回 400，前端提示"不能拖到这里"。
10. **Markdown 必须 sanitize**：渲染前清理 HTML，禁止 XSS。
11. **表单宽容校验**：三平台数据可部分填写，禁止"全部必填"。

### 11.4 质量约束

12. **每个 Phase 交付时附验收清单**：对照 Feature Spec 的"验收框架"逐条勾选。
13. **迁移必须有断言**：迁移脚本跑完自动对比条数，不一致即失败。
14. **接口返回统一格式**：`{ ok: true, data }` / `{ ok: false, error }`，禁止混用。
15. **每次改动跑一遍全量测试**：现有 6 项测试 + 新增接口测试，全绿才算完成。

---

## 12. 风险与注意事项

| 风险 | 影响 | 应对 |
|------|------|------|
| JSON → SQLite 迁移丢数据 | 137 条作品丢失 | 迁移前备份 `data/workbench.json`，迁移后做条数对比验证（断言） |
| 5 模块前端单文件过大 | 加载慢 | 按页面懒加载 JS 模块，首次只加载 dashboard |
| NAS 性能不足 | 接口响应慢 | SQLite 查询限 LIMIT 100，Dashboard 聚合用汇总表缓存 |
| 端口冲突 | 4174 被占用 | docker-compose 中可改 `ports` 映射 |
| 移动端体验差 | 看板拖动不可用 | 移动端降级为点击状态变更，不拖拽 |
| AI 各模块独立缓存账号 | 改账号后下游不刷新 | store.js 单例 + 事件总线强制约束（见 11.2） |
| AI 只写快乐路径 | 空数据/报错时白屏 | 三状态验收强制（见 11.2 第 7 条） |

---

## 13. 下一步行动

| # | 行动 |
|---|------|
| 1 | 搭建 Docker 项目骨架（Express + SQLite + Dockerfile） |
| 2 | 创建基建三件套：`store.js` + `api.js` + `space-context` 中间件 |
| 3 | 运行 JSON → SQLite 迁移（含断言校验） |
| 4 | 开始 Phase 1：账号矩阵 CRUD |
| 5 | Phase 1 完成后部署到 NAS 验证 |
| 6 | 继续 Phase 2 → Phase 3 |

---

> 附：数据模型和 API 的详细字段定义参见各模块的 v2.0 Feature Spec 文档。
