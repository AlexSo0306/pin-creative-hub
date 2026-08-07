import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const PLATFORMS = ['douyin', 'xiaohongshu', 'shipinhao'];
const METRICS = [
  'plays', 'likes', 'comments', 'bookmarks', 'shares', 'followersGained', 'leads'
];

function httpError(status, code, message, details) {
  return Object.assign(new Error(message), { status, code, details });
}

function isDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function numberValue(value, field, details) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    details[field] = '请输入非负整数';
    return null;
  }
  return number;
}

function requireCard(database, id) {
  const card = database.prepare(`
    SELECT cards.id, cards.status
    FROM content_cards cards
    WHERE cards.id = ? AND cards.workspace_id = 'default'
      AND cards.deleted_at IS NULL
  `).get(id);
  if (!card) {
    throw httpError(404, 'CONTENT_CARD_NOT_FOUND', '未找到该内容卡片');
  }
  return card;
}

function normalizeRecord(payload, index = 0) {
  const details = {};
  const platform = String(payload.platform || '');
  const recordDate = String(payload.recordDate || payload.record_date || '');
  if (!PLATFORMS.includes(platform)) details[`records.${index}.platform`] = '请选择有效平台';
  if (!isDate(recordDate)) details[`records.${index}.recordDate`] = '请选择有效采集日期';

  const values = {};
  for (const field of METRICS) {
    const snakeField = field === 'followersGained' ? 'followers_gained' : field;
    values[field] = numberValue(
      payload[field] ?? payload[snakeField],
      `records.${index}.${field}`,
      details
    );
  }
  if (Object.keys(details).length) {
    throw httpError(422, 'VALIDATION_ERROR', '表现数据未通过校验', details);
  }
  return { platform, recordDate, ...values };
}

function metricRates(record) {
  const interactions = (record.likes || 0) + (record.comments || 0) +
    (record.bookmarks || 0) + (record.shares || 0);
  const plays = record.plays || 0;
  return {
    interactions,
    engagementRate: plays ? interactions / plays : null,
    bookmarkRate: plays ? (record.bookmarks || 0) / plays : null,
    leadRate: plays ? (record.leads || 0) / plays : null
  };
}

function serializeRecord(row) {
  return {
    id: row.id,
    contentCardId: row.content_card_id,
    platform: row.platform,
    recordDate: row.record_date,
    plays: row.plays,
    likes: row.likes,
    comments: row.comments,
    bookmarks: row.bookmarks,
    shares: row.shares,
    followersGained: row.followers_gained,
    leads: row.leads,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...metricRates(row)
  };
}

function rangeEnd(periodType, start) {
  const date = new Date(`${start}T00:00:00Z`);
  if (periodType === 'week') date.setUTCDate(date.getUTCDate() + 6);
  else date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function normalizeReviewQuery(query) {
  const periodType = query.periodType || query.period || 'week';
  const start = query.start;
  if (!['week', 'month'].includes(periodType) || !isDate(start)) {
    throw httpError(422, 'VALIDATION_ERROR', '复盘周期无效');
  }
  if (query.platform && !PLATFORMS.includes(query.platform)) {
    throw httpError(422, 'VALIDATION_ERROR', '平台筛选值无效');
  }
  return {
    periodType,
    start,
    end: rangeEnd(periodType, start),
    accountId: query.accountId || null,
    platform: query.platform || null
  };
}

function latestRows(database, filters) {
  const conditions = [
    "performance.workspace_id = 'default'",
    'performance.record_date BETWEEN ? AND ?',
    'cards.deleted_at IS NULL',
    "cards.status IN ('published', 'reviewed')"
  ];
  const values = [filters.start, filters.end];
  if (filters.accountId) {
    conditions.push('cards.account_id = ?');
    values.push(filters.accountId);
  }
  if (filters.platform) {
    conditions.push('performance.platform = ?');
    values.push(filters.platform);
  }

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
      WHERE ${conditions.join(' AND ')}
    )
    SELECT * FROM ranked
    WHERE row_number = 1
    ORDER BY record_date DESC, updated_at DESC
  `).all(...values);
}

function accountBaselines(database) {
  const rows = database.prepare(`
    WITH latest_per_content AS (
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
      FROM latest_per_content
      WHERE latest_number = 1
    )
    SELECT account_id, AVG(COALESCE(plays, 0)) AS average_plays
    FROM recent
    WHERE recent_number <= 10
    GROUP BY account_id
  `).all();
  return new Map(rows.map((row) => [row.account_id, row.average_plays || 0]));
}

function reviewPayload(database, filters) {
  const rows = latestRows(database, filters);
  const baselines = accountBaselines(database);
  const records = rows.map((row) => {
    const record = {
      ...serializeRecord(row),
      title: row.title,
      accountId: row.account_id,
      accountName: row.account_name,
      accountColor: row.account_color
    };
    const baseline = baselines.get(row.account_id) || 0;
    const ratio = baseline ? (row.plays || 0) / baseline : null;
    return {
      ...record,
      baselinePlays: baseline,
      anomaly: ratio >= 2 ? 'hit' : ratio !== null && ratio <= 0.5 ? 'low' : null,
      anomalyRatio: ratio
    };
  });
  const summary = records.reduce((result, record) => {
    result.plays += record.plays || 0;
    result.interactions += record.interactions;
    result.followersGained += record.followersGained || 0;
    result.leads += record.leads || 0;
    result.contentIds.add(record.contentCardId);
    return result;
  }, {
    plays: 0,
    interactions: 0,
    followersGained: 0,
    leads: 0,
    contentIds: new Set()
  });

  return {
    period: filters,
    summary: {
      publishedContent: summary.contentIds.size,
      recordCount: records.length,
      plays: summary.plays,
      interactions: summary.interactions,
      followersGained: summary.followersGained,
      leads: summary.leads,
      engagementRate: summary.plays ? summary.interactions / summary.plays : null
    },
    top: [...records].sort((left, right) => (right.plays || 0) - (left.plays || 0)).slice(0, 3),
    anomalies: records.filter((record) => record.anomaly),
    records
  };
}

export function createPerformanceRouter(database) {
  const router = Router();

  router.get('/pending', (request, response) => {
    const rows = database.prepare(`
      SELECT
        cards.id,
        cards.title,
        cards.primary_platform,
        cards.status_changed_at,
        accounts.id AS account_id,
        accounts.name AS account_name,
        accounts.color AS account_color
      FROM content_cards cards
      JOIN owned_accounts accounts ON accounts.id = cards.account_id
      WHERE cards.workspace_id = 'default'
        AND cards.status = 'published'
        AND cards.deleted_at IS NULL
        AND accounts.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM content_performance performance
          WHERE performance.content_card_id = cards.id
        )
      ORDER BY cards.status_changed_at ASC
    `).all();
    const now = Date.now();
    response.json({
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        primaryPlatform: row.primary_platform,
        publishedAt: row.status_changed_at,
        daysPublished: Math.max(
          0,
          Math.floor((now - new Date(row.status_changed_at).getTime()) / 86400000)
        ),
        account: {
          id: row.account_id,
          name: row.account_name,
          color: row.account_color
        }
      }))
    });
  });

  router.get('/review', (request, response) => {
    response.json({ data: reviewPayload(database, normalizeReviewQuery(request.query)) });
  });

  router.get('/', (request, response) => {
    const cardId = request.query.contentCardId || request.query.content_card_id;
    if (!cardId) {
      throw httpError(422, 'VALIDATION_ERROR', '请选择内容卡片');
    }
    requireCard(database, cardId);
    const rows = database.prepare(`
      SELECT * FROM content_performance
      WHERE content_card_id = ?
      ORDER BY record_date DESC, platform ASC
    `).all(cardId);
    response.json({ data: rows.map(serializeRecord) });
  });

  router.post('/', (request, response) => {
    const cardId = String(
      request.body.contentCardId || request.body.content_card_id || ''
    );
    requireCard(database, cardId);
    const source = Array.isArray(request.body.records)
      ? request.body.records
      : [request.body];
    if (!source.length) {
      throw httpError(422, 'VALIDATION_ERROR', '请至少填写一个平台的数据');
    }
    const records = source.map(normalizeRecord);
    const now = new Date().toISOString();
    const upsert = database.prepare(`
      INSERT INTO content_performance (
        id, workspace_id, content_card_id, platform, record_date,
        plays, likes, comments, bookmarks, shares, followers_gained,
        leads, created_at, updated_at
      ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_card_id, platform, record_date) DO UPDATE SET
        plays = excluded.plays,
        likes = excluded.likes,
        comments = excluded.comments,
        bookmarks = excluded.bookmarks,
        shares = excluded.shares,
        followers_gained = excluded.followers_gained,
        leads = excluded.leads,
        updated_at = excluded.updated_at
    `);

    database.exec('BEGIN');
    try {
      for (const record of records) {
        upsert.run(
          randomUUID(),
          cardId,
          record.platform,
          record.recordDate,
          record.plays,
          record.likes,
          record.comments,
          record.bookmarks,
          record.shares,
          record.followersGained,
          record.leads,
          now,
          now
        );
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    const saved = database.prepare(`
      SELECT * FROM content_performance
      WHERE content_card_id = ?
      ORDER BY record_date DESC, platform ASC
    `).all(cardId);
    response.status(201).json({ data: saved.map(serializeRecord) });
  });

  return router;
}
