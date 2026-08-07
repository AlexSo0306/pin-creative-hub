import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrateInspirationData, readLegacyWorkbench } from '../src/migrate-inspiration.js';
import { createTestServer } from './helpers.js';

const legacyFixturePath = fileURLToPath(
  new URL('./fixtures/legacy-workbench.json', import.meta.url)
);

async function request(server, path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${server.baseUrl}/api${path}`, {
    ...options,
    headers
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

async function createCreator(server, name = '测试创作者') {
  const result = await request(server, '/creators', {
    method: 'POST',
    body: JSON.stringify({
      name,
      category: '家居',
      location: '重庆',
      douyinUrl: 'https://www.douyin.com/user/test-douyin',
      xiaohongshuUrl: 'https://www.xiaohongshu.com/user/profile/test-xhs'
    })
  });
  assert.equal(result.response.status, 201);
  return result.body.data;
}

test('reference creator and CSV import support validation and deduplication', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());
  const creator = await createCreator(server);

  assert.equal(creator.accounts.length, 2);
  assert.deepEqual(
    creator.accounts.map((account) => account.platform).sort(),
    ['douyin', 'xiaohongshu']
  );

  const csv = [
    'platform,post_id,title,author,publish_time,likes,plays,tags,url',
    'douyin,post-1,第一条作品,测试创作者,2026-08-01T10:00:00Z,120,3000,"收纳,小户型",https://example.com/1',
    'douyin,post-1,重复作品,测试创作者,2026-08-01T10:00:00Z,120,3000,,https://example.com/1',
    'xiaohongshu,post-2,未知作者作品,不存在的作者,2026-08-02T10:00:00Z,20,400,,https://example.com/2'
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'posts.csv');
  const imported = await request(server, '/posts/import-csv', {
    method: 'POST',
    body: form
  });

  assert.equal(imported.response.status, 201);
  assert.deepEqual(
    {
      imported: imported.body.data.imported,
      skipped: imported.body.data.skipped,
      failed: imported.body.data.failed
    },
    { imported: 1, skipped: 1, failed: 1 }
  );
  assert.match(imported.body.data.errors[0].message, /不存在/);
});

test('CSV import accepts Chinese Douyin export headers', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());
  await createCreator(server, '抖音创作者');

  const csv = [
    '序号,视频id,发布时间,标题,作者,平台,点赞数,播放量,视频链接',
    '1,dy-100,2026-08-01T10:00:00Z,第一条中文标题,抖音创作者,抖音,120,3000,https://example.com/1',
    '2,dy-101,2026-08-02T10:00:00Z,第二条中文标题,抖音创作者,抖音,80,2000,https://example.com/2'
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([`\ufeff${csv}`], { type: 'text/csv' }), '抖音创作者_抖音数据.csv');
  const imported = await request(server, '/posts/import-csv', {
    method: 'POST',
    body: form
  });

  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.data.imported, 2);
  assert.equal(imported.body.data.failed, 0);
});

test('CSV import infers platform and author from Douyin export filename', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());
  await createCreator(server, '文件名创作者');

  const csv = [
    '序号,视频id,发布时间,标题,点赞数,播放量',
    '1,dy-200,2026-08-01T10:00:00Z,由文件名识别作者,120,3000'
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), '文件名创作者_抖音数据.csv');
  const imported = await request(server, '/posts/import-csv', {
    method: 'POST',
    body: form
  });

  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.data.imported, 1);
  assert.equal(imported.body.data.failed, 0);
});

test('CSV import auto-creates a manually entered account name', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const csv = [
    '序号,视频id,发布时间,标题,点赞数,播放量',
    '1,dy-300,2026-08-01T10:00:00Z,手动账号作品一,120,3000',
    '2,dy-301,2026-08-02T10:00:00Z,手动账号作品二,80,2000'
  ].join('\n');
  const form = new FormData();
  form.append('author', '手动新建账号');
  form.append('platform', 'douyin');
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'works.csv');
  const imported = await request(server, '/posts/import-csv', {
    method: 'POST',
    body: form
  });

  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.data.imported, 2);
  assert.equal(imported.body.data.failed, 0);

  const creators = await request(server, '/creators');
  const created = creators.body.data.find((creator) => creator.name === '手动新建账号');
  assert.ok(created);
  assert.equal(created.postCount, 2);
  assert.equal(created.accounts[0].platform, 'douyin');
});

test('monitor detects hot work and Markdown import binds exact titles', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());
  const creator = await createCreator(server, '趋势作者');
  const account = creator.accounts.find((item) => item.platform === 'douyin');
  const insert = server.database.prepare(`
    INSERT INTO reference_posts (
      id, workspace_id, legacy_space_id, creator_id, account_id, platform,
      platform_post_id, title, publish_time, discovered_at, visible_count,
      original_url, tags, source, created_at, updated_at
    ) VALUES (?, 'default', 'home', ?, ?, 'douyin', ?, ?, ?, ?, ?, '', '[]', 'test', ?, ?)
  `);
  const values = [100, 120, 110, 500];
  values.forEach((value, index) => {
    const date = `2026-08-0${index + 1}T10:00:00.000Z`;
    insert.run(
      `trend-${index + 1}`,
      creator.id,
      account.id,
      `platform-${index + 1}`,
      index === 3 ? '爆款作品' : `普通作品 ${index + 1}`,
      date,
      date,
      value,
      date,
      date
    );
  });

  const monitor = await request(
    server,
    `/dashboard/monitor?metric=visible&end=2026-08-06&creatorId=${creator.id}`
  );
  assert.equal(monitor.response.status, 200);
  assert.equal(monitor.body.data.summary.posts, 4);
  assert.equal(monitor.body.data.hot[0].title, '爆款作品');
  assert.ok(monitor.body.data.hot[0].ratio > 4);

  const markdown = '# 爆款作品\n\n这是用于研究的竞品文案。';
  const form = new FormData();
  form.append('file', new Blob([markdown], { type: 'text/markdown' }), '爆款作品.md');
  const imported = await request(server, '/posts/import-content', {
    method: 'POST',
    body: form
  });
  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.data.bound.length, 1);

  const content = await request(server, '/posts/trend-4/content');
  assert.equal(content.body.data.body, markdown);
  assert.ok(content.body.data.boundAt);
});

test('filtered CSV export and legacy migration preserve real metric semantics', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const migration = migrateInspirationData(server.database, readLegacyWorkbench(legacyFixturePath));
  assert.deepEqual(migration, {
    creators: 1,
    accounts: 2,
    posts: 137,
    visiblePosts: 137,
    fabricatedMetrics: 0
  });
  assert.equal(
    server.database.prepare(`
      SELECT visible_count FROM reference_posts WHERE id = 'dy-7626230998975763195'
    `).get().visible_count,
    99000
  );

  const repeated = migrateInspirationData(server.database, readLegacyWorkbench(legacyFixturePath));
  assert.equal(repeated.posts, 137);

  const exported = await request(server, '/posts/export?platform=xiaohongshu');
  assert.equal(exported.response.status, 200);
  assert.match(exported.response.headers.get('content-type'), /text\/csv/);
  assert.equal(exported.body.trim().split(/\r?\n/).length, 15);
  assert.match(exported.body, /小红书/);
});
