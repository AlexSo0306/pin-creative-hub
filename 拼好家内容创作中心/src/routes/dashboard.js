import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  shipinhao: '视频号'
};

function httpError(status, code, message, details) {
  return Object.assign(new Error(message), { status, code, details });
}

function isDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function isMonth(value) {
  const text = String(value || '');
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text);
}

function chinaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekRange(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  const start = shiftDate(value, 1 - weekday);
  return { start, end: shiftDate(start, 6) };
}

function monthRange(month) {
  const start = `${month}-01`;
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

function ageInDays(older, newer) {
  return Math.max(
    0,
    Math.floor(
      (new Date(`${newer}T00:00:00Z`).getTime() -
        new Date(String(older).slice(0, 10) + 'T00:00:00Z').getTime()) / 86400000
    )
  );
}

function latestPerformance(database, start = null, end = null) {
  const dateFilter = start && end
    ? 'AND performance.record_date BETWEEN ? AND ?'
    : '';
  const values = start && end ? [start, end] : [];
  return database.prepare(`
    WITH ranked AS (
      SELECT
        performance.*,
        cards.title,
        cards.account_id,
        accounts.name AS account_name,
        accounts.color AS account_color,
        ROW_NUMBER() OVER (
          PARTITION BY performance.content_card_id, performance.platform
          ORDER BY performance.record_date DESC, performance.updated_at DESC
        ) AS row_number
      FROM content_performance performance
      JOIN content_cards cards ON cards.id = performance.content_card_id
      JOIN owned_accounts accounts ON accounts.id = cards.account_id
      WHERE performance.workspace_id = 'default'
        AND cards.deleted_at IS NULL
        AND accounts.deleted_at IS NULL
        ${dateFilter}
    )
    SELECT * FROM ranked
    WHERE row_number = 1
    ORDER BY record_date DESC, updated_at DESC
  `).all(...values);
}

function accountBaselines(database) {
  const rows = database.prepare(`
    WITH latest_per_platform AS (
      SELECT
        performance.content_card_id,
        cards.account_id,
        performance.plays,
        performance.record_date,
        ROW_NUMBER() OVER (
          PARTITION BY performance.content_card_id, performance.platform
          ORDER BY performance.record_date DESC, performance.updated_at DESC
        ) AS latest_number
      FROM content_performance performance
      JOIN content_cards cards ON cards.id = performance.content_card_id
      WHERE performance.workspace_id = 'default'
        AND cards.deleted_at IS NULL
    ),
    recent AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY account_id
          ORDER BY record_date DESC
        ) AS recent_number
      FROM latest_per_platform
      WHERE latest_number = 1
    )
    SELECT account_id, AVG(COALESCE(plays, 0)) AS average_plays
    FROM recent
    WHERE recent_number <= 10
    GROUP BY account_id
  `).all();
  return new Map(rows.map((row) => [row.account_id, row.average_plays || 0]));
}

function performancePayload(database, date) {
  const rows = latestPerformance(database);
  const overview = rows.reduce((result, row) => {
    result.plays += row.plays || 0;
    result.likes += row.likes || 0;
    result.shares += row.shares || 0;
    result.followersGained += row.followers_gained || 0;
    return result;
  }, { plays: 0, likes: 0, shares: 0, followersGained: 0 });

  const recent = latestPerformance(database, shiftDate(date, -6), date);
  const baselines = accountBaselines(database);
  const records = recent.map((row) => {
    const plays = row.plays || 0;
    const interactions = (row.likes || 0) + (row.comments || 0) +
      (row.bookmarks || 0) + (row.shares || 0);
    const baseline = baselines.get(row.account_id) || 0;
    const ratio = baseline ? plays / baseline : null;
    return {
      contentCardId: row.content_card_id,
      title: row.title,
      platform: row.platform,
      accountName: row.account_name,
      accountColor: row.account_color,
      recordDate: row.record_date,
      plays,
      interactions,
      engagementRate: plays ? interactions / plays : null,
      baselinePlays: baseline,
      anomaly: ratio >= 2 ? 'hit' : ratio !== null && ratio <= 0.5 ? 'low' : null,
      anomalyRatio: ratio
    };
  });

  return {
    overview,
    performance: {
      period: { start: shiftDate(date, -6), end: date },
      top: [...records].sort((left, right) => right.plays - left.plays).slice(0, 3),
      anomalies: records.filter((record) => record.anomaly)
    }
  };
}

function progressFor(row) {
  if (row.status === 'idea') return 30;
  if (row.status === 'scripted') {
    return row.publish_plan_body ? 75 : row.script_body ? 60 : 45;
  }
  if (row.production_progress === 'ready') return 92;
  if (row.production_progress === 'editing') return 82;
  return 70;
}

function pipelinePayload(database) {
  const rows = database.prepare(`
    SELECT
      cards.*,
      accounts.name AS account_name,
      accounts.color AS account_color
    FROM content_cards cards
    JOIN owned_accounts accounts ON accounts.id = cards.account_id
    WHERE cards.workspace_id = 'default'
      AND cards.status IN ('idea', 'scripted', 'producing')
      AND cards.deleted_at IS NULL
      AND accounts.deleted_at IS NULL
    ORDER BY cards.updated_at DESC
  `).all();
  return {
    total: rows.length,
    items: rows.slice(0, 5).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      productionProgress: row.production_progress,
      primaryPlatform: row.primary_platform,
      updatedAt: row.updated_at,
      progress: progressFor(row),
      account: {
        id: row.account_id,
        name: row.account_name,
        color: row.account_color
      }
    }))
  };
}

function calendarPayload(database, month) {
  const range = monthRange(month);
  const releases = database.prepare(`
    SELECT
      records.id,
      records.content_card_id,
      records.platform,
      records.publish_time,
      cards.title,
      accounts.id AS account_id,
      accounts.name AS account_name,
      accounts.color AS account_color
    FROM content_publish_records records
    JOIN content_cards cards ON cards.id = records.content_card_id
    JOIN owned_accounts accounts ON accounts.id = cards.account_id
    WHERE cards.workspace_id = 'default'
      AND records.publish_time IS NOT NULL
      AND substr(records.publish_time, 1, 10) BETWEEN ? AND ?
      AND cards.deleted_at IS NULL
      AND accounts.deleted_at IS NULL
    ORDER BY records.publish_time ASC, accounts.name ASC, records.platform ASC
  `).all(range.start, range.end).map((row) => ({
    id: row.id,
    contentCardId: row.content_card_id,
    date: row.publish_time.slice(0, 10),
    publishTime: row.publish_time,
    title: row.title,
    platform: row.platform,
    platformLabel: PLATFORM_LABELS[row.platform],
    account: {
      id: row.account_id,
      name: row.account_name,
      color: row.account_color
    }
  }));
  const notes = database.prepare(`
    SELECT * FROM calendar_notes
    WHERE workspace_id = 'default'
      AND note_date BETWEEN ? AND ?
    ORDER BY note_date ASC, created_at ASC
  `).all(range.start, range.end).map((row) => ({
    id: row.id,
    date: row.note_date,
    content: row.content,
    createdAt: row.created_at
  }));
  const legend = database.prepare(`
    SELECT id, name, color
    FROM owned_accounts
    WHERE workspace_id = 'default' AND deleted_at IS NULL
    ORDER BY created_at ASC
  `).all();
  return { month, releases, notes, legend };
}

function weekPayload(database, date) {
  const range = weekRange(date);
  const rows = database.prepare(`
    SELECT
      records.content_card_id,
      substr(records.publish_time, 1, 10) AS publish_date
    FROM content_publish_records records
    JOIN content_cards cards ON cards.id = records.content_card_id
    WHERE cards.workspace_id = 'default'
      AND records.publish_time IS NOT NULL
      AND substr(records.publish_time, 1, 10) BETWEEN ? AND ?
      AND cards.deleted_at IS NULL
    GROUP BY records.content_card_id, publish_date
    ORDER BY publish_date ASC
  `).all(range.start, range.end);
  const daily = Array.from({ length: 7 }, (_, index) => {
    const day = shiftDate(range.start, index);
    return {
      date: day,
      published: rows.filter((row) => row.publish_date === day).length
    };
  });
  return {
    ...range,
    published: new Set(rows.map((row) => row.content_card_id)).size,
    planned: null,
    daily
  };
}

function pendingPerformanceCount(database, date) {
  const threshold = `${shiftDate(date, -2)}T23:59:59.999Z`;
  return database.prepare(`
    SELECT COUNT(*) AS count
    FROM content_cards cards
    WHERE cards.workspace_id = 'default'
      AND cards.status = 'published'
      AND cards.status_changed_at <= ?
      AND cards.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM content_performance performance
        WHERE performance.content_card_id = cards.id
      )
  `).get(threshold).count;
}

function generatedTodos(database, date) {
  const rows = database.prepare(`
    SELECT
      cards.id,
      cards.title,
      cards.status,
      cards.updated_at,
      cards.status_changed_at,
      accounts.name AS account_name,
      accounts.color AS account_color
    FROM content_cards cards
    JOIN owned_accounts accounts ON accounts.id = cards.account_id
    WHERE cards.workspace_id = 'default'
      AND cards.deleted_at IS NULL
      AND accounts.deleted_at IS NULL
      AND cards.status IN ('idea', 'published')
    ORDER BY cards.updated_at ASC
  `).all();
  const actions = new Set(database.prepare(`
    SELECT todo_key FROM dashboard_todo_actions
    WHERE workspace_id = 'default' AND effective_date = ?
  `).all(date).map((row) => row.todo_key));
  // 一次性取出所有已有表现数据的卡片，避免在循环内逐条查询（N+1）
  const cardsWithPerformance = new Set(
    database.prepare(`
      SELECT DISTINCT content_card_id FROM content_performance
    `).all().map((row) => row.content_card_id)
  );
  const todos = [];

  for (const row of rows) {
    const updatedDays = ageInDays(row.updated_at, date);
    const statusDays = ageInDays(row.status_changed_at, date);
    if (row.status === 'published') {
      const hasPerformance = cardsWithPerformance.has(row.id);
      if (statusDays >= 2 && !hasPerformance) {
        todos.push({
          key: `backfill:${row.id}`,
          level: 'must',
          title: `补录「${row.title}」表现数据`,
          source: `已发布 ${statusDays} 天 · 尚未录入`,
          href: '#/review',
          accountName: row.account_name,
          accountColor: row.account_color
        });
      } else if (statusDays >= 7) {
        todos.push({
          key: `review:${row.id}`,
          level: 'later',
          title: `复盘「${row.title}」`,
          source: `已发布 ${statusDays} 天 · 尚未复盘`,
          href: '#/review',
          accountName: row.account_name,
          accountColor: row.account_color
        });
      }
    }
    if (row.status === 'idea' && updatedDays >= 14) {
      todos.push({
        key: `stale:${row.id}`,
        level: 'later',
        title: `推进「${row.title}」`,
        source: `选题 ${updatedDays} 天未更新`,
        href: '#/content-plan',
        accountName: row.account_name,
        accountColor: row.account_color
      });
    }
  }

  const visible = todos.filter((todo) => !actions.has(todo.key));
  return {
    must: visible.filter((todo) => todo.level === 'must'),
    later: visible.filter((todo) => todo.level === 'later')
  };
}

function inspirationPayload(database) {
  const rows = database.prepare(`
    SELECT
      posts.id,
      posts.title,
      posts.platform,
      posts.visible_count,
      posts.likes,
      posts.plays,
      posts.original_url,
      posts.publish_time,
      posts.discovered_at,
      creators.name AS creator_name
    FROM reference_posts posts
    JOIN reference_creators creators ON creators.id = posts.creator_id
    WHERE posts.workspace_id = 'default'
    ORDER BY
      coalesce(posts.visible_count, posts.likes, posts.plays, 0) DESC,
      coalesce(posts.publish_time, posts.discovered_at) DESC
    LIMIT 5
  `).all();

  return {
    status: rows.length ? 'available' : 'empty',
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      platform: row.platform,
      creatorName: row.creator_name,
      visibleCount: row.visible_count,
      likes: row.likes,
      plays: row.plays,
      originalUrl: row.original_url,
      publishTime: row.publish_time,
      discoveredAt: row.discovered_at
    }))
  };
}

function dashboardPayload(database, date, month) {
  const performance = performancePayload(database, date);
  return {
    generatedAt: new Date().toISOString(),
    asOfDate: date,
    overview: {
      ...performance.overview,
      followersTotal: null,
      pendingPerformance: pendingPerformanceCount(database, date)
    },
    week: weekPayload(database, date),
    calendar: calendarPayload(database, month),
    pipeline: pipelinePayload(database),
    todos: generatedTodos(database, date),
    performance: performance.performance,
    inspiration: inspirationPayload(database)
  };
}

function normalizedDate(value) {
  const date = value || chinaToday();
  if (!isDate(date)) {
    throw httpError(422, 'VALIDATION_ERROR', '日期参数无效');
  }
  return date;
}

export function createDashboardRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const date = normalizedDate(request.query.date);
    const month = request.query.month || date.slice(0, 7);
    if (!isMonth(month)) {
      throw httpError(422, 'VALIDATION_ERROR', '月份参数无效');
    }
    response.json({ data: dashboardPayload(database, date, month) });
  });

  router.get('/todos', (request, response) => {
    const date = normalizedDate(request.query.date);
    response.json({ data: generatedTodos(database, date) });
  });

  router.post('/todos/:todoKey/:action', (request, response) => {
    const date = normalizedDate(request.body.date || request.query.date);
    const action = request.params.action;
    if (!['complete', 'postpone'].includes(action)) {
      throw httpError(404, 'NOT_FOUND', '未找到该待办操作');
    }
    const todos = generatedTodos(database, date);
    const all = [...todos.must, ...todos.later];
    const todoKey = decodeURIComponent(request.params.todoKey);
    if (!all.some((todo) => todo.key === todoKey)) {
      throw httpError(404, 'DASHBOARD_TODO_NOT_FOUND', '未找到该待办或已处理');
    }
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO dashboard_todo_actions (
        id, workspace_id, todo_key, action, effective_date, created_at
      ) VALUES (?, 'default', ?, ?, ?, ?)
      ON CONFLICT(workspace_id, todo_key, effective_date) DO UPDATE SET
        action = excluded.action,
        created_at = excluded.created_at
    `).run(
      randomUUID(),
      todoKey,
      action === 'complete' ? 'completed' : 'postponed',
      date,
      now
    );
    response.status(201).json({
      data: {
        todoKey,
        action: action === 'complete' ? 'completed' : 'postponed',
        effectiveDate: date
      }
    });
  });

  return router;
}

export function createCalendarRouter(database) {
  const router = Router();

  router.get('/notes', (request, response) => {
    const month = request.query.month || chinaToday().slice(0, 7);
    if (!isMonth(month)) {
      throw httpError(422, 'VALIDATION_ERROR', '月份参数无效');
    }
    response.json({ data: calendarPayload(database, month).notes });
  });

  router.post('/notes', (request, response) => {
    const date = String(request.body.date || request.body.noteDate || '');
    const content = String(request.body.content || '').trim();
    const details = {};
    if (!isDate(date)) details.date = '请选择有效日期';
    if (!content) details.content = '请输入备注内容';
    if (content.length > 500) details.content = '备注不能超过 500 字';
    if (Object.keys(details).length) {
      throw httpError(422, 'VALIDATION_ERROR', '日历备注未通过校验', details);
    }
    const row = {
      id: randomUUID(),
      date,
      content,
      createdAt: new Date().toISOString()
    };
    database.prepare(`
      INSERT INTO calendar_notes (
        id, workspace_id, note_date, content, created_at
      ) VALUES (?, 'default', ?, ?, ?)
    `).run(row.id, row.date, row.content, row.createdAt);
    response.status(201).json({ data: row });
  });

  router.delete('/notes/:id', (request, response) => {
    const result = database.prepare(`
      DELETE FROM calendar_notes
      WHERE id = ? AND workspace_id = 'default'
    `).run(request.params.id);
    if (!result.changes) {
      throw httpError(404, 'CALENDAR_NOTE_NOT_FOUND', '未找到该日历备注');
    }
    response.status(204).end();
  });

  return router;
}
