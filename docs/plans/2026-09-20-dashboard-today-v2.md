# 今日工作台 v2.0 · 实施计划

> **For Agent:** 用 verification 逐 Task 校验（node:test + 逐屏自查），每完成一 Task 更新 `docs/AI-COLLAB.md` 共享日志。

**Goal:** 把「今日工作台」从"资料库快照"升级为"运营指挥中心"，完整落地 Spec 6 区块：数据总览 / 内容日历 / 选题流水线 / 今日待办 / 表现速览 / 灵感速递。

**现状（已查实）：** 后端已有 `/api/dashboard`、`/api/dashboard/monitor`、`/api/calendar` 路由和"今日待办"生成逻辑；前端 `pages/dashboard.js` 已渲染 6 区块骨架。→ **本计划是"增强对齐 Spec"，不是从零新建。**

**非目标（Spec N1-N6）：** 不跨空间汇总、首页不展示深度图表、不做 AI 建议、不做推送。

---

### Task 1: 后端数据总览补齐

**Files:** `src/routes/dashboard.js`

**Steps:**
1. 数据总览：聚合所有自有账号的总播放/总点赞/总粉丝/总分享（存在 `content_performance`，按其聚合）。
2. 本周已发布进度：按本周内 `content_publish_records` 计数 vs 本周计划数。
3. 各账号粉丝趋势箭头（↑/↓/→）：对比最近两期粉丝字段。
4. 待补数据提醒：统计已发布但未录表现数据的内容数。
5. 补 `node --test` 测试；确认 `npm test` 通过。

### Task 2: 后端内容日历 + 待办接口校準

**Files:** `src/routes/dashboard.js`

**Steps:**
1. 内容日历：确认返回发布记录 + 备注 + 账号×平台颜色图例（现状已有，补字段校验）。
2. 校验"今日待办"自动计算逻辑与 Spec 一致：今日排期、逾期未发、待补数据 → must/later；支持标记完成/推迟（检查 `dashboard_todo_actions` 读写）。
3. 补测试覆盖 must/later 归类。

### Task 3: 前端数据总览 + 表现速览增强

**Files:** `public/js/pages/dashboard.js`、`public/index.html`、`public/css/app.css`

**Steps:**
1. 顶部数据总览四卡片（总览/点赞/粉丝/分享）+ 本周进度条 + 待补数据提醒，对齐 Spec 布局。
2. 表现速览：Top 3 + 异常标记（超均值 2 倍=爆款，<50%=翻车），点击跳数据复盘。
3. 逐屏自查桌面/移动端信息层级，不用特效框架（原生 JS）。

### Task 4: 前端内容日历 + 今日待办 + 选题流水线 + 灵感速递增强

**Files:** `public/js/pages/dashboard.js`、`public/js/store.js`、`public/css/app.css`

**Steps:**
1. 内容日历：月视图 + 账号×平台颜色 + 点击日期展开当日列表 + 添加自由文本备注 + 周/月切换。
2. 今日待办：must/later 两级 + 标记完成/推迟到明天操作反馈。
3. 选题流水线：写作中/待排期列表（标题/平台/进度/最后编辑时间），点击跳编辑页。
4. 灵感速递：最新 3 条对标作品 + 刷新雷达反馈（保留 v1.0）。

### Task 5: 数据打通与端到端验证

**Files:** 端到端自查

**Steps:**
1. `seed.js` 造样例数据 → `npm start` 逐区块核对 Spec 布局。
2. `npm test` 全绿。
3. 更新 `docs/AI-COLLAB.md` 共享日志（做了什么 / 卡哪 / 下一步）。

---

## 合入 main 前 check
- [ ] `npm test` 通过
- [ ] 无 `.env`/`*.db`/`node_modules` 进库
- [ ] 共享日志已更新
