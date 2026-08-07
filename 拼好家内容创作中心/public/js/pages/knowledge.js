import { marked } from '../vendor/marked.esm.js';
import { api, ApiError } from '../api.js';
import { toast } from '../components/toast.js';

const CATEGORIES = {
  brand_guide: '品牌手册',
  script_template: '脚本模板',
  sop: 'SOP',
  review_method: '复盘方法'
};
const STATUSES = {
  active: '正式',
  draft: '草稿',
  archived: '归档'
};

const state = {
  items: [],
  summary: {},
  query: '',
  category: '',
  status: 'active',
  sort: 'updated',
  current: null,
  editing: false,
  dirty: false,
  returnFocus: null,
  searchTimer: null
};
let escapeBound = false;

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
      if (name.startsWith('on') || name === 'srcdoc') {
        element.removeAttribute(attribute.name);
      }
      if (
        (name === 'href' || name === 'src') &&
        /^(javascript:|data:)/.test(value)
      ) {
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

function formatDate(value) {
  if (!value) return '尚未更新';
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function readQuery() {
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  state.query = query.get('q') || '';
  state.category = CATEGORIES[query.get('category')] ? query.get('category') : '';
  state.status = STATUSES[query.get('status')] ? query.get('status') : 'active';
  state.sort = ['updated', 'created', 'title'].includes(query.get('sort'))
    ? query.get('sort')
    : 'updated';
}

function writeQuery() {
  const query = new URLSearchParams();
  if (state.query) query.set('q', state.query);
  if (state.category) query.set('category', state.category);
  if (state.status !== 'active') query.set('status', state.status);
  if (state.sort !== 'updated') query.set('sort', state.sort);
  history.replaceState(null, '', `#/knowledge${query.size ? `?${query}` : ''}`);
}

function categoryPill(asset) {
  return `
    <span class="knowledge-category" data-category="${asset.category}">
      ${CATEGORIES[asset.category] || '其他'}
    </span>
  `;
}

function summaryMarkup() {
  const summary = state.summary;
  return [
    ['正式资产', summary.active || 0, '可被内容计划复用'],
    ['待整理', summary.draft || 0, '来自复盘或手动草稿'],
    ['本月更新', summary.updatedThisMonth || 0, '新增或修订的资产'],
    ['本月被引用', summary.usageThisMonth || 0, '引用统计将在内容计划接入']
  ].map(([label, value, copy]) => `
    <article>
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${copy}</small>
    </article>
  `).join('');
}

function draftMarkup() {
  const drafts = state.items.filter((asset) => asset.status === 'draft');
  const section = document.getElementById('knowledgeDrafts');
  if (!section) return;
  section.hidden = drafts.length === 0;
  if (!drafts.length) return;
  document.getElementById('knowledgeDraftCount').textContent = `${drafts.length} 条待整理`;
  document.getElementById('knowledgeDraftList').innerHTML = drafts.map((asset) => `
    <article class="knowledge-draft-row">
      <div class="knowledge-draft-main">
        ${categoryPill(asset)}
        <div>
          <strong>${escapeHtml(asset.title)}</strong>
          <span>${escapeHtml(asset.source.label)} · ${formatDate(asset.updatedAt)}</span>
          <p>${escapeHtml(asset.summary || '这条草稿还没有摘要。')}</p>
        </div>
      </div>
      <div class="knowledge-draft-actions">
        <button class="button button-secondary compact-button" type="button"
          data-edit-asset="${asset.id}">整理并发布</button>
        <button class="knowledge-text-button" type="button"
          data-ignore-asset="${asset.id}">忽略</button>
      </div>
    </article>
  `).join('');
}

function filteredItems() {
  return state.items.filter((asset) => asset.status === state.status);
}

function assetGridMarkup() {
  const items = filteredItems();
  const label = document.getElementById('knowledgeResultCount');
  if (label) label.textContent = `${items.length} 个${STATUSES[state.status]}资产`;
  if (!items.length) {
    const hasFilters = Boolean(state.query || state.category);
    return `
      <div class="empty-state knowledge-empty">
        <strong>${hasFilters ? '没有匹配的资产' : `还没有${STATUSES[state.status]}资产`}</strong>
        <p>${hasFilters ? '换个关键词或分类再试试。' : '新建一份方法文档，开始积累可复用经验。'}</p>
        <button class="button button-secondary" type="button"
          data-empty-action="${hasFilters ? 'clear' : 'new'}">
          ${hasFilters ? '清除筛选' : '新建第一份资产'}
        </button>
      </div>
    `;
  }
  return items.map((asset) => `
    <button class="knowledge-card" type="button" data-open-asset="${asset.id}">
      <span class="knowledge-card-top">
        ${categoryPill(asset)}
        <span>${escapeHtml(asset.source.label)}</span>
      </span>
      <strong>${escapeHtml(asset.title)}</strong>
      <p>${escapeHtml(asset.summary || '暂无摘要，打开查看完整正文。')}</p>
      <span class="knowledge-tags">
        ${asset.tags.slice(0, 3).map((tag) => `<i>${escapeHtml(tag)}</i>`).join('')}
      </span>
      <span class="knowledge-card-foot">
        <span>v${asset.version} · ${formatDate(asset.updatedAt)}</span>
        <b>查看</b>
      </span>
    </button>
  `).join('');
}

function renderData() {
  document.getElementById('knowledgeSummary').innerHTML = summaryMarkup();
  draftMarkup();
  document.getElementById('knowledgeGrid').innerHTML = assetGridMarkup();
  bindDynamicActions();
}

async function loadAssets() {
  const root = document.getElementById('knowledgePage');
  root?.classList.add('loading');
  try {
    const query = new URLSearchParams({
      status: 'all',
      sort: state.sort
    });
    if (state.query) query.set('q', state.query);
    if (state.category) query.set('category', state.category);
    const result = await api(`/knowledge-assets?${query}`);
    state.items = result.items;
    state.summary = result.summary;
    renderData();
  } catch (error) {
    document.getElementById('knowledgeGrid').innerHTML = `
      <div class="empty-state error-state">
        <strong>知识资产读取失败</strong>
        <p>${escapeHtml(error.message)}</p>
        <button class="button button-secondary" type="button" id="retryKnowledge">重新加载</button>
      </div>
    `;
    document.getElementById('retryKnowledge')?.addEventListener('click', loadAssets);
  } finally {
    root?.classList.remove('loading');
  }
}

function drawerLayer() {
  return document.getElementById('knowledgeDrawerLayer');
}

function closeDrawer(force = false) {
  if (!force && state.editing && state.dirty && !window.confirm('当前修改尚未保存，确定放弃吗？')) {
    return;
  }
  drawerLayer()?.remove();
  state.current = null;
  state.editing = false;
  state.dirty = false;
  state.returnFocus?.focus?.();
}

function editFormMarkup(asset) {
  return `
    <form class="knowledge-editor" id="knowledgeAssetForm" novalidate>
      <div class="drawer-body">
        <div class="knowledge-form-grid">
          <label class="field-wide">
            <span>资产标题</span>
            <input name="title" maxlength="80" required value="${escapeHtml(asset.title || '')}"
              placeholder="例如：开场钩子五秒公式">
          </label>
          <label>
            <span>分类</span>
            <select name="category">
              ${Object.entries(CATEGORIES).map(([value, label]) => `
                <option value="${value}" ${asset.category === value ? 'selected' : ''}>${label}</option>
              `).join('')}
            </select>
          </label>
          <label>
            <span>状态</span>
            <select name="status">
              <option value="draft" ${asset.status === 'draft' ? 'selected' : ''}>保存为草稿</option>
              <option value="active" ${asset.status === 'active' ? 'selected' : ''}>发布为正式资产</option>
            </select>
          </label>
          <label class="field-wide">
            <span>标签</span>
            <input name="tags" maxlength="260" value="${escapeHtml((asset.tags || []).join('，'))}"
              placeholder="用逗号分隔，例如：开场，抖音，口播">
          </label>
          <label class="field-wide">
            <span>摘要</span>
            <textarea name="summary" rows="3" maxlength="160"
              placeholder="用一句话说明这份资产能解决什么问题">${escapeHtml(asset.summary || '')}</textarea>
          </label>
          <label class="field-wide">
            <span>Markdown 正文</span>
            <textarea class="knowledge-body-input" name="body" required
              placeholder="# 方法标题&#10;&#10;写下步骤、话术、判断标准或检查清单。">${escapeHtml(asset.body || '')}</textarea>
          </label>
          <p class="knowledge-source-note">
            来源：${escapeHtml(asset.source?.label || '手动创建')}
            ${asset.version ? ` · 当前版本 v${asset.version}` : ''}
          </p>
        </div>
      </div>
      <footer class="drawer-footer">
        <span class="knowledge-save-state" id="knowledgeSaveState"></span>
        <div>
          <button class="button button-secondary" type="button" data-cancel-asset>取消</button>
          <button class="button button-primary" type="submit">保存资产</button>
        </div>
      </footer>
    </form>
  `;
}

function readMarkup(asset) {
  return `
    <div class="drawer-body knowledge-reader">
      <div class="knowledge-reader-meta">
        ${categoryPill(asset)}
        <span>${STATUSES[asset.status]} · v${asset.version}</span>
        <span>${escapeHtml(asset.source.label)}</span>
        <span>更新于 ${formatDate(asset.updatedAt)}</span>
      </div>
      ${asset.tags.length ? `
        <div class="knowledge-reader-tags">
          ${asset.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="markdown-body">${renderMarkdown(asset.body)}</div>
    </div>
    <footer class="drawer-footer">
      <div>
        ${asset.status === 'archived'
          ? '<button class="button button-secondary" type="button" data-restore-current>恢复为草稿</button>'
          : '<button class="button button-secondary" type="button" data-archive-current>归档</button>'}
        <button class="button knowledge-delete-button" type="button" data-delete-current>删除</button>
      </div>
      <button class="button button-primary" type="button" data-edit-current>编辑资产</button>
    </footer>
  `;
}

function renderDrawer() {
  const asset = state.current;
  const existing = drawerLayer();
  const layer = existing || document.createElement('div');
  layer.className = 'drawer-layer knowledge-drawer-layer';
  layer.id = 'knowledgeDrawerLayer';
  layer.innerHTML = `
    <button class="drawer-scrim" type="button" data-close-knowledge aria-label="关闭知识资产"></button>
    <aside class="drawer knowledge-drawer" role="dialog" aria-modal="true"
      aria-labelledby="knowledgeDrawerTitle">
      <header class="drawer-header">
        <div>
          <p class="eyebrow">${state.editing ? 'ASSET EDITOR' : 'KNOWLEDGE DOCUMENT'}</p>
          <h2 id="knowledgeDrawerTitle">${escapeHtml(state.editing ? (asset.id ? '编辑资产' : '新建资产') : asset.title)}</h2>
        </div>
        <button class="icon-button" type="button" data-close-knowledge aria-label="关闭">×</button>
      </header>
      ${state.editing ? editFormMarkup(asset) : readMarkup(asset)}
    </aside>
  `;
  if (!existing) document.body.append(layer);
  bindDrawer();
  requestAnimationFrame(() => {
    const target = state.editing
      ? layer.querySelector('[name="title"]')
      : layer.querySelector('[data-edit-current]');
    target?.focus();
  });
}

async function openAsset(id, edit = false) {
  state.returnFocus = document.activeElement;
  try {
    state.current = await api(`/knowledge-assets/${id}`);
    state.editing = edit;
    state.dirty = false;
    renderDrawer();
  } catch (error) {
    toast(error.message, 'danger');
  }
}

function openNewAsset() {
  state.returnFocus = document.activeElement;
  state.current = {
    title: '',
    category: 'script_template',
    summary: '',
    body: '',
    tags: [],
    source: { label: '手动创建' },
    status: 'draft'
  };
  state.editing = true;
  state.dirty = false;
  renderDrawer();
}

async function saveAsset(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const data = new FormData(form);
  const payload = {
    title: data.get('title'),
    category: data.get('category'),
    summary: data.get('summary'),
    body: data.get('body'),
    tags: String(data.get('tags') || '').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    status: data.get('status')
  };
  if (state.current.id) payload.version = state.current.version;
  submit.disabled = true;
  submit.textContent = '保存中...';
  try {
    state.current = await api(
      state.current.id ? `/knowledge-assets/${state.current.id}` : '/knowledge-assets',
      {
        method: state.current.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      }
    );
    state.editing = false;
    state.dirty = false;
    renderDrawer();
    await loadAssets();
    toast(payload.status === 'active' ? '资产已保存并发布' : '资产草稿已保存', 'success');
  } catch (error) {
    const message = error instanceof ApiError && error.details
      ? Object.values(error.details)[0]
      : error.message;
    document.getElementById('knowledgeSaveState').textContent = message;
    toast(message, 'danger');
  } finally {
    submit.disabled = false;
    submit.textContent = '保存资产';
  }
}

async function updateLifecycle(action) {
  const id = state.current?.id;
  if (!id) return;
  try {
    if (action === 'delete') {
      if (!window.confirm(`确定删除“${state.current.title}”吗？历史内容中的引用不会被删除。`)) return;
      await api(`/knowledge-assets/${id}`, { method: 'DELETE' });
      closeDrawer(true);
      toast('资产已删除', 'success');
    } else {
      state.current = await api(`/knowledge-assets/${id}/${action}`, {
        method: 'POST',
        body: '{}'
      });
      renderDrawer();
      toast(action === 'archive' ? '资产已归档' : '资产已恢复为草稿', 'success');
    }
    await loadAssets();
  } catch (error) {
    toast(error.message, 'danger');
  }
}

function bindDrawer() {
  document.querySelectorAll('[data-close-knowledge]').forEach((button) => {
    button.addEventListener('click', () => closeDrawer());
  });
  document.querySelector('[data-cancel-asset]')?.addEventListener('click', () => closeDrawer());
  document.querySelector('[data-edit-current]')?.addEventListener('click', () => {
    state.editing = true;
    state.dirty = false;
    renderDrawer();
  });
  document.querySelector('[data-archive-current]')?.addEventListener('click', () => updateLifecycle('archive'));
  document.querySelector('[data-restore-current]')?.addEventListener('click', () => updateLifecycle('restore'));
  document.querySelector('[data-delete-current]')?.addEventListener('click', () => updateLifecycle('delete'));
  const form = document.getElementById('knowledgeAssetForm');
  form?.addEventListener('submit', saveAsset);
  form?.addEventListener('input', () => { state.dirty = true; });
}

async function exportAssets() {
  const items = filteredItems();
  if (!items.length) {
    toast('当前筛选下没有可导出的资产');
    return;
  }
  const button = document.getElementById('exportKnowledge');
  button.disabled = true;
  try {
    const assets = await Promise.all(items.map((item) => api(`/knowledge-assets/${item.id}`)));
    const blob = new Blob([JSON.stringify(assets, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `拼好家-知识资产-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast(`已导出 ${assets.length} 条资产`, 'success');
  } catch (error) {
    toast(error.message, 'danger');
  } finally {
    button.disabled = false;
  }
}

function bindDynamicActions() {
  document.querySelectorAll('[data-open-asset]').forEach((button) => {
    button.addEventListener('click', () => openAsset(button.dataset.openAsset));
  });
  document.querySelectorAll('[data-edit-asset]').forEach((button) => {
    button.addEventListener('click', () => openAsset(button.dataset.editAsset, true));
  });
  document.querySelectorAll('[data-ignore-asset]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.current = await api(`/knowledge-assets/${button.dataset.ignoreAsset}`);
      await updateLifecycle('archive');
      state.current = null;
    });
  });
  document.querySelector('[data-empty-action="new"]')?.addEventListener('click', openNewAsset);
  document.querySelector('[data-empty-action="clear"]')?.addEventListener('click', () => {
    state.query = '';
    state.category = '';
    document.getElementById('knowledgeSearch').value = '';
    document.getElementById('knowledgeCategory').value = '';
    writeQuery();
    loadAssets();
  });
}

function bindPage() {
  document.getElementById('addKnowledgeAsset').addEventListener('click', openNewAsset);
  document.getElementById('exportKnowledge').addEventListener('click', exportAssets);
  document.getElementById('knowledgeSearch').addEventListener('input', (event) => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.query = event.target.value.trim();
      writeQuery();
      loadAssets();
    }, 240);
  });
  document.getElementById('knowledgeCategory').addEventListener('change', (event) => {
    state.category = event.target.value;
    writeQuery();
    loadAssets();
  });
  document.getElementById('knowledgeStatus').addEventListener('change', (event) => {
    state.status = event.target.value;
    writeQuery();
    renderData();
  });
  document.getElementById('knowledgeSort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    writeQuery();
    loadAssets();
  });
  if (!escapeBound) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drawerLayer()) closeDrawer();
    });
    escapeBound = true;
  }
}

export async function renderKnowledgePage(root) {
  readQuery();
  root.innerHTML = `
    <section class="page knowledge-page" id="knowledgePage">
      <header class="page-header knowledge-page-header">
        <div>
          <p class="eyebrow">METHOD LIBRARY / 06</p>
          <h1>知识资产</h1>
          <p class="lead">把复盘结论和创作经验整理成可搜索、可引用的方法。</p>
        </div>
        <div class="knowledge-page-actions">
          <button class="button button-secondary" type="button" id="exportKnowledge">导出</button>
          <button class="button button-primary" type="button" id="addKnowledgeAsset">
            <span aria-hidden="true">＋</span> 新建资产
          </button>
        </div>
      </header>

      <section class="knowledge-summary" id="knowledgeSummary" aria-label="知识资产概览">
        ${Array.from({ length: 4 }, () => '<article class="skeleton"></article>').join('')}
      </section>

      <section class="knowledge-drafts" id="knowledgeDrafts" hidden>
        <div class="knowledge-section-head">
          <div>
            <p class="eyebrow">DRAFT INBOX</p>
            <h2>待整理</h2>
          </div>
          <span id="knowledgeDraftCount"></span>
        </div>
        <div id="knowledgeDraftList"></div>
      </section>

      <section class="knowledge-library">
        <div class="knowledge-section-head knowledge-library-head">
          <div>
            <p class="eyebrow">ASSET LIBRARY</p>
            <h2>资产库</h2>
          </div>
          <span id="knowledgeResultCount">正在读取...</span>
        </div>
        <div class="knowledge-toolbar">
          <label class="knowledge-search">
            <span class="visually-hidden">搜索资产</span>
            <input id="knowledgeSearch" type="search" value="${escapeHtml(state.query)}"
              placeholder="搜索标题、正文或标签">
          </label>
          <label>
            <span class="visually-hidden">分类</span>
            <select id="knowledgeCategory">
              <option value="">全部分类</option>
              ${Object.entries(CATEGORIES).map(([value, label]) => `
                <option value="${value}" ${state.category === value ? 'selected' : ''}>${label}</option>
              `).join('')}
            </select>
          </label>
          <label>
            <span class="visually-hidden">状态</span>
            <select id="knowledgeStatus">
              ${Object.entries(STATUSES).map(([value, label]) => `
                <option value="${value}" ${state.status === value ? 'selected' : ''}>${label}资产</option>
              `).join('')}
            </select>
          </label>
          <label>
            <span class="visually-hidden">排序</span>
            <select id="knowledgeSort">
              <option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>最近更新</option>
              <option value="created" ${state.sort === 'created' ? 'selected' : ''}>最近创建</option>
              <option value="title" ${state.sort === 'title' ? 'selected' : ''}>标题排序</option>
            </select>
          </label>
        </div>
        <div class="knowledge-grid" id="knowledgeGrid" aria-live="polite">
          <div class="loading-state">正在从 SQLite 读取知识资产...</div>
        </div>
      </section>
    </section>
  `;
  bindPage();
  await loadAssets();
}
