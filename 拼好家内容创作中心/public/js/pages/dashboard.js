import { api } from '../api.js';

const PLATFORM_LABELS = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  shipinhao: '视频号'
};

const STATUS_LABELS = {
  idea: '选题',
  scripted: '脚本完成',
  producing: '制作中'
};

let state = {
  data: null,
  month: '',
  selectedDate: '',
  loading: false
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN', {
    notation: Number(value) >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(Number(value) || 0);
}

function formatPercent(value) {
  if (value === null || value === undefined) return '暂无';
  return `${(value * 100).toFixed(1)}%`;
}

function formatMonth(month) {
  const [year, value] = month.split('-');
  return `${year} 年 ${Number(value)} 月`;
}

function shiftMonth(month, delta) {
  const date = new Date(`${month}-01T00:00:00`);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function relativeTime(value, reference = state.data?.asOfDate || localDate()) {
  const left = new Date(String(value).slice(0, 10) + 'T00:00:00').getTime();
  const right = new Date(`${reference}T00:00:00`).getTime();
  const days = Math.max(0, Math.floor((right - left) / 86400000));
  if (days === 0) return '今天更新';
  if (days === 1) return '昨天更新';
  return `${days} 天前更新`;
}

function showToast(message, tone = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function overviewMarkup(data) {
  const metrics = [
    ['总播放 / 阅读', formatNumber(data.plays), '最新表现快照聚合'],
    ['总点赞', formatNumber(data.likes), '全部自有账号'],
    ['总分享', formatNumber(data.shares), '全部平台累计'],
    [
      '粉丝快照',
      data.followersTotal === null ? '待接入' : formatNumber(data.followersTotal),
      `内容带来新增关注 ${formatNumber(data.followersGained)}`
    ]
  ];
  return metrics.map(([label, value, detail], index) => `
    <article class="dashboard-metric${index === 0 ? ' featured' : ''}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `).join('');
}

function weekMarkup(week, pendingPerformance) {
  const planKnown = Number.isInteger(week.planned);
  const percent = planKnown && week.planned
    ? Math.min(100, Math.round((week.published / week.planned) * 100))
    : null;
  const maxDaily = Math.max(1, ...week.daily.map((item) => item.published));
  return `
    <section class="dashboard-panel week-panel">
      <div class="dashboard-panel-head">
        <div>
          <p class="eyebrow">WEEKLY PACE</p>
          <h2>本周发布进度</h2>
        </div>
        <a class="dashboard-text-link" href="#/content-plan">内容计划 →</a>
      </div>
      <div class="week-total">
        <strong>${week.published}</strong>
        <span>${planKnown ? `/ ${week.planned} 条` : '条已发布'}</span>
        ${percent === null ? '<b>未设置本周排期</b>' : `<b>${percent}%</b>`}
      </div>
      <div class="week-track" aria-label="本周发布进度">
        <i style="width:${percent ?? 0}%"></i>
      </div>
      <div class="week-bars" aria-label="每日发布数">
        ${week.daily.map((item) => `
          <span title="${item.date} · ${item.published} 条">
            <i style="height:${Math.max(3, (item.published / maxDaily) * 100)}%"></i>
            <small>${['一', '二', '三', '四', '五', '六', '日'][
              new Date(`${item.date}T00:00:00`).getDay() === 0
                ? 6
                : new Date(`${item.date}T00:00:00`).getDay() - 1
            ]}</small>
          </span>
        `).join('')}
      </div>
      <div class="week-foot">
        <span>${week.start} 至 ${week.end}</span>
        <span class="${pendingPerformance ? 'warn' : ''}">待补表现 ${pendingPerformance} 条</span>
      </div>
    </section>
  `;
}

function performanceMarkup(performance) {
  return `
    <section class="dashboard-panel performance-panel">
      <div class="dashboard-panel-head">
        <div>
          <p class="eyebrow">LAST 7 DAYS</p>
          <h2>表现速览</h2>
        </div>
        <a class="dashboard-text-link" href="#/review">完整复盘 →</a>
      </div>
      <div class="dashboard-performance-list">
        ${performance.top.length ? performance.top.map((item, index) => `
          <a class="dashboard-performance-row" href="#/review">
            <span class="performance-rank">0${index + 1}</span>
            <i style="--account-color:${escapeHtml(item.accountColor)}"></i>
            <span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.accountName)} · ${PLATFORM_LABELS[item.platform]}</small>
            </span>
            <span class="performance-values">
              <b>${formatNumber(item.plays)}</b>
              <small>互动率 ${formatPercent(item.engagementRate)}</small>
            </span>
            ${item.anomaly ? `
              <em class="${item.anomaly}">
                ${item.anomaly === 'hit' ? '高表现' : '低于基线'}
              </em>
            ` : ''}
          </a>
        `).join('') : `
          <div class="dashboard-blank">
            <strong>最近 7 天暂无表现数据</strong>
            <a href="#/review">录入数据 →</a>
          </div>
        `}
      </div>
    </section>
  `;
}

function calendarDays(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const total = new Date(year, monthNumber, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const result = [];
  for (let index = 0; index < leading; index += 1) result.push(null);
  for (let day = 1; day <= total; day += 1) {
    result.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  while (result.length % 7) result.push(null);
  return result;
}

function calendarMarkup(calendar, today) {
  const releases = Map.groupBy(calendar.releases, (item) => item.date);
  const notes = Map.groupBy(calendar.notes, (item) => item.date);
  return `
    <section class="dashboard-panel calendar-panel">
      <div class="dashboard-panel-head calendar-heading">
        <div>
          <p class="eyebrow">CONTENT CALENDAR</p>
          <h2>内容日历</h2>
        </div>
        <div class="calendar-controls">
          <button type="button" class="calendar-step" id="dashboardPrevMonth"
            aria-label="上个月" title="上个月">‹</button>
          <strong>${formatMonth(calendar.month)}</strong>
          <button type="button" class="calendar-step" id="dashboardNextMonth"
            aria-label="下个月" title="下个月">›</button>
        </div>
      </div>
      <div class="calendar-weekdays" aria-hidden="true">
        ${['一', '二', '三', '四', '五', '六', '日'].map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="dashboard-calendar-grid">
        ${calendarDays(calendar.month).map((date) => {
          if (!date) return '<span class="calendar-day blank"></span>';
          const dateReleases = releases.get(date) || [];
          const dateNotes = notes.get(date) || [];
          return `
            <button type="button"
              class="calendar-day${date === today ? ' today' : ''}${date === state.selectedDate ? ' selected' : ''}"
              data-calendar-date="${date}">
              <span>${Number(date.slice(-2))}</span>
              <span class="calendar-events">
                ${dateReleases.slice(0, 3).map((item) => `
                  <i style="--event-color:${escapeHtml(item.account.color)}"
                    title="${escapeHtml(item.account.name)} · ${PLATFORM_LABELS[item.platform]} · ${escapeHtml(item.title)}"></i>
                `).join('')}
                ${dateNotes.length ? '<b title="有备注"></b>' : ''}
              </span>
              ${dateReleases.length ? `<small>${dateReleases.length} 条</small>` : ''}
            </button>
          `;
        }).join('')}
      </div>
      <div class="calendar-legend">
        ${calendar.legend.map((account) => `
          <span><i style="--account-color:${escapeHtml(account.color)}"></i>${escapeHtml(account.name)}</span>
        `).join('')}
        <span><b></b>备注</span>
      </div>
      <div id="calendarDayDetail">${dayDetailMarkup(calendar)}</div>
    </section>
  `;
}

function dayDetailMarkup(calendar) {
  const date = state.selectedDate || state.data?.asOfDate;
  const releases = calendar.releases.filter((item) => item.date === date);
  const notes = calendar.notes.filter((item) => item.date === date);
  return `
    <div class="calendar-detail-head">
      <strong>${date}</strong>
      <span>${releases.length} 条发布 · ${notes.length} 条备注</span>
    </div>
    <div class="calendar-detail-body">
      <div class="calendar-detail-list">
        ${releases.map((item) => `
          <a href="#/content-plan">
            <i style="--account-color:${escapeHtml(item.account.color)}"></i>
            <span>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.account.name)} · ${PLATFORM_LABELS[item.platform]}</small>
            </span>
          </a>
        `).join('')}
        ${notes.map((note) => `
          <div class="calendar-note">
            <span>${escapeHtml(note.content)}</span>
            <button type="button" data-delete-note="${note.id}" aria-label="删除备注" title="删除备注">×</button>
          </div>
        `).join('')}
        ${!releases.length && !notes.length ? '<p>当天暂无发布记录或备注。</p>' : ''}
      </div>
      <form class="calendar-note-form" id="calendarNoteForm">
        <input name="content" maxlength="500" placeholder="添加当天备注" aria-label="备注内容">
        <button type="submit" class="button button-secondary">添加</button>
      </form>
    </div>
  `;
}

function todoGroup(title, tone, items) {
  return `
    <div class="dashboard-todo-group">
      <div class="todo-group-title"><i class="${tone}"></i>${title}<span>${items.length}</span></div>
      ${items.length ? items.map((todo) => `
        <article class="dashboard-todo">
          <i style="--account-color:${escapeHtml(todo.accountColor)}"></i>
          <span>
            <strong>${escapeHtml(todo.title)}</strong>
            <small>${escapeHtml(todo.source)} · ${escapeHtml(todo.accountName)}</small>
          </span>
          <div>
            <button type="button" data-todo-key="${escapeHtml(todo.key)}" data-todo-action="complete"
              aria-label="完成待办" title="完成">✓</button>
            <button type="button" data-todo-key="${escapeHtml(todo.key)}" data-todo-action="postpone"
              aria-label="推迟待办" title="推迟到明天">→</button>
          </div>
        </article>
      `).join('') : '<p class="dashboard-group-empty">暂无事项</p>'}
    </div>
  `;
}

function todosMarkup(todos) {
  return `
    <section class="dashboard-panel todo-panel">
      <div class="dashboard-panel-head">
        <div>
          <p class="eyebrow">AUTO GENERATED</p>
          <h2>今日待办</h2>
        </div>
        <span class="dashboard-panel-meta">${todos.must.length + todos.later.length} 项</span>
      </div>
      <div class="dashboard-todos">
        ${todoGroup('必须今天做', 'danger', todos.must)}
        ${todoGroup('待处理', 'warn', todos.later)}
      </div>
    </section>
  `;
}

function pipelineMarkup(pipeline) {
  return `
    <section class="dashboard-panel pipeline-panel">
      <div class="dashboard-panel-head">
        <div>
          <p class="eyebrow">IN PROGRESS</p>
          <h2>选题流水线</h2>
        </div>
        <a class="dashboard-text-link" href="#/content-plan">查看全部 ${pipeline.total} 条 →</a>
      </div>
      <div class="dashboard-pipeline-list">
        ${pipeline.items.map((item) => `
          <a class="dashboard-pipeline-row" href="#/content-plan">
            <i style="--account-color:${escapeHtml(item.account.color)}"></i>
            <span class="pipeline-main">
              <strong>${escapeHtml(item.title)}</strong>
              <small>
                ${escapeHtml(item.account.name)} ·
                ${PLATFORM_LABELS[item.primaryPlatform] || '待定平台'} ·
                ${STATUS_LABELS[item.status]}
              </small>
              <span class="pipeline-track"><i style="width:${item.progress}%"></i></span>
            </span>
            <span class="pipeline-progress">
              <b>${item.progress}%</b>
              <small>${relativeTime(item.updatedAt)}</small>
            </span>
          </a>
        `).join('')}
      </div>
    </section>
  `;
}

function inspirationMarkup(inspiration) {
  return `
    <section class="dashboard-inspiration">
      <div>
        <p class="eyebrow">SIGNAL FEED</p>
        <h2>灵感速递</h2>
        <p>${inspiration.status === 'unavailable'
          ? '灵感雷达数据源尚未迁入，新信号接入后会自动出现在这里。'
          : '最近捕获的对标内容信号。'}</p>
      </div>
      <nav aria-label="工作台快捷跳转">
        <a href="#/inspiration">灵感雷达</a>
        <a href="#/content-plan">内容计划</a>
        <a href="#/review">数据复盘</a>
        <a href="#/accounts">账号矩阵</a>
        <a href="#/knowledge">知识资产</a>
      </nav>
    </section>
  `;
}

function pageMarkup(data) {
  return `
    <div class="page dashboard-page">
      <header class="dashboard-header">
        <div>
          <p class="eyebrow">OPERATIONS COMMAND CENTER</p>
          <h1>今日工作台</h1>
          <p>${data.asOfDate} · 内容、发布与复盘状态实时聚合</p>
        </div>
        <div class="dashboard-header-status">
          <i></i>
          <span>数据已同步</span>
          <small>${new Date(data.generatedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
          })}</small>
        </div>
      </header>
      <section class="dashboard-overview">${overviewMarkup(data.overview)}</section>
      <div class="dashboard-primary-grid">
        <div class="dashboard-left-stack">
          ${weekMarkup(data.week, data.overview.pendingPerformance)}
          ${performanceMarkup(data.performance)}
        </div>
        ${calendarMarkup(data.calendar, data.asOfDate)}
      </div>
      <div class="dashboard-work-grid">
        ${todosMarkup(data.todos)}
        ${pipelineMarkup(data.pipeline)}
      </div>
      ${inspirationMarkup(data.inspiration)}
    </div>
  `;
}

function bindCalendar(root) {
  root.querySelector('#dashboardPrevMonth')?.addEventListener('click', () => {
    state.month = shiftMonth(state.month, -1);
    state.selectedDate = `${state.month}-01`;
    loadDashboard(root);
  });
  root.querySelector('#dashboardNextMonth')?.addEventListener('click', () => {
    state.month = shiftMonth(state.month, 1);
    state.selectedDate = `${state.month}-01`;
    loadDashboard(root);
  });
  root.querySelectorAll('[data-calendar-date]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedDate = button.dataset.calendarDate;
      root.querySelectorAll('[data-calendar-date]').forEach((item) => {
        item.classList.toggle('selected', item.dataset.calendarDate === state.selectedDate);
      });
      root.querySelector('#calendarDayDetail').innerHTML = dayDetailMarkup(state.data.calendar);
      bindDayDetail(root);
    });
  });
  bindDayDetail(root);
}

function bindDayDetail(root) {
  root.querySelector('#calendarNoteForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    const content = new FormData(event.currentTarget).get('content');
    button.disabled = true;
    try {
      await api('/calendar/notes', {
        method: 'POST',
        body: JSON.stringify({ date: state.selectedDate, content })
      });
      showToast('日历备注已添加');
      await loadDashboard(root);
    } catch (error) {
      showToast(error.message, 'danger');
      button.disabled = false;
    }
  });
  root.querySelectorAll('[data-delete-note]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/calendar/notes/${button.dataset.deleteNote}`, { method: 'DELETE' });
        showToast('日历备注已删除');
        await loadDashboard(root);
      } catch (error) {
        showToast(error.message, 'danger');
        button.disabled = false;
      }
    });
  });
}

function bindTodos(root) {
  root.querySelectorAll('[data-todo-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(
          `/dashboard/todos/${encodeURIComponent(button.dataset.todoKey)}/${button.dataset.todoAction}`,
          {
            method: 'POST',
            body: JSON.stringify({ date: state.data.asOfDate })
          }
        );
        showToast(button.dataset.todoAction === 'complete' ? '待办已完成' : '已推迟到明天');
        await loadDashboard(root);
      } catch (error) {
        showToast(error.message, 'danger');
        button.disabled = false;
      }
    });
  });
}

async function loadDashboard(root) {
  if (state.loading) return;
  state.loading = true;
  if (!state.data) {
    root.innerHTML = '<div class="page-loading" role="status">正在汇总今日运营数据…</div>';
  }
  try {
    const date = localDate();
    const data = await api(`/dashboard?date=${date}&month=${state.month || date.slice(0, 7)}`);
    state.data = data;
    state.month = data.calendar.month;
    if (!state.selectedDate || !state.selectedDate.startsWith(state.month)) {
      state.selectedDate = data.asOfDate.startsWith(state.month)
        ? data.asOfDate
        : `${state.month}-01`;
    }
    root.innerHTML = pageMarkup(data);
    bindCalendar(root);
    bindTodos(root);
  } catch (error) {
    root.innerHTML = `
      <div class="page dashboard-page">
        <div class="dashboard-load-error">
          <strong>今日工作台载入失败</strong>
          <p>${escapeHtml(error.message)}</p>
          <button type="button" class="button button-primary" id="retryDashboard">重试</button>
        </div>
      </div>
    `;
    root.querySelector('#retryDashboard')?.addEventListener('click', () => loadDashboard(root));
  } finally {
    state.loading = false;
  }
}

export async function renderDashboardPage(root) {
  state = {
    data: null,
    month: localDate().slice(0, 7),
    selectedDate: localDate(),
    loading: false
  };
  await loadDashboard(root);
}
