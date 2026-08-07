import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { parse as parseCsv } from 'csv-parse/sync';

const PLATFORMS = ['douyin', 'xiaohongshu'];
const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书'
};
const METRICS = ['visible', 'likes', 'plays'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

function httpError(status, code, message, details) {
  return Object.assign(new Error(message), { status, code, details });
}

function chinaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).replaceAll(',', '').trim();
  const multiplier = text.endsWith('亿') ? 100000000 : text.endsWith('万') ? 10000 : 1;
  const number = Number(text.replace(/[万亿]$/, '')) * multiplier;
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function tagsFrom(value) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // CSV tags are comma-separated text, not JSON.
  }
  return String(value).split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

const CSV_COLUMN_ALIASES = new Map([
  ['序号', 'seq'],
  ['视频id', 'post_id'],
  ['作品id', 'post_id'],
  ['post_id', 'post_id'],
  ['标题', 'title'],
  ['作品标题', 'title'],
  ['内容标题', 'title'],
  ['title', 'title'],
  ['发布日期', 'publish_time'],
  ['发布时间', 'publish_time'],
  ['创建时间', 'publish_time'],
  ['更新时间', 'publish_time'],
  ['publish_time', 'publish_time'],
  ['点赞数', 'likes'],
  ['likes', 'likes'],
  ['评论数', 'comments'],
  ['comments', 'comments'],
  ['转发数', 'shares'],
  ['shares', 'shares'],
  ['收藏数', 'bookmarks'],
  ['bookmarks', 'bookmarks'],
  ['播放量', 'plays'],
  ['plays', 'plays'],
  ['是否置顶', 'pinned'],
  ['置顶', 'pinned'],
  ['视频链接', 'url'],
  ['作品链接', 'url'],
  ['链接', 'url'],
  ['url', 'url'],
  ['original_url', 'url'],
  ['作者', 'author'],
  ['作者昵称', 'author'],
  ['达人昵称', 'author'],
  ['达人', 'author'],
  ['author', 'author'],
  ['平台', 'platform'],
  ['平台名称', 'platform'],
  ['platform', 'platform'],
  ['标签', 'tags'],
  ['tags', 'tags']
]);

function normalizeCsvKey(key) {
  const normalized = String(key || '').replace(/^\ufeff/, '').trim().toLowerCase();
  return CSV_COLUMN_ALIASES.get(normalized) || normalized;
}

function normalizeCsvRecords(records) {
  return records.map((record) =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [normalizeCsvKey(key), value]))
  );
}

function platformFromLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('xiaohongshu') || text.includes('小红书')) return 'xiaohongshu';
  if (text.includes('douyin') || text.includes('抖音')) return 'douyin';
  return '';
}

function platformFromUrl(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('xiaohongshu.com')) return 'xiaohongshu';
  if (text.includes('douyin.com')) return 'douyin';
  return '';
}

function decodeFilename(value) {
  const raw = String(value || '');
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return /[\u4e00-\u9fff]/.test(decoded) ? decoded : raw;
}

function exportContextFromFilename(filename, form = {}) {
  const base = decodeFilename(filename).replace(/\\/g, '/').split('/').at(-1) || '';
  const match = base.match(/^(.+?)[_\-—\s]+(抖音|小红书)(?:数据|作品|导出|视频)?(?:[_\-—\s].*)?\.csv$/i);
  return {
    platform: platformFromLabel(form.platform) || (match ? platformFromLabel(match[2]) : ''),
    author: String(form.author || '').trim() || (match ? match[1].trim() : '')
  };
}

function parsePublishTime(value) {
  const text = String(value || '').trim().replaceAll('/', '-');
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tagsFromTitle(title) {
  return [...String(title || '').matchAll(/#([^\s#，,]+)/g)].map((match) => match[1]);
}

function mapPost(row) {
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    accountId: row.account_id,
    accountHandle: row.account_handle || '',
    platform: row.platform,
    postId: row.platform_post_id,
    title: row.title,
    contentType: row.content_type,
    publishTime: row.publish_time,
    discoveredAt: row.discovered_at,
    likes: row.likes,
    bookmarks: row.bookmarks,
    plays: row.plays,
    comments: row.comments,
    shares: row.shares,
    visibleCount: row.visible_count,
    originalUrl: row.original_url,
    tags: tagsFrom(row.tags),
    source: row.source,
    contentBound: Boolean(row.content_bound_at),
    contentBoundAt: row.content_bound_at
  };
}

function postSelect() {
  return `
    SELECT
      posts.*,
      creators.name AS creator_name,
      accounts.account_handle
    FROM reference_posts posts
    JOIN reference_creators creators ON creators.id = posts.creator_id
    LEFT JOIN reference_accounts accounts ON accounts.id = posts.account_id
  `;
}

function readPost(database, id) {
  const row = database.prepare(`
    ${postSelect()}
    WHERE posts.workspace_id = 'default' AND posts.id = ?
  `).get(id);
  return row ? mapPost(row) : null;
}

function readCreator(database, id) {
  const row = database.prepare(`
    SELECT * FROM reference_creators
    WHERE workspace_id = 'default' AND id = ?
  `).get(id);
  if (!row) return null;

  const accounts = database.prepare(`
    SELECT
      accounts.*,
      COUNT(posts.id) AS post_count
    FROM reference_accounts accounts
    LEFT JOIN reference_posts posts ON posts.account_id = accounts.id
    WHERE accounts.workspace_id = 'default' AND accounts.creator_id = ?
    GROUP BY accounts.id
    ORDER BY CASE accounts.platform WHEN 'douyin' THEN 1 ELSE 2 END
  `).all(id);

  const postCount = database.prepare(`
    SELECT COUNT(*) AS count FROM reference_posts
    WHERE workspace_id = 'default' AND creator_id = ?
  `).get(id).count;

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    location: row.location,
    postCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accounts: accounts.map((account) => ({
      id: account.id,
      platform: account.platform,
      handle: account.account_handle,
      profileUrl: account.profile_url,
      collectionMode: account.collection_mode,
      collectionStatus: account.collection_status,
      expectedPostCount: account.expected_post_count,
      collectedPostCount: account.collected_post_count,
      actualPostCount: account.post_count,
      lastCollectedAt: account.last_collected_at
    }))
  };
}

function accountHandleFromUrl(value) {
  if (!value) return '';
  try {
    return new URL(value).pathname.split('/').filter(Boolean).at(-1) || '';
  } catch {
    return '';
  }
}

function ensureReferenceAccount(database, creatorId, platform, profileUrl = '', now = new Date().toISOString()) {
  let account = database.prepare(`
    SELECT * FROM reference_accounts
    WHERE creator_id = ? AND platform = ?
  `).get(creatorId, platform);
  if (account) return account;

  const id = randomUUID();
  database.prepare(`
    INSERT INTO reference_accounts (
      id, workspace_id, creator_id, platform, account_handle, profile_url,
      collection_mode, collection_status, expected_post_count,
      collected_post_count, last_collected_at, created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, 'manual', 'pending', NULL, 0, NULL, ?, ?)
  `).run(
    id,
    creatorId,
    platform,
    accountHandleFromUrl(profileUrl),
    profileUrl,
    now,
    now
  );
  account = database.prepare('SELECT * FROM reference_accounts WHERE id = ?').get(id);
  return account;
}

function findCreatorByName(database, name) {
  return database.prepare(`
    SELECT id FROM reference_creators
    WHERE workspace_id = 'default' AND lower(name) = lower(?)
  `).get(name);
}

function ensureCreatorByName(database, name, now = new Date().toISOString()) {
  const existing = findCreatorByName(database, name);
  if (existing) return existing.id;
  const id = randomUUID();
  database.prepare(`
    INSERT INTO reference_creators (
      id, workspace_id, legacy_space_id, name, category, location,
      created_at, updated_at
    ) VALUES (?, 'default', 'home', ?, '', '', ?, ?)
  `).run(id, name, now, now);
  return id;
}

function listPosts(database, query = {}) {
  const conditions = ["posts.workspace_id = 'default'"];
  const values = [];
  if (PLATFORMS.includes(query.platform)) {
    conditions.push('posts.platform = ?');
    values.push(query.platform);
  }
  if (query.creatorId) {
    conditions.push('posts.creator_id = ?');
    values.push(query.creatorId);
  }
  if (query.q) {
    conditions.push(`(
      lower(posts.title) LIKE lower(?)
      OR lower(creators.name) LIKE lower(?)
      OR lower(posts.tags) LIKE lower(?)
    )`);
    const keyword = `%${String(query.q).trim()}%`;
    values.push(keyword, keyword, keyword);
  }
  if (query.content === 'bound') conditions.push('posts.content_bound_at IS NOT NULL');
  if (query.content === 'unbound') conditions.push('posts.content_bound_at IS NULL');

  const sortColumn = {
    likes: 'coalesce(posts.likes, posts.visible_count, 0)',
    plays: 'coalesce(posts.plays, posts.visible_count, 0)',
    visible: 'coalesce(posts.visible_count, posts.likes, posts.plays, 0)',
    recent: "coalesce(posts.publish_time, posts.discovered_at)"
  }[query.sort] || "coalesce(posts.publish_time, posts.discovered_at)";
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
  const offset = Math.max(0, Number(query.offset) || 0);
  const where = conditions.join(' AND ');
  const total = database.prepare(`
    SELECT COUNT(*) AS count
    FROM reference_posts posts
    JOIN reference_creators creators ON creators.id = posts.creator_id
    WHERE ${where}
  `).get(...values).count;
  const rows = database.prepare(`
    ${postSelect()}
    WHERE ${where}
    ORDER BY ${sortColumn} DESC, posts.discovered_at DESC
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset);
  return { total, items: rows.map(mapPost) };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/^《|》$/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

function similarity(left, right) {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) return 0;
  const rows = Array.from({ length: a.length + 1 }, (_, index) => index);
  for (let column = 1; column <= b.length; column += 1) {
    let previous = rows[0];
    rows[0] = column;
    for (let row = 1; row <= a.length; row += 1) {
      const current = rows[row];
      rows[row] = Math.min(
        rows[row] + 1,
        rows[row - 1] + 1,
        previous + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return 1 - rows[a.length] / Math.max(a.length, b.length);
}

function decodeUploadFilename(value) {
  const filename = String(value || '');
  if ([...filename].some((character) => character.codePointAt(0) > 255)) return filename;
  const decoded = Buffer.from(filename, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? filename : decoded;
}

const MAX_ZIP_FILES = 200;
const MAX_UNCOMPRESSED_TOTAL = 100 * 1024 * 1024;
const MAX_UNCOMPRESSED_ENTRY = 50 * 1024 * 1024;

async function markdownFiles(file) {
  if (!file) throw httpError(422, 'VALIDATION_ERROR', '请选择 ZIP 或 Markdown 文件');
  if (/\.md$/i.test(file.originalname)) {
    return [{
      filename: decodeUploadFilename(file.originalname),
      body: file.buffer.toString('utf8')
    }];
  }
  if (!/\.zip$/i.test(file.originalname)) {
    throw httpError(422, 'VALIDATION_ERROR', '仅支持 ZIP 压缩包或 .md 文件');
  }
  const zip = await JSZip.loadAsync(file.buffer);
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /\.md$/i.test(entry.name)
  );
  if (!entries.length) {
    throw httpError(422, 'NO_MARKDOWN_FILES', '压缩包中未找到 .md 文件');
  }
  if (entries.length > MAX_ZIP_FILES) {
    throw httpError(413, 'ZIP_TOO_MANY_FILES', `压缩包内 .md 文件数量超过上限（${MAX_ZIP_FILES} 个）`);
  }
  // 限制解压膨胀（zip bomb 缓解）：单文件与累计解压大小均设上限，边解压边检查
  const files = [];
  let totalSize = 0;
  for (const entry of entries) {
    const declaredSize = entry._data?.uncompressedSize || 0;
    if (declaredSize > MAX_UNCOMPRESSED_ENTRY) {
      throw httpError(413, 'ZIP_ENTRY_TOO_LARGE', `压缩包内「${entry.name}」解压后体积超过限制`);
    }
    const body = await entry.async('string');
    totalSize += body.length;
    if (totalSize > MAX_UNCOMPRESSED_TOTAL) {
      throw httpError(413, 'ZIP_TOO_LARGE', '压缩包解压后总大小超过限制');
    }
    files.push({
      filename: entry.name.split('/').at(-1),
      body
    });
  }
  return files;
}

function metricValue(row, metric) {
  if (metric === 'likes') return row.likes;
  if (metric === 'plays') return row.plays;
  return row.visible_count ?? row.likes ?? row.plays;
}

function monitorPayload(database, query = {}) {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(query.end || '') ? query.end : chinaToday();
  const start = shiftDate(end, -29);
  const metric = METRICS.includes(query.metric) ? query.metric : 'visible';
  const creatorId = query.creatorId || '';
  const conditions = [
    "posts.workspace_id = 'default'",
    "substr(coalesce(posts.publish_time, posts.discovered_at), 1, 10) BETWEEN ? AND ?"
  ];
  const values = [start, end];
  if (creatorId) {
    conditions.push('posts.creator_id = ?');
    values.push(creatorId);
  }
  const recentRows = database.prepare(`
    SELECT posts.*, creators.name AS creator_name
    FROM reference_posts posts
    JOIN reference_creators creators ON creators.id = posts.creator_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY coalesce(posts.publish_time, posts.discovered_at) ASC
  `).all(...values);

  const trendMap = new Map();
  for (const row of recentRows) {
    const value = metricValue(row, metric);
    if (value === null || value === undefined) continue;
    const date = String(row.publish_time || row.discovered_at).slice(0, 10);
    trendMap.set(date, (trendMap.get(date) || 0) + value);
  }

  const settings = database.prepare(`
    SELECT * FROM inspiration_settings WHERE workspace_id = 'default'
  `).get() || {
    hot_likes_multiplier: 2,
    hot_plays_multiplier: 2,
    hot_visible_multiplier: 2
  };
  const threshold = Math.max(
    1,
    Number(query.threshold) ||
      (metric === 'likes'
        ? settings.hot_likes_multiplier
        : metric === 'plays'
          ? settings.hot_plays_multiplier
          : settings.hot_visible_multiplier)
  );
  const allRows = database.prepare(`
    SELECT posts.*, creators.name AS creator_name
    FROM reference_posts posts
    JOIN reference_creators creators ON creators.id = posts.creator_id
    WHERE posts.workspace_id = 'default'
      ${creatorId ? 'AND posts.creator_id = ?' : ''}
    ORDER BY posts.creator_id, coalesce(posts.publish_time, posts.discovered_at) ASC
  `).all(...(creatorId ? [creatorId] : []));
  const history = new Map();
  const hot = [];
  for (const row of allRows) {
    const value = metricValue(row, metric);
    const key = row.creator_id;
    const previous = history.get(key) || [];
    if (value !== null && value !== undefined && previous.length >= 2) {
      const window = previous.slice(-10);
      const average = window.reduce((sum, item) => sum + item, 0) / window.length;
      const ratio = average ? value / average : 0;
      if (ratio >= threshold) {
        hot.push({
          ...mapPost(row),
          metric,
          metricValue: value,
          baseline: average,
          ratio,
          aboveAveragePercent: Math.round((ratio - 1) * 100)
        });
      }
    }
    if (value !== null && value !== undefined) {
      history.set(key, [...previous, value]);
    }
  }

  const summary = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reference_creators WHERE workspace_id = 'default') AS creators,
      (SELECT COUNT(*) FROM reference_accounts WHERE workspace_id = 'default') AS accounts,
      (SELECT COUNT(*) FROM reference_posts WHERE workspace_id = 'default') AS posts,
      (SELECT COUNT(*) FROM reference_posts
        WHERE workspace_id = 'default'
          AND substr(discovered_at, 1, 10) BETWEEN ? AND ?) AS recent,
      (SELECT COUNT(*) FROM reference_posts
        WHERE workspace_id = 'default' AND content_bound_at IS NOT NULL) AS content_bound
  `).get(shiftDate(end, -6), end);

  return {
    period: { start, end },
    metric,
    threshold,
    summary: {
      creators: summary.creators,
      accounts: summary.accounts,
      posts: summary.posts,
      recent: summary.recent,
      contentBound: summary.content_bound,
      contentBoundRate: summary.posts ? summary.content_bound / summary.posts : 0
    },
    trend: [...trendMap].map(([date, value]) => ({ date, value })),
    hot: hot.sort((left, right) => right.ratio - left.ratio).slice(0, 5),
    works: listPosts(database, {
      creatorId,
      sort: metric,
      limit: 10
    }).items
  };
}

export function createCreatorsRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const rows = database.prepare(`
      SELECT id FROM reference_creators
      WHERE workspace_id = 'default'
      ORDER BY updated_at DESC, name ASC
    `).all();
    response.json({ data: rows.map((row) => readCreator(database, row.id)) });
  });

  router.get('/:id', (request, response) => {
    const creator = readCreator(database, request.params.id);
    if (!creator) throw httpError(404, 'CREATOR_NOT_FOUND', '未找到该参考创作者');
    response.json({ data: creator });
  });

  router.post('/', (request, response) => {
    const name = String(request.body.name || '').trim();
    const douyinUrl = String(request.body.douyinUrl || '').trim();
    const xiaohongshuUrl = String(request.body.xiaohongshuUrl || '').trim();
    const details = {};
    if (!name) details.name = '请填写创作者名称';
    if (!isValidUrl(douyinUrl)) details.douyinUrl = '请输入有效的抖音主页链接';
    if (!isValidUrl(xiaohongshuUrl)) {
      details.xiaohongshuUrl = '请输入有效的小红书主页链接';
    }
    if (database.prepare(`
      SELECT 1 FROM reference_creators
      WHERE workspace_id = 'default' AND lower(name) = lower(?)
    `).get(name)) {
      details.name = '该创作者已存在';
    }
    if (Object.keys(details).length) {
      throw httpError(422, 'VALIDATION_ERROR', '创作者信息未通过校验', details);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    database.exec('BEGIN');
    try {
      database.prepare(`
        INSERT INTO reference_creators (
          id, workspace_id, legacy_space_id, name, category, location,
          created_at, updated_at
        ) VALUES (?, 'default', 'home', ?, ?, ?, ?, ?)
      `).run(
        id,
        name,
        String(request.body.category || '').trim(),
        String(request.body.location || '').trim(),
        now,
        now
      );
      if (douyinUrl) ensureReferenceAccount(database, id, 'douyin', douyinUrl, now);
      if (xiaohongshuUrl) {
        ensureReferenceAccount(database, id, 'xiaohongshu', xiaohongshuUrl, now);
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    response.status(201).json({ data: readCreator(database, id) });
  });

  return router;
}

export function createPostsRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    response.json({ data: listPosts(database, request.query) });
  });

  router.get('/export', (request, response) => {
    const posts = listPosts(database, { ...request.query, limit: 500 }).items;
    if (!posts.length) throw httpError(422, 'NO_EXPORT_DATA', '没有可导出的数据');
    const header = [
      '平台', '作者', '标题', '发布时间', '点赞数', '收藏数', '播放量',
      '评论数', '分享数', '可见数', '标签', '原始链接', '是否有文案'
    ];
    const rows = posts.map((post) => [
      PLATFORM_LABELS[post.platform] || post.platform,
      post.creatorName,
      post.title,
      post.publishTime || '',
      post.likes ?? '',
      post.bookmarks ?? '',
      post.plays ?? '',
      post.comments ?? '',
      post.shares ?? '',
      post.visibleCount ?? '',
      post.tags.join(','),
      post.originalUrl,
      post.contentBound ? '是' : '否'
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    response.setHeader('content-type', 'text/csv; charset=utf-8');
    response.setHeader(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`灵感雷达_家居_${chinaToday()}.csv`)}`
    );
    response.send(`\ufeff${csv}`);
  });

  router.post('/import-csv', upload.single('file'), (request, response) => {
    const source = request.file?.buffer.toString('utf8') || String(request.body.csv || '');
    if (!source.trim()) throw httpError(422, 'VALIDATION_ERROR', '请选择 CSV 文件');
    let records;
    try {
      records = parseCsv(source.replace(/^\ufeff/, ''), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });
    } catch (error) {
      throw httpError(422, 'CSV_PARSE_ERROR', 'CSV 内容无法解析', {
        csv: error.message
      });
    }
    const normalizedRecords = normalizeCsvRecords(records);
    const columns = normalizedRecords.length ? Object.keys(normalizedRecords[0]) : [];
    const required = ['post_id', 'title', 'publish_time'];
    const missing = required.filter((key) => !columns.includes(key));
    if (missing.length) {
      throw httpError(422, 'CSV_COLUMNS_MISSING', `CSV 缺少必填列：${missing.join('、')}（支持中英文表头：平台/platform、视频id/post_id、标题/title、作者/author、发布时间/publish_time，也支持抖音数据导出）`);
    }
    const hasColumn = (key) => columns.includes(key);
    const manualAuthor = String(request.body.author || '').trim();
    const context = exportContextFromFilename(request.file?.originalname, {
      platform: String(request.body.platform || ''),
      author: manualAuthor
    });
    const contextPlatform = context.platform ||
      normalizedRecords.map((row) => platformFromUrl(row.url)).find(Boolean) ||
      '';

    const result = { imported: 0, skipped: 0, failed: 0, errors: [] };
    const now = new Date().toISOString();
    const insert = database.prepare(`
      INSERT INTO reference_posts (
        id, workspace_id, legacy_space_id, creator_id, account_id, platform,
        platform_post_id, title, content_type, publish_time, discovered_at,
        likes, bookmarks, plays, comments, shares, visible_count, original_url,
        tags, source, content_body, content_bound_at, created_at, updated_at
      ) VALUES (
        ?, 'default', 'home', ?, ?, ?, ?, ?, '', ?, ?,
        ?, ?, ?, ?, ?, NULL, ?, ?, 'csv-import', NULL, NULL, ?, ?
      )
    `);

    database.exec('BEGIN');
    try {
      let contextCreatorId = null;
      normalizedRecords.forEach((row, index) => {
        const line = index + 2;
        const platform = platformFromLabel(row.platform) || contextPlatform;
        const postId = String(row.post_id || '').trim();
        const title = String(row.title || '').trim();
        const author = String(manualAuthor || row.author || context.author || '').trim();
        const publishDate = parsePublishTime(row.publish_time);
        if (!PLATFORMS.includes(platform)) {
          result.failed += 1;
          result.errors.push({ line, message: '无法识别平台（当前支持抖音/小红书）' });
          return;
        }
        if (!postId) {
          result.failed += 1;
          result.errors.push({ line, message: 'post_id 为空' });
          return;
        }
        if (!title) {
          result.failed += 1;
          result.errors.push({ line, message: 'title 为空' });
          return;
        }
        if (Number.isNaN(publishDate.getTime())) {
          result.failed += 1;
          result.errors.push({ line, message: '日期格式错误' });
          return;
        }
        if (!author) {
          result.failed += 1;
          result.errors.push({ line, message: '无法识别作者：请使用“作者_抖音数据.csv”命名或在导入时填写作者' });
          return;
        }
        let creatorId = findCreatorByName(database, author)?.id || null;
        if (!creatorId && context.author && author === context.author) {
          contextCreatorId ||= ensureCreatorByName(database, context.author, now);
          creatorId = contextCreatorId;
        }
        if (!creatorId) {
          result.failed += 1;
          result.errors.push({ line, message: `作者“${author}”不存在（可在导入时填写账号名称自动创建）` });
          return;
        }
        if (database.prepare(`
          SELECT 1 FROM reference_posts
          WHERE workspace_id = 'default'
            AND platform = ?
            AND lower(platform_post_id) = lower(?)
        `).get(platform, postId)) {
          result.skipped += 1;
          return;
        }
        const account = ensureReferenceAccount(database, creatorId, platform, '', now);
        insert.run(
          randomUUID(),
          creatorId,
          account.id,
          platform,
          postId,
          title,
          publishDate.toISOString(),
          now,
          numberOrNull(row.likes),
          numberOrNull(row.bookmarks),
          numberOrNull(row.plays),
          numberOrNull(row.comments),
          numberOrNull(row.shares),
          String(row.url || '').trim(),
          JSON.stringify(hasColumn('tags') ? tagsFrom(row.tags) : tagsFromTitle(title)),
          now,
          now
        );
        result.imported += 1;
      });
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    response.status(201).json({ data: result });
  });

  router.post('/import-content', upload.single('file'), async (request, response) => {
    const files = await markdownFiles(request.file);
    const posts = database.prepare(`
      SELECT posts.id, posts.title, posts.platform, creators.name AS creator_name,
        posts.content_bound_at
      FROM reference_posts posts
      JOIN reference_creators creators ON creators.id = posts.creator_id
      WHERE posts.workspace_id = 'default'
    `).all();
    const now = new Date().toISOString();
    const result = { bound: [], candidates: [], unmatched: [], existing: [] };
    const update = database.prepare(`
      UPDATE reference_posts
      SET content_body = ?, content_bound_at = ?, updated_at = ?
      WHERE id = ? AND workspace_id = 'default'
    `);
    database.exec('BEGIN');
    try {
      for (const file of files) {
        const title = file.filename.replace(/\.md$/i, '').replace(/^《|》$/g, '').trim();
        const exact = posts.filter(
          (post) => normalizeTitle(post.title) === normalizeTitle(title)
        );
        if (exact.length === 1) {
          if (exact[0].content_bound_at && request.body.overwrite !== 'true') {
            result.existing.push({
              filename: file.filename,
              post: exact[0],
              markdown: file.body
            });
          } else {
            update.run(file.body, now, now, exact[0].id);
            result.bound.push({ filename: file.filename, postId: exact[0].id });
          }
          continue;
        }
        const candidates = posts
          .map((post) => ({ ...post, score: similarity(title, post.title) }))
          .filter((post) => post.score >= 0.8)
          .sort((left, right) => right.score - left.score)
          .slice(0, 5);
        if (candidates.length) {
          result.candidates.push({
            filename: file.filename,
            markdown: file.body,
            candidates
          });
        } else {
          result.unmatched.push({ filename: file.filename });
        }
      }
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    response.status(201).json({ data: result });
  });

  router.get('/:id/content', (request, response) => {
    const row = database.prepare(`
      SELECT id, title, content_body, content_bound_at, original_url
      FROM reference_posts
      WHERE workspace_id = 'default' AND id = ?
    `).get(request.params.id);
    if (!row) throw httpError(404, 'POST_NOT_FOUND', '未找到该对标作品');
    response.json({
      data: {
        id: row.id,
        title: row.title,
        body: row.content_body,
        boundAt: row.content_bound_at,
        originalUrl: row.original_url
      }
    });
  });

  router.put('/:id/content', (request, response) => {
    const body = String(request.body.body || '').trim();
    if (!body) throw httpError(422, 'VALIDATION_ERROR', '文案内容不能为空');
    const now = new Date().toISOString();
    const result = database.prepare(`
      UPDATE reference_posts
      SET content_body = ?, content_bound_at = ?, updated_at = ?
      WHERE workspace_id = 'default' AND id = ?
    `).run(body, now, now, request.params.id);
    if (!result.changes) throw httpError(404, 'POST_NOT_FOUND', '未找到该对标作品');
    response.json({ data: readPost(database, request.params.id) });
  });

  router.get('/:id', (request, response) => {
    const post = readPost(database, request.params.id);
    if (!post) throw httpError(404, 'POST_NOT_FOUND', '未找到该对标作品');
    response.json({ data: post });
  });

  return router;
}

export function createMonitorRouter(database) {
  const router = Router();
  router.get('/', (request, response) => {
    response.json({ data: monitorPayload(database, request.query) });
  });
  return router;
}

export function createInspirationSettingsRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const row = database.prepare(`
      SELECT * FROM inspiration_settings WHERE workspace_id = 'default'
    `).get();
    response.json({
      data: {
        likesMultiplier: row?.hot_likes_multiplier ?? 2,
        playsMultiplier: row?.hot_plays_multiplier ?? 2,
        visibleMultiplier: row?.hot_visible_multiplier ?? 2
      }
    });
  });

  router.put('/', (request, response) => {
    const likes = Number(request.body.likesMultiplier);
    const plays = Number(request.body.playsMultiplier);
    const visible = Number(request.body.visibleMultiplier);
    if ([likes, plays, visible].some((value) => !Number.isFinite(value) || value < 1)) {
      throw httpError(422, 'VALIDATION_ERROR', '爆款阈值必须大于或等于 1');
    }
    database.prepare(`
      INSERT INTO inspiration_settings (
        workspace_id, hot_likes_multiplier, hot_plays_multiplier,
        hot_visible_multiplier, updated_at
      ) VALUES ('default', ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        hot_likes_multiplier = excluded.hot_likes_multiplier,
        hot_plays_multiplier = excluded.hot_plays_multiplier,
        hot_visible_multiplier = excluded.hot_visible_multiplier,
        updated_at = excluded.updated_at
    `).run(likes, plays, visible, new Date().toISOString());
    response.json({
      data: {
        likesMultiplier: likes,
        playsMultiplier: plays,
        visibleMultiplier: visible
      }
    });
  });

  return router;
}

export function createInspirationSyncRouter(database) {
  const router = Router();

  router.get('/', (request, response) => {
    const rows = database.prepare(`
      SELECT * FROM inspiration_sync_runs
      WHERE workspace_id = 'default'
      ORDER BY started_at DESC
      LIMIT 20
    `).all();
    response.json({ data: rows });
  });

  router.post('/', (request, response) => {
    const now = new Date().toISOString();
    const accounts = database.prepare(`
      SELECT COUNT(*) AS count FROM reference_accounts WHERE workspace_id = 'default'
    `).get().count;
    const posts = database.prepare(`
      SELECT COUNT(*) AS count FROM reference_posts WHERE workspace_id = 'default'
    `).get().count;
    const row = {
      id: randomUUID(),
      status: 'success',
      mode: 'manual-check',
      checkedAccounts: accounts,
      collected: posts,
      startedAt: now,
      finishedAt: now,
      message: `已检查本地数据库：${accounts} 个对标账号，${posts} 条作品`
    };
    database.prepare(`
      INSERT INTO inspiration_sync_runs (
        id, workspace_id, legacy_space_id, status, mode, checked_accounts,
        expected_count, collected_count, inserted_count, updated_count,
        started_at, finished_at, message
      ) VALUES (?, 'default', 'home', ?, ?, ?, NULL, ?, 0, 0, ?, ?, ?)
    `).run(
      row.id,
      row.status,
      row.mode,
      row.checkedAccounts,
      row.collected,
      row.startedAt,
      row.finishedAt,
      row.message
    );
    response.status(201).json({ data: row });
  });

  return router;
}

export { monitorPayload };
