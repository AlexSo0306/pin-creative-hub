/* 锅宝挂件 · 自挂载 drop-in 模块
 *
 * 这是工作台里唯一需要「接线」的地方。本文件被 import 时自动挂载，
 * 因此 **不需要改 app.js** —— index.html 加一行 script 即可。
 *
 * 默认驱动（全部来自真实数据，零后端改动）：
 *   · 当前路由 → 状态（见 ROUTE_STATE）
 *   · 本地时间 23:00–07:00 → 强制 sleeping，不管在哪个页面
 *   · 点击挂件 → 气泡显示「当前页面 + 状态一句话」，并转一圈
 *
 * 接真实业务数据时不要改本文件，改成从页面里调：
 *   window.mascotDock.setState('celebrate', { say: '今天的排期都发完了' });
 *   window.mascotDock.say('数据已同步', 2600);
 *   window.mascotDock.setShape('pot');     // 换形状：dango/bean/egg/drop/leaf/cube/capsule/pot
 *   window.mascotDock.setInk('soda');      // 换墨色：11 色，见 INK_NAMES
 *
 * 墨色说明：品牌规范规则 1「不使用渐变」，而参考引擎的身体是墨色渐变。
 * 因此这里用 inkFlat: 'var(--fg)' 走纯色（深色主题白墨 / 浅色主题黑墨，自动跟随主题）；
 * 想还原参考的渐变质感，把下面 inkFlat 那行删掉即可。
 */

import { createMascot, ALL_STATES } from './mascot.js';

const STORAGE_KEY = 'phj-workbench-mascot';

/* 路由 → 状态。v2 有 39 个状态，这里只挑语义最贴的 6 个。 */
const ROUTE_STATE = {
  dashboard: 'working',
  inspiration: 'curious',
  'content-plan': 'writing',
  review: 'thinking',
  accounts: 'idle',
  knowledge: 'drowsy',
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
  thinking: '正在复盘数据',
  writing: '在写今天的内容计划',
  working: '正在处理今天的活',
  drowsy: '这个点该歇了',
  sleeping: '收工了，明天见',
  happy: '今天进展不错',
  celebrate: '收工',
  alerting: '有东西要处理',
  notifying: '有一条新提醒',
  searching: '正在找素材',
  loading: '正在拉数据',
  uploading: '正在上传',
  sending: '正在发送',
  receiving: '收到新数据',
  listening: '在听着',
  excited: '状态很好',
  proud: '干得漂亮',
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
  holder.className = 'pm-dock-holder';

  dock.append(bubble, holder);
  document.body.appendChild(dock);

  const mascot = createMascot(holder, {
    state: 'idle',
    shape: 'pot',          // 锅宝 —— 用「锅」形，与账号名对应
    ink: 'ink',
    inkFlat: 'var(--fg)',  // 纯色墨，遵守品牌规范规则 1（删掉此行即还原渐变质感）
  });

  let pinned = false;
  let hideTimer = 0;

  function stateLabel(state) {
    return STATE_LINE[state] || state;
  }

  function textFor(state) {
    const label = ROUTE_LABEL[currentRoute()];
    return `${label} · ${stateLabel(state)}`;
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
    const state = isNight() ? 'sleeping' : (ROUTE_STATE[currentRoute()] || 'idle');
    mascot.setState(state);
    if (pinned) show(textFor(state));
  }

  /* 悬停看状态，点击钉住（触屏没有 hover，靠点击） */
  dock.addEventListener('pointerenter', () => show(textFor(mascot.state)));
  dock.addEventListener('pointerleave', () => {
    if (!pinned) hide();
  });
  dock.addEventListener('click', () => {
    pinned = !pinned;
    if (pinned) {
      show(textFor(mascot.state));
      mascot.spin(1);        // 点击反馈：转一圈
    } else hide();
  });

  window.addEventListener('hashchange', applyRoute);

  const api = {
    mascot,
    setState(state, options = {}) {
      if (!ALL_STATES.includes(state)) return;
      mascot.setState(state);
      if (options.say) show(options.say, options.holdMs || 2600);
      else if (pinned) show(textFor(state));
    },
    setShape(name) {
      mascot.setShape(name);
    },
    setInk(id) {
      mascot.setInk(id);
    },
    setEye(name) {
      mascot.setEye(name);
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
