/* 锅宝挂件 · 自挂载 drop-in 模块
 *
 * 这是工作台里唯一需要「接线」的地方。本文件被 import 时自动挂载，
 * 因此 **不需要改 app.js** —— index.html 加一行 script 即可。
 *
 * 默认驱动（全部来自真实数据，零后端改动）：
 *   · 当前路由 → 状态（见 ROUTE_STATE）
 *   · 本地时间 23:00–07:00 → 强制 sleeping，不管在哪个页面
 *   · 点击挂件 → 气泡显示「当前页面 + 状态一句话」，并转一圈
 *   · 拖动挂件 → 挪到任意位置，位置记进 localStorage（拖完那一下不算点击）
 *
 * 接真实业务数据时不要改本文件，改成从页面里调：
 *   window.mascotDock.setState('celebrate', { say: '今天的排期都发完了' });
 *   window.mascotDock.say('数据已同步', 2600);
 *   window.mascotDock.setShape('pot');     // 换形状：dango/bean/egg/drop/leaf/cube/capsule/pot
 *   window.mascotDock.setInk('soda');      // 换墨色：11 色，见 INK_NAMES
 *   window.mascotDock.resetPos();          // 拖飞了：放回默认角落
 *
 * 墨色说明：品牌规范规则 1「不使用渐变」，而参考引擎的身体是墨色渐变。
 * 因此这里用 inkFlat: 'var(--fg)' 走纯色（深色主题白墨 / 浅色主题黑墨，自动跟随主题）；
 * 想还原参考的渐变质感，把下面 inkFlat 那行删掉即可。
 */

import { createMascot, ALL_STATES } from './mascot.js';

const STORAGE_KEY = 'phj-workbench-mascot';
const POS_KEY = 'phj-workbench-mascot-pos';   // 拖拽后的位置（视口坐标）
const DRAG_SLOP = 6;                          // 位移超过 6px 才算拖拽，否则算点击

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

  /* 挂件靠左时把气泡翻到右侧 —— 否则气泡会飘到屏幕外，看不见。 */
  function placeBubble() {
    const r = holder.getBoundingClientRect();
    const room = 230;   // 气泡最大宽度 210 + 间隙 10 + 余量
    bubble.classList.toggle('is-flipped', r.left < room);
  }

  function show(text, autoHideMs = 0) {
    bubble.textContent = text;
    placeBubble();
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

  /* ── 拖拽定位 ──────────────────────────────────────────────
   *
   * 位置存 localStorage，存的是 left/top（相对视口左上角）。
   * 写回时必须同时清掉 CSS 的 right/bottom 锚点 —— 四个方向同时生效会互相打架。
   *
   * 与「点击钉住气泡」的冲突是这里唯一的难点：两者都从 pointerdown 开始。
   * 用位移阈值区分（DRAG_SLOP）：
   *   位移 < 阈值 → 当作点击，交给 click 处理器正常开/关气泡；
   *   位移 ≥ 阈值 → 进入拖拽，pointerup 时置 suppressClick，把紧随其后的 click 吃掉。
   * suppressClick 在**每次 pointerdown 时复位**，这样即使某次拖拽没有紧跟 click
   * （pointercancel、被系统打断），也不会把下一次真实点击误吞。
   */

  function readPos() {
    try {
      const v = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (v && Number.isFinite(v.left) && Number.isFinite(v.top)) return v;
    } catch { /* 存坏了就当没有 */ }
    return null;
  }

  /* 夹在视口内 —— 拖出屏幕就再也抓不回来了，这是必须兜住的。
     量的是 holder（挂件本体），不是 dock：要保证的是「挂件」可见。 */
  function clampPos(left, top) {
    const r = holder.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - r.width);
    const maxY = Math.max(0, window.innerHeight - r.height);
    return {
      left: Math.min(Math.max(0, left), maxX),
      top: Math.min(Math.max(0, top), maxY),
    };
  }

  function applyPos(left, top) {
    const p = clampPos(left, top);
    dock.style.left = `${p.left}px`;
    dock.style.top = `${p.top}px`;
    dock.style.right = 'auto';
    dock.style.bottom = 'auto';
    return p;
  }

  const savedPos = readPos();
  if (savedPos) applyPos(savedPos.left, savedPos.top);

  let dragging = false;
  let moved = false;
  let grab = null;          // { px, py, left, top }
  let suppressClick = false;

  dock.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;            // 只接左键 / 触摸（触摸的 button 也是 0）
    suppressClick = false;                 // 新手势开始先复位，避免误吞下一次点击
    const r = dock.getBoundingClientRect();
    dragging = true;
    moved = false;
    grab = { px: e.clientX, py: e.clientY, left: r.left, top: r.top };
    /* 指针捕获：手指/鼠标移出挂件范围后仍能继续收到 move，不然拖一半就断 */
    try { dock.setPointerCapture(e.pointerId); } catch { /* 不支持就算了 */ }
  });

  dock.addEventListener('pointermove', (e) => {
    if (!dragging || !grab) return;
    const dx = e.clientX - grab.px;
    const dy = e.clientY - grab.py;
    if (!moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;   // 还没过阈值：可能只是手抖的点击
      moved = true;
      dock.classList.add('is-dragging');
    }
    applyPos(grab.left + dx, grab.top + dy);
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    grab = null;
    if (!moved) return;                    // 没移动过：当作点击，什么都不做
    dock.classList.remove('is-dragging');
    const r = dock.getBoundingClientRect();
    const p = applyPos(r.left, r.top);     // 落定前再夹一次（期间可能 resize 过）
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* 存不了就算了 */ }
    suppressClick = true;                  // 这一下不算点击
    placeBubble();                         // 钉住的气泡要跟着换边
  }

  dock.addEventListener('pointerup', endDrag);
  dock.addEventListener('pointercancel', endDrag);

  /* 视口变化（转屏 / 改窗口）后重新夹取，别把挂件留在屏幕外 */
  window.addEventListener('resize', () => {
    if (!dock.style.left) return;          // 从没拖过：仍走 CSS 的 right/bottom 锚点
    const r = dock.getBoundingClientRect();
    applyPos(r.left, r.top);
  });

  /* 悬停看状态，点击钉住（触屏没有 hover，靠点击） */
  dock.addEventListener('pointerenter', () => show(textFor(mascot.state)));
  dock.addEventListener('pointerleave', () => {
    if (!pinned) hide();
  });
  dock.addEventListener('click', () => {
    if (suppressClick) {                   // 刚拖完，这一下不算点击
      suppressClick = false;
      return;
    }
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
    /* 把挂件放回默认角落（拖飞了 / 想复位时用） */
    resetPos() {
      try { localStorage.removeItem(POS_KEY); } catch { /* 存不了就算了 */ }
      dock.style.left = '';
      dock.style.top = '';
      dock.style.right = '';
      dock.style.bottom = '';
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
