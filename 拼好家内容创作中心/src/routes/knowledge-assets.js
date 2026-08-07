import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const CATEGORIES = new Set(['brand_guide', 'script_template', 'sop', 'review_method']);
const STATUSES = new Set(['draft', 'active', 'archived']);
const SORTS = new Set(['updated', 'created', 'title']);

function httpError(status, code, message, details) {
  return Object.assign(new Error(message), { status, code, details });
}

function parseTags(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanTags(value) {
  const input = Array.isArray(value)
    ? value
    : String(value || '').split(/[,，]/);
  const tags = [...new Set(input.map((tag) => String(tag).trim()).filter(Boolean))];
  if (tags.length > 12 || tags.some((tag) => tag.length > 20)) {
    throw httpError(422, 'VALIDATION_ERROR', '标签未通过校验', {
      tags: '最多 12 个标签，每个标签不超过 20 个字符'
    });
  }
  return tags;
}

function sourceLabel(row) {
  if (row.source_type === 'review') {
    const type = row.period_type === 'month' ? '月度复盘' : '周复盘';
    return row.period_start ? `${row.period_start} ${type}` : '数据复盘';
  }
  if (row.source_type === 'content') return '内容计划';
  return '手动创建';
}

export function serializeKnowledgeAsset(row, options = {}) {
  if (!row) return null;
  const asset = {
    id: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary,
    body: options.withBody === false ? undefined : row.body,
    tags: parseTags(row.tags_json),
    source: {
      type: row.source_type,
      reviewId: row.source_review_id,
      contentCardId: row.source_content_card_id,
      label: sourceLabel(row)
    },
    status: row.status,
    version: row.version,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (asset.body === undefined) delete asset.body;
  return asset;
}

function normalize(payload, existing) {
  const value = {
    title: String(payload.title ?? existing?.title ?? '').trim(),
    category: payload.category ?? existing?.category,
    summary: String(payload.summary ?? existing?.summary ?? '').trim(),
    body: String(payload.body ?? existing?.body ?? '').trim(),
    tags: cleanTags(payload.tags ?? parseTags(existing?.tags_json)),
    status: payload.status ?? existing?.status ?? 'draft'
  };
  const details = {};
  if (!value.title || value.title.length > 80) details.title = '标题为 1 至 80 个字符';
  if (!CATEGORIES.has(value.category)) details.category = '请选择有效分类';
  if (value.summary.length > 160) details.summary = '摘要不能超过 160 个字符';
  if (!value.body || value.body.length > 50000) details.body = '正文为 1 至 50000 个字符';
  if (!STATUSES.has(value.status)) details.status = '请选择有效状态';
  if (Object.keys(details).length) {
    throw httpError(422, 'VALIDATION_ERROR', '知识资产未通过校验', details);
  }
  return value;
}

function read(database, id) {
  return database.prepare(`
    SELECT assets.*, conclusions.period_type, conclusions.period_start
    FROM knowledge_assets assets
    LEFT JOIN review_conclusions conclusions ON conclusions.id = assets.source_review_id
    WHERE assets.id = ? AND assets.workspace_id = 'default'
      AND assets.deleted_at IS NULL
  `).get(id);
}

function reviewBody(conclusion) {
  return [
    '# 有效标题模式', conclusion.effective_titles || '暂无',
    '# 有效开头模式', conclusion.effective_openings || '暂无',
    '# 有效 CTA 模式', conclusion.effective_ctas || '暂无',
    '# 暂停或放弃的选题', conclusion.abandon_topics || '暂无',
    '# 下周期动作', conclusion.next_actions || '暂无'
  ].join('\n\n');
}

export function upsertReviewKnowledgeDraft(database, conclusion, now = new Date().toISOString()) {
  const existing = database.prepare(`
    SELECT * FROM knowledge_assets
    WHERE workspace_id = 'default' AND source_review_id = ?
      AND deleted_at IS NULL
  `).get(conclusion.id);
  if (existing?.status === 'active') return existing;

  const title = `${conclusion.period_start} ${conclusion.period_type === 'month' ? '月度' : '周'}复盘可复用方法`;
  const body = reviewBody(conclusion);
  const summary = '由周期复盘生成，待整理为可复用的方法资产。';

  if (existing) {
    database.prepare(`
      UPDATE knowledge_assets
      SET title = ?, summary = ?, body = ?, tags_json = ?,
        version = version + 1, updated_at = ?
      WHERE id = ?
    `).run(title, summary, body, JSON.stringify(['复盘']), now, existing.id);
    return read(database, existing.id);
  }

  const id = randomUUID();
  database.prepare(`
    INSERT INTO knowledge_assets (
      id, workspace_id, title, category, summary, body, tags_json,
      source_type, source_review_id, status, version,
      created_at, updated_at
    ) VALUES (?, 'default', ?, 'review_method', ?, ?, ?, 'review', ?, 'draft', 1, ?, ?)
  `).run(id, title, summary, body, JSON.stringify(['复盘']), conclusion.id, now, now);
  return read(database, id);
}

export function createKnowledgeAssetsRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const query = String(request.query.q || '').trim();
    const category = String(request.query.category || '');
    const status = String(request.query.status || 'active');
    const sort = SORTS.has(request.query.sort) ? request.query.sort : 'updated';
    if (category && !CATEGORIES.has(category)) {
      throw httpError(422, 'VALIDATION_ERROR', '知识资产分类无效');
    }
    if (status !== 'all' && !STATUSES.has(status)) {
      throw httpError(422, 'VALIDATION_ERROR', '知识资产状态无效');
    }

    const clauses = ["assets.workspace_id = 'default'", 'assets.deleted_at IS NULL'];
    const params = [];
    if (category) {
      clauses.push('assets.category = ?');
      params.push(category);
    }
    if (status !== 'all') {
      clauses.push('assets.status = ?');
      params.push(status);
    }
    if (query) {
      clauses.push(`(
        assets.title LIKE ? OR assets.summary LIKE ? OR
        assets.body LIKE ? OR assets.tags_json LIKE ?
      )`);
      const pattern = `%${query}%`;
      params.push(pattern, pattern, pattern, pattern);
    }
    const order = {
      updated: 'assets.updated_at DESC, assets.id ASC',
      created: 'assets.created_at DESC, assets.id ASC',
      title: 'assets.title COLLATE NOCASE ASC, assets.id ASC'
    }[sort];
    const items = database.prepare(`
      SELECT assets.*, conclusions.period_type, conclusions.period_start
      FROM knowledge_assets assets
      LEFT JOIN review_conclusions conclusions ON conclusions.id = assets.source_review_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${order}
    `).all(...params).map((row) => serializeKnowledgeAsset(row, { withBody: false }));
    const month = new Date().toISOString().slice(0, 7);
    const summary = database.prepare(`
      SELECT
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN updated_at LIKE ? THEN 1 ELSE 0 END) AS updated_this_month
      FROM knowledge_assets
      WHERE workspace_id = 'default' AND deleted_at IS NULL
    `).get(`${month}%`);
    response.json({
      data: {
        items,
        summary: {
          active: summary.active || 0,
          draft: summary.draft || 0,
          updatedThisMonth: summary.updated_this_month || 0,
          usageThisMonth: 0
        }
      }
    });
  });

  router.get('/:id', (request, response) => {
    const asset = read(database, request.params.id);
    if (!asset) throw httpError(404, 'KNOWLEDGE_ASSET_NOT_FOUND', '未找到该知识资产');
    response.json({ data: serializeKnowledgeAsset(asset) });
  });

  router.post('/', (request, response) => {
    const asset = normalize(request.body);
    const now = new Date().toISOString();
    const id = randomUUID();
    database.prepare(`
      INSERT INTO knowledge_assets (
        id, workspace_id, title, category, summary, body, tags_json,
        source_type, status, version, published_at, created_at, updated_at
      ) VALUES (?, 'default', ?, ?, ?, ?, ?, 'manual', ?, 1, ?, ?, ?)
    `).run(
      id, asset.title, asset.category, asset.summary, asset.body,
      JSON.stringify(asset.tags), asset.status,
      asset.status === 'active' ? now : null, now, now
    );
    response.status(201).json({ data: serializeKnowledgeAsset(read(database, id)) });
  });

  router.put('/:id', (request, response) => {
    const existing = read(database, request.params.id);
    if (!existing) throw httpError(404, 'KNOWLEDGE_ASSET_NOT_FOUND', '未找到该知识资产');
    if (Number(request.body.version) !== existing.version) {
      throw httpError(409, 'ASSET_VERSION_CONFLICT', '资产已更新，请刷新后重试');
    }
    const asset = normalize(request.body, existing);
    const now = new Date().toISOString();
    const publishedAt = asset.status === 'active'
      ? existing.published_at || now
      : existing.published_at;
    database.prepare(`
      UPDATE knowledge_assets
      SET title = ?, category = ?, summary = ?, body = ?, tags_json = ?,
        status = ?, version = version + 1, published_at = ?, updated_at = ?
      WHERE id = ? AND workspace_id = 'default'
    `).run(
      asset.title, asset.category, asset.summary, asset.body,
      JSON.stringify(asset.tags), asset.status, publishedAt, now, existing.id
    );
    response.json({ data: serializeKnowledgeAsset(read(database, existing.id)) });
  });

  router.post('/:id/archive', (request, response) => {
    const existing = read(database, request.params.id);
    if (!existing) throw httpError(404, 'KNOWLEDGE_ASSET_NOT_FOUND', '未找到该知识资产');
    database.prepare(`
      UPDATE knowledge_assets SET status = 'archived', updated_at = ?
      WHERE id = ? AND workspace_id = 'default'
    `).run(new Date().toISOString(), existing.id);
    response.json({ data: serializeKnowledgeAsset(read(database, existing.id)) });
  });

  router.post('/:id/restore', (request, response) => {
    const existing = read(database, request.params.id);
    if (!existing) throw httpError(404, 'KNOWLEDGE_ASSET_NOT_FOUND', '未找到该知识资产');
    database.prepare(`
      UPDATE knowledge_assets SET status = 'draft', updated_at = ?
      WHERE id = ? AND workspace_id = 'default'
    `).run(new Date().toISOString(), existing.id);
    response.json({ data: serializeKnowledgeAsset(read(database, existing.id)) });
  });

  router.delete('/:id', (request, response) => {
    const existing = read(database, request.params.id);
    if (!existing) throw httpError(404, 'KNOWLEDGE_ASSET_NOT_FOUND', '未找到该知识资产');
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE knowledge_assets
      SET status = 'deleted', deleted_at = ?, updated_at = ?
      WHERE id = ? AND workspace_id = 'default'
    `).run(now, now, existing.id);
    response.status(204).end();
  });

  return router;
}
