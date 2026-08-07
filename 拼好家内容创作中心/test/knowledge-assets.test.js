import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestServer } from './helpers.js';

async function request(server, path, options = {}) {
  const response = await fetch(`${server.baseUrl}/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers
    }
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test('knowledge assets support search, lifecycle and version conflicts', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const initial = await request(server, '/knowledge-assets');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.data.items.length, 4);
  assert.equal(initial.body.data.summary.active, 4);

  const searched = await request(
    server,
    '/knowledge-assets?q=%E5%BC%80%E5%9C%BA&category=script_template'
  );
  assert.equal(searched.body.data.items.length, 1);
  assert.equal(searched.body.data.items[0].id, 'knowledge-hook-five-seconds');

  const invalid = await request(server, '/knowledge-assets', {
    method: 'POST',
    body: JSON.stringify({ title: '', category: 'bad', body: '' })
  });
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  const created = await request(server, '/knowledge-assets', {
    method: 'POST',
    body: JSON.stringify({
      title: '收藏 CTA 模板',
      category: 'script_template',
      summary: '让用户明确知道收藏后能得到什么。',
      body: '# CTA\n\n收藏这份清单，下次照着做。',
      tags: ['CTA', '收藏'],
      status: 'draft'
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.version, 1);
  assert.equal(created.body.data.status, 'draft');

  const updated = await request(server, `/knowledge-assets/${created.body.data.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...created.body.data,
      status: 'active',
      body: '# CTA\n\n收藏这份清单，做饭时直接照着走。'
    })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.data.version, 2);
  assert.equal(updated.body.data.status, 'active');

  const conflict = await request(server, `/knowledge-assets/${created.body.data.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...created.body.data,
      title: '过期编辑'
    })
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, 'ASSET_VERSION_CONFLICT');

  const archived = await request(
    server,
    `/knowledge-assets/${created.body.data.id}/archive`,
    { method: 'POST', body: '{}' }
  );
  assert.equal(archived.body.data.status, 'archived');

  const deleted = await request(server, `/knowledge-assets/${created.body.data.id}`, {
    method: 'DELETE'
  });
  assert.equal(deleted.response.status, 204);
  const missing = await request(server, `/knowledge-assets/${created.body.data.id}`);
  assert.equal(missing.response.status, 404);
});

test('review conclusion deposits one idempotent knowledge draft', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const payload = {
    periodType: 'week',
    periodStart: '2026-08-03',
    periodEnd: '2026-08-09',
    effectiveTitles: '数字标题更清楚',
    effectiveOpenings: '先展示结果',
    effectiveCtas: '引导收藏清单',
    abandonTopics: '泛泛而谈的选题',
    nextActions: '测试具体时间成本',
    depositToKnowledge: true
  };
  const first = await request(server, '/review-conclusions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.knowledgeDraft.status, 'draft');
  const draftId = first.body.data.knowledgeDraft.id;

  const second = await request(server, '/review-conclusions', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      effectiveTitles: '数字和时间成本标题更清楚'
    })
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.body.data.knowledgeDraft.id, draftId);
  assert.equal(second.body.data.knowledgeDraft.version, 2);

  const count = server.database.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_assets
    WHERE source_review_id = ?
  `).get(first.body.data.conclusion.id).count;
  assert.equal(count, 1);
});
