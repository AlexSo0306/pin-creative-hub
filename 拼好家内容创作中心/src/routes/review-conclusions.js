import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  serializeKnowledgeAsset,
  upsertReviewKnowledgeDraft
} from './knowledge-assets.js';

function httpError(status, code, message, details) {
  return Object.assign(new Error(message), { status, code, details });
}

function isDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    effectiveTitles: row.effective_titles,
    effectiveOpenings: row.effective_openings,
    effectiveCtas: row.effective_ctas,
    abandonTopics: row.abandon_topics,
    nextActions: row.next_actions,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalize(payload) {
  const value = {
    periodType: payload.periodType || payload.period_type,
    periodStart: payload.periodStart || payload.period_start,
    periodEnd: payload.periodEnd || payload.period_end,
    effectiveTitles: String(payload.effectiveTitles || payload.effective_titles || '').trim(),
    effectiveOpenings: String(
      payload.effectiveOpenings || payload.effective_openings || ''
    ).trim(),
    effectiveCtas: String(payload.effectiveCtas || payload.effective_ctas || '').trim(),
    abandonTopics: String(payload.abandonTopics || payload.abandon_topics || '').trim(),
    nextActions: String(payload.nextActions || payload.next_actions || '').trim()
  };
  const details = {};
  if (!['week', 'month'].includes(value.periodType)) {
    details.periodType = '请选择周或月';
  }
  if (!isDate(value.periodStart)) details.periodStart = '周期开始日期无效';
  if (!isDate(value.periodEnd) || value.periodEnd < value.periodStart) {
    details.periodEnd = '周期结束日期无效';
  }
  if (Object.keys(details).length) {
    throw httpError(422, 'VALIDATION_ERROR', '复盘结论未通过校验', details);
  }
  return value;
}

function read(database, id) {
  return database.prepare(`
    SELECT * FROM review_conclusions
    WHERE id = ? AND workspace_id = 'default'
  `).get(id);
}

export function createReviewConclusionsRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const periodType = request.query.periodType || request.query.period;
    const periodStart = request.query.start || request.query.periodStart;
    if (!['week', 'month'].includes(periodType) || !isDate(periodStart)) {
      throw httpError(422, 'VALIDATION_ERROR', '复盘周期无效');
    }
    const row = database.prepare(`
      SELECT * FROM review_conclusions
      WHERE workspace_id = 'default'
        AND period_type = ?
        AND period_start = ?
    `).get(periodType, periodStart);
    response.json({ data: serialize(row) });
  });

  router.post('/', (request, response) => {
    const conclusion = normalize(request.body);
    const now = new Date().toISOString();
    const existing = database.prepare(`
      SELECT id FROM review_conclusions
      WHERE workspace_id = 'default'
        AND period_type = ?
        AND period_start = ?
    `).get(conclusion.periodType, conclusion.periodStart);
    const id = existing?.id || randomUUID();
    let knowledgeDraft = null;
    database.exec('BEGIN');
    try {
      database.prepare(`
        INSERT INTO review_conclusions (
          id, workspace_id, period_type, period_start, period_end,
          effective_titles, effective_openings, effective_ctas,
          abandon_topics, next_actions, created_at, updated_at
        ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, period_type, period_start) DO UPDATE SET
          period_end = excluded.period_end,
          effective_titles = excluded.effective_titles,
          effective_openings = excluded.effective_openings,
          effective_ctas = excluded.effective_ctas,
          abandon_topics = excluded.abandon_topics,
          next_actions = excluded.next_actions,
          updated_at = excluded.updated_at
      `).run(
        id,
        conclusion.periodType,
        conclusion.periodStart,
        conclusion.periodEnd,
        conclusion.effectiveTitles,
        conclusion.effectiveOpenings,
        conclusion.effectiveCtas,
        conclusion.abandonTopics,
        conclusion.nextActions,
        now,
        now
      );
      const saved = read(database, id);
      if (request.body.depositToKnowledge) {
        knowledgeDraft = upsertReviewKnowledgeDraft(database, saved, now);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    const saved = serialize(read(database, id));
    response.status(existing ? 200 : 201).json({
      data: request.body.depositToKnowledge
        ? {
            conclusion: saved,
            knowledgeDraft: serializeKnowledgeAsset(knowledgeDraft)
          }
        : saved
    });
  });

  router.put('/:id', (request, response) => {
    if (!read(database, request.params.id)) {
      throw httpError(404, 'REVIEW_CONCLUSION_NOT_FOUND', '未找到该复盘结论');
    }
    const conclusion = normalize(request.body);
    const now = new Date().toISOString();
    database.prepare(`
      UPDATE review_conclusions
      SET period_type = ?, period_start = ?, period_end = ?,
        effective_titles = ?, effective_openings = ?, effective_ctas = ?,
        abandon_topics = ?, next_actions = ?, updated_at = ?
      WHERE id = ? AND workspace_id = 'default'
    `).run(
      conclusion.periodType,
      conclusion.periodStart,
      conclusion.periodEnd,
      conclusion.effectiveTitles,
      conclusion.effectiveOpenings,
      conclusion.effectiveCtas,
      conclusion.abandonTopics,
      conclusion.nextActions,
      now,
      request.params.id
    );
    response.json({ data: serialize(read(database, request.params.id)) });
  });

  return router;
}
