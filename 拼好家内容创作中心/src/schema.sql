PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS owned_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'preparing', 'paused')),
  color TEXT NOT NULL,
  positioning TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS owned_accounts_active_name
ON owned_accounts(workspace_id, lower(name))
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS owned_accounts_workspace_status
ON owned_accounts(workspace_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS owned_account_platforms (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('douyin', 'xiaohongshu', 'shipinhao')),
  username TEXT NOT NULL DEFAULT '',
  profile_url TEXT NOT NULL DEFAULT '',
  publish_status TEXT NOT NULL CHECK (publish_status IN ('active', 'paused', 'unconfigured')),
  last_published TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES owned_accounts(id) ON DELETE CASCADE,
  UNIQUE (account_id, platform)
);

CREATE TABLE IF NOT EXISTS content_cards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('idea', 'scripted', 'producing', 'published', 'reviewed')
  ),
  primary_platform TEXT CHECK (
    primary_platform IS NULL OR
    primary_platform IN ('douyin', 'xiaohongshu', 'shipinhao')
  ),
  category TEXT NOT NULL DEFAULT '',
  production_progress TEXT CHECK (
    production_progress IS NULL OR
    production_progress IN ('shooting', 'editing', 'ready')
  ),
  script_body TEXT NOT NULL DEFAULT '',
  script_updated_at TEXT,
  publish_plan_body TEXT NOT NULL DEFAULT '',
  publish_plan_updated_at TEXT,
  status_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (account_id) REFERENCES owned_accounts(id)
);

CREATE INDEX IF NOT EXISTS content_cards_workspace_status
ON content_cards(workspace_id, status, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS content_cards_account
ON content_cards(account_id, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS content_publish_records (
  id TEXT PRIMARY KEY,
  content_card_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (
    platform IN ('douyin', 'xiaohongshu', 'shipinhao')
  ),
  publish_url TEXT NOT NULL DEFAULT '',
  publish_time TEXT,
  publish_title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (content_card_id) REFERENCES content_cards(id) ON DELETE CASCADE,
  UNIQUE (content_card_id, platform)
);

CREATE TABLE IF NOT EXISTS content_performance (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  content_card_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (
    platform IN ('douyin', 'xiaohongshu', 'shipinhao')
  ),
  record_date TEXT NOT NULL,
  plays INTEGER CHECK (plays IS NULL OR plays >= 0),
  likes INTEGER CHECK (likes IS NULL OR likes >= 0),
  comments INTEGER CHECK (comments IS NULL OR comments >= 0),
  bookmarks INTEGER CHECK (bookmarks IS NULL OR bookmarks >= 0),
  shares INTEGER CHECK (shares IS NULL OR shares >= 0),
  followers_gained INTEGER CHECK (followers_gained IS NULL OR followers_gained >= 0),
  leads INTEGER CHECK (leads IS NULL OR leads >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (content_card_id) REFERENCES content_cards(id) ON DELETE CASCADE,
  UNIQUE (content_card_id, platform, record_date)
);

CREATE INDEX IF NOT EXISTS content_performance_card_date
ON content_performance(content_card_id, record_date DESC);

CREATE INDEX IF NOT EXISTS content_performance_workspace_date
ON content_performance(workspace_id, record_date DESC, platform);

CREATE TABLE IF NOT EXISTS review_conclusions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  effective_titles TEXT NOT NULL DEFAULT '',
  effective_openings TEXT NOT NULL DEFAULT '',
  effective_ctas TEXT NOT NULL DEFAULT '',
  abandon_topics TEXT NOT NULL DEFAULT '',
  next_actions TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  UNIQUE (workspace_id, period_type, period_start)
);

CREATE TABLE IF NOT EXISTS knowledge_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('brand_guide', 'script_template', 'sop', 'review_method')
  ),
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL CHECK (
    source_type IN ('manual', 'review', 'content')
  ),
  source_review_id TEXT,
  source_content_card_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'active', 'archived', 'deleted')
  ),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (source_review_id) REFERENCES review_conclusions(id),
  FOREIGN KEY (source_content_card_id) REFERENCES content_cards(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_assets_review_source
ON knowledge_assets(source_review_id)
WHERE source_review_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_assets_workspace_status
ON knowledge_assets(workspace_id, status, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_assets_workspace_category
ON knowledge_assets(workspace_id, category, updated_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS calendar_notes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_date TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS calendar_notes_workspace_date
ON calendar_notes(workspace_id, note_date, created_at);

CREATE TABLE IF NOT EXISTS dashboard_todo_actions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  todo_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('completed', 'postponed')),
  effective_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  UNIQUE (workspace_id, todo_key, effective_date)
);

CREATE INDEX IF NOT EXISTS dashboard_todo_actions_workspace_date
ON dashboard_todo_actions(workspace_id, effective_date, created_at);

CREATE TABLE IF NOT EXISTS reference_creators (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  legacy_space_id TEXT NOT NULL DEFAULT 'home',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS reference_creators_workspace_name
ON reference_creators(workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS reference_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('douyin', 'xiaohongshu')),
  account_handle TEXT NOT NULL DEFAULT '',
  profile_url TEXT NOT NULL DEFAULT '',
  collection_mode TEXT NOT NULL DEFAULT 'manual',
  collection_status TEXT NOT NULL DEFAULT 'partial'
    CHECK (collection_status IN ('complete', 'partial', 'pending')),
  expected_post_count INTEGER CHECK (
    expected_post_count IS NULL OR expected_post_count >= 0
  ),
  collected_post_count INTEGER NOT NULL DEFAULT 0
    CHECK (collected_post_count >= 0),
  last_collected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (creator_id) REFERENCES reference_creators(id) ON DELETE CASCADE,
  UNIQUE (creator_id, platform)
);

CREATE INDEX IF NOT EXISTS reference_accounts_workspace_creator
ON reference_accounts(workspace_id, creator_id, platform);

CREATE TABLE IF NOT EXISTS reference_posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  legacy_space_id TEXT NOT NULL DEFAULT 'home',
  creator_id TEXT NOT NULL,
  account_id TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('douyin', 'xiaohongshu')),
  platform_post_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  publish_time TEXT,
  discovered_at TEXT NOT NULL,
  likes INTEGER CHECK (likes IS NULL OR likes >= 0),
  bookmarks INTEGER CHECK (bookmarks IS NULL OR bookmarks >= 0),
  plays INTEGER CHECK (plays IS NULL OR plays >= 0),
  comments INTEGER CHECK (comments IS NULL OR comments >= 0),
  shares INTEGER CHECK (shares IS NULL OR shares >= 0),
  visible_count INTEGER CHECK (visible_count IS NULL OR visible_count >= 0),
  original_url TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual',
  content_body TEXT,
  content_bound_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (creator_id) REFERENCES reference_creators(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES reference_accounts(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS reference_posts_platform_post
ON reference_posts(workspace_id, platform, lower(platform_post_id));

CREATE INDEX IF NOT EXISTS reference_posts_workspace_publish
ON reference_posts(workspace_id, publish_time DESC, discovered_at DESC);

CREATE INDEX IF NOT EXISTS reference_posts_creator_publish
ON reference_posts(creator_id, publish_time DESC, discovered_at DESC);

CREATE TABLE IF NOT EXISTS inspiration_settings (
  workspace_id TEXT PRIMARY KEY,
  hot_likes_multiplier REAL NOT NULL DEFAULT 2.0
    CHECK (hot_likes_multiplier >= 1),
  hot_plays_multiplier REAL NOT NULL DEFAULT 2.0
    CHECK (hot_plays_multiplier >= 1),
  hot_visible_multiplier REAL NOT NULL DEFAULT 2.0
    CHECK (hot_visible_multiplier >= 1),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS inspiration_sync_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  legacy_space_id TEXT NOT NULL DEFAULT 'home',
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  mode TEXT NOT NULL,
  checked_accounts INTEGER NOT NULL DEFAULT 0,
  expected_count INTEGER,
  collected_count INTEGER,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  message TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS inspiration_sync_runs_workspace_started
ON inspiration_sync_runs(workspace_id, started_at DESC);
