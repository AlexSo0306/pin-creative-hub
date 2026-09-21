/* 锅宝挂件 · 自挂载 drop-in 模块
 *
 * 这是工作台里唯一需要「接线」的地方。本文件被 import 时自动挂载，
 * 因此 **不需要改 app.js** —— index.html 加一行 script 即可。
 *
 * 默认驱动（全部来自真实数据，零后端改动）：
 *   · 当前路由 → 状态（见 ROUTE_STATE）
 *   · 本地时间 23:00–07:00 → 强制 sleepy，不管在哪个页面
 *   · 点击挂件 → 气泡显示「当前页面 + 状态一句话」
 *
 * 接真实业务数据时不要改本文件，改成从页面里调：
 *   window.mascotDock.setState('celebrate', { say: '今天的排期都发完了' });
 *   window.mascotDock.setEnergy(0.3);   // 0=没活了 1=满负荷
 *   window.mascotDock.say('数据已同步', 2600);
 */

import { createMascot, MASCOT_STATES } from './mascot.js';

const STORAGE_KEY = 'phj-workbench-mascot';

const ROUTE_STATE = {
  dashboard: 'focus',
  inspiration: 'curious',
  'content-plan': 'focus',
  review: 'focus',
  accounts: 'idle',
  knowledge: 'sleepy',
};

const ROUTE_LABEL = {
  dashboard: '今日工作台',
  inspiration: '灵感雷达',
  'content-plan': '内容计划',
  review: '数据复盘',
  accounts: '账号矩阵',
  knowledge: '知识资产',
};

const STATE_LINE = {
  idle: '待机中',
  curious: '在看别人怎么做',
  happy: '今天进展不错',
  focus: '正在处理今天的活',
  sleepy: '这个点该歇了',
  alert: '有东西要处理',
  celebrate: '收工',
};

function currentRoute() {
  const route = (location.hash.replace(/^#\//, '').split('?')[0] || 'dashboard');
  return ROUTE_LABEL[route] ? route : 'dashboard';
}

function isNight() {
  const h = new Date().getHours();
  return h >= 23 || h < 7;
}

function mount() {
  if (localStorage.getItem(STORAGE_KEY) === 'off') return null;

  const dock = document.createElement('div');
  dock.className = 'pm-dock';

  const bubble = document.createElement('div');
  bubble.className = 'pm-dock-bubble';
  bubble.setAttribute('role', 'status');

  const holder = document.createElement('div');

  dock.append(bubble, holder);
  document.body.appendChild(dock);

  const mascot = createMascot(holder, { state: 'idle', energy: 0.7, scale: 1 });

  let pinned = false;
  let hideTimer = 0;

  function textFor(state) {
    const label = ROUTE_LABEL[currentRoute()];
    return `${label} · ${STATE_LINE[state] || MASCOT_STATES[state]?.label || ''}`;
  }

  function show(text, autoHideMs = 0) {
    bubble.textContent = text;
    bubble.classList.add('is-on');
    clearTimeout(hideTimer);
    if (autoHideMs) hideTimer = setTimeout(() => hide(), autoHideMs);
  }

  function hide() {
    bubble.classList.remove('is-on');
  }

  function applyRoute() {
    const state = isNight() ? 'sleepy' : (ROUTE_STATE[currentRoute()] || 'idle');
    mascot.setState(state);
    mascot.pulse();
    if (pinned) show(textFor(state));
  }

  /* 悬停看状态，点击钉住（触屏没有 hover，靠点击） */
  dock.addEventListener('pointerenter', () => show(textFor(mascot.state)));
  dock.addEventListener('pointerleave', () => {
    if (!pinned) hide();
  });
  dock.addEventListener('click', () => {
    pinned = !pinned;
    if (pinned) show(textFor(mascot.state));
    else hide();
  });

  window.addEventListener('hashchange', applyRoute);

  const api = {
    mascot,
    setState(state, options = {}) {
      mascot.setState(state);
      if (options.say) show(options.say, options.holdMs || 2600);
      else if (pinned) show(textFor(state));
    },
    setEnergy(v) {
      mascot.setEnergy(v);
    },
    say(text, holdMs = 2600) {
      show(text, holdMs);
    },
    /* 逃生口：localStorage 置 off 即永久隐藏，无需改代码 */
    hide() {
      localStorage.setItem(STORAGE_KEY, 'off');
      mascot.destroy();
      dock.remove();
    },
    show() {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    },
  };

  applyRoute();
  return api;
}

const instance = mount();
if (instance) window.mascotDock = instance;

export default instance;
