import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase } from './db.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
export const defaultLegacyPath = path.resolve(
  dirname,
  '..',
  '..',
  'data',
  'workbench.json'
);

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).replaceAll(',', '').trim();
  const multiplier = text.endsWith('亿') ? 100000000 : text.endsWith('万') ? 10000 : 1;
  const number = Number(text.replace(/[万亿]$/, '')) * multiplier;
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

export function readLegacyWorkbench(filename = defaultLegacyPath) {
  return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\ufeff/, ''));
}

export function migrateInspirationData(database, legacy) {
  const now = new Date().toISOString();
  const creators = Array.isArray(legacy.creators) ? legacy.creators : [];
  const accounts = Array.isArray(legacy.accounts) ? legacy.accounts : [];
  const posts = Array.isArray(legacy.posts) ? legacy.posts : [];
  const syncRuns = Array.isArray(legacy.syncRuns) ? legacy.syncRuns : [];

  const upsertCreator = database.prepare(`
    INSERT INTO reference_creators (
      id, workspace_id, legacy_space_id, name, category, location,
      created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      legacy_space_id = excluded.legacy_space_id,
      name = excluded.name,
      category = excluded.category,
      location = excluded.location,
      updated_at = excluded.updated_at
  `);
  const upsertAccount = database.prepare(`
    INSERT INTO reference_accounts (
      id, workspace_id, creator_id, platform, account_handle, profile_url,
      collection_mode, collection_status, expected_post_count,
      collected_post_count, last_collected_at, created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      creator_id = excluded.creator_id,
      platform = excluded.platform,
      account_handle = excluded.account_handle,
      profile_url = excluded.profile_url,
      collection_mode = excluded.collection_mode,
      collection_status = excluded.collection_status,
      expected_post_count = excluded.expected_post_count,
      collected_post_count = excluded.collected_post_count,
      last_collected_at = excluded.last_collected_at,
      updated_at = excluded.updated_at
  `);
  const upsertPost = database.prepare(`
    INSERT INTO reference_posts (
      id, workspace_id, legacy_space_id, creator_id, account_id, platform,
      platform_post_id, title, content_type, publish_time, discovered_at,
      likes, bookmarks, plays, comments, shares, visible_count, original_url,
      tags, source, content_body, content_bound_at, created_at, updated_at
    ) VALUES (
      ?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      legacy_space_id = excluded.legacy_space_id,
      creator_id = excluded.creator_id,
      account_id = excluded.account_id,
      platform = excluded.platform,
      platform_post_id = excluded.platform_post_id,
      title = excluded.title,
      content_type = excluded.content_type,
      publish_time = excluded.publish_time,
      discovered_at = excluded.discovered_at,
      visible_count = excluded.visible_count,
      original_url = excluded.original_url,
      tags = excluded.tags,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);
  const upsertSyncRun = database.prepare(`
    INSERT INTO inspiration_sync_runs (
      id, workspace_id, legacy_space_id, status, mode, checked_accounts,
      expected_count, collected_count, inserted_count, updated_count,
      started_at, finished_at, message
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      mode = excluded.mode,
      checked_accounts = excluded.checked_accounts,
      expected_count = excluded.expected_count,
      collected_count = excluded.collected_count,
      inserted_count = excluded.inserted_count,
      updated_count = excluded.updated_count,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      message = excluded.message
  `);

  database.exec('BEGIN');
  try {
    for (const creator of creators) {
      upsertCreator.run(
        creator.id,
        creator.spaceId || 'home',
        creator.name,
        creator.category || '',
        creator.location || '',
        creator.createdAt || now,
        now
      );
    }
    for (const account of accounts) {
      const createdAt = account.addedAt || now;
      upsertAccount.run(
        account.id,
        account.creatorId,
        account.platform,
        account.handle || '',
        account.profileUrl || '',
        account.collectionMode || 'manual',
        account.collectionStatus || 'partial',
        numberOrNull(account.expectedPostCount),
        numberOrNull(account.collectedPostCount) || 0,
        account.lastCollectedAt || null,
        createdAt,
        account.lastCollectedAt || createdAt
      );
    }
    for (const post of posts) {
      const discoveredAt = post.discoveredAt || post.publishedAt || now;
      upsertPost.run(
        post.id,
        post.spaceId || 'home',
        post.creatorId,
        post.accountId || null,
        post.platform,
        post.platformPostId,
        post.title || '',
        post.contentType || '',
        post.publishedAt || null,
        discoveredAt,
        numberOrNull(post.metrics?.visibleCount),
        post.originalUrl || '',
        JSON.stringify(post.tags || []),
        post.source || 'legacy-json',
        discoveredAt,
        discoveredAt
      );
    }
    for (const run of syncRuns) {
      upsertSyncRun.run(
        run.id,
        run.spaceId || 'home',
        run.status || 'success',
        run.mode || 'legacy-import',
        numberOrNull(run.checkedAccounts) || 0,
        numberOrNull(run.expected),
        numberOrNull(run.collected),
        numberOrNull(run.inserted) || 0,
        numberOrNull(run.updated) || 0,
        run.startedAt || now,
        run.finishedAt || null,
        run.message || ''
      );
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return {
    creators: database.prepare(`
      SELECT COUNT(*) AS count FROM reference_creators WHERE workspace_id = 'default'
    `).get().count,
    accounts: database.prepare(`
      SELECT COUNT(*) AS count FROM reference_accounts WHERE workspace_id = 'default'
    `).get().count,
    posts: database.prepare(`
      SELECT COUNT(*) AS count FROM reference_posts WHERE workspace_id = 'default'
    `).get().count,
    visiblePosts: database.prepare(`
      SELECT COUNT(*) AS count FROM reference_posts
      WHERE workspace_id = 'default' AND visible_count IS NOT NULL
    `).get().count,
    fabricatedMetrics: database.prepare(`
      SELECT COUNT(*) AS count FROM reference_posts
      WHERE workspace_id = 'default' AND (likes IS NOT NULL OR plays IS NOT NULL)
    `).get().count
  };
}

async function main() {
  const source = process.argv[2] || process.env.LEGACY_WORKBENCH_PATH || defaultLegacyPath;
  const database = createDatabase({ seed: true });
  try {
    const result = migrateInspirationData(database, readLegacyWorkbench(source));
    if (result.creators !== 1 || result.accounts !== 2 || result.posts !== 137) {
      throw new Error(`迁移数量校验失败：${JSON.stringify(result)}`);
    }
    if (result.visiblePosts !== 137 || result.fabricatedMetrics !== 0) {
      throw new Error(`指标真实性校验失败：${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({ source, ...result }, null, 2));
  } finally {
    database.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
