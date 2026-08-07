import { marked } from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/dompurify.es.js';
import { api, ApiError } from '../api.js';
import { store } from '../store.js';
import { toast } from '../components/toast.js';

// 账号在账号矩阵页变更后，即时同步本页筛选，无需手动刷新
store.on('accounts:updated', () => {
  if (!document.getElementById('accountPlanFilters')) return;
  if (
    state.accountId !== 'all' &&
    !store.accounts.some((account) => account.id === state.accountId)
  ) {
    state.accountId = 'all';
  }
  renderAccountFilters();
});

const COLUMNS = [
  ['idea', '选题池', '把模糊想法先放进来'],
  ['scripted', '脚本库', '脚本定稿，等待制作'],
  ['producing', '制作中', '拍摄、剪辑与待发布'],
  ['published', '已发布', '补齐平台记录与数据'],
  ['reviewed', '已复盘', '已完成运营闭环']
];
const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  shipinhao: '视频号'
};
const PROGRESS_LABELS = {
  shooting: '拍摄中',
  editing: '剪辑中',
  ready: '待发布'
};

const state = {
  cards: [],
  accountId: 'all',
  platform: 'all',
  query: '',
  currentId: null,
  activeTab: 'basic',
  documentEditing: false,
  draggedId: null
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

function renderMarkdown(source) {
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(
    marked.parse(String(source || ''), { gfm: true, breaks: true })
  );
  template.content.querySelectorAll('a').forEach((element) => {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  });
  return template.innerHTML;
}

function relativeTime(value) {
  if (!value) return '刚刚';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '昨天' : `${days} 天前`;
}

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function filteredCards() {
  const query = state.query.toLowerCase();
  return state.cards.filter((card) => {
    const accountMatch = state.accountId === 'all' || card.accountId === state.accountId;
    const platformMatch = state.platform === 'all' || card.primaryPlatform === state.platform;
    const textMatch = !query ||
      `${card.title} ${card.category} ${card.account.name}`.toLowerCase().includes(query);
    return accountMatch && platformMatch && textMatch;
  });
}

function cardDocuments(card) {
  const documents = [];
  if (card.scriptBody) documents.push('<span title="已有录制稿">录制稿</span>');
  if (card.publishPlanBody) documents.push('<span title="已有发布方案">发布方案</span>');
  return documents.length ? documents.join('') : '<span class="empty">文档待补</span>';
}

function boardCard(card) {
  return `
    <article class="plan-card" draggable="true" data-card-id="${card.id}"
      style="--account-color:${card.account.color}">
      <button class="plan-card-open" type="button" data-open-card="${card.id}">
        <span class="plan-card-account">
          <i aria-hidden="true"></i>
          ${escapeHtml(card.account.name)}
        </span>
        <strong>${escapeHtml(card.title)}</strong>
        <span class="plan-card-category">${escapeHtml(card.category || '未设置内容方向')}</span>
      </button>
      <div class="plan-card-meta">
        <span class="document-flags">${cardDocuments(card)}</span>
        ${card.primaryPlatform
          ? `<span class="platform-chip">${PLATFORM_LABELS[card.primaryPlatform]}</span>`
          : ''}
      </div>
      ${card.status === 'producing' ? `
        <label class="progress-control">
          <span class="visually-hidden">制作进度</span>
          <select data-card-progress="${card.id}">
            <option value="">未标记进度</option>
            ${Object.entries(PROGRESS_LABELS).map(([value, label]) => `
              <option value="${value}" ${card.productionProgress === value ? 'selected' : ''}>
                ${label}
              </option>
            `).join('')}
          </select>
        </label>
      ` : ''}
      <footer>
        <span>${relativeTime(card.updatedAt)}</span>
        ${card.status === 'published'
          ? `<a href="#/review?card=${encodeURIComponent(card.id)}"
              data-review-card="${card.id}">补数据</a>`
          : `<span>${COLUMNS.find(([value]) => value === card.status)?.[1] || ''}</span>`}
      </footer>
    </article>
  `;
}

function renderBoard() {
  const board = document.getElementById('contentBoard');
  if (!board) return;
  const cards = filteredCards();
  document.getElementById('planResultCount').textContent = `${cards.length} 条内容`;

  board.innerHTML = COLUMNS.map(([status, title, hint]) => {
    const columnCards = cards.filter((card) => card.status === status);
    return `
      <section class="plan-column" data-drop-status="${status}">
        <header>
          <div>
            <h2>${title}</h2>
            <p>${hint}</p>
          </div>
          <span>${columnCards.length}</span>
        </header>
        <div class="plan-card-list">
          ${columnCards.length
            ? columnCards.map(boardCard).join('')
            : `<div class="plan-column-empty">当前没有内容</div>`}
        </div>
      </section>
    `;
  }).join('');

  board.querySelectorAll('[data-open-card]').forEach((button) => {
    button.addEventListener('click', () => openDetails(button.dataset.openCard));
  });
  board.querySelectorAll('[data-card-progress]').forEach((select) => {
    select.addEventListener('click', (event) => event.stopPropagation());
    select.addEventListener('change', async () => {
      await changeStatus(select.dataset.cardProgress, 'producing', select.value || null);
    });
  });
  board.querySelectorAll('.plan-card').forEach((card) => {
    card.addEventListener('dragstart', () => {
      state.draggedId = card.dataset.cardId;
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      state.draggedId = null;
      card.classList.remove('dragging');
      board.querySelectorAll('.drag-over').forEach((column) => column.classList.remove('drag-over'));
    });
  });
  board.querySelectorAll('[data-drop-status]').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      event.preventDefault();
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', async (event) => {
      event.preventDefault();
      column.classList.remove('drag-over');
      const card = state.cards.find((item) => item.id === state.draggedId);
      const status = column.dataset.dropStatus;
      if (!card || card.status === status) return;
      await changeStatus(card.id, status, status === 'producing' ? card.productionProgress : null);
    });
  });
}

function renderAccountFilters() {
  const container = document.getElementById('accountPlanFilters');
  if (!container) return;
  const activeAccounts = store.accounts.filter((account) => account.status === 'active');
  container.innerHTML = `
    <button type="button" data-plan-account="all" class="${state.accountId === 'all' ? 'on' : ''}">
      全部
    </button>
    ${activeAccounts.map((account) => `
      <button type="button" data-plan-account="${account.id}"
        class="${state.accountId === account.id ? 'on' : ''}"
        style="--account-color:${account.color}">
        <i aria-hidden="true"></i>${escapeHtml(account.name)}
      </button>
    `).join('')}
    <a href="#/accounts" title="管理账号" aria-label="管理账号">管理</a>
  `;
  container.querySelectorAll('[data-plan-account]').forEach((button) => {
    button.addEventListener('click', () => {
      state.accountId = button.dataset.planAccount;
      renderAccountFilters();
      renderBoard();
    });
  });
}

function accountOptions(selectedId) {
  return store.accounts
    .filter((account) => account.status !== 'paused' || account.id === selectedId)
    .map((account) => `
      <option value="${account.id}" ${account.id === selectedId ? 'selected' : ''}>
        ${escapeHtml(account.name)}
      </option>
    `).join('');
}

function platformOptions(selected) {
  return `
    <option value="">暂不设置</option>
    ${Object.entries(PLATFORM_LABELS).map(([value, label]) => `
      <option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>
    `).join('')}
  `;
}

function openNewCard() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="drawer-layer compact-drawer-layer" id="newCardLayer">
      <button class="drawer-scrim" type="button" data-close-card-form aria-label="关闭"></button>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="newCardTitle">
        <header class="drawer-header">
          <div>
            <p class="eyebrow">CONTENT / NEW</p>
            <h2 id="newCardTitle">新建选题</h2>
          </div>
          <button class="icon-button" type="button" data-close-card-form aria-label="关闭">×</button>
        </header>
        <form class="simple-drawer-form" id="newCardForm" novalidate>
          <div class="drawer-body">
            <section class="form-section">
              <div class="form-grid">
                <label class="field-wide">
                  <span>内容标题 *</span>
                  <input name="title" autocomplete="off" placeholder="例如：双层芝士汉堡肉盖饭">
                  <small class="field-error" data-error="title"></small>
                </label>
                <label>
                  <span>所属账号 *</span>
                  <select name="accountId">
                    <option value="">请选择账号</option>
                    ${accountOptions(state.accountId === 'all' ? '' : state.accountId)}
                  </select>
                  <small class="field-error" data-error="accountId"></small>
                </label>
                <label>
                  <span>主推平台</span>
                  <select name="primaryPlatform">${platformOptions('')}</select>
                </label>
                <label class="field-wide">
                  <span>内容方向</span>
                  <input name="category" placeholder="例如：美食 / 二人食晚餐">
                </label>
              </div>
            </section>
          </div>
          <footer class="drawer-footer">
            <span></span>
            <div>
              <button class="button button-secondary" type="button" data-close-card-form>取消</button>
              <button class="button button-primary" type="submit">创建选题</button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  `);
  const layer = document.getElementById('newCardLayer');
  layer.querySelectorAll('[data-close-card-form]').forEach((button) => {
    button.addEventListener('click', () => layer.remove());
  });
  layer.querySelector('form').addEventListener('submit', createCard);
  setTimeout(() => layer.querySelector('[name="title"]').focus(), 30);
}

function showFormErrors(form, details = {}) {
  form.querySelectorAll('.field-error').forEach((element) => {
    element.textContent = details[element.dataset.error] || '';
  });
}

async function createCard(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const submit = form.querySelector('[type="submit"]');
  showFormErrors(form);
  submit.disabled = true;
  submit.textContent = '创建中…';
  try {
    const card = await api('/content-cards', {
      method: 'POST',
      body: JSON.stringify({
        title: data.get('title'),
        accountId: data.get('accountId'),
        primaryPlatform: data.get('primaryPlatform') || null,
        category: data.get('category')
      })
    });
    state.cards.unshift(card);
    document.getElementById('newCardLayer').remove();
    renderBoard();
    toast(`已创建「${card.title}」`, 'success');
  } catch (error) {
    if (error instanceof ApiError) showFormErrors(form, error.details);
    toast(error.message, 'danger');
  } finally {
    submit.disabled = false;
    submit.textContent = '创建选题';
  }
}

function currentCard() {
  return state.cards.find((card) => card.id === state.currentId);
}

function detailsTab(card) {
  if (state.activeTab === 'basic') return basicTab(card);
  if (state.activeTab === 'script') return documentTab(card, 'script');
  if (state.activeTab === 'publish-plan') return documentTab(card, 'publish-plan');
  return publishRecordsTab(card);
}

function basicTab(card) {
  return `
    <form id="cardBasicForm" class="card-detail-form">
      <section class="account-banner" style="--account-color:${card.account.color}">
        <i aria-hidden="true"></i>
        <span><small>所属账号</small><strong>${escapeHtml(card.account.name)}</strong></span>
      </section>
      <div class="form-grid">
        <label class="field-wide">
          <span>内容标题 *</span>
          <input name="title" value="${escapeHtml(card.title)}">
          <small class="field-error" data-error="title"></small>
        </label>
        <label>
          <span>所属账号 *</span>
          <select name="accountId">${accountOptions(card.accountId)}</select>
          <small class="field-error" data-error="accountId"></small>
        </label>
        <label>
          <span>状态</span>
          <select name="status">
            ${COLUMNS.map(([value, label]) => `
              <option value="${value}" ${card.status === value ? 'selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </label>
        <label>
          <span>主推平台</span>
          <select name="primaryPlatform">${platformOptions(card.primaryPlatform)}</select>
        </label>
        <label>
          <span>内容方向</span>
          <input name="category" value="${escapeHtml(card.category)}">
        </label>
        <label class="field-wide production-progress-field" ${card.status !== 'producing' ? 'hidden' : ''}>
          <span>制作进度</span>
          <select name="productionProgress">
            <option value="">未标记</option>
            ${Object.entries(PROGRESS_LABELS).map(([value, label]) => `
              <option value="${value}" ${card.productionProgress === value ? 'selected' : ''}>
                ${label}
              </option>
            `).join('')}
          </select>
        </label>
      </div>
      <dl class="card-timestamps">
        <div><dt>创建时间</dt><dd>${new Date(card.createdAt).toLocaleString('zh-CN')}</dd></div>
        <div><dt>最后更新</dt><dd>${new Date(card.updatedAt).toLocaleString('zh-CN')}</dd></div>
      </dl>
      <div class="detail-actions">
        <button class="button button-danger" type="button" id="deleteContentCard">删除卡片</button>
        <button class="button button-primary" type="submit">保存信息</button>
      </div>
    </form>
  `;
}

function documentTab(card, type) {
  const isScript = type === 'script';
  const body = isScript ? card.scriptBody : card.publishPlanBody;
  const title = isScript ? '录制稿' : '发布方案';
  if (state.documentEditing) {
    return `
      <form class="document-editor" id="documentForm" data-document-type="${type}">
        <div class="document-editor-head">
          <div>
            <strong>${title} Markdown</strong>
            <span>支持标题、列表、表格、引用和链接</span>
          </div>
          <button class="button button-secondary" type="button" id="cancelDocumentEdit">取消</button>
        </div>
        <textarea name="body" rows="22" placeholder="在这里粘贴 AI 生成的 ${title}…">${escapeHtml(body)}</textarea>
        <footer>
          <button class="button button-secondary" type="button" id="clearDocument">清空</button>
          <button class="button button-primary" type="submit">保存文档</button>
        </footer>
      </form>
    `;
  }

  return body ? `
    <section class="document-view">
      <div class="document-view-toolbar">
        <span>最后更新：${relativeTime(isScript ? card.scriptUpdatedAt : card.publishPlanUpdatedAt)}</span>
        <button class="button button-secondary" type="button" id="editDocument">编辑</button>
      </div>
      <div class="markdown-body">${renderMarkdown(body)}</div>
    </section>
  ` : `
    <section class="document-empty">
      <span>${isScript ? 'SCRIPT' : 'PLAN'}</span>
      <strong>还没有${title}</strong>
      <p>把 AI 生成的 Markdown 文档粘贴进来，保存后即可直接阅读。</p>
      <button class="button button-primary" type="button" id="editDocument">粘贴文档</button>
    </section>
  `;
}

function publishRecordsTab(card) {
  const records = new Map(card.publishRecords.map((record) => [record.platform, record]));
  return `
    <form id="publishRecordsForm" class="publish-record-form">
      <div class="publish-record-intro">
        <strong>三平台发布记录</strong>
        <p>每个平台独立保存标题、作品链接与实际发布时间。</p>
      </div>
      ${Object.entries(PLATFORM_LABELS).map(([platform, label]) => {
        const record = records.get(platform) || {};
        return `
          <fieldset class="publish-record" data-platform="${platform}">
            <legend>${label}</legend>
            <label class="field-wide">
              <span>发布标题</span>
              <input name="${platform}-title" value="${escapeHtml(record.publishTitle)}">
            </label>
            <label>
              <span>作品链接</span>
              <input type="url" name="${platform}-url" value="${escapeHtml(record.publishUrl)}"
                placeholder="https://">
              <small class="field-error" data-error="records.${Object.keys(PLATFORM_LABELS).indexOf(platform)}.publishUrl"></small>
            </label>
            <label>
              <span>发布时间</span>
              <input type="datetime-local" name="${platform}-time"
                value="${localDateTime(record.publishTime)}">
            </label>
          </fieldset>
        `;
      }).join('')}
      <div class="detail-actions">
        <button class="button button-secondary" type="submit" data-publish-action="save">保存记录</button>
        <button class="button button-primary" type="submit" data-publish-action="publish">
          保存并标记已发布
        </button>
      </div>
    </form>
  `;
}

function openDetails(id) {
  state.currentId = id;
  state.activeTab = 'basic';
  state.documentEditing = false;
  document.getElementById('contentCardLayer')?.remove();
  const card = currentCard();
  if (!card) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="drawer-layer content-detail-layer" id="contentCardLayer">
      <button class="drawer-scrim" type="button" data-close-card-detail aria-label="关闭详情"></button>
      <aside class="drawer content-detail-drawer" role="dialog" aria-modal="true"
        aria-labelledby="contentCardTitle">
        <header class="drawer-header">
          <div>
            <p class="eyebrow" id="contentCardStatus">CONTENT / ${card.status.toUpperCase()}</p>
            <h2 id="contentCardTitle">${escapeHtml(card.title)}</h2>
          </div>
          <button class="icon-button" type="button" data-close-card-detail aria-label="关闭">×</button>
        </header>
        <nav class="detail-tabs" aria-label="卡片详情">
          <button type="button" data-detail-tab="basic">基本信息</button>
          <button type="button" data-detail-tab="script">录制稿</button>
          <button type="button" data-detail-tab="publish-plan">发布方案</button>
          <button type="button" data-detail-tab="publish-records">发布记录</button>
        </nav>
        <div class="drawer-body content-detail-body" id="contentDetailBody"></div>
      </aside>
    </div>
  `);
  bindDetailsShell();
  renderDetailsBody();
}

function bindDetailsShell() {
  const layer = document.getElementById('contentCardLayer');
  layer.querySelectorAll('[data-close-card-detail]').forEach((button) => {
    button.addEventListener('click', closeDetails);
  });
  layer.querySelectorAll('[data-detail-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.detailTab;
      state.documentEditing = false;
      renderDetailsBody();
    });
  });
}

function closeDetails() {
  document.getElementById('contentCardLayer')?.remove();
  state.currentId = null;
  state.documentEditing = false;
}

function renderDetailsBody() {
  const card = currentCard();
  const body = document.getElementById('contentDetailBody');
  if (!card || !body) return;
  document.getElementById('contentCardTitle').textContent = card.title;
  document.getElementById('contentCardStatus').textContent =
    `CONTENT / ${card.status.toUpperCase()}`;
  document.querySelectorAll('[data-detail-tab]').forEach((button) => {
    button.classList.toggle('on', button.dataset.detailTab === state.activeTab);
  });
  body.innerHTML = detailsTab(card);
  bindDetailBody(card);
}

function bindDetailBody(card) {
  if (state.activeTab === 'basic') {
    const form = document.getElementById('cardBasicForm');
    form.addEventListener('submit', saveBasicInfo);
    form.elements.status.addEventListener('change', () => {
      form.querySelector('.production-progress-field').hidden =
        form.elements.status.value !== 'producing';
    });
    document.getElementById('deleteContentCard').addEventListener('click', deleteCard);
    return;
  }
  if (state.activeTab === 'script' || state.activeTab === 'publish-plan') {
    document.getElementById('editDocument')?.addEventListener('click', () => {
      state.documentEditing = true;
      renderDetailsBody();
      setTimeout(() => document.querySelector('#documentForm textarea')?.focus(), 20);
    });
    document.getElementById('cancelDocumentEdit')?.addEventListener('click', () => {
      state.documentEditing = false;
      renderDetailsBody();
    });
    document.getElementById('clearDocument')?.addEventListener('click', () => {
      document.querySelector('#documentForm textarea').value = '';
      document.querySelector('#documentForm textarea').focus();
    });
    document.getElementById('documentForm')?.addEventListener('submit', saveDocument);
    return;
  }
  const publishForm = document.getElementById('publishRecordsForm');
  publishForm.addEventListener('click', (event) => {
    if (event.target.dataset.publishAction) {
      publishForm.dataset.action = event.target.dataset.publishAction;
    }
  });
  publishForm.addEventListener('submit', savePublishRecords);
}

function replaceCard(card) {
  const index = state.cards.findIndex((item) => item.id === card.id);
  if (index >= 0) state.cards.splice(index, 1, card);
  else state.cards.unshift(card);
  renderBoard();
  if (state.currentId === card.id) renderDetailsBody();
}

async function saveBasicInfo(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const submit = form.querySelector('[type="submit"]');
  showFormErrors(form);
  submit.disabled = true;
  try {
    let card = await api(`/content-cards/${state.currentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: data.get('title'),
        accountId: data.get('accountId'),
        primaryPlatform: data.get('primaryPlatform') || null,
        category: data.get('category')
      })
    });
    if (
      card.status !== data.get('status') ||
      card.productionProgress !== (data.get('productionProgress') || null)
    ) {
      card = await api(`/content-cards/${state.currentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: data.get('status'),
          productionProgress: data.get('productionProgress') || null
        })
      });
    }
    replaceCard(card);
    toast('内容信息已更新', 'success');
  } catch (error) {
    if (error instanceof ApiError) showFormErrors(form, error.details);
    toast(error.message, 'danger');
  } finally {
    submit.disabled = false;
  }
}

async function saveDocument(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.dataset.documentType;
  const endpoint = type === 'script' ? 'script' : 'publish-plan';
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const card = await api(`/content-cards/${state.currentId}/${endpoint}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: new FormData(form).get('body') })
    });
    state.documentEditing = false;
    replaceCard(card);
    toast(type === 'script' ? '录制稿已保存' : '发布方案已保存', 'success');
  } catch (error) {
    toast(error.message, 'danger');
  } finally {
    submit.disabled = false;
  }
}

async function savePublishRecords(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const action = form.dataset.action || 'save';
  form.dataset.action = '';
  form.querySelectorAll('[type="submit"]').forEach((button) => { button.disabled = true; });
  showFormErrors(form);
  try {
    const records = Object.keys(PLATFORM_LABELS).map((platform) => ({
      platform,
      publishTitle: data.get(`${platform}-title`),
      publishUrl: data.get(`${platform}-url`),
      publishTime: data.get(`${platform}-time`)
        ? new Date(data.get(`${platform}-time`)).toISOString()
        : null
    }));
    const card = await api(`/content-cards/${state.currentId}/publish-info`, {
      method: 'PATCH',
      body: JSON.stringify({ records, markPublished: action === 'publish' })
    });
    replaceCard(card);
    toast(action === 'publish' ? '已保存并标记为已发布' : '发布记录已保存', 'success');
  } catch (error) {
    if (error instanceof ApiError) showFormErrors(form, error.details);
    toast(error.message, 'danger');
  } finally {
    form.querySelectorAll('[type="submit"]').forEach((button) => { button.disabled = false; });
  }
}

async function changeStatus(id, status, productionProgress = null) {
  const original = state.cards.find((card) => card.id === id);
  if (!original) return;
  original.status = status;
  original.productionProgress = status === 'producing' ? productionProgress : null;
  renderBoard();
  try {
    const card = await api(`/content-cards/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, productionProgress })
    });
    replaceCard(card);
    toast(`已移动到「${COLUMNS.find(([value]) => value === status)[1]}」`, 'success');
  } catch (error) {
    await loadCards();
    toast(error.message, 'danger');
  }
}

async function deleteCard() {
  const card = currentCard();
  if (!card || !confirm(`确定删除「${card.title}」？该操作会进行软删除。`)) return;
  try {
    await api(`/content-cards/${card.id}`, { method: 'DELETE' });
    state.cards = state.cards.filter((item) => item.id !== card.id);
    closeDetails();
    renderBoard();
    toast('内容卡片已删除', 'success');
  } catch (error) {
    toast(error.message, 'danger');
  }
}

async function loadCards() {
  state.cards = await api('/content-cards');
  renderBoard();
}

function bindPage() {
  document.getElementById('addContentCard').addEventListener('click', openNewCard);
  document.getElementById('contentSearch').addEventListener('input', (event) => {
    state.query = event.target.value.trim();
    renderBoard();
  });
  document.getElementById('platformPlanFilter').addEventListener('change', (event) => {
    state.platform = event.target.value;
    renderBoard();
  });
}

export async function renderContentPlanPage(root) {
  state.currentId = null;
  state.activeTab = 'basic';
  state.documentEditing = false;
  root.innerHTML = `
    <section class="page content-plan-page">
      <header class="page-header content-plan-header">
        <div>
          <p class="eyebrow">CONTENT PIPELINE / 03</p>
          <h1>内容计划</h1>
          <p class="lead">从选题到复盘，每张卡片都承载账号归属、录制稿、发布方案和三平台记录。</p>
        </div>
        <button class="button button-primary" type="button" id="addContentCard">
          <span aria-hidden="true">＋</span> 新建选题
        </button>
      </header>

      <section class="plan-controls">
        <nav class="account-plan-filters" id="accountPlanFilters" aria-label="按账号筛选"></nav>
        <div class="plan-filter-tools">
          <label class="search-field">
            <span class="visually-hidden">搜索内容卡片</span>
            <input type="search" id="contentSearch" placeholder="搜索标题、方向或账号">
          </label>
          <label>
            <span class="visually-hidden">平台筛选</span>
            <select id="platformPlanFilter">
              <option value="all">全部平台</option>
              ${Object.entries(PLATFORM_LABELS).map(([value, label]) => `
                <option value="${value}">${label}</option>
              `).join('')}
            </select>
          </label>
        </div>
      </section>

      <div class="plan-board-meta">
        <span id="planResultCount">正在读取内容…</span>
        <span>拖动卡片可推进状态</span>
      </div>
      <section class="content-board" id="contentBoard" aria-live="polite">
        <div class="loading-state">正在从 SQLite 读取内容计划…</div>
      </section>
    </section>
  `;
  bindPage();

  try {
    const [accounts, cards] = await Promise.all([
      store.accounts.length ? Promise.resolve(store.accounts) : api('/owned-accounts'),
      api('/content-cards')
    ]);
    store.set('accounts', accounts);
    state.cards = cards;
    renderAccountFilters();
    renderBoard();
  } catch (error) {
    document.getElementById('contentBoard').innerHTML = `
      <div class="empty-state error-state">
        <strong>内容计划加载失败</strong>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}
