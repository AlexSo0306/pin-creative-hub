# 拼好家运营创作中心 Full-Stack Implementation Plan

> **For Codex:** Implement this plan task-by-task, verifying each vertical slice before expanding the next module.

**Goal:** 将现有 6 个静态 HTML 原型实现为可在 NAS Docker 中运行、使用 SQLite 持久化、前后端完整联动的运营创作中心。

**Architecture:** 使用单个 Express 进程提供 REST API 和 Vanilla JS SPA 静态资源。SQLite 是唯一业务数据源，前端通过统一 `api.js` 和 `store.js` 访问共享状态；原型 HTML 保留为视觉参考，不再作为业务数据源。

**Tech Stack:** Node.js 22.13+、Express 5、Node `node:sqlite`、Vanilla JS ES Modules、Node Test Runner、Docker Compose。

---

## 1. Delivery Principles

- 数据库是唯一真实数据源，禁止页面各自维护业务 `localStorage`。
- 账号、内容、复盘等跨模块关联一律使用稳定 ID，禁止标题模糊匹配。
- 每个阶段至少交付一个可以从浏览器操作并写入 SQLite 的垂直切片。
- 共用侧边栏、主题、按钮、抽屉、Toast、表单等组件只实现一次。
- 保留现有 `*-v2.html` 文件，迁移完成前作为视觉和交互验收基准。
- 所有写接口进行服务端校验，删除默认使用软删除。

## 2. Target Structure

```text
拼好家内容创作中心/
├── package.json
├── server.js
├── Dockerfile
├── docker-compose.yml
├── data/
├── src/
│   ├── app.js
│   ├── db.js
│   ├── schema.sql
│   ├── seed.js
│   ├── middleware/
│   │   └── errors.js
│   └── routes/
│       ├── health.js
│       ├── owned-accounts.js
│       ├── content-cards.js
│       ├── performance.js
│       ├── knowledge-assets.js
│       ├── inspiration.js
│       └── dashboard.js
├── public/
│   ├── index.html
│   ├── css/
│   │   └── app.css
│   └── js/
│       ├── app.js
│       ├── api.js
│       ├── store.js
│       ├── components/
│       └── pages/
└── test/
```

## 3. Phase 0: Foundation

### Task 0.1: Project runtime

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `src/app.js`
- Create: `src/routes/health.js`
- Test: `test/health.test.js`

**Acceptance:**
- `npm test` passes.
- `GET /api/health` returns `{ "ok": true }`.
- Express serves `public/index.html`.

### Task 0.2: SQLite foundation

**Files:**
- Create: `src/db.js`
- Create: `src/schema.sql`
- Create: `src/seed.js`
- Test: `test/db.test.js`

**Acceptance:**
- Database and parent directory are created automatically.
- Foreign keys and WAL mode are enabled.
- Schema migration is repeatable.
- Initial workspace and account data are seeded only when tables are empty.

### Task 0.3: Shared frontend shell

**Files:**
- Create: `public/index.html`
- Create: `public/css/app.css`
- Create: `public/js/app.js`
- Create: `public/js/api.js`
- Create: `public/js/store.js`

**Acceptance:**
- Six navigation items share one app shell.
- Theme choice persists separately from business data.
- Hash routing opens the requested module without a full page reload.
- Loading, empty, error and toast states exist.

## 4. Phase 1: Account Matrix and Content Plan

### Task 1.1: Owned account API

**Files:**
- Create: `src/routes/owned-accounts.js`
- Test: `test/owned-accounts.test.js`

**Endpoints:**
- `GET /api/owned-accounts`
- `POST /api/owned-accounts`
- `PUT /api/owned-accounts/:id`
- `PATCH /api/owned-accounts/:id/status`
- `DELETE /api/owned-accounts/:id`

**Acceptance:**
- Duplicate active names are rejected.
- Platform URLs accept only empty, HTTP or HTTPS values.
- Deletes are soft deletes.
- Account colors and platform configuration are returned to all downstream modules.

### Task 1.2: Account matrix frontend

**Files:**
- Create: `public/js/pages/accounts.js`
- Create: `public/js/components/drawer.js`
- Modify: `public/css/app.css`

**Acceptance:**
- Account cards load from the API.
- Search and status filters work.
- Create and edit forms persist to SQLite.
- Form validation and server errors are visible and accessible.

### Task 1.3: Content plan API and frontend

**Files:**
- Create: `src/routes/content-cards.js`
- Create: `public/js/pages/content-plan.js`
- Test: `test/content-cards.test.js`

**Acceptance:**
- Five-column board loads from SQLite.
- New cards select accounts from the owned account API.
- Dragging updates status through a stable card ID.
- Script, publish plan and platform publish records persist.

## 5. Phase 2: Data Review and Knowledge

### Task 2.1: Performance and conclusions

**Files:**
- Create: `src/routes/performance.js`
- Create: `public/js/pages/review.js`
- Test: `test/performance.test.js`

**Acceptance:**
- Performance records use `(content_card_id, platform, record_date)` uniqueness.
- Derived rates are calculated consistently.
- Marking reviewed updates the content card by ID in one transaction.

### Task 2.2: Knowledge assets

**Files:**
- Create: `src/routes/knowledge-assets.js`
- Create: `public/js/pages/knowledge.js`
- Test: `test/knowledge-assets.test.js`

**Acceptance:**
- Assets support create, edit, filter and soft delete.
- Review conclusions can create knowledge assets without intermediate localStorage keys.

## 6. Phase 3: Inspiration and Dashboard

### Task 3.1: Inspiration radar

**Files:**
- Create: `src/routes/inspiration.js`
- Create: `public/js/pages/inspiration.js`
- Test: `test/inspiration.test.js`

**Acceptance:**
- Creators, reference accounts and posts come from SQLite.
- CSV import validates rows and reports partial failures.
- A post can create a content card with a stable source reference.

### Task 3.2: Dashboard aggregation

**Files:**
- Create: `src/routes/dashboard.js`
- Create: `public/js/pages/dashboard.js`
- Test: `test/dashboard.test.js`

**Acceptance:**
- One dashboard endpoint returns metrics, calendar, pipeline, todos, performance and inspiration.
- No per-row database queries are used.
- Calendar notes persist in SQLite.

## 7. Phase 4: Deployment and Hardening

### Task 4.1: Docker deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Acceptance:**
- Container listens on port `4174`.
- `data/` is mounted as a persistent volume.
- Health endpoint works after container restart.

### Task 4.2: Quality gate

**Checks:**
- Run `npm test`.
- Exercise every write endpoint with validation failures.
- Verify desktop and mobile layouts.
- Verify keyboard navigation, focus trapping and reduced motion.
- Export and restore a database backup.

## 8. Current Iteration

**Status: Completed on August 5, 2026.**

This iteration implements Tasks 0.1, 0.2, 0.3, 1.1 and 1.2. The SPA and REST API are running locally, automated tests pass, and browser verification confirms that account create, edit, refresh persistence and soft delete all write through to SQLite.

Docker deployment is verified on the NAS at `192.168.124.77`. The container survives restart, the health endpoint remains available, and SQLite data persists through the mounted `data/` directory.
