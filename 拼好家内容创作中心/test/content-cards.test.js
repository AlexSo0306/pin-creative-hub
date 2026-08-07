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

test('content card workflow persists documents, status and publish records', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const initial = await request(server, '/content-cards');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.data.length, 8);
  assert.equal(initial.body.data[0].publishRecords.length, 3);

  const invalid = await request(server, '/content-cards', {
    method: 'POST',
    body: JSON.stringify({ title: '' })
  });
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.error.details.title, '请填写内容标题');
  assert.equal(invalid.body.error.details.accountId, '请选择所属账号');

  const created = await request(server, '/content-cards', {
    method: 'POST',
    body: JSON.stringify({
      title: 'API 测试内容',
      accountId: 'acc-chef',
      primaryPlatform: 'douyin',
      category: '测试'
    })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.status, 'idea');
  assert.equal(created.body.data.account.id, 'acc-chef');
  const id = created.body.data.id;

  const updated = await request(server, `/content-cards/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: '更新后的 API 测试内容',
      accountId: 'acc-home',
      primaryPlatform: 'xiaohongshu',
      category: '家居测试'
    })
  });
  assert.equal(updated.body.data.account.id, 'acc-home');
  assert.equal(updated.body.data.title, '更新后的 API 测试内容');

  const script = await request(server, `/content-cards/${id}/script`, {
    method: 'PATCH',
    body: JSON.stringify({ body: '# 测试录制稿\n\n- 第一项' })
  });
  assert.match(script.body.data.scriptBody, /第一项/);
  assert.ok(script.body.data.scriptUpdatedAt);

  const plan = await request(server, `/content-cards/${id}/publish-plan`, {
    method: 'PATCH',
    body: JSON.stringify({ body: '# 发布方案\n\n| 平台 | 时间 |\n| --- | --- |' })
  });
  assert.match(plan.body.data.publishPlanBody, /发布方案/);

  const producing = await request(server, `/content-cards/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'producing', productionProgress: 'editing' })
  });
  assert.equal(producing.body.data.productionProgress, 'editing');

  const invalidUrl = await request(server, `/content-cards/${id}/publish-info`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{ platform: 'douyin', publishUrl: 'not-a-url' }]
    })
  });
  assert.equal(invalidUrl.response.status, 422);

  const published = await request(server, `/content-cards/${id}/publish-info`, {
    method: 'PATCH',
    body: JSON.stringify({
      records: [{
        platform: 'douyin',
        publishUrl: 'https://www.douyin.com/video/test',
        publishTitle: '平台测试标题'
      }],
      markPublished: true
    })
  });
  assert.equal(published.body.data.status, 'published');
  assert.equal(published.body.data.productionProgress, null);
  assert.ok(published.body.data.publishRecords.every((record) => record.publishTime));
  assert.equal(
    published.body.data.publishRecords.find((record) => record.platform === 'douyin').publishTitle,
    '平台测试标题'
  );

  const movedBack = await request(server, `/content-cards/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'scripted', productionProgress: 'shooting' })
  });
  assert.equal(movedBack.body.data.productionProgress, null);
  assert.match(
    movedBack.body.data.publishRecords.find((record) => record.platform === 'douyin').publishUrl,
    /^https:/
  );

  const filtered = await request(
    server,
    '/content-cards?accountId=acc-home&platform=xiaohongshu&search=API'
  );
  assert.equal(filtered.body.data.length, 1);
  assert.equal(filtered.body.data[0].id, id);

  const deleted = await request(server, `/content-cards/${id}`, {
    method: 'DELETE'
  });
  assert.equal(deleted.response.status, 204);

  const final = await request(server, '/content-cards');
  assert.equal(final.body.data.length, 8);
});
