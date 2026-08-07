import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const PLATFORMS = ['douyin', 'xiaohongshu', 'shipinhao'];
const STATUSES = ['idea', 'scripted', 'producing', 'published', 'reviewed'];
const PROGRESS_VALUES = ['shooting', 'editing', 'ready'];

function httpError(status, code, message, details) {
  return Object.assign(new Error(message), { status, code, details });
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function requireCard(database, id) {
  const card = database.prepare(`
    SELECT id FROM content_cards
    WHERE id = ? AND workspace_id = 'default' AND deleted_at IS NULL
  `).get(id);
  if (!card) {
    throw httpError(404, 'CONTENT_CARD_NOT_FOUND', '未找到该内容卡片');
  }
}

function requireAccount(database, accountId) {
  const account = database.prepare(`
    SELECT id FROM owned_accounts
    WHERE id = ? AND workspace_id = 'default' AND deleted_at IS NULL
  `).get(accountId);
  if (!account) {
    throw httpError(422, 'VALIDATION_ERROR', '内容卡片信息未通过校验', {
      accountId: '请选择有效的所属账号'
    });
  }
}

function normalizeBasic(payload, database) {
  const value = {
    title: String(payload.title || '').trim(),
    accountId: String(payload.accountId || payload.account_id || '').trim(),
    primaryPlatform: payload.primaryPlatform || payload.primary_platform || null,
    category: String(payload.category || '').trim()
  };
  const details = {};
  if (!value.title) details.title = '请填写内容标题';
  if (!value.accountId) details.accountId = '请选择所属账号';
  if (value.primaryPlatform && !PLATFORMS.includes(value.primaryPlatform)) {
    details.primaryPlatform = '请选择有效的主推平台';
  }
  if (Object.keys(details).length) {
    throw httpError(422, 'VALIDATION_ERROR', '内容卡片信息未通过校验', details);
  }
  requireAccount(database, value.accountId);
  return value;
}

function readCard(database, id) {
  const row = database.prepare(`
    SELECT
      cards.*,
      accounts.name AS account_name,
      accounts.color AS account_color,
      accounts.direction AS account_direction
    FROM content_cards cards
    JOIN owned_accounts accounts ON accounts.id = cards.account_id
    WHERE cards.id = ? AND cards.deleted_at IS NULL
  `).get(id);
  if (!row) return null;

  const savedRecords = database.prepare(`
    SELECT platform, publish_url, publish_time, publish_title, updated_at
    FROM content_publish_records
    WHERE content_card_id = ?
  `).all(id);
  const records = new Map(savedRecords.map((record) => [record.platform, record]));

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    accountId: row.account_id,
    account: {
      id: row.account_id,
      name: row.account_name,
      color: row.account_color,
      direction: row.account_direction
    },
    title: row.title,
    status: row.status,
    primaryPlatform: row.primary_platform,
    category: row.category,
    productionProgress: row.production_progress,
    scriptBody: row.script_body,
    scriptUpdatedAt: row.script_updated_at,
    publishPlanBody: row.publish_plan_body,
    publishPlanUpdatedAt: row.publish_plan_updated_at,
    publishRecords: PLATFORMS.map((platform) => {
      const record = records.get(platform);
      return {
        platform,
        publishUrl: record?.publish_url || '',
        publishTime: record?.publish_time || null,
        publishTitle: record?.publish_title || '',
        updatedAt: record?.updated_at || null
      };
    }),
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function ensurePublishRecords(database, cardId, now) {
  const statement = database.prepare(`
    INSERT INTO content_publish_records (
      id, content_card_id, platform, publish_url, publish_time,
      publish_title, created_at, updated_at
    ) VALUES (?, ?, ?, '', NULL, '', ?, ?)
    ON CONFLICT(content_card_id, platform) DO NOTHING
  `);
  for (const platform of PLATFORMS) {
    statement.run(randomUUID(), cardId, platform, now, now);
  }
}

function markMissingPublishTimes(database, cardId, now) {
  ensurePublishRecords(database, cardId, now);
  database.prepare(`
    UPDATE content_publish_records
    SET publish_time = coalesce(publish_time, ?), updated_at = ?
    WHERE content_card_id = ?
  `).run(now, now, cardId);
}

export function createContentCardsRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const conditions = [
      "cards.workspace_id = 'default'",
      'cards.deleted_at IS NULL',
      'accounts.deleted_at IS NULL'
    ];
    const values = [];

    if (request.query.accountId) {
      conditions.push('cards.account_id = ?');
      values.push(request.query.accountId);
    }
    if (request.query.status) {
      if (!STATUSES.includes(request.query.status)) {
        throw httpError(422, 'VALIDATION_ERROR', '状态筛选值无效');
      }
      conditions.push('cards.status = ?');
      values.push(request.query.status);
    }
    if (request.query.platform) {
      if (!PLATFORMS.includes(request.query.platform)) {
        throw httpError(422, 'VALIDATION_ERROR', '平台筛选值无效');
      }
      conditions.push('cards.primary_platform = ?');
      values.push(request.query.platform);
    }
    if (request.query.search) {
      conditions.push('(lower(cards.title) LIKE lower(?) OR lower(cards.category) LIKE lower(?))');
      const search = `%${request.query.search}%`;
      values.push(search, search);
    }

    const rows = database.prepare(`
      SELECT cards.id
      FROM content_cards cards
      JOIN owned_accounts accounts ON accounts.id = cards.account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY cards.updated_at DESC
    `).all(...values);

    response.json({ data: rows.map((row) => readCard(database, row.id)) });
  });

  router.get('/:id', (request, response) => {
    const card = readCard(database, request.params.id);
    if (!card) {
      throw httpError(404, 'CONTENT_CARD_NOT_FOUND', '未找到该内容卡片');
    }
    response.json({ data: card });
  });

  router.post('/', (request, response) => {
    const card = normalizeBasic(request.body, database);
    const id = randomUUID();
    const now = new Date().toISOString();

    database.exec('BEGIN');
    try {
      database.prepare(`
        INSERT INTO content_cards (
          id, workspace_id, account_id, title, status, primary_platform,
          category, status_changed_at, created_at, updated_at
        ) VALUES (?, 'default', ?, ?, 'idea', ?, ?, ?, ?, ?)
      `).run(
        id,
        card.accountId,
        card.title,
        card.primaryPlatform,
        card.category,
        now,
        now,
        now
      );
      ensurePublishRecords(database, id, now);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    response.status(201).json({ data: readCard(database, id) });
  });

  router.put('/:id', (request, response) => {
    requireCard(database, request.params.id);
    const card = normalizeBasic(request.body, database);
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE content_cards
      SET account_id = ?, title = ?, primary_platform = ?, category = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      card.accountId,
      card.title,
      card.primaryPlatform,
      card.category,
      now,
      request.params.id
    );
    response.json({ data: readCard(database, request.params.id) });
  });

  router.patch('/:id/status', (request, response) => {
    requireCard(database, request.params.id);
    const status = request.body.status;
    if (!STATUSES.includes(status)) {
      throw httpError(422, 'VALIDATION_ERROR', '内容状态无效', {
        status: '请选择有效的内容状态'
      });
    }
    const requestedProgress = request.body.productionProgress ??
      request.body.production_progress ?? null;
    if (requestedProgress && !PROGRESS_VALUES.includes(requestedProgress)) {
      throw httpError(422, 'VALIDATION_ERROR', '制作进度无效', {
        productionProgress: '请选择有效的制作进度'
      });
    }

    const now = new Date().toISOString();
    const progress = status === 'producing' ? requestedProgress : null;
    database.exec('BEGIN');
    try {
      database.prepare(`
        UPDATE content_cards
        SET status = ?, production_progress = ?, status_changed_at = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
      `).run(status, progress, now, now, request.params.id);
      if (status === 'published') {
        markMissingPublishTimes(database, request.params.id, now);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    response.json({ data: readCard(database, request.params.id) });
  });

  router.post('/:id/reviewed', (request, response) => {
    const card = database.prepare(`
      SELECT status FROM content_cards
      WHERE id = ? AND workspace_id = 'default' AND deleted_at IS NULL
    `).get(request.params.id);
    if (!card) {
      throw httpError(404, 'CONTENT_CARD_NOT_FOUND', '未找到该内容卡片');
    }
    if (!['published', 'reviewed'].includes(card.status)) {
      throw httpError(409, 'CONTENT_CARD_NOT_PUBLISHED', '只有已发布内容可以标记为已复盘');
    }
    const performanceCount = database.prepare(`
      SELECT COUNT(*) AS count FROM content_performance
      WHERE content_card_id = ?
    `).get(request.params.id).count;
    if (!performanceCount) {
      throw httpError(409, 'PERFORMANCE_REQUIRED', '请先录入至少一个平台的表现数据');
    }
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE content_cards
      SET status = 'reviewed', production_progress = NULL,
        status_changed_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now, now, request.params.id);
    response.json({ data: readCard(database, request.params.id) });
  });

  router.patch('/:id/script', (request, response) => {
    requireCard(database, request.params.id);
    const body = String(request.body.body ?? request.body.scriptBody ?? '');
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE content_cards
      SET script_body = ?, script_updated_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(body, body ? now : null, now, request.params.id);
    response.json({ data: readCard(database, request.params.id) });
  });

  router.patch('/:id/publish-plan', (request, response) => {
    requireCard(database, request.params.id);
    const body = String(request.body.body ?? request.body.publishPlanBody ?? '');
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE content_cards
      SET publish_plan_body = ?, publish_plan_updated_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(body, body ? now : null, now, request.params.id);
    response.json({ data: readCard(database, request.params.id) });
  });

  router.patch('/:id/publish-info', (request, response) => {
    requireCard(database, request.params.id);
    const records = Array.isArray(request.body.records)
      ? request.body.records
      : [request.body];
    const details = {};
    const normalized = records.map((record, index) => {
      const platform = record.platform;
      const publishUrl = String(record.publishUrl ?? record.publish_url ?? '').trim();
      if (!PLATFORMS.includes(platform)) {
        details[`records.${index}.platform`] = '请选择有效的平台';
      }
      if (!isValidUrl(publishUrl)) {
        details[`records.${index}.publishUrl`] = '请输入以 http:// 或 https:// 开头的有效链接';
      }
      return {
        platform,
        publishUrl,
        publishTime: record.publishTime || record.publish_time || null,
        publishTitle: String(record.publishTitle ?? record.publish_title ?? '').trim()
      };
    });
    if (Object.keys(details).length) {
      throw httpError(422, 'VALIDATION_ERROR', '发布记录未通过校验', details);
    }

    const now = new Date().toISOString();
    const statement = database.prepare(`
      INSERT INTO content_publish_records (
        id, content_card_id, platform, publish_url, publish_time,
        publish_title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_card_id, platform) DO UPDATE SET
        publish_url = excluded.publish_url,
        publish_time = excluded.publish_time,
        publish_title = excluded.publish_title,
        updated_at = excluded.updated_at
    `);

    database.exec('BEGIN');
    try {
      for (const record of normalized) {
        statement.run(
          randomUUID(),
          request.params.id,
          record.platform,
          record.publishUrl,
          record.publishTime,
          record.publishTitle,
          now,
          now
        );
      }
      if (request.body.markPublished) {
        markMissingPublishTimes(database, request.params.id, now);
        database.prepare(`
          UPDATE content_cards
          SET status = 'published', production_progress = NULL,
              status_changed_at = ?, updated_at = ?
          WHERE id = ?
        `).run(now, now, request.params.id);
      } else {
        database.prepare(`
          UPDATE content_cards SET updated_at = ? WHERE id = ?
        `).run(now, request.params.id);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    response.json({ data: readCard(database, request.params.id) });
  });

  router.delete('/:id', (request, response) => {
    const now = new Date().toISOString();
    const result = database.prepare(`
      UPDATE content_cards
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now, now, request.params.id);
    if (!result.changes) {
      throw httpError(404, 'CONTENT_CARD_NOT_FOUND', '未找到该内容卡片');
    }
    response.status(204).end();
  });

  return router;
}
