import { marked } from '../vendor/marked.esm.js';
import { api, ApiError } from '../api.js';
import { toast } from '../components/toast.js';

const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书'
};
const METRIC_LABELS = {
  visible: '可见数',
  likes: '点赞',
  plays: '播放'
};
const state = {
  tab: 'monitor',
  metric: 'visible',
  creatorId: '',
  threshold: 2,
  creators: [],
  monitor: null,
  posts: [],
  total: 0,
  archive: {
    q: '',
    platform: '',
    creatorId: '',
    content: '',
    sort: 'recent'
  },
  settings: {
    likesMultiplier: 2,
    playsMultiplier: 2,
    visibleMultiplier: 2
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function renderMarkdown(source) {
  const template = document.createElement('template');
  template.innerHTML = marked.parse(String(source || ''), { gfm: true, breaks: true });
  template.content.querySelectorAll(
    'script, style, iframe, object, embed, form, input, button, textarea, select, meta, link'
  ).forEach((element) => element.remove());
  template.content.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') element.removeAttribute(attribute.name);
      if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === 'A') {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return template.innerHTML;
}

function formatNumber(value) {
  if (value === null || value === undefined) return '暂无';
  const number = Number(value);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) {
    const digits = number >= 100000 ? 1 : 2;
    return `${(number / 10000).toFixed(digits).replace(/\.0+$/, '')}万`;
  }
  return number.toLocaleString('zh-CN');
}

function formatDate(value) {
  if (!value) return '日期未知';
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function metricValue(post, metric = state.metric) {
  if (metric === 'likes') return post.likes;
  if (metric === 'plays') return post.plays;
  return post.visibleCount ?? post.likes ?? post.plays;
}

function platformChip(platform) {
  return `<span class="inspiration-platform ${platform}">
    ${PLATFORM_LABELS[platform] || escapeHtml(platform)}
  </span>`;
}

function creatorOptions(selected = '') {
  return state.creators.map((creator) => `
    <option value="${creator.id}" ${selected === creator.id ? 'selected' : ''}>
      ${escapeHtml(creator.name)}
    </option>
  `).join('');
}

function currentMultiplierKey() {
  return `${state.metric}Multiplier`;
}

function chartMarkup() {
  const trend = state.monitor?.trend || [];
  if (!trend.length) {
    return `
      <div class="inspiration-empty chart-empty">
        <strong>当前周期没有可绘制的${METRIC_LABELS[state.metric]}数据</strong>
        <span>切换指标或导入带指标的作品后，趋势会显示在这里。</span>
      </div>
    `;
  }
  const width = 760;
  const height = 250;
  const left = 42;
  const top = 18;
  const plotWidth = width - left - 18;
  const plotHeight = height - top - 38;
  const values = trend.map((item) => Number(item.value || 0));
  const maximum = Math.max(...values, 1);
  const points = trend.map((item, index) => {
    const x = left + (trend.length === 1 ? plotWidth / 2 : (index / (trend.length - 1)) * plotWidth);
    const y = top + plotHeight - (Number(item.value || 0) / maximum) * plotHeight;
    return { ...item, x, y };
  });
  const path = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${left},${top + plotHeight} ${path} ${left + plotWidth},${top + plotHeight}`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = top + plotHeight - ratio * plotHeight;
    return `
      <line x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}" />
      <text x="${left - 8}" y="${y + 3}" text-anchor="end">
        ${escapeHtml(formatNumber(maximum * ratio))}
      </text>
    `;
  }).join('');
  const dateLabels = points.filter((_, index) => (
    index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2)
  )).map((point) => `
    <text x="${point.x}" y="${height - 8}" text-anchor="middle">
      ${escapeHtml(point.date.slice(5))}
    </text>
  `).join('');
  return `
    <svg class="inspiration-chart" viewBox="0 0 ${width} ${height}"
      role="img" aria-label="最近 30 天${METRIC_LABELS[state.metric]}趋势">
      <g class="chart-grid">${grid}${dateLabels}</g>
      <polygon class="chart-area" points="${area}" />
      <polyline class="chart-line" points="${path}" />
      ${points.map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="4">
          <title>${point.date}：${formatNumber(point.value)}</title>
        </circle>
      `).join('')}
    </svg>
  `;
}

function summaryMarkup() {
  const summary = state.monitor?.summary || {};
  const items = [
    ['对标创作者', summary.creators || 0, `${summary.accounts || 0} 个平台账号`],
    ['收录作品', summary.posts || 0, '真实对标作品总量'],
    ['近 7 日新增', summary.recent || 0, '按入库时间统计'],
    ['文案绑定率', `${Math.round((summary.contentBoundRate || 0) * 100)}%`,
      `${summary.contentBound || 0} 条已绑定文案`]
  ];
  return items.map(([label, value, hint], index) => `
    <article class="inspiration-metric ${index === 1 ? 'featured' : ''}">
      <span>${label}</span>
      <strong>${typeof value === 'number' ? value.toLocaleString('zh-CN') : value}</strong>
      <small>${hint}</small>
    </article>
  `).join('');
}

function hotMarkup() {
  const hot = state.monitor?.hot || [];
  if (!hot.length) {
    return `
      <div class="inspiration-empty compact">
        <strong>当前阈值下没有爆款信号</strong>
        <span>爆款基于同一创作者此前最多 10 条作品的均值计算。</span>
      </div>
    `;
  }
  return hot.map((post, index) => `
    <button type="button" class="inspiration-hot-row" data-post-id="${post.id}">
      <span class="hot-rank">${String(index + 1).padStart(2, '0')}</span>
      <span class="hot-main">
        <strong>${escapeHtml(post.title)}</strong>
        <small>${escapeHtml(post.creatorName)} · ${PLATFORM_LABELS[post.platform]}</small>
      </span>
      <span class="hot-signal">
        <b>${post.ratio.toFixed(1)} 倍</b>
        <small>高于均值 ${post.aboveAveragePercent}%</small>
      </span>
    </button>
  `).join('');
}

function worksRows(posts, options = {}) {
  if (!posts.length) {
    return `
      <tr><td colspan="7">
        <div class="inspiration-empty">
          <strong>${options.emptyTitle || '没有匹配的作品'}</strong>
          <span>${options.emptyHint || '调整筛选条件，或先导入对标作品。'}</span>
        </div>
      </td></tr>
    `;
  }
  return posts.map((post) => `
    <tr>
      <td>
        <button type="button" class="inspiration-title-button" data-post-id="${post.id}">
          ${escapeHtml(post.title)}
        </button>
        <small>${escapeHtml(post.creatorName)}</small>
      </td>
      <td>${platformChip(post.platform)}</td>
      <td>${formatDate(post.publishTime || post.discoveredAt)}</td>
      <td class="number-cell">${formatNumber(post.visibleCount)}</td>
      <td class="number-cell">${formatNumber(post.likes)}</td>
      <td class="number-cell">${formatNumber(post.plays)}</td>
      <td>
        <span class="content-state ${post.contentBound ? 'bound' : ''}">
          ${post.contentBound ? '已绑定' : '未绑定'}
        </span>
      </td>
    </tr>
  `).join('');
}

function renderMonitor() {
  document.getElementById('inspirationPanel').innerHTML = `
    <section class="inspiration-summary" aria-label="灵感雷达数据摘要">
      ${summaryMarkup()}
    </section>

    <section class="inspiration-insights">
      <div class="inspiration-panel trend-panel">
        <div class="inspiration-section-head">
          <div>
            <p class="eyebrow">30 DAY SIGNAL</p>
            <h2>账号趋势</h2>
          </div>
          <div class="inspiration-inline-controls">
            <select id="monitorCreator" aria-label="筛选创作者">
              <option value="">全部创作者</option>
              ${creatorOptions(state.creatorId)}
            </select>
            <div class="segmented-control" aria-label="趋势指标">
              ${Object.entries(METRIC_LABELS).map(([value, label]) => `
                <button type="button" class="${state.metric === value ? 'on' : ''}"
                  data-inspiration-metric="${value}">${label}</button>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="inspiration-chart-wrap">${chartMarkup()}</div>
        <p class="inspiration-note">
          最近 30 天按日聚合。旧数据库仅保存“可见数”，点赞与播放需通过 CSV 新增。
        </p>
      </div>

      <div class="inspiration-panel hot-panel">
        <div class="inspiration-section-head">
          <div>
            <p class="eyebrow">OUTLIER RANKING</p>
            <h2>爆款排行</h2>
          </div>
          <label class="threshold-control">
            <span>阈值</span>
            <input id="hotThreshold" type="number" min="1" step="0.5"
              value="${state.threshold}" aria-label="爆款阈值倍数">
            <span>倍</span>
          </label>
        </div>
        <div class="inspiration-hot-list">${hotMarkup()}</div>
      </div>
    </section>

    <section class="inspiration-panel inspiration-works-panel">
      <div class="inspiration-section-head">
        <div>
          <p class="eyebrow">REFERENCE CATALOG</p>
          <h2>数据明细</h2>
        </div>
        <button class="button button-secondary compact-button" type="button"
          data-switch-inspiration-tab="archive">查看全部</button>
      </div>
      <div class="inspiration-table-scroll">
        <table class="inspiration-table">
          <thead>
            <tr>
              <th>作品</th><th>平台</th><th>发布日期</th><th>可见数</th>
              <th>点赞</th><th>播放</th><th>文案</th>
            </tr>
          </thead>
          <tbody>${worksRows(state.monitor?.works || [])}</tbody>
        </table>
      </div>
    </section>
  `;
  bindMonitor();
  bindPostButtons();
}

function archiveQuery() {
  const params = new URLSearchParams({ limit: '500', sort: state.archive.sort });
  Object.entries(state.archive).forEach(([key, value]) => {
    if (!value || key === 'sort') return;
    params.set(key, value);
  });
  return params;
}

function renderArchive() {
  document.getElementById('inspirationPanel').innerHTML = `
    <section class="inspiration-panel archive-panel">
      <div class="inspiration-section-head archive-heading">
        <div>
          <p class="eyebrow">HISTORICAL WORKS</p>
          <h2>历史作品 <span>${state.total.toLocaleString('zh-CN')}</span></h2>
        </div>
        <button class="button button-secondary compact-button" type="button"
          id="clearArchiveFilters">清空筛选</button>
      </div>
      <div class="inspiration-toolbar">
        <label class="inspiration-search">
          <span class="visually-hidden">搜索标题或标签</span>
          <input id="archiveSearch" value="${escapeHtml(state.archive.q)}"
            placeholder="搜索标题、创作者或标签">
        </label>
        <select id="archivePlatform" aria-label="平台筛选">
          <option value="">全部平台</option>
          ${Object.entries(PLATFORM_LABELS).map(([value, label]) => `
            <option value="${value}" ${state.archive.platform === value ? 'selected' : ''}>
              ${label}
            </option>
          `).join('')}
        </select>
        <select id="archiveCreator" aria-label="创作者筛选">
          <option value="">全部创作者</option>
          ${creatorOptions(state.archive.creatorId)}
        </select>
        <select id="archiveContent" aria-label="文案状态筛选">
          <option value="">全部文案状态</option>
          <option value="bound" ${state.archive.content === 'bound' ? 'selected' : ''}>已绑定文案</option>
          <option value="unbound" ${state.archive.content === 'unbound' ? 'selected' : ''}>未绑定文案</option>
        </select>
        <select id="archiveSort" aria-label="作品排序">
          <option value="recent" ${state.archive.sort === 'recent' ? 'selected' : ''}>最近发布</option>
          <option value="visible" ${state.archive.sort === 'visible' ? 'selected' : ''}>可见数最高</option>
          <option value="likes" ${state.archive.sort === 'likes' ? 'selected' : ''}>点赞最高</option>
          <option value="plays" ${state.archive.sort === 'plays' ? 'selected' : ''}>播放最高</option>
        </select>
      </div>
      <div class="inspiration-table-scroll archive-table-scroll">
        <table class="inspiration-table">
          <thead>
            <tr>
              <th>作品</th><th>平台</th><th>发布日期</th><th>可见数</th>
              <th>点赞</th><th>播放</th><th>文案</th>
            </tr>
          </thead>
          <tbody>${worksRows(state.posts)}</tbody>
        </table>
      </div>
    </section>
  `;
  bindArchive();
  bindPostButtons();
}

function renderCreators() {
  document.getElementById('inspirationPanel').innerHTML = `
    <section class="creator-directory">
      <div class="inspiration-section-head">
        <div>
          <p class="eyebrow">REFERENCE ACCOUNTS</p>
          <h2>对标账号 <span>${state.creators.length}</span></h2>
        </div>
        <button class="button button-primary compact-button" type="button" id="addCreator">
          添加创作者
        </button>
      </div>
      ${state.creators.length ? `
        <div class="reference-creator-grid">
          ${state.creators.map((creator) => `
            <article class="reference-creator-card">
              <div class="creator-card-head">
                <span class="creator-monogram">${escapeHtml(creator.name.slice(0, 1))}</span>
                <div>
                  <h3>${escapeHtml(creator.name)}</h3>
                  <p>${escapeHtml(creator.category || '尚未设置内容方向')}</p>
                </div>
                <strong>${creator.postCount}</strong>
              </div>
              <div class="creator-account-list">
                ${creator.accounts.map((account) => `
                  <div>
                    ${platformChip(account.platform)}
                    <span>
                      <strong>${escapeHtml(account.handle || '未记录账号名')}</strong>
                      <small>
                        ${account.actualPostCount} 条作品 ·
                        ${account.collectionStatus === 'complete' ? '采集完整' : '持续补充'}
                      </small>
                    </span>
                    ${account.profileUrl ? `
                      <a href="${escapeHtml(account.profileUrl)}" target="_blank"
                        rel="noopener noreferrer" aria-label="打开${PLATFORM_LABELS[account.platform]}主页">
                        ↗
                      </a>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
              <footer>
                <span>${escapeHtml(creator.location || '地区未设置')}</span>
                <button type="button" data-filter-creator="${creator.id}">查看作品</button>
              </footer>
            </article>
          `).join('')}
        </div>
      ` : `
        <div class="inspiration-empty large">
          <strong>还没有对标创作者</strong>
          <span>先添加创作者及平台主页，再通过 CSV 导入作品。</span>
          <button class="button button-primary" type="button" id="addFirstCreator">添加创作者</button>
        </div>
      `}
    </section>
  `;
  document.getElementById('addCreator')?.addEventListener('click', openCreatorDrawer);
  document.getElementById('addFirstCreator')?.addEventListener('click', openCreatorDrawer);
  document.querySelectorAll('[data-filter-creator]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.archive.creatorId = button.dataset.filterCreator;
      await switchTab('archive');
    });
  });
}

function setBusy(active) {
  document.getElementById('inspirationPage')?.classList.toggle('loading', active);
}

async function loadMonitor() {
  const params = new URLSearchParams({
    metric: state.metric,
    threshold: String(state.threshold)
  });
  if (state.creatorId) params.set('creatorId', state.creatorId);
  state.monitor = await api(`/dashboard/monitor?${params}`);
}

async function loadArchive() {
  const result = await api(`/posts?${archiveQuery()}`);
  state.posts = result.items;
  state.total = result.total;
}

async function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('[data-inspiration-tab]').forEach((button) => {
    button.classList.toggle('on', button.dataset.inspirationTab === tab);
  });
  setBusy(true);
  try {
    if (tab === 'monitor') {
      await loadMonitor();
      renderMonitor();
    } else if (tab === 'archive') {
      await loadArchive();
      renderArchive();
    } else {
      renderCreators();
    }
  } catch (error) {
    renderLoadError(error);
  } finally {
    setBusy(false);
  }
}

function renderLoadError(error) {
  document.getElementById('inspirationPanel').innerHTML = `
    <div class="inspiration-empty large error-state">
      <strong>灵感雷达加载失败</strong>
      <span>${escapeHtml(error.message)}</span>
      <button type="button" class="button button-secondary" id="retryInspiration">重新加载</button>
    </div>
  `;
  document.getElementById('retryInspiration')?.addEventListener('click', () => switchTab(state.tab));
}

function bindMonitor() {
  document.getElementById('monitorCreator')?.addEventListener('change', async (event) => {
    state.creatorId = event.target.value;
    await switchTab('monitor');
  });
  document.querySelectorAll('[data-inspiration-metric]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.metric = button.dataset.inspirationMetric;
      state.threshold = state.settings[currentMultiplierKey()];
      await switchTab('monitor');
    });
  });
  document.getElementById('hotThreshold')?.addEventListener('change', async (event) => {
    const value = Math.max(1, Number(event.target.value) || 2);
    state.threshold = value;
    state.settings[currentMultiplierKey()] = value;
    try {
      await api('/inspiration/settings', {
        method: 'PUT',
        body: JSON.stringify(state.settings)
      });
      await switchTab('monitor');
      toast('爆款阈值已保存', 'success');
    } catch (error) {
      toast(error.message, 'danger');
    }
  });
  document.querySelector('[data-switch-inspiration-tab]')?.addEventListener('click', () => {
    switchTab('archive');
  });
}

function bindArchive() {
  let searchTimer;
  document.getElementById('archiveSearch').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.archive.q = event.target.value.trim();
      await switchTab('archive');
    }, 280);
  });
  [
    ['archivePlatform', 'platform'],
    ['archiveCreator', 'creatorId'],
    ['archiveContent', 'content'],
    ['archiveSort', 'sort']
  ].forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', async (event) => {
      state.archive[key] = event.target.value;
      await switchTab('archive');
    });
  });
  document.getElementById('clearArchiveFilters').addEventListener('click', async () => {
    state.archive = { q: '', platform: '', creatorId: '', content: '', sort: 'recent' };
    await switchTab('archive');
  });
}

function bindPostButtons() {
  document.querySelectorAll('[data-post-id]').forEach((button) => {
    button.addEventListener('click', () => openPostDrawer(button.dataset.postId));
  });
}

function closeDrawer() {
  document.getElementById('inspirationDrawerLayer')?.remove();
  document.body.style.overflow = '';
}

function drawerShell(title, eyebrow, body, footer = '') {
  closeDrawer();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="drawer-layer inspiration-drawer-layer" id="inspirationDrawerLayer">
      <button class="drawer-scrim" type="button" data-close-inspiration
        aria-label="关闭弹窗"></button>
      <aside class="drawer inspiration-drawer" role="dialog" aria-modal="true">
        <header class="drawer-header">
          <div>
            <p class="eyebrow">${eyebrow}</p>
            <h2>${escapeHtml(title)}</h2>
          </div>
          <button class="icon-button" type="button" data-close-inspiration aria-label="关闭">×</button>
        </header>
        ${body}
        ${footer}
      </aside>
    </div>
  `);
  document.querySelectorAll('[data-close-inspiration]').forEach((button) => {
    button.addEventListener('click', closeDrawer);
  });
  document.body.style.overflow = 'hidden';
}

async function openPostDrawer(id) {
  try {
    const [post, content] = await Promise.all([
      api(`/posts/${encodeURIComponent(id)}`),
      api(`/posts/${encodeURIComponent(id)}/content`)
    ]);
    drawerShell(post.title, 'REFERENCE WORK / DETAIL', `
      <div class="drawer-body inspiration-detail-body">
        <div class="post-detail-meta">
          ${platformChip(post.platform)}
          <span>${escapeHtml(post.creatorName)}</span>
          <span>${formatDate(post.publishTime || post.discoveredAt)}</span>
        </div>
        <section class="post-metric-strip">
          <div><span>可见数</span><strong>${formatNumber(post.visibleCount)}</strong></div>
          <div><span>点赞</span><strong>${formatNumber(post.likes)}</strong></div>
          <div><span>播放</span><strong>${formatNumber(post.plays)}</strong></div>
        </section>
        ${post.tags.length ? `
          <div class="post-tags">${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        ` : ''}
        <section class="post-content-section">
          <div class="inspiration-section-head">
            <div>
              <p class="eyebrow">BOUND COPY</p>
              <h3>竞品文案</h3>
            </div>
            <span class="content-state ${content.boundAt ? 'bound' : ''}">
              ${content.boundAt ? '已绑定' : '未绑定'}
            </span>
          </div>
          ${content.body ? `
            <article class="inspiration-markdown">${renderMarkdown(content.body)}</article>
          ` : `
            <div class="inspiration-empty compact">
              <strong>这条作品还没有绑定文案</strong>
              <span>使用“导入文案”上传同名 Markdown 文件即可自动匹配。</span>
            </div>
          `}
        </section>
        ${post.originalUrl ? `
          <a class="button button-secondary post-original-link"
            href="${escapeHtml(post.originalUrl)}" target="_blank" rel="noopener noreferrer">
            打开原作品 ↗
          </a>
        ` : ''}
      </div>
    `);
  } catch (error) {
    toast(error.message, 'danger');
  }
}

function openCreatorDrawer() {
  drawerShell('添加创作者', 'REFERENCE CREATOR / NEW', `
    <form id="creatorForm" class="inspiration-drawer-form" novalidate>
      <div class="drawer-body">
        <section class="form-section">
          <h3>基本信息</h3>
          <div class="form-grid">
            <label class="field-wide">
              <span>创作者名称 *</span>
              <input name="name" required maxlength="80" placeholder="例如：居里富人">
              <small class="field-error" data-error="name"></small>
            </label>
            <label>
              <span>内容方向</span>
              <input name="category" maxlength="80" placeholder="家居 / 独居生活">
            </label>
            <label>
              <span>所在地区</span>
              <input name="location" maxlength="40" placeholder="重庆">
            </label>
          </div>
        </section>
        <section class="form-section">
          <h3>平台主页</h3>
          <div class="form-grid">
            <label class="field-wide">
              <span>抖音主页链接</span>
              <input name="douyinUrl" type="url" placeholder="https://www.douyin.com/user/...">
              <small class="field-error" data-error="douyinUrl"></small>
            </label>
            <label class="field-wide">
              <span>小红书主页链接</span>
              <input name="xiaohongshuUrl" type="url"
                placeholder="https://www.xiaohongshu.com/user/profile/...">
              <small class="field-error" data-error="xiaohongshuUrl"></small>
            </label>
          </div>
        </section>
      </div>
      <footer class="drawer-footer">
        <span>至少填写一个平台主页，后续也可通过 CSV 自动补建账号。</span>
        <div>
          <button class="button button-secondary" type="button" data-close-inspiration>取消</button>
          <button class="button button-primary" type="submit">保存创作者</button>
        </div>
      </footer>
    </form>
  `);
  document.querySelectorAll('[data-close-inspiration]').forEach((button) => {
    button.addEventListener('click', closeDrawer);
  });
  document.getElementById('creatorForm').addEventListener('submit', saveCreator);
}

async function saveCreator(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  form.querySelectorAll('.field-error').forEach((element) => { element.textContent = ''; });
  submit.disabled = true;
  try {
    await api('/creators', { method: 'POST', body: JSON.stringify(data) });
    state.creators = await api('/creators');
    closeDrawer();
    await switchTab('creators');
    toast('对标创作者已添加', 'success');
  } catch (error) {
    if (error instanceof ApiError && error.details) {
      Object.entries(error.details).forEach(([field, message]) => {
        const element = form.querySelector(`[data-error="${field}"]`);
        if (element) element.textContent = message;
      });
    }
    toast(error.message, 'danger');
  } finally {
    submit.disabled = false;
  }
}

function openImportDrawer(kind) {
  const isCsv = kind === 'csv';
  drawerShell(
    isCsv ? '导入作品' : '导入文案',
    isCsv ? 'CSV IMPORT' : 'MARKDOWN IMPORT',
    `
      <form id="inspirationImportForm" class="inspiration-drawer-form">
        <div class="drawer-body">
          <section class="import-drop-zone">
            <span>${isCsv ? 'CSV' : 'MD / ZIP'}</span>
            <strong>${isCsv ? '选择作品数据文件' : '选择文案文件或压缩包'}</strong>
            <p>${isCsv
              ? '支持灵感雷达模板，也支持抖音导出 CSV（文件名如“作者_抖音数据.csv”会自动识别平台与作者）。重复作品自动跳过。'
              : '文件名与作品标题一致时自动绑定；相似标题会列出候选供你确认。'}</p>
            <input type="file" name="file" required
              accept="${isCsv ? '.csv,text/csv' : '.md,.zip,text/markdown,application/zip'}">
          </section>
          ${isCsv ? `
            <div class="import-options">
              <label>
                <span>账号名称</span>
                <input type="text" name="author" placeholder="手动填写后自动创建到对标账号">
              </label>
              <label>
                <span>平台</span>
                <select name="platform">
                  <option value="">自动识别</option>
                  <option value="douyin">抖音</option>
                  <option value="xiaohongshu">小红书</option>
                </select>
              </label>
            </div>
          ` : ''}
          <div id="importResult"></div>
        </div>
        <footer class="drawer-footer">
          <span>${isCsv ? '导入不会覆盖已有作品。' : '默认不会覆盖已经绑定的文案。'}</span>
          <div>
            <button class="button button-secondary" type="button" data-close-inspiration>取消</button>
            <button class="button button-primary" type="submit">
              ${isCsv ? '开始导入' : '匹配并导入'}
            </button>
          </div>
        </footer>
      </form>
    `
  );
  document.querySelectorAll('[data-close-inspiration]').forEach((button) => {
    button.addEventListener('click', closeDrawer);
  });
  document.getElementById('inspirationImportForm').addEventListener('submit', (event) => {
    submitImport(event, kind);
  });
}

function importResultMarkup(result, kind) {
  if (kind === 'csv') {
    return `
      <div class="import-summary">
        <div><strong>${result.imported}</strong><span>成功导入</span></div>
        <div><strong>${result.skipped}</strong><span>重复跳过</span></div>
        <div><strong>${result.failed}</strong><span>导入失败</span></div>
      </div>
      ${result.errors.length ? `
        <div class="import-errors">
          ${result.errors.map((error) => `
            <p><b>第 ${error.line} 行</b><span>${escapeHtml(error.message)}</span></p>
          `).join('')}
        </div>
      ` : ''}
    `;
  }
  return `
    <div class="import-summary">
      <div><strong>${result.bound.length}</strong><span>自动绑定</span></div>
      <div><strong>${result.candidates.length}</strong><span>待确认</span></div>
      <div><strong>${result.unmatched.length}</strong><span>未匹配</span></div>
    </div>
    ${result.candidates.map((group, groupIndex) => `
      <section class="import-candidates">
        <strong>${escapeHtml(group.filename)}</strong>
        <p>请选择要绑定的作品：</p>
        ${group.candidates.map((candidate) => `
          <button type="button" data-bind-candidate="${candidate.id}"
            data-candidate-group="${groupIndex}">
            <span>${escapeHtml(candidate.title)}</span>
            <small>${escapeHtml(candidate.creator_name)} · 匹配 ${Math.round(candidate.score * 100)}%</small>
          </button>
        `).join('')}
      </section>
    `).join('')}
    ${result.existing.length ? `
      <p class="import-notice">${result.existing.length} 条已有文案，未覆盖。</p>
    ` : ''}
  `;
}

async function submitImport(event, kind) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const data = new FormData(form);
  submit.disabled = true;
  try {
    const result = await api(kind === 'csv' ? '/posts/import-csv' : '/posts/import-content', {
      method: 'POST',
      body: data
    });
    document.getElementById('importResult').innerHTML = importResultMarkup(result, kind);
    if (kind === 'content') bindCandidateButtons(result);
    await Promise.all([loadMonitor(), loadArchive()]);
    toast(kind === 'csv' ? '作品导入完成' : '文案匹配完成', 'success');
  } catch (error) {
    document.getElementById('importResult').innerHTML = `
      <div class="inspiration-empty compact error-state">
        <strong>导入失败</strong><span>${escapeHtml(error.message)}</span>
      </div>
    `;
  } finally {
    submit.disabled = false;
  }
}

function bindCandidateButtons(result) {
  document.querySelectorAll('[data-bind-candidate]').forEach((button) => {
    button.addEventListener('click', async () => {
      const group = result.candidates[Number(button.dataset.candidateGroup)];
      button.disabled = true;
      try {
        await api(`/posts/${encodeURIComponent(button.dataset.bindCandidate)}/content`, {
          method: 'PUT',
          body: JSON.stringify({ body: group.markdown })
        });
        button.closest('.import-candidates').innerHTML = `
          <p class="import-notice success">已绑定到：${escapeHtml(button.querySelector('span').textContent)}</p>
        `;
        toast('文案已绑定', 'success');
      } catch (error) {
        button.disabled = false;
        toast(error.message, 'danger');
      }
    });
  });
}

async function refreshRadar() {
  const button = document.getElementById('refreshRadar');
  button.disabled = true;
  try {
    const run = await api('/sync', { method: 'POST', body: '{}' });
    await Promise.all([loadMonitor(), loadArchive()]);
    if (state.tab === 'monitor') renderMonitor();
    toast(run.message, 'success');
  } catch (error) {
    toast(error.message, 'danger');
  } finally {
    button.disabled = false;
  }
}

function exportPosts() {
  const params = state.tab === 'archive' ? archiveQuery() : new URLSearchParams();
  if (state.tab === 'monitor' && state.creatorId) params.set('creatorId', state.creatorId);
  const anchor = document.createElement('a');
  anchor.href = `/api/posts/export?${params}`;
  anchor.click();
}

function bindPage() {
  document.querySelectorAll('[data-inspiration-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.inspirationTab));
  });
  document.getElementById('refreshRadar').addEventListener('click', refreshRadar);
  document.getElementById('importWorks').addEventListener('click', () => openImportDrawer('csv'));
  document.getElementById('importContent').addEventListener('click', () => openImportDrawer('content'));
  document.getElementById('exportInspiration').addEventListener('click', exportPosts);
}

export async function renderInspirationPage(root) {
  root.innerHTML = `
    <section class="page inspiration-page" id="inspirationPage">
      <header class="page-header inspiration-page-header">
        <div>
          <p class="eyebrow">COMPETITOR MONITORING / 02</p>
          <h1>灵感雷达</h1>
          <p class="lead">集中监控对标创作者、识别异常高表现作品，并沉淀可阅读的竞品文案。</p>
        </div>
        <div class="inspiration-page-actions">
          <button class="button button-secondary" type="button" id="refreshRadar">刷新雷达</button>
          <button class="button button-secondary" type="button" id="importWorks">导入作品</button>
          <button class="button button-secondary" type="button" id="importContent">导入文案</button>
          <button class="button button-primary" type="button" id="exportInspiration">导出</button>
        </div>
      </header>
      <nav class="inspiration-tabs" aria-label="灵感雷达视图">
        <button class="on" type="button" data-inspiration-tab="monitor">监控看板</button>
        <button type="button" data-inspiration-tab="archive">历史作品</button>
        <button type="button" data-inspiration-tab="creators">对标账号</button>
      </nav>
      <div id="inspirationPanel">
        <div class="inspiration-loading">
          <span></span><span></span><span></span>
        </div>
      </div>
    </section>
  `;
  bindPage();
  try {
    [state.creators, state.settings] = await Promise.all([
      api('/creators'),
      api('/inspiration/settings')
    ]);
    state.threshold = state.settings[currentMultiplierKey()];
    await switchTab('monitor');
  } catch (error) {
    renderLoadError(error);
  }
}
