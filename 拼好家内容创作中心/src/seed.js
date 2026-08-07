const PLATFORMS = ['douyin', 'xiaohongshu', 'shipinhao'];

const seedAccounts = [
  {
    id: 'acc-chef',
    name: '苏师傅爱做饭',
    direction: '家常菜与厨房效率',
    status: 'active',
    color: '#F97316',
    positioning: '用普通家庭食材，给出可以立刻复刻的做饭方案。',
    targetAudience: '希望提升做饭效率的年轻家庭',
    cta: '收藏菜单，今晚照着做',
    platforms: [
      ['douyin', '苏师傅爱做饭', 'active', '2026-08-04'],
      ['xiaohongshu', '苏师傅的厨房', 'active', '2026-08-02'],
      ['shipinhao', '苏师傅爱做饭', 'active', '2026-08-01']
    ]
  },
  {
    id: 'acc-home',
    name: '英爱家38平',
    direction: '小户型家居改造',
    status: 'active',
    color: '#3B82F6',
    positioning: '记录 38 平小家的真实改造和收纳方法。',
    targetAudience: '小户型业主与租房人群',
    cta: '关注小家改造进度',
    platforms: [
      ['douyin', '英爱家38平', 'active', '2026-08-03'],
      ['xiaohongshu', '英爱家38平', 'active', '2026-08-04'],
      ['shipinhao', '', 'unconfigured', '']
    ]
  },
  {
    id: 'acc-fitness',
    name: '游泳健身了解一下',
    direction: '游泳训练与体能提升',
    status: 'preparing',
    color: '#22C55E',
    positioning: '把专业训练拆成普通人能执行的短计划。',
    targetAudience: '游泳初学者和轻健身人群',
    cta: '跟练一周后回来记录变化',
    platforms: [
      ['douyin', '游泳健身了解一下', 'active', '2026-07-28'],
      ['xiaohongshu', '', 'unconfigured', ''],
      ['shipinhao', '', 'unconfigured', '']
    ]
  }
];

const seedContentCards = [
  {
    id: 'content-chef-burger-rice',
    accountId: 'acc-chef',
    title: '双层芝士汉堡肉盖饭',
    status: 'producing',
    primaryPlatform: 'douyin',
    category: '美食 / 二人食晚餐',
    progress: 'editing',
    script: '# 双层芝士汉堡肉盖饭\n\n## 录制稿正文\n\n下班后，给那个加班到九点的 TA 做一份会拉丝的汉堡肉盖饭。\n\n- 汉堡肉煎至两面焦香\n- 酱汁收浓后盖上芝士\n- 热米饭最后装盘',
    publishPlan: '# 三平台发布方案\n\n| 平台 | 建议发布时间 | 内容重点 |\n| --- | --- | --- |\n| 抖音 | 17:30 | 拉丝开场 |\n| 视频号 | 18:00 | 完整步骤 |\n| 小红书 | 19:00 | 配方清单 |'
  },
  {
    id: 'content-chef-crispy-chicken',
    accountId: 'acc-chef',
    title: '三步做出脆皮鸡腿饭',
    status: 'scripted',
    primaryPlatform: 'xiaohongshu',
    category: '快手晚餐',
    script: '# 三步脆皮鸡腿饭\n\n1. 鸡腿去骨腌制\n2. 鸡皮朝下煎脆\n3. 淋酱装盘',
    publishPlan: '# 发布方案\n\n主标题：鸡腿别再直接下锅，三步煎出脆皮。'
  },
  {
    id: 'content-home-counter-flow',
    accountId: 'acc-home',
    title: '厨房台面收纳的错误动线',
    status: 'idea',
    primaryPlatform: 'xiaohongshu',
    category: '厨房收纳'
  },
  {
    id: 'content-home-entry-cabinet',
    accountId: 'acc-home',
    title: '38 平玄关薄柜改造',
    status: 'published',
    primaryPlatform: 'xiaohongshu',
    category: '小户型改造'
  },
  {
    id: 'content-home-wardrobe-zones',
    accountId: 'acc-home',
    title: '不用扩容的衣柜分区法',
    status: 'reviewed',
    primaryPlatform: 'shipinhao',
    category: '衣柜收纳'
  },
  {
    id: 'content-fitness-breathing',
    accountId: 'acc-fitness',
    title: '自由泳换气总是抬头怎么办',
    status: 'producing',
    primaryPlatform: 'douyin',
    category: '自由泳技巧',
    progress: 'shooting',
    script: '# 自由泳换气\n\n> 换气不是抬头，而是身体滚转后让嘴角露出水面。\n\n- 先练侧身打腿\n- 保持一侧泳镜在水中\n- 吸气短，呼气长'
  },
  {
    id: 'content-fitness-stretch',
    accountId: 'acc-fitness',
    title: '肩背训练后的 6 分钟拉伸',
    status: 'idea',
    primaryPlatform: 'xiaohongshu',
    category: '训练恢复'
  },
  {
    id: 'content-fitness-breaststroke',
    accountId: 'acc-fitness',
    title: '蛙泳蹬腿发力顺序',
    status: 'published',
    primaryPlatform: 'shipinhao',
    category: '蛙泳技巧'
  }
];

const seedPerformance = [
  ['performance-home-entry-xhs', 'content-home-entry-cabinet', 'xiaohongshu',
    '2026-08-05', 38600, 3120, 186, 2450, 240, 128, 32],
  ['performance-home-entry-douyin', 'content-home-entry-cabinet', 'douyin',
    '2026-08-05', 16400, 1080, 72, 360, 95, 41, 9],
  ['performance-home-wardrobe-video', 'content-home-wardrobe-zones', 'shipinhao',
    '2026-08-04', 8200, 510, 48, 120, 168, 22, 5],
  ['performance-home-wardrobe-xhs', 'content-home-wardrobe-zones', 'xiaohongshu',
    '2026-08-04', 12100, 940, 86, 1180, 104, 53, 12],
  ['performance-home-wardrobe-douyin', 'content-home-wardrobe-zones', 'douyin',
    '2026-08-04', 6900, 420, 39, 96, 44, 14, 3]
];

const seedKnowledgeAssets = [
  {
    id: 'knowledge-hook-five-seconds',
    title: '开场钩子五秒公式',
    category: 'script_template',
    summary: '用痛点、结果承诺、悬念和视觉动作完成前五秒。',
    body: '# 使用步骤\n\n1. 用一句反直觉的话切中目标人群痛点。\n2. 亮出结果，说明看完能得到什么。\n3. 留下必须看完整支才能解开的悬念。\n4. 前五秒出现一次视觉动作或关键特写。\n\n## 示例\n\n> 千万别把鸡蛋直接倒进面糊里，很多人第一步就错了。',
    tags: ['开场', '口播', '抖音'],
    sourceType: 'manual',
    status: 'active',
    version: 2,
    createdAt: '2026-07-04T08:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z'
  },
  {
    id: 'knowledge-brand-chef-voice',
    title: '苏师傅爱做饭品牌口吻',
    category: 'brand_guide',
    summary: '干脆、家常、不端着，统一称呼、禁用词和口播收尾。',
    body: '# 品牌口吻\n\n- 自称“师傅”，对用户说“你”。\n- 多用短句，少用感叹号。\n- 不使用“家人们”“姐妹们”等泛化称呼。\n- 不夸大功效，不制造健康焦虑。\n\n## 统一收尾\n\n收藏菜单，我们下顿见。',
    tags: ['苏师傅爱做饭', '口播', '品牌'],
    sourceType: 'manual',
    status: 'active',
    version: 1,
    createdAt: '2026-07-06T08:00:00.000Z',
    updatedAt: '2026-08-02T10:00:00.000Z'
  },
  {
    id: 'knowledge-new-account-sop',
    title: '新号起号 14 天 SOP',
    category: 'sop',
    summary: '用两周确认定位、验证选题并形成下一周期内容节奏。',
    body: '# 新号起号 14 天\n\n## 第 1 至 3 天\n\n确认定位与三个差异化选题，完成账号基础装修。\n\n## 第 4 至 7 天\n\n日更一条，封面保持统一，记录完播率中位数。\n\n## 第 8 至 11 天\n\n把表现最好的选题角度拆成系列，连续更新。\n\n## 第 12 至 14 天\n\n停更一天做复盘，确定后 14 天的内容节奏。',
    tags: ['起号', '发布', '复盘'],
    sourceType: 'manual',
    status: 'active',
    version: 1,
    createdAt: '2026-07-10T08:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z'
  },
  {
    id: 'knowledge-review-cross-platform',
    title: '三平台对照复盘方法',
    category: 'review_method',
    summary: '用平台中位数识别共同点，并在下个周期只测试一个变量。',
    body: '# 三平台对照复盘\n\n1. 按平台整理播放、互动率和收藏率中位数。\n2. 找出低于中位数一半的内容，归纳选题、开头和封面共同点。\n3. 把高表现角度抽象成可复用公式。\n4. 下个周期只测试一个变量，避免归因模糊。',
    tags: ['复盘', '抖音', '小红书', '视频号'],
    sourceType: 'manual',
    status: 'active',
    version: 1,
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z'
  }
];

function seedWorkspaceAndAccounts(database) {
  const existing = database.prepare(
    'SELECT COUNT(*) AS count FROM workspaces'
  ).get().count;

  if (existing > 0) return;
  const now = new Date().toISOString();
  database.exec('BEGIN');

  try {
    database.prepare(`
      INSERT INTO workspaces (id, name, status, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?)
    `).run('default', '拼好家', now, now);

    const insertAccount = database.prepare(`
      INSERT INTO owned_accounts (
        id, workspace_id, name, direction, status, color, positioning,
        target_audience, cta, notes, created_at, updated_at
      ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, '', ?, ?)
    `);
    const insertPlatform = database.prepare(`
      INSERT INTO owned_account_platforms (
        id, account_id, platform, username, profile_url, publish_status,
        last_published, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)
    `);

    for (const account of seedAccounts) {
      insertAccount.run(
        account.id,
        account.name,
        account.direction,
        account.status,
        account.color,
        account.positioning,
        account.targetAudience,
        account.cta,
        now,
        now
      );

      const configured = new Map(account.platforms.map((item) => [item[0], item]));
      for (const platform of PLATFORMS) {
        const item = configured.get(platform) || [platform, '', 'unconfigured', ''];
        insertPlatform.run(
          `${account.id}-${platform}`,
          account.id,
          platform,
          item[1],
          item[2],
          item[3],
          now,
          now
        );
      }
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function seedContent(database) {
  const existing = database.prepare(
    'SELECT COUNT(*) AS count FROM content_cards'
  ).get().count;
  if (existing > 0) return;

  const accountCount = database.prepare(`
    SELECT COUNT(*) AS count FROM owned_accounts
    WHERE id IN ('acc-chef', 'acc-home', 'acc-fitness')
      AND deleted_at IS NULL
  `).get().count;
  if (accountCount !== 3) return;

  const baseTime = Date.parse('2026-08-05T02:00:00.000Z');
  const insertCard = database.prepare(`
    INSERT INTO content_cards (
      id, workspace_id, account_id, title, status, primary_platform,
      category, production_progress, script_body, script_updated_at,
      publish_plan_body, publish_plan_updated_at, status_changed_at,
      created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRecord = database.prepare(`
    INSERT INTO content_publish_records (
      id, content_card_id, platform, publish_url, publish_time,
      publish_title, created_at, updated_at
    ) VALUES (?, ?, ?, '', ?, ?, ?, ?)
  `);

  database.exec('BEGIN');
  try {
    seedContentCards.forEach((card, index) => {
      const createdAt = new Date(baseTime - ((index + 2) * 86400000)).toISOString();
      const updatedAt = new Date(baseTime - (index * 3600000)).toISOString();
      insertCard.run(
        card.id,
        card.accountId,
        card.title,
        card.status,
        card.primaryPlatform || null,
        card.category || '',
        card.status === 'producing' ? card.progress || null : null,
        card.script || '',
        card.script ? updatedAt : null,
        card.publishPlan || '',
        card.publishPlan ? updatedAt : null,
        updatedAt,
        createdAt,
        updatedAt
      );

      for (const platform of PLATFORMS) {
        const publishTime = ['published', 'reviewed'].includes(card.status)
          ? updatedAt
          : null;
        insertRecord.run(
          `${card.id}-${platform}`,
          card.id,
          platform,
          publishTime,
          '',
          createdAt,
          updatedAt
        );
      }
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function seedPerformanceData(database) {
  const existing = database.prepare(
    'SELECT COUNT(*) AS count FROM content_performance'
  ).get().count;
  if (existing > 0) return;

  const availableCards = database.prepare(`
    SELECT COUNT(*) AS count
    FROM content_cards
    WHERE id IN ('content-home-entry-cabinet', 'content-home-wardrobe-zones')
      AND deleted_at IS NULL
  `).get().count;
  if (availableCards !== 2) return;

  const insert = database.prepare(`
    INSERT INTO content_performance (
      id, workspace_id, content_card_id, platform, record_date,
      plays, likes, comments, bookmarks, shares, followers_gained,
      leads, created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = '2026-08-05T12:00:00.000Z';

  database.exec('BEGIN');
  try {
    for (const record of seedPerformance) {
      insert.run(...record, createdAt, createdAt);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function seedKnowledge(database) {
  const existing = database.prepare(
    'SELECT COUNT(*) AS count FROM knowledge_assets'
  ).get().count;
  if (existing > 0) return;

  const workspace = database.prepare(
    "SELECT id FROM workspaces WHERE id = 'default'"
  ).get();
  if (!workspace) return;

  const insert = database.prepare(`
    INSERT INTO knowledge_assets (
      id, workspace_id, title, category, summary, body, tags_json,
      source_type, status, version, published_at, created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  database.exec('BEGIN');
  try {
    for (const asset of seedKnowledgeAssets) {
      insert.run(
        asset.id,
        asset.title,
        asset.category,
        asset.summary,
        asset.body,
        JSON.stringify(asset.tags),
        asset.sourceType,
        asset.status,
        asset.version,
        asset.status === 'active' ? asset.updatedAt : null,
        asset.createdAt,
        asset.updatedAt
      );
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function seedDatabase(database) {
  seedWorkspaceAndAccounts(database);
  seedContent(database);
  seedPerformanceData(database);
  seedKnowledge(database);
}
