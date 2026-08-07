import { api, ApiError } from '../api.js';
import { store } from '../store.js';
import { toast } from '../components/toast.js';

const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  shipinhao: '视频号'
};
const STATUS_LABELS = {
  active: '运营中',
  preparing: '筹备中',
  paused: '已停用'
};
const PUBLISH_LABELS = {
  active: '发布中',
  paused: '暂停发布',
  unconfigured: '未配置'
};
const COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4',
  '#3B82F6', '#8B5CF6', '#EC4899', '#78716C'
];

const state = {
  filter: 'all',
  query: '',
  editing: null
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function accountMatches(account) {
  const statusMatch = state.filter === 'all' || account.status === state.filter;
  const haystack = `${account.name} ${account.direction} ${account.positioning}`.toLowerCase();
  return statusMatch && (!state.query || haystack.includes(state.query.toLowerCase()));
}

function latestPublish(account) {
  const dates = account.platforms
    .map((platform) => platform.lastPublished)
    .filter(Boolean)
    .sort()
    .reverse();
  return dates[0] || '';
}

function daysSince(date) {
  if (!date) return '尚未发布';
  const diff = Math.floor((Date.now() - new Date(`${date}T12:00:00+08:00`)) / 86400000);
  if (diff <= 0) return '今天发布';
  if (diff === 1) return '昨天发布';
  return `${diff} 天前发布`;
}

function accountCard(account) {
  const configured = account.platforms.filter(
    (platform) => platform.publishStatus !== 'unconfigured'
  ).length;

  return `
    <button class="account-card" type="button" data-account-id="${account.id}"
      style="--account-color:${account.color}"
      aria-label="编辑账号：${escapeHtml(account.name)}">
      <span class="account-card-top">
        <span class="account-identity">
          <i class="account-dot" aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(account.name)}</strong>
            <small>${escapeHtml(account.direction)}</small>
          </span>
        </span>
        <span class="status-pill ${account.status}">${STATUS_LABELS[account.status]}</span>
      </span>
      <span class="account-positioning">${escapeHtml(account.positioning || '暂未填写账号定位。')}</span>
      <span class="platform-list">
        ${account.platforms.map((platform) => `
          <span class="platform-row">
            <b>${PLATFORM_LABELS[platform.platform]}</b>
            <span>${escapeHtml(platform.username || PUBLISH_LABELS[platform.publishStatus])}</span>
            <i class="${platform.publishStatus}" title="${PUBLISH_LABELS[platform.publishStatus]}"></i>
          </span>
        `).join('')}
      </span>
      <span class="account-card-foot">
        <span><b>${configured}/3</b> 平台已配置</span>
        <span>${daysSince(latestPublish(account))}</span>
      </span>
    </button>
  `;
}

function renderSummary(accounts) {
  const active = accounts.filter((account) => account.status === 'active').length;
  const preparing = accounts.filter((account) => account.status === 'preparing').length;
  const configured = accounts.reduce(
    (count, account) => count + account.platforms.filter(
      (platform) => platform.publishStatus !== 'unconfigured'
    ).length,
    0
  );
  const possible = accounts.length * 3;
  const coverage = possible ? Math.round((configured / possible) * 100) : 0;

  return `
    <div class="summary-grid">
      <article class="summary-primary">
        <p>账号覆盖</p>
        <strong>${accounts.length}<small> 个方向</small></strong>
        <span>${active} 个运营中 · ${preparing} 个筹备中</span>
      </article>
      <article class="summary-cell">
        <p>平台配置完成率</p>
        <strong>${coverage}%</strong>
        <div class="coverage-track"><i style="width:${coverage}%"></i></div>
        <span>${configured} / ${possible} 个平台已配置</span>
      </article>
      <article class="summary-cell">
        <p>当前数据源</p>
        <strong>SQLite</strong>
        <span>所有修改实时写入本地数据库</span>
      </article>
    </div>
  `;
}

function formPlatform(platform, value = {}) {
  return `
    <fieldset class="platform-editor" data-platform="${platform}">
      <div class="platform-editor-head">
        <legend>${PLATFORM_LABELS[platform]}</legend>
        <select name="${platform}-publishStatus" aria-label="${PLATFORM_LABELS[platform]}发布状态">
          ${Object.entries(PUBLISH_LABELS).map(([key, label]) => `
            <option value="${key}" ${value.publishStatus === key ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </div>
      <label>
        <span>平台用户名</span>
        <input name="${platform}-username" value="${escapeHtml(value.username)}" placeholder="未填写">
      </label>
      <label>
        <span>主页链接</span>
        <input name="${platform}-profileUrl" type="url" value="${escapeHtml(value.profileUrl)}" placeholder="https://">
        <small class="field-error" data-error="platforms.${platform}.profileUrl"></small>
      </label>
    </fieldset>
  `;
}

function openEditor(account = null) {
  state.editing = account?.id || null;
  const platforms = new Map((account?.platforms || []).map((item) => [item.platform, item]));
  const color = account?.color || COLORS[store.accounts.length % COLORS.length];

  document.body.insertAdjacentHTML('beforeend', `
    <div class="drawer-layer" id="accountEditorLayer">
      <button class="drawer-scrim" type="button" data-close-editor aria-label="关闭编辑面板"></button>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="editorTitle">
        <header class="drawer-header">
          <div>
            <p class="eyebrow">${account ? 'ACCOUNT / EDIT' : 'ACCOUNT / NEW'}</p>
            <h2 id="editorTitle">${account ? '编辑账号' : '添加账号'}</h2>
          </div>
          <button class="icon-button" type="button" data-close-editor aria-label="关闭">×</button>
        </header>
        <form id="accountForm" novalidate>
          <div class="drawer-body">
            <section class="form-section">
              <h3>基础信息</h3>
              <div class="form-grid">
                <label class="field-wide">
                  <span>账号名称 *</span>
                  <input name="name" value="${escapeHtml(account?.name)}" autocomplete="off">
                  <small class="field-error" data-error="name"></small>
                </label>
                <label>
                  <span>内容方向 *</span>
                  <input name="direction" value="${escapeHtml(account?.direction)}">
                  <small class="field-error" data-error="direction"></small>
                </label>
                <label>
                  <span>运营状态</span>
                  <select name="status">
                    ${Object.entries(STATUS_LABELS).map(([key, label]) => `
                      <option value="${key}" ${account?.status === key ? 'selected' : ''}>${label}</option>
                    `).join('')}
                  </select>
                </label>
                <label class="field-wide">
                  <span>账号定位</span>
                  <textarea name="positioning" rows="3">${escapeHtml(account?.positioning)}</textarea>
                </label>
                <label>
                  <span>目标受众</span>
                  <input name="targetAudience" value="${escapeHtml(account?.targetAudience)}">
                </label>
                <label>
                  <span>常用 CTA</span>
                  <input name="cta" value="${escapeHtml(account?.cta)}">
                </label>
              </div>
              <div class="color-field">
                <span>账号识别色</span>
                <div class="color-options">
                  ${COLORS.map((item) => `
                    <label title="${item}">
                      <input type="radio" name="color" value="${item}" ${item === color ? 'checked' : ''}>
                      <i style="--swatch:${item}"></i>
                    </label>
                  `).join('')}
                </div>
              </div>
            </section>
            <section class="form-section">
              <h3>三平台信息</h3>
              <div class="platform-editors">
                ${Object.keys(PLATFORM_LABELS).map(
                  (platform) => formPlatform(platform, platforms.get(platform))
                ).join('')}
              </div>
            </section>
          </div>
          <footer class="drawer-footer">
            ${account ? '<button class="button button-danger" type="button" id="deleteAccount">删除账号</button>' : '<span></span>'}
            <div>
              <button class="button button-secondary" type="button" data-close-editor>取消</button>
              <button class="button button-primary" type="submit">保存账号</button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  `);

  const layer = document.getElementById('accountEditorLayer');
  const form = document.getElementById('accountForm');
  layer.querySelectorAll('[data-close-editor]').forEach((button) => {
    button.addEventListener('click', closeEditor);
  });
  form.addEventListener('submit', saveAccount);
  layer.querySelector('#deleteAccount')?.addEventListener('click', deleteAccount);
  setTimeout(() => form.elements.name.focus(), 30);
}

function closeEditor() {
  document.getElementById('accountEditorLayer')?.remove();
  state.editing = null;
}

function collectForm(form) {
  const data = new FormData(form);
  return {
    name: data.get('name'),
    direction: data.get('direction'),
    status: data.get('status'),
    color: data.get('color'),
    positioning: data.get('positioning'),
    targetAudience: data.get('targetAudience'),
    cta: data.get('cta'),
    platforms: Object.keys(PLATFORM_LABELS).map((platform) => ({
      platform,
      username: data.get(`${platform}-username`),
      profileUrl: data.get(`${platform}-profileUrl`),
      publishStatus: data.get(`${platform}-publishStatus`)
    }))
  };
}

function showErrors(form, details = {}) {
  form.querySelectorAll('.field-error').forEach((element) => {
    element.textContent = details[element.dataset.error] || '';
  });
}

async function saveAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  showErrors(form);
  submit.disabled = true;
  submit.textContent = '保存中…';

  try {
    const wasEditing = Boolean(state.editing);
    const payload = collectForm(form);
    const saved = state.editing
      ? await api(`/owned-accounts/${state.editing}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
      : await api('/owned-accounts', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
    await loadAccounts();
    closeEditor();
    toast(wasEditing ? '账号信息已更新' : `已创建「${saved.name}」`, 'success');
  } catch (error) {
    if (error instanceof ApiError && error.details) {
      showErrors(form, error.details);
    }
    toast(error.message, 'danger');
  } finally {
    submit.disabled = false;
    submit.textContent = '保存账号';
  }
}

async function deleteAccount() {
  const account = store.accounts.find((item) => item.id === state.editing);
  if (!account || !confirm(`确定删除「${account.name}」？该操作会进行软删除。`)) return;

  try {
    await api(`/owned-accounts/${account.id}`, { method: 'DELETE' });
    await loadAccounts();
    closeEditor();
    toast('账号已删除', 'success');
  } catch (error) {
    toast(error.message, 'danger');
  }
}

function bindPage() {
  document.getElementById('addAccount').addEventListener('click', () => openEditor());
  document.getElementById('accountSearch').addEventListener('input', (event) => {
    state.query = event.target.value.trim();
    renderAccountsGrid();
  });
  document.querySelectorAll('[data-account-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.accountFilter;
      document.querySelectorAll('[data-account-filter]').forEach((item) => {
        item.classList.toggle('on', item === button);
      });
      renderAccountsGrid();
    });
  });
}

function renderAccountsGrid() {
  const grid = document.getElementById('accountGrid');
  if (!grid) return;
  const accounts = store.accounts.filter(accountMatches);
  document.getElementById('visibleAccountCount').textContent = `${accounts.length} 个账号`;
  grid.innerHTML = accounts.length
    ? accounts.map(accountCard).join('')
    : `
      <div class="empty-state">
        <strong>没有匹配的账号</strong>
        <p>调整搜索词或状态筛选，查看其他账号。</p>
      </div>
    `;
  grid.querySelectorAll('[data-account-id]').forEach((button) => {
    button.addEventListener('click', () => {
      openEditor(store.accounts.find((account) => account.id === button.dataset.accountId));
    });
  });
}

async function loadAccounts() {
  const accounts = await api('/owned-accounts');
  store.set('accounts', accounts);
  const summary = document.getElementById('accountSummary');
  if (summary) summary.innerHTML = renderSummary(accounts);
  renderAccountsGrid();
}

export async function renderAccountsPage(root) {
  root.innerHTML = `
    <section class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">ACCOUNT MATRIX / 05</p>
          <h1>账号矩阵</h1>
          <p class="lead">维护自有账号和平台配置，为内容计划、日历和数据复盘提供统一数据源。</p>
        </div>
        <button class="button button-primary" type="button" id="addAccount">
          <span aria-hidden="true">＋</span> 添加账号
        </button>
      </header>

      <section id="accountSummary" aria-label="账号概览">
        <div class="summary-grid skeleton-summary"></div>
      </section>

      <section class="list-section">
        <div class="section-toolbar">
          <div>
            <p class="eyebrow">OWNED ACCOUNTS</p>
            <h2>自有账号</h2>
          </div>
          <div class="toolbar-actions">
            <label class="search-field">
              <span class="visually-hidden">搜索账号</span>
              <input id="accountSearch" type="search" placeholder="搜索名称、方向或定位">
            </label>
            <div class="segmented-control" aria-label="账号状态筛选">
              <button type="button" class="on" data-account-filter="all">全部</button>
              <button type="button" data-account-filter="active">运营中</button>
              <button type="button" data-account-filter="preparing">筹备中</button>
              <button type="button" data-account-filter="paused">已停用</button>
            </div>
          </div>
        </div>
        <div class="list-meta">
          <span id="visibleAccountCount">正在加载…</span>
          <span>点击账号卡片编辑详情</span>
        </div>
        <div class="account-grid" id="accountGrid" aria-live="polite">
          <div class="loading-state">正在从 SQLite 读取账号数据…</div>
        </div>
      </section>
    </section>
  `;

  bindPage();

  try {
    await loadAccounts();
  } catch (error) {
    document.getElementById('accountGrid').innerHTML = `
      <div class="empty-state error-state">
        <strong>账号数据加载失败</strong>
        <p>${escapeHtml(error.message)}</p>
        <button class="button button-secondary" id="retryAccounts" type="button">重新加载</button>
      </div>
    `;
    document.getElementById('retryAccounts').addEventListener('click', loadAccounts);
  }
}
