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

test('dashboard aggregates real content, calendar and performance data', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const result = await request(
    server,
    '/dashboard?date=2026-08-06&month=2026-08'
  );

  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.asOfDate, '2026-08-06');
  assert.equal(result.body.data.overview.plays, 82200);
  assert.equal(result.body.data.overview.likes, 6070);
  assert.equal(result.body.data.overview.shares, 651);
  assert.equal(result.body.data.overview.followersTotal, null);
  assert.equal(result.body.data.overview.pendingPerformance, 1);
  assert.equal(result.body.data.week.start, '2026-08-03');
  assert.equal(result.body.data.week.end, '2026-08-09');
  assert.equal(result.body.data.week.published, 3);
  assert.equal(result.body.data.week.planned, null);
  assert.equal(result.body.data.calendar.releases.length, 9);
  assert.equal(result.body.data.pipeline.total, 5);
  assert.equal(result.body.data.pipeline.items.length, 5);
  assert.equal(result.body.data.performance.top.length, 3);
  assert.equal(result.body.data.performance.top[0].plays, 38600);
  assert.equal(result.body.data.inspiration.status, 'empty');
});

test('calendar notes persist and can be deleted', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const invalid = await request(server, '/calendar/notes', {
    method: 'POST',
    body: JSON.stringify({ date: '2026-02-31', content: '' })
  });
  assert.equal(invalid.response.status, 422);

  const created = await request(server, '/calendar/notes', {
    method: 'POST',
    body: JSON.stringify({ date: '2026-08-06', content: '补拍封面镜头' })
  });
  assert.equal(created.response.status, 201);

  const dashboard = await request(
    server,
    '/dashboard?date=2026-08-06&month=2026-08'
  );
  assert.deepEqual(
    dashboard.body.data.calendar.notes.map((note) => note.content),
    ['补拍封面镜头']
  );

  const removed = await request(server, `/calendar/notes/${created.body.data.id}`, {
    method: 'DELETE'
  });
  assert.equal(removed.response.status, 204);

  const notes = await request(server, '/calendar/notes?month=2026-08');
  assert.deepEqual(notes.body.data, []);
});

test('dashboard todo actions hide an item for the effective date', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  server.database.prepare(`
    UPDATE content_cards
    SET status_changed_at = '2026-08-01T00:00:00.000Z'
    WHERE id = 'content-fitness-breaststroke'
  `).run();

  const before = await request(server, '/dashboard/todos?date=2026-08-06');
  const todo = before.body.data.must.find(
    (item) => item.key === 'backfill:content-fitness-breaststroke'
  );
  assert.ok(todo);

  const action = await request(
    server,
    `/dashboard/todos/${encodeURIComponent(todo.key)}/postpone`,
    {
      method: 'POST',
      body: JSON.stringify({ date: '2026-08-06' })
    }
  );
  assert.equal(action.response.status, 201);
  assert.equal(action.body.data.action, 'postponed');

  const after = await request(server, '/dashboard/todos?date=2026-08-06');
  assert.equal(
    after.body.data.must.some((item) => item.key === todo.key),
    false
  );

  const tomorrow = await request(server, '/dashboard/todos?date=2026-08-07');
  assert.equal(
    tomorrow.body.data.must.some((item) => item.key === todo.key),
    true
  );
});
