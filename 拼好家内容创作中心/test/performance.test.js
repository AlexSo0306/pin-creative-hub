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

test('performance workflow aggregates data and closes the review loop', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const seededCount = server.database.prepare(
    'SELECT COUNT(*) AS count FROM content_performance'
  ).get().count;
  assert.equal(seededCount, 5);

  const pending = await request(server, '/performance/pending');
  assert.equal(pending.response.status, 200);
  assert.deepEqual(
    pending.body.data.map((card) => card.id),
    ['content-fitness-breaststroke']
  );

  const invalid = await request(server, '/performance', {
    method: 'POST',
    body: JSON.stringify({
      contentCardId: 'content-fitness-breaststroke',
      platform: 'shipinhao',
      recordDate: '2026-08-06',
      plays: -1
    })
  });
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  const invalidDate = await request(server, '/performance', {
    method: 'POST',
    body: JSON.stringify({
      contentCardId: 'content-fitness-breaststroke',
      platform: 'shipinhao',
      recordDate: '2026-02-31',
      plays: 10
    })
  });
  assert.equal(invalidDate.response.status, 422);

  const created = await request(server, '/performance', {
    method: 'POST',
    body: JSON.stringify({
      contentCardId: 'content-fitness-breaststroke',
      platform: 'shipinhao',
      recordDate: '2026-08-06',
      plays: 0,
      likes: 2,
      comments: 1,
      bookmarks: 3,
      shares: 1,
      followersGained: 1,
      leads: 0
    })
  });
  assert.equal(created.response.status, 201);
  const zeroRecord = created.body.data.find(
    (record) => record.platform === 'shipinhao' && record.recordDate === '2026-08-06'
  );
  assert.equal(zeroRecord.engagementRate, null);
  assert.equal(zeroRecord.bookmarkRate, null);
  assert.equal(zeroRecord.leadRate, null);

  const updated = await request(server, '/performance', {
    method: 'POST',
    body: JSON.stringify({
      contentCardId: 'content-fitness-breaststroke',
      platform: 'shipinhao',
      recordDate: '2026-08-06',
      plays: 9000,
      likes: 620,
      comments: 48,
      bookmarks: 210,
      shares: 82,
      followersGained: 31,
      leads: 6
    })
  });
  assert.equal(updated.response.status, 201);
  assert.equal(updated.body.data.length, 1);
  assert.equal(updated.body.data[0].plays, 9000);

  const duplicateCount = server.database.prepare(`
    SELECT COUNT(*) AS count
    FROM content_performance
    WHERE content_card_id = 'content-fitness-breaststroke'
      AND platform = 'shipinhao'
      AND record_date = '2026-08-06'
  `).get().count;
  assert.equal(duplicateCount, 1);

  const review = await request(
    server,
    '/performance/review?periodType=week&start=2026-08-03'
  );
  assert.equal(review.response.status, 200);
  assert.equal(review.body.data.summary.publishedContent, 3);
  assert.equal(review.body.data.summary.recordCount, 6);
  assert.equal(review.body.data.top.length, 3);
  assert.equal(review.body.data.top[0].plays, 38600);

  const filtered = await request(
    server,
    '/performance/review?periodType=week&start=2026-08-03&accountId=acc-fitness&platform=shipinhao'
  );
  assert.equal(filtered.body.data.summary.publishedContent, 1);
  assert.equal(filtered.body.data.records.length, 1);
  assert.equal(filtered.body.data.records[0].contentCardId, 'content-fitness-breaststroke');

  const conclusion = await request(server, '/review-conclusions', {
    method: 'POST',
    body: JSON.stringify({
      periodType: 'week',
      periodStart: '2026-08-03',
      periodEnd: '2026-08-09',
      effectiveTitles: '数字和具体场景更有效',
      effectiveOpenings: '先展示改造前后对比',
      effectiveCtas: '引导收藏清单',
      abandonTopics: '缺少具体结果的泛选题',
      nextActions: '继续测试小户型动线'
    })
  });
  assert.equal(conclusion.response.status, 201);

  const reread = await request(
    server,
    '/review-conclusions?periodType=week&start=2026-08-03'
  );
  assert.equal(reread.response.status, 200);
  assert.equal(reread.body.data.effectiveTitles, '数字和具体场景更有效');

  const reviewed = await request(
    server,
    '/content-cards/content-fitness-breaststroke/reviewed',
    { method: 'POST', body: '{}' }
  );
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.body.data.status, 'reviewed');

  const noDataReview = await request(
    server,
    '/content-cards/content-home-entry-cabinet/reviewed',
    { method: 'POST', body: '{}' }
  );
  assert.equal(noDataReview.response.status, 200);
});

test('content without performance data cannot be marked reviewed', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const result = await request(
    server,
    '/content-cards/content-fitness-breaststroke/reviewed',
    { method: 'POST', body: '{}' }
  );
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error.code, 'PERFORMANCE_REQUIRED');
});
