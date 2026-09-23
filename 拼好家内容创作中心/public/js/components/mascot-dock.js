/* 锅宝 · 侧栏挂载模块
 *
 * 位置：左侧导航栏内、「界面主题」上方的一个 216×216 正方形容器（见 mascot.css）。
 *       **不再是浮动挂件** —— 不拖拽、不记位置，固定在那里。
 *
 * 引擎：第三方 mood-mates（非商业社区许可，见 public/js/vendor/mood-mates/README.md）。
 *       引擎脚本在 index.html 里按固定顺序 defer 加载，本模块只消费 window.MoodMates。
 *
 * 驱动方式（全部来自真实数据，零后端改动）：
 *   · 当前路由 → 表情（见 ROUTE_EMOTION）
 *   · 本地时间 23:00–07:00 → 强制 00 睡眠，不管在哪个页面
 *   · 鼠标在页面上移动 → 视线跟随（引擎自带帧率无关平滑）
 *   · 点击 → 气泡显示「当前页面 · 表情名」，并触发一次 celebrate
 *   · 标签页切到后台 → setActive(false) 停帧省电
 *
 * 接真实业务数据时不要改本文件，从页面里调：
 *   window.mascotDock.setEmotion('33', { say: '今天的排期都发完了' });
 *   window.mascotDock.say('数据已同步', 2600);
 *   window.mascotDock.celebrate();          // 签名动作（锅宝冒热气）+ 撒花
 *
 * ⚠ 与旧自研引擎的 API 断代（旧引擎已不在页面上）：
 *   setState('working')  → setEmotion('32')      39 状态换成 32 个分段式 emotionId
 *   setShape('pot')      → 没了（锅宝只有锅形一个剪影）
 *   setInk('soda')       → 没了（体色是角色色板，只能在 create 时用 color 覆盖）
 *   setEye('crescent')   → 没了（眼形由每个表情的眼形池决定）
 *   resetPos()           → 没了（不再拖拽，位置固定）
 */

const STORAGE_KEY = 'phj-workbench-guobao';   // 置 'off' 即永久隐藏
const BUBBLE_GAP = 10;                        // 气泡与容器的水平间隙

/* 路由 → emotionId。32 个表情分四组：
   00-09 生命周期 · 10-29 情绪反应 · 30-49 代理工作状态 · 50+ 自定义 */
const ROUTE_EMOTION = {
  dashboard: '32',        // 处理中忙碌 —— 工作台是干活的地方
  inspiration: '40',      // 检索资料 —— 雷达在翻素材
  'content-plan': '16',   // 专注 —— 写排期
  review: '30',           // 思考中 —— 复盘要动脑
  accounts: '02',         // 待机放空 —— 矩阵页是浏览性质
  knowledge: '04',        // 发呆 —— 翻资料库
};

const ROUTE_LABEL = {
  dashboard: '今日工作台',
  inspiration: '灵感雷达',
  'content-plan': '内容计划',
  review: '数据复盘',
  accounts: '账号矩阵',
  knowledge: '知识资产',
};

const NIGHT_EMOTION = '00';   // 睡眠

function currentRoute() {
  const route = location.hash.replace(/^#\//, '').split('?')[0] || 'dashboard';
  return ROUTE_LABEL[route] ? route : 'dashboard';
}

function isNight() {
  const h = new Date().getHours();
  return h >= 23 || h < 7;
}

function mount() {
  if (localStorage.getItem(STORAGE_KEY) === 'off') return null;

  const slot = document.getElementById('guobao-slot');
  const stage = document.getElementById('guobao-stage');
  const bubble = document.getElementById('guobao-bubble');
  if (!slot || !stage || !bubble) return null;
  if (!window.MoodMates) {
    console.warn('[锅宝] 引擎未加载 —— 检查 index.html 里 vendor/mood-mates 的脚本顺序');
    return null;
  }

  const emotionName = (id) => window.MoodMates.config.getRaw(id)?.name || id;

  const mate = window.MoodMates.create(stage, {
    character: 'guobao',
    emotion: '02',
    /* idle:false —— 表情由路由驱动，不让引擎在超时后自行切走。
       角色仍然「活着」：眨眼、待机小动作、视线漂移都来自表情编排本身，与 idle 无关。 */
    idle: false,
    eyeScale: 1.05,   // 216px 容器下眼睛略放大，远看更清楚
  });

  let current = '02';
  let pinned = false;
  let hideTimer = 0;

  function textFor(id) {
    return `${ROUTE_LABEL[currentRoute()]} · ${emotionName(id)}`;
  }

  /* 气泡用 position:fixed（.sidebar 有 overflow:hidden，absolute 会被裁掉），
     所以位置得自己按容器的视口矩形算。 */
  function placeBubble() {
    const r = slot.getBoundingClientRect();
    bubble.style.left = `${Math.round(r.right + BUBBLE_GAP)}px`;
    bubble.style.top = `${Math.round(r.top + 18)}px`;
  }

  function show(text, autoHideMs = 0) {
    bubble.textContent = text;
    placeBubble();
    bubble.classList.add('is-on');
    clearTimeout(hideTimer);
    if (autoHideMs) hideTimer = setTimeout(hide, autoHideMs);
  }

  function hide() {
    bubble.classList.remove('is-on');
  }

  function applyRoute() {
    const id = isNight() ? NIGHT_EMOTION : (ROUTE_EMOTION[currentRoute()] || '02');
    current = id;
    mate.setEmotion(id);
    if (pinned) show(textFor(id));
  }

  /* 窗口尺寸变化 / 滚动时气泡要跟着走（侧栏是 fixed，但视口会变） */
  window.addEventListener('resize', () => { if (pinned) placeBubble(); });
  window.addEventListener('scroll', () => { if (pinned) placeBubble(); }, { passive: true });

  /* 悬停看状态，点击钉住（触屏没有 hover，靠点击） */
  stage.addEventListener('pointerenter', () => show(textFor(current)));
  stage.addEventListener('pointerleave', () => { if (!pinned) hide(); });
  stage.addEventListener('click', () => {
    pinned = !pinned;
    slot.classList.toggle('is-active', pinned);
    if (pinned) {
      show(textFor(current));
      mate.celebrate();       // 点击反馈：签名动作（锅宝冒热气）+ 撒花
    } else hide();
  });

  /* 全页面视线跟随。归一化到 [-1,1]，以容器中心为原点。
     引擎内部做帧率无关平滑，这里给原始值即可。 */
  window.addEventListener('pointermove', (e) => {
    const r = slot.getBoundingClientRect();
    if (!r.width) return;
    const nx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
    const ny = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
    mate.setGaze(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny)));
  }, { passive: true });

  /* 标签页切到后台就停帧 —— 侧栏角色没人看的时候不该占 rAF */
  document.addEventListener('visibilitychange', () => {
    mate.setActive(!document.hidden);
    if (document.hidden) hide();
  });

  window.addEventListener('hashchange', applyRoute);

  /* 跨过 23:00 / 07:00 那一刻要自动切睡眠/醒来 —— 只靠 hashchange 触发不到，
     用户挂着不动就一直是白天那个表情。每分钟对一次，只在真的变了才动。 */
  const clockTimer = setInterval(() => {
    const want = isNight() ? NIGHT_EMOTION : (ROUTE_EMOTION[currentRoute()] || '02');
    if (want !== current) {
      current = want;
      mate.setEmotion(want);
      if (pinned) show(textFor(want));
    }
  }, 60000);

  const api = {
    mate,
    /* 切表情。id 见 emotionList()；options.say 顺带弹气泡 */
    setEmotion(id, options = {}) {
      if (!window.MoodMates.config.getRaw(id)) {
        console.warn(`[锅宝] 未知 emotionId: ${id}`);
        return false;
      }
      current = id;
      mate.setEmotion(id);
      if (options.say) show(options.say, options.holdMs || 2600);
      else if (pinned) show(textFor(id));
      return true;
    },
    say(text, holdMs = 2600) { show(text, holdMs); },
    celebrate() { mate.celebrate(); },
    spin(n = 1) { mate.spin(n); },
    burst(n = 24) { mate.burst(n); },
    bounce() { mate.bounce(); },
    blink() { mate.blink(); },
    /* 32 个表情清单，给调试 / 设置面板用 */
    emotionList() {
      return window.MoodMates.config.list().map((d) => ({ id: d.id, name: d.name, group: d.group }));
    },
    /* 当前路由该是什么表情（夜间返回 '00'） */
    routeEmotion() {
      return isNight() ? NIGHT_EMOTION : (ROUTE_EMOTION[currentRoute()] || '02');
    },
    /* 当前表情 id */
    currentEmotion() { return current; },
    /* 逃生口：localStorage 置 off 即永久隐藏，无需改代码 */
    hide() {
      localStorage.setItem(STORAGE_KEY, 'off');
      clearInterval(clockTimer);
      mate.destroy();
      slot.remove();
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
