import { api, ApiError } from '../api.js';
import { store } from '../store.js';
import { toast } from '../components/toast.js';

// 账号在账号矩阵页变更后，即时同步本页筛选，无需手动刷新
store.on('accounts:updated', () => {
  if (document.getElementById('reviewAccountFilter')) renderFilters();
});

const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  shipinhao: '视频号'
};
const METRIC_FIELDS = [
  ['plays', '播放 / 阅读'],
  ['likes', '点赞'],
  ['comments', '评论'],
  ['bookmarks', '收藏'],
  ['shares', '分享'],
  ['followersGained', '涨粉'],
  ['leads', '咨询 / 私信']
];

const state = {
  periodType: 'week',
  start: '',
  accountId: 'all',
  platform: 'all',
  review: null,
  pending: [],
  cards: [],
  conclusion: null,
  entryCardId: null
};
let escapeListenerBound = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function localIsoDate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function currentPeriodStart(type) {
  const date = new Date();
  if (type === 'week') {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  } else {
    date.setDate(1);
  }
  return localIsoDate(date);
}

function periodEnd(type, start) {
  const date = new Date(`${start}T12:00:00`);
  if (type === 'week') date.setDate(date.getDate() + 6);
  else date.setMonth(date.getMonth() + 1, 0);
  return localIsoDate(date);
}

function shiftPeriod(direction) {
  const date = new Date(`${state.start}T12:00:00`);
  if (state.periodType === 'week') date.setDate(date.getDate() + (7 * direction));
  else date.setMonth(date.getMonth() + direction, 1);
  state.start = localIsoDate(date);
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric'
  });
}

function periodLabel() {
  const end = periodEnd(state.periodType, state.start);
  if (state.periodType === 'week') {
    return `${formatDate(state.start)} - ${formatDate(end)}`;
  }
  return new Date(`${state.start}T12:00:00`).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long'
  });
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(number >= 100000 ? 1 : 2)}万`;
  return number.toLocaleString('zh-CN');
}

function formatRate(value) {
  return value === null || value === undefined
    ? '—'
    : `${(Number(value) * 100).toFixed(2)}%`;
}

function cardById(id) {
  return state.cards.find((card) => card.id === id);
}

function queryCardId() {
  const query = location.hash.split('?')[1] || '';
  return new URLSearchParams(query).get('card');
}

function renderFilters() {
  const account = document.getElementById('reviewAccountFilter');
  if (!account) return;
  account.innerHTML = `
    <option value="all">全部账号</option>
    ${store.accounts.map((item) => `
      <option value="${item.id}" ${state.accountId === item.id ? 'selected' : ''}>
        ${escapeHtml(item.name)}
      </option>
    `).join('')}
  `;
  document.getElementById('reviewPlatformFilter').value = state.platform;
  document.querySelectorAll('[data-review-period]').forEach((button) => {
    button.classList.toggle('on', button.dataset.reviewPeriod === state.periodType);
  });
  document.getElementById('reviewPeriodLabel').textContent = periodLabel();
  document.getElementById('nextReviewPeriod').disabled =
    state.start >= currentPeriodStart(state.periodType);
}

function summaryMarkup() {
  const summary = state.review?.summary || {};
  const metrics = [
    ['发布内容', `${summary.publishedContent || 0} 条`, '周期内有数据的内容'],
    ['播放 / 阅读', formatNumber(summary.plays), `${summary.recordCount || 0} 条平台记录`],
    ['总互动', formatNumber(summary.interactions), '点赞、评论、收藏与分享'],
    ['新增关注', formatNumber(summary.followersGained), '由内容带来的涨粉'],
    ['有效咨询', formatNumber(summary.leads), '私信与明确业务线索'],
    ['平均互动率', formatRate(summary.engagementRate), '总互动 / 总播放']
  ];
  return metrics.map(([label, value, hint], index) => `
    <article class="review-metric ${index === 1 ? 'featured' : ''}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `).join('');
}

function pendingMarkup() {
  if (!state.pending.length) {
    return `
      <div class="review-empty compact">
        <strong>已发布内容的数据都补齐了</strong>
        <span>新的已发布内容会自动出现在这里。</span>
      </div>
    `;
  }
  return state.pending.map((card) => `
    <article class="pending-review-row" style="--account-color:${card.account.color}">
      <i aria-hidden="true"></i>
      <div>
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(card.account.name)} · ${PLATFORM_LABELS[card.primaryPlatform] || '多平台'}</span>
      </div>
      <span class="${card.daysPublished > 7 ? 'stale' : ''}">
        已发布 ${card.daysPublished} 天${card.daysPublished > 7 ? ' · 数据可能过期' : ''}
      </span>
      <button type="button" class="button button-secondary" data-entry-card="${card.id}">
        补数据
      </button>
    </article>
  `).join('');
}

function topMarkup() {
  const top = state.review?.top || [];
  if (!top.length) return '<div class="review-empty compact">本周期暂无表现数据</div>';
  return top.map((record, index) => `
    <button class="review-rank-row" type="button" data-entry-card="${record.contentCardId}">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <i style="--account-color:${record.accountColor}" aria-hidden="true"></i>
      <span>
        <strong>${escapeHtml(record.title)}</strong>
        <small>${escapeHtml(record.accountName)} · ${PLATFORM_LABELS[record.platform]}</small>
      </span>
      <b>${formatNumber(record.plays)}</b>
    </button>
  `).join('');
}

function anomalyMarkup() {
  const anomalies = state.review?.anomalies || [];
  if (!anomalies.length) {
    return `
      <div class="review-empty compact">
        当前没有达到 2 倍或 50% 阈值的异常内容
      </div>
    `;
  }
  return anomalies.map((record) => {
    const hit = record.anomaly === 'hit';
    const ratio = record.anomalyRatio || 0;
    return `
      <button class="review-anomaly-row ${hit ? 'hit' : 'low'}" type="button"
        data-entry-card="${record.contentCardId}">
        <span class="anomaly-label">${hit ? '爆款' : '低于均值'}</span>
        <span>
          <strong>${escapeHtml(record.title)}</strong>
          <small>${PLATFORM_LABELS[record.platform]} · 账号基线 ${formatNumber(record.baselinePlays)}</small>
        </span>
        <b>${hit ? `${ratio.toFixed(1)} 倍` : `${Math.round(ratio * 100)}%`}</b>
      </button>
    `;
  }).join('');
}

function tableMarkup() {
  const records = state.review?.records || [];
  if (!records.length) {
    return `
      <tr>
        <td colspan="10">
          <div class="review-empty">
            <strong>本周期暂无已录入的表现数据</strong>
            <span>可切换周期或从待补清单录入第一条数据。</span>
          </div>
        </td>
      </tr>
    `;
  }
  return records.map((record) => `
    <tr>
      <td>
        <button type="button" class="review-table-title"
          data-entry-card="${record.contentCardId}">
          ${escapeHtml(record.title)}
        </button>
        <small>${escapeHtml(record.accountName)}</small>
      </td>
      <td><span class="platform-chip">${PLATFORM_LABELS[record.platform]}</span></td>
      <td>${formatDate(record.recordDate)}</td>
      <td>${formatNumber(record.plays)}</td>
      <td>${formatNumber(record.likes)}</td>
      <td>${formatNumber(record.comments)}</td>
      <td>${formatNumber(record.bookmarks)}</td>
      <td>${formatRate(record.engagementRate)}</td>
      <td>${formatNumber(record.followersGained)}</td>
      <td>${formatNumber(record.leads)}</td>
    </tr>
  `).join('');
}

function renderReviewData() {
  document.getElementById('reviewMetrics').innerHTML = summaryMarkup();
  document.getElementById('reviewPendingCount').textContent = state.pending.length;
  document.getElementById('reviewPendingList').innerHTML = pendingMarkup();
  document.getElementById('reviewTopList').innerHTML = topMarkup();
  document.getElementById('reviewAnomalyList').innerHTML = anomalyMarkup();
  document.getElementById('reviewTableBody').innerHTML = tableMarkup();
  document.getElementById('reviewRecordCount').textContent =
    `${state.review?.records?.length || 0} 条平台记录`;
  bindEntryButtons();
}

function renderConclusion() {
  const form = document.getElementById('reviewConclusionForm');
  if (!form) return;
  const value = state.conclusion || {};
  form.elements.effectiveTitles.value = value.effectiveTitles || '';
  form.elements.effectiveOpenings.value = value.effectiveOpenings || '';
  form.elements.effectiveCtas.value = value.effectiveCtas || '';
  form.elements.abandonTopics.value = value.abandonTopics || '';
  form.elements.nextActions.value = value.nextActions || '';
  document.getElementById('reviewConclusionState').textContent = value.id
    ? `已保存 · ${new Date(value.updatedAt).toLocaleString('zh-CN')}`
    : '本周期尚未写复盘结论';
}

async function loadReview() {
  const container = document.getElementById('reviewContent');
  container?.classList.add('loading');
  renderFilters();
  const params = new URLSearchParams({
    periodType: state.periodType,
    start: state.start
  });
  if (state.accountId !== 'all') params.set('accountId', state.accountId);
  if (state.platform !== 'all') params.set('platform', state.platform);

  try {
    const [review, pending, conclusion] = await Promise.all([
      api(`/performance/review?${params}`),
      api('/performance/pending'),
      api(`/review-conclusions?periodType=${state.periodType}&start=${state.start}`)
    ]);
    state.review = review;
    state.pending = pending;
    state.conclusion = conclusion;
    renderReviewData();
    renderConclusion();
  } catch (error) {
    document.getElementById('reviewTableBody').innerHTML = `
      <tr><td colspan="10">
        <div class="review-empty error-state">
          <strong>数据复盘加载失败</strong>
          <span>${escapeHtml(error.message)}</span>
          <button class="button button-secondary" type="button" id="retryReview">重新加载</button>
        </div>
      </td></tr>
    `;
    document.getElementById('retryReview')?.addEventListener('click', loadReview);
  } finally {
    container?.classList.remove('loading');
  }
}

function platformEntry(platform, records, card) {
  const latest = records
    .filter((record) => record.platform === platform)
    .sort((left, right) => right.recordDate.localeCompare(left.recordDate))[0];
  const enabled = Boolean(latest) || card.primaryPlatform === platform;
  return `
    <fieldset class="performance-platform" data-entry-platform="${platform}">
      <div class="performance-platform-head">
        <label class="platform-enable">
          <input type="checkbox" name="${platform}-enabled" ${enabled ? 'checked' : ''}>
          <span>${PLATFORM_LABELS[platform]}</span>
        </label>
        <span data-platform-rate="${platform}">
          互动率 ${formatRate(latest?.engagementRate)}
        </span>
      </div>
      <div class="performance-entry-grid">
        ${METRIC_FIELDS.map(([field, label]) => `
          <label>
            <span>${label}</span>
            <input type="number" min="0" step="1" inputmode="numeric"
              name="${platform}-${field}" value="${latest?.[field] ?? ''}" placeholder="0">
          </label>
        `).join('')}
        <label>
          <span>数据采集日期</span>
          <input type="date" name="${platform}-recordDate"
            value="${latest?.recordDate || localIsoDate()}">
        </label>
      </div>
    </fieldset>
  `;
}

async function openEntry(cardId) {
  const card = cardById(cardId);
  if (!card) {
    toast('未找到对应的内容卡片', 'danger');
    return;
  }
  state.entryCardId = cardId;
  let records = [];
  try {
    records = await api(`/performance?contentCardId=${encodeURIComponent(cardId)}`);
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div class="drawer-layer review-entry-layer" id="reviewEntryLayer">
      <button class="drawer-scrim" type="button" data-close-entry aria-label="关闭数据录入"></button>
      <aside class="drawer review-entry-drawer" role="dialog" aria-modal="true"
        aria-labelledby="reviewEntryTitle">
        <header class="drawer-header">
          <div>
            <p class="eyebrow">PERFORMANCE / ENTRY</p>
            <h2 id="reviewEntryTitle">${escapeHtml(card.title)}</h2>
            <span class="entry-account" style="--account-color:${card.account.color}">
              <i aria-hidden="true"></i>${escapeHtml(card.account.name)}
            </span>
          </div>
          <button class="icon-button" type="button" data-close-entry aria-label="关闭">×</button>
        </header>
        <form id="performanceEntryForm" novalidate>
          <div class="drawer-body">
            <p class="entry-help">勾选本次要保存的平台。每个平台可使用独立采集日期，同日数据会更新原记录。</p>
            <div class="performance-platforms">
              ${Object.keys(PLATFORM_LABELS).map(
                (platform) => platformEntry(platform, records, card)
              ).join('')}
            </div>
          </div>
          <footer class="drawer-footer">
            <button class="button button-secondary" type="submit" data-entry-action="reviewed">
              保存并标记已复盘
            </button>
            <button class="button button-primary" type="submit" data-entry-action="save">
              保存数据
            </button>
          </footer>
        </form>
      </aside>
    </div>
  `);

  const layer = document.getElementById('reviewEntryLayer');
  layer.querySelectorAll('[data-close-entry]').forEach((button) => {
    button.addEventListener('click', closeEntry);
  });
  layer.querySelectorAll('.performance-platform input').forEach((input) => {
    input.addEventListener('input', updateEntryRates);
  });
  layer.querySelector('form').addEventListener('submit', savePerformance);
  document.body.style.overflow = 'hidden';
  setTimeout(() => layer.querySelector('input[type="checkbox"]:checked')?.focus(), 30);
}

function closeEntry() {
  document.getElementById('reviewEntryLayer')?.remove();
  document.body.style.overflow = '';
  state.entryCardId = null;
  if (queryCardId()) {
    history.replaceState(null, '', '#/review');
  }
}

function updateEntryRates() {
  const form = document.getElementById('performanceEntryForm');
  if (!form) return;
  for (const platform of Object.keys(PLATFORM_LABELS)) {
    const value = (field) => Number(form.elements[`${platform}-${field}`].value || 0);
    const plays = value('plays');
    const interactions = value('likes') + value('comments') +
      value('bookmarks') + value('shares');
    form.querySelector(`[data-platform-rate="${platform}"]`).textContent =
      `互动率 ${plays ? `${((interactions / plays) * 100).toFixed(2)}%` : '—'}`;
  }
}

function collectPerformance(form) {
  return Object.keys(PLATFORM_LABELS)
    .filter((platform) => form.elements[`${platform}-enabled`].checked)
    .map((platform) => {
      const record = {
        platform,
        recordDate: form.elements[`${platform}-recordDate`].value
      };
      for (const [field] of METRIC_FIELDS) {
        const raw = form.elements[`${platform}-${field}`].value;
        record[field] = raw === '' ? null : Number(raw);
      }
      return record;
    });
}

async function savePerformance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const action = event.submitter?.dataset.entryAction || 'save';
  const records = collectPerformance(form);
  if (!records.length) {
    toast('请至少勾选一个要保存的平台', 'danger');
    return;
  }
  const buttons = form.querySelectorAll('[type="submit"]');
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await api('/performance', {
      method: 'POST',
      body: JSON.stringify({ contentCardId: state.entryCardId, records })
    });
    if (action === 'reviewed') {
      await api(`/content-cards/${state.entryCardId}/reviewed`, {
        method: 'POST',
        body: '{}'
      });
    }
    closeEntry();
    await refreshCards();
    await loadReview();
    toast(action === 'reviewed' ? '数据已保存，内容已标记为已复盘' : '表现数据已保存', 'success');
  } catch (error) {
    const details = error instanceof ApiError && error.details
      ? Object.values(error.details)[0]
      : '';
    toast(details || error.message, 'danger');
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function saveConclusion(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const data = new FormData(form);
  submit.disabled = true;
  submit.textContent = '保存中…';
  try {
    const result = await api('/review-conclusions', {
      method: 'POST',
      body: JSON.stringify({
        periodType: state.periodType,
        periodStart: state.start,
        periodEnd: periodEnd(state.periodType, state.start),
        effectiveTitles: data.get('effectiveTitles'),
        effectiveOpenings: data.get('effectiveOpenings'),
        effectiveCtas: data.get('effectiveCtas'),
        abandonTopics: data.get('abandonTopics'),
        nextActions: data.get('nextActions'),
        depositToKnowledge: data.get('depositToKnowledge') === 'on'
      })
    });
    state.conclusion = result.conclusion || result;
    renderConclusion();
    toast(
      result.knowledgeDraft
        ? '复盘已保存，并生成一条待整理知识草稿'
        : '本周期复盘结论已保存',
      'success'
    );
  } catch (error) {
    toast(error.message, 'danger');
  } finally {
    submit.disabled = false;
    submit.textContent = '保存复盘结论';
  }
}

function bindEntryButtons() {
  document.querySelectorAll('[data-entry-card]').forEach((button) => {
    button.addEventListener('click', () => openEntry(button.dataset.entryCard));
  });
}

function bindPage() {
  document.querySelectorAll('[data-review-period]').forEach((button) => {
    button.addEventListener('click', async () => {
      const nextType = button.dataset.reviewPeriod;
      if (nextType === state.periodType) return;
      state.periodType = nextType;
      state.start = currentPeriodStart(nextType);
      await loadReview();
    });
  });
  document.getElementById('previousReviewPeriod').addEventListener('click', async () => {
    shiftPeriod(-1);
    await loadReview();
  });
  document.getElementById('nextReviewPeriod').addEventListener('click', async () => {
    shiftPeriod(1);
    await loadReview();
  });
  document.getElementById('reviewAccountFilter').addEventListener('change', async (event) => {
    state.accountId = event.target.value;
    await loadReview();
  });
  document.getElementById('reviewPlatformFilter').addEventListener('change', async (event) => {
    state.platform = event.target.value;
    await loadReview();
  });
  document.getElementById('openPerformanceEntry').addEventListener('click', () => {
    const first = state.pending[0] || state.cards.find(
      (card) => ['published', 'reviewed'].includes(card.status)
    );
    if (first) openEntry(first.id);
    else toast('目前没有可录入数据的已发布内容');
  });
  document.getElementById('reviewConclusionForm').addEventListener('submit', saveConclusion);
  if (!escapeListenerBound) {
    document.addEventListener('keydown', handleEscape);
    escapeListenerBound = true;
  }
}

function handleEscape(event) {
  if (event.key === 'Escape') closeEntry();
}

async function refreshCards() {
  state.cards = (await api('/content-cards')).filter(
    (card) => ['published', 'reviewed'].includes(card.status)
  );
}

export async function renderDataReviewPage(root) {
  state.periodType = 'week';
  state.start = currentPeriodStart('week');
  state.accountId = 'all';
  state.platform = 'all';
  state.review = null;
  state.pending = [];
  state.conclusion = null;

  root.innerHTML = `
    <section class="page data-review-page" id="reviewContent">
      <header class="page-header review-page-header">
        <div>
          <p class="eyebrow">PERFORMANCE REVIEW / 04</p>
          <h1>数据复盘</h1>
          <p class="lead">集中回收三平台表现数据，识别有效内容，并把已发布内容推进到复盘闭环。</p>
        </div>
        <button class="button button-primary" type="button" id="openPerformanceEntry">
          <span aria-hidden="true">＋</span> 录入表现数据
        </button>
      </header>

      <section class="review-toolbar" aria-label="复盘筛选">
        <div class="segmented-control">
          <button type="button" class="on" data-review-period="week">周</button>
          <button type="button" data-review-period="month">月</button>
        </div>
        <div class="period-stepper">
          <button type="button" id="previousReviewPeriod" aria-label="上一个周期">‹</button>
          <strong id="reviewPeriodLabel"></strong>
          <button type="button" id="nextReviewPeriod" aria-label="下一个周期">›</button>
        </div>
        <label>
          <span class="visually-hidden">账号筛选</span>
          <select id="reviewAccountFilter"><option>全部账号</option></select>
        </label>
        <label>
          <span class="visually-hidden">平台筛选</span>
          <select id="reviewPlatformFilter">
            <option value="all">全部平台</option>
            ${Object.entries(PLATFORM_LABELS).map(([value, label]) =>
              `<option value="${value}">${label}</option>`
            ).join('')}
          </select>
        </label>
      </section>

      <section class="review-metrics" id="reviewMetrics" aria-label="周期摘要">
        ${Array.from({ length: 6 }, () => '<article class="review-metric skeleton"></article>').join('')}
      </section>

      <section class="review-section pending-review-section">
        <div class="review-section-heading">
          <div>
            <p class="eyebrow">DATA HYGIENE</p>
            <h2>待补数据 <span id="reviewPendingCount">0</span></h2>
          </div>
          <span>仅显示已发布且没有任何表现记录的内容</span>
        </div>
        <div class="pending-review-list" id="reviewPendingList"></div>
      </section>

      <section class="review-insights">
        <div class="review-insight-panel">
          <div class="review-section-heading">
            <div>
              <p class="eyebrow">TOP CONTENT</p>
              <h2>播放 Top 3</h2>
            </div>
            <span>按当前筛选排序</span>
          </div>
          <div id="reviewTopList"></div>
        </div>
        <div class="review-insight-panel">
          <div class="review-section-heading">
            <div>
              <p class="eyebrow">SIGNALS</p>
              <h2>异常标记</h2>
            </div>
            <span>最近 10 条账号均值</span>
          </div>
          <div id="reviewAnomalyList"></div>
        </div>
      </section>

      <section class="review-section review-table-section">
        <div class="review-section-heading">
          <div>
            <p class="eyebrow">PERFORMANCE DETAILS</p>
            <h2>数据明细</h2>
          </div>
          <span id="reviewRecordCount">0 条平台记录</span>
        </div>
        <div class="review-table-scroll">
          <table class="review-table">
            <thead>
              <tr>
                <th>内容</th><th>平台</th><th>采集日</th><th>播放</th><th>点赞</th>
                <th>评论</th><th>收藏</th><th>互动率</th><th>涨粉</th><th>咨询</th>
              </tr>
            </thead>
            <tbody id="reviewTableBody">
              <tr><td colspan="10"><div class="loading-state">正在读取表现数据…</div></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="review-conclusion">
        <div class="review-section-heading">
          <div>
            <p class="eyebrow">PERIOD CONCLUSION</p>
            <h2>复盘结论</h2>
          </div>
          <span id="reviewConclusionState">本周期尚未写复盘结论</span>
        </div>
        <form id="reviewConclusionForm">
          <div class="conclusion-grid">
            <label>
              <span>有效标题模式</span>
              <textarea name="effectiveTitles" rows="3" placeholder="哪些标题带来了更好的点击？"></textarea>
            </label>
            <label>
              <span>有效开头模式</span>
              <textarea name="effectiveOpenings" rows="3" placeholder="哪些开头带来了高互动？"></textarea>
            </label>
            <label>
              <span>有效 CTA 模式</span>
              <textarea name="effectiveCtas" rows="3" placeholder="哪些动作带来了收藏或咨询？"></textarea>
            </label>
            <label>
              <span>可放弃选题类型</span>
              <textarea name="abandonTopics" rows="3" placeholder="哪些方向持续表现不佳？"></textarea>
            </label>
            <label class="conclusion-actions-field">
              <span>下一周期改进方向</span>
              <textarea name="nextActions" rows="4" placeholder="写下 1-3 条下一周期动作"></textarea>
            </label>
          </div>
          <footer>
            <label class="review-deposit-toggle">
              <input type="checkbox" name="depositToKnowledge">
              <span>同时沉淀为知识资产草稿</span>
            </label>
            <button class="button button-primary" type="submit">保存复盘结论</button>
          </footer>
        </form>
      </section>
    </section>
  `;

  bindPage();
  try {
    const [accounts] = await Promise.all([
      store.accounts.length ? Promise.resolve(store.accounts) : api('/owned-accounts'),
      refreshCards()
    ]);
    store.set('accounts', accounts);
    renderFilters();
    await loadReview();
    const requestedCard = queryCardId();
    if (requestedCard) await openEntry(requestedCard);
  } catch (error) {
    toast(error.message, 'danger');
  }
}
