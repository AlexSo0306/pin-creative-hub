import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const PLATFORMS = ['douyin', 'xiaohongshu', 'shipinhao'];
const ACCOUNT_STATUSES = ['active', 'preparing', 'paused'];
const PUBLISH_STATUSES = ['active', 'paused', 'unconfigured'];
const DEFAULT_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4',
  '#3B82F6', '#8B5CF6', '#EC4899', '#78716C'
];

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

function normalizePlatforms(platforms = []) {
  const source = new Map(
    Array.isArray(platforms)
      ? platforms.map((platform) => [platform.platform, platform])
      : []
  );

  return PLATFORMS.map((platform) => {
    const value = source.get(platform) || {};
    return {
      platform,
      username: String(value.username || '').trim(),
      profileUrl: String(value.profileUrl || value.profile_url || '').trim(),
      publishStatus: PUBLISH_STATUSES.includes(value.publishStatus || value.publish_status)
        ? value.publishStatus || value.publish_status
        : 'unconfigured',
      lastPublished: String(value.lastPublished || value.last_published || '').trim()
    };
  });
}

function validateAccount(payload, database, currentId = null) {
  const account = {
    name: String(payload.name || '').trim(),
    direction: String(payload.direction || '').trim(),
    status: ACCOUNT_STATUSES.includes(payload.status) ? payload.status : 'active',
    color: /^#[0-9a-f]{6}$/i.test(payload.color || '')
      ? payload.color.toUpperCase()
      : DEFAULT_COLORS[0],
    positioning: String(payload.positioning || '').trim(),
    targetAudience: String(payload.targetAudience || payload.target_audience || '').trim(),
    cta: String(payload.cta || '').trim(),
    notes: String(payload.notes || '').trim(),
    platforms: normalizePlatforms(payload.platforms)
  };

  const details = {};
  if (!account.name) details.name = '请填写账号名称';
  if (!account.direction) details.direction = '请填写内容方向';

  const duplicate = database.prepare(`
    SELECT id FROM owned_accounts
    WHERE workspace_id = 'default'
      AND lower(name) = lower(?)
      AND deleted_at IS NULL
      AND id != coalesce(?, '')
  `).get(account.name, currentId);

  if (duplicate) details.name = '该账号名称已存在';

  for (const platform of account.platforms) {
    if (!isValidUrl(platform.profileUrl)) {
      details[`platforms.${platform.platform}.profileUrl`] =
        '请输入以 http:// 或 https:// 开头的有效链接';
    }
  }

  if (Object.keys(details).length) {
    throw httpError(422, 'VALIDATION_ERROR', '账号信息未通过校验', details);
  }

  return account;
}

function readAccount(database, id) {
  const row = database.prepare(`
    SELECT * FROM owned_accounts
    WHERE id = ? AND deleted_at IS NULL
  `).get(id);

  if (!row) return null;

  const platforms = database.prepare(`
    SELECT platform, username, profile_url, publish_status, last_published
    FROM owned_account_platforms
    WHERE account_id = ?
    ORDER BY CASE platform
      WHEN 'douyin' THEN 1
      WHEN 'xiaohongshu' THEN 2
      ELSE 3
    END
  `).all(id);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    direction: row.direction,
    status: row.status,
    color: row.color,
    positioning: row.positioning,
    targetAudience: row.target_audience,
    cta: row.cta,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    platforms: platforms.map((platform) => ({
      platform: platform.platform,
      username: platform.username,
      profileUrl: platform.profile_url,
      publishStatus: platform.publish_status,
      lastPublished: platform.last_published
    }))
  };
}

function writePlatforms(database, accountId, platforms, now) {
  const statement = database.prepare(`
    INSERT INTO owned_account_platforms (
      id, account_id, platform, username, profile_url, publish_status,
      last_published, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, platform) DO UPDATE SET
      username = excluded.username,
      profile_url = excluded.profile_url,
      publish_status = excluded.publish_status,
      last_published = excluded.last_published,
      updated_at = excluded.updated_at
  `);

  for (const platform of platforms) {
    statement.run(
      randomUUID(),
      accountId,
      platform.platform,
      platform.username,
      platform.profileUrl,
      platform.publishStatus,
      platform.lastPublished,
      now,
      now
    );
  }
}

export function createOwnedAccountsRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const rows = database.prepare(`
      SELECT id FROM owned_accounts
      WHERE workspace_id = 'default' AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'active' THEN 1 WHEN 'preparing' THEN 2 ELSE 3 END,
        updated_at DESC
    `).all();

    response.json({ data: rows.map((row) => readAccount(database, row.id)) });
  });

  router.get('/:id', (request, response) => {
    const account = readAccount(database, request.params.id);
    if (!account) {
      throw httpError(404, 'ACCOUNT_NOT_FOUND', '未找到该账号');
    }
    response.json({ data: account });
  });

  router.post('/', (request, response) => {
    const account = validateAccount(request.body, database);
    const id = randomUUID();
    const now = new Date().toISOString();

    database.exec('BEGIN');
    try {
      database.prepare(`
        INSERT INTO owned_accounts (
          id, workspace_id, name, direction, status, color, positioning,
          target_audience, cta, notes, created_at, updated_at
        ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        account.name,
        account.direction,
        account.status,
        account.color,
        account.positioning,
        account.targetAudience,
        account.cta,
        account.notes,
        now,
        now
      );
      writePlatforms(database, id, account.platforms, now);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    response.status(201).json({ data: readAccount(database, id) });
  });

  router.put('/:id', (request, response) => {
    if (!readAccount(database, request.params.id)) {
      throw httpError(404, 'ACCOUNT_NOT_FOUND', '未找到该账号');
    }

    const account = validateAccount(request.body, database, request.params.id);
    const now = new Date().toISOString();

    database.exec('BEGIN');
    try {
      database.prepare(`
        UPDATE owned_accounts SET
          name = ?, direction = ?, status = ?, color = ?, positioning = ?,
          target_audience = ?, cta = ?, notes = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
      `).run(
        account.name,
        account.direction,
        account.status,
        account.color,
        account.positioning,
        account.targetAudience,
        account.cta,
        account.notes,
        now,
        request.params.id
      );
      writePlatforms(database, request.params.id, account.platforms, now);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }

    response.json({ data: readAccount(database, request.params.id) });
  });

  router.patch('/:id/status', (request, response) => {
    if (!ACCOUNT_STATUSES.includes(request.body.status)) {
      throw httpError(422, 'VALIDATION_ERROR', '账号状态无效', {
        status: '请选择有效的账号状态'
      });
    }

    const result = database.prepare(`
      UPDATE owned_accounts
      SET status = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(request.body.status, new Date().toISOString(), request.params.id);

    if (!result.changes) {
      throw httpError(404, 'ACCOUNT_NOT_FOUND', '未找到该账号');
    }

    response.json({ data: readAccount(database, request.params.id) });
  });

  router.delete('/:id', (request, response) => {
    const now = new Date().toISOString();
    const result = database.prepare(`
      UPDATE owned_accounts
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now, now, request.params.id);

    if (!result.changes) {
      throw httpError(404, 'ACCOUNT_NOT_FOUND', '未找到该账号');
    }

    response.status(204).end();
  });

  return router;
}
