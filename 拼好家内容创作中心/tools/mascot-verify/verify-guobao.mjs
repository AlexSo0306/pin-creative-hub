/* 锅宝侧栏容器 —— 真实应用实测。
   验：容器几何（216×216、在「界面主题」上方）、角色渲染、五官存在、
       路由→表情映射、气泡、明暗主题、移动端隐藏。 */
import path from "node:path";
import { launch, sweep, leftover } from "/Users/alexso/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs";

const URL_ = process.argv[2] || "http://127.0.0.1:4174/";
const OUT = "/Users/alexso/WorkBuddy/pin-creative-hub/拼好家内容创作中心/tools/mascot-verify/shots";

sweep();
const t = await launch({ url: URL_, width: 1440, height: 900 });

const ok = [], fail = [];
const ck = (n, c, e = "") => (c ? ok : fail).push(n + (e ? ` — ${e}` : ""));

try {
  await t.waitFor("window.mascotDock && document.querySelector('.guobao-stage svg')", { timeout: 20000 });
  await t.sleep(1800);

  /* 1. 容器几何 + 位置 */
  const geo = await t.evalJs(`(() => {
    const slot = document.querySelector('.guobao-slot');
    const theme = document.querySelector('.theme-control');
    const status = document.querySelector('.sidebar-status');
    const stage = document.querySelector('.guobao-stage');
    const svg = stage.querySelector('svg');
    const rs = slot.getBoundingClientRect();
    const rt = theme.getBoundingClientRect();
    const rg = svg.getBoundingClientRect();
    return {
      slot: [Math.round(rs.width), Math.round(rs.height)],
      slotRect: [Math.round(rs.left), Math.round(rs.top)],
      themeTop: Math.round(rt.top),
      statusTop: Math.round(status.getBoundingClientRect().top),
      svg: [Math.round(rg.width), Math.round(rg.height)],
      stagePE: getComputedStyle(stage).pointerEvents,
      slotBorder: getComputedStyle(slot).borderTopWidth + ' ' + getComputedStyle(slot).borderTopColor,
      /* 五官：引擎把身体/眼/嘴都画在同一个 svg 里 */
      paths: svg.querySelectorAll('path').length,
      ellipses: svg.querySelectorAll('ellipse').length,
      gradients: svg.querySelectorAll('radialGradient,linearGradient').length,
      groups: [...svg.querySelectorAll('g')].map((g) => g.getAttribute('class') || '-'),
      hitTarget: (() => { const el = document.elementFromPoint(rs.left + rs.width/2, rs.top + rs.height/2);
                          return el ? (el.tagName + '.' + (el.getAttribute('class')||'-')) : null; })(),
    };
  })()`);

  /* ⚠ 期望值不是 216 —— 侧栏 248 宽、padding 16×2，再减去 1px 右边框 = 215。
     要断言的是「正方形 + 尺寸合理」，不是某个写死的数。 */
  ck("容器是正方形", geo.slot[0] === geo.slot[1] && geo.slot[0] >= 200 && geo.slot[0] <= 230,
    `实测 ${geo.slot.join('×')}`);
  ck("容器在「界面主题」上方", geo.slotRect[1] + geo.slot[1] <= geo.themeTop + 1,
    `容器底 ${geo.slotRect[1] + geo.slot[1]} vs 主题顶 ${geo.themeTop}`);
  ck("容器在侧栏状态行上方", geo.themeTop <= geo.statusTop, `主题顶 ${geo.themeTop} ≤ 状态顶 ${geo.statusTop}`);
  ck("SVG 撑满容器", geo.svg[0] > 150 && geo.svg[1] > 150, `实测 ${geo.svg.join('×')}`);
  ck("容器有边框（被「框住」）", parseFloat(geo.slotBorder) >= 1, geo.slotBorder);
  ck("图元齐全（身体+眼+嘴）", geo.paths >= 4 && geo.gradients >= 3,
    `path ${geo.paths} · ellipse ${geo.ellipses} · 渐变 ${geo.gradients}`);
  ck("命中测试落在角色上（能点）", /path|svg|ellipse|g/.test(geo.hitTarget || ''), `elementFromPoint → ${geo.hitTarget}`);

  /* 2. 引擎与角色 */
  const eng = await t.evalJs(`(() => ({
    chars: window.MoodMates.characters.list().map((c) => c.id),
    emotions: window.MoodMates.config.list().length,
    cur: window.mascotDock.currentEmotion(),
    routeEmotion: window.mascotDock.routeEmotion(),
    listLen: window.mascotDock.emotionList().length,
  }))()`);
  ck("角色 guobao 已注册", eng.chars.includes('guobao'), JSON.stringify(eng.chars));
  ck("32 个表情可用", eng.emotions === 32, `实测 ${eng.emotions}`);
  ck("emotionList() 返回 32 条", eng.listLen === 32, `实测 ${eng.listLen}`);

  /* 3. 夜间规则 —— 必须先单独验，因为它会**覆盖**路由映射。
     ⚠ 上一版这里是个空转测试：跑的时候正好是凌晨，6 条路由全落到 '00'，
     routeEmotion() 与 currentEmotion() 当然相等 —— 断言全绿但什么都没测。
     凡是被「时间/环境」分支保护的断言，都要把那个分支**显式钉死**再测另一支。 */
  const night = await t.evalJs(`(() => {
    const real = Date.prototype.getHours;
    Date.prototype.getHours = function () { return 3; };
    const r = window.mascotDock.routeEmotion();
    Date.prototype.getHours = real;
    return r;
  })()`);
  ck("夜间（03:00）强制 00 睡眠", night === '00', `实测 ${night}`);

  /* 4. 路由 → 表情映射 —— 先把时钟拨到白天，否则全被夜间规则吃掉 */
  const EXPECT = {
    dashboard: '32', inspiration: '40', 'content-plan': '16',
    review: '30', accounts: '02', knowledge: '04',
  };
  await t.evalJs(`window.__realGetHours = Date.prototype.getHours;
    Date.prototype.getHours = function () { return 12; };`);
  /* ⚠ 先跳到一个别的路由 —— 把 hash 设成**当前已经是的值不会触发 hashchange**，
     于是 applyRoute() 不跑、currentEmotion() 停在旧值，第一条断言会假红。 */
  await t.evalJs(`location.hash = '#/accounts'`);
  await t.sleep(420);
  for (const [r, want] of Object.entries(EXPECT)) {
    await t.evalJs(`location.hash = '#/${r}'`);
    await t.sleep(420);
    const got = await t.evalJs(`window.mascotDock.currentEmotion()`);
    ck(`路由 ${r} → 表情 ${want}`, got === want, `实际 ${got}`);
  }
  await t.evalJs(`Date.prototype.getHours = window.__realGetHours`);

  /* 4. 气泡：悬停出现、内容含中文 */
  await t.evalJs(`location.hash = '#/dashboard'`);
  await t.sleep(300);
  const box = await t.evalJs(`(() => { const r = document.querySelector('.guobao-stage').getBoundingClientRect();
    return [Math.round(r.left + r.width/2), Math.round(r.top + r.height/2)]; })()`);
  await t.mouse("mouseMoved", box[0], box[1]);
  await t.sleep(500);
  const bub = await t.evalJs(`(() => { const b = document.getElementById('guobao-bubble');
    const r = b.getBoundingClientRect();
    return { on: b.classList.contains('is-on'), text: b.textContent.trim(),
             left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
             vw: window.innerWidth, pos: getComputedStyle(b).position }; })()`);
  ck("悬停弹气泡", bub.on === true, JSON.stringify(bub.text));
  ck("气泡文案是中文", /[\u4e00-\u9fa5]/.test(bub.text), JSON.stringify(bub.text));
  /* 要验的是「气泡**伸出了侧栏**且完整可见」，不是「气泡整体在侧栏右边」——
     气泡的 left 是容器右边 +10px = 241，本来就落在侧栏 248 之内 7px。
     ⚠ .sidebar 有 overflow:hidden，若气泡是 absolute 就会被裁掉；用 fixed 才逃得出去。 */
  ck("气泡伸出侧栏且完整可见", bub.right > 248 && bub.left >= 0 && bub.right <= bub.vw,
    `气泡 [${bub.left}, ${bub.right}] · 侧栏宽 248 · 视口 ${bub.vw} · position ${bub.pos}`);
  ck("气泡在视口内", bub.right <= bub.vw, `气泡右 ${bub.right} ≤ 视口 ${bub.vw}`);

  /* 5. 明暗主题都渲染 */
  for (const th of ['framer', 'fluent']) {
    await t.evalJs(`document.documentElement.dataset.theme = '${th}'`);
    await t.sleep(700);
    const fill = await t.evalJs(`(() => { const svg = document.querySelector('.guobao-stage svg');
      const paths = [...svg.querySelectorAll('path')].filter((p) => p.getBoundingClientRect().width > 4);
      return { n: paths.length, fill: paths[0] ? getComputedStyle(paths[0]).fill : null }; })()`);
    ck(`主题 ${th} 下角色仍渲染`, fill.n >= 2, `可见 path ${fill.n} · 首个 fill ${fill.fill}`);
  }
  await t.evalJs(`document.documentElement.dataset.theme = 'framer'`);
  await t.sleep(400);

  /* 6. 截图 */
  await t.shot(path.join(OUT, "锅宝-侧栏-深色.png"));
  await t.evalJs(`document.documentElement.dataset.theme = 'fluent'`);
  await t.sleep(800);
  await t.shot(path.join(OUT, "锅宝-侧栏-浅色.png"));
  await t.evalJs(`document.documentElement.dataset.theme = 'framer'`);

  /* 7. 移动端：容器应隐藏 */
  await t.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await t.sleep(900);
  const mob = await t.evalJs(`(() => { const s = document.querySelector('.guobao-slot');
    return { display: getComputedStyle(s).display, w: Math.round(s.getBoundingClientRect().width) }; })()`);
  ck("移动端隐藏容器", mob.display === 'none' || mob.w === 0, JSON.stringify(mob));
  await t.shot(path.join(OUT, "锅宝-手机390.png"));
  await t.send("Emulation.clearDeviceMetricsOverride");
  await t.sleep(500);

  /* 7.5 引擎特效粒子的配色 —— mm-* 是**宿主的样式契约**
   *
   * ⚠ 引擎 core/fx.js 建 bubble / speck / sheen 时**不给 fill 属性**，只挂类名：
   *      el('path', { d: cloudD, class: 'mm-bubble' })   ← 无 fill
   *   颜色规则在上游**演示站**的 site/style.css（第 754–760 行），不在 core/ 里。
   *   只搬 core/ + data/ 而漏了这段 CSS，图元就落到 SVG 默认 fill:#000 ——
   *   角色旁边飘出一个黑泡泡（深色主题下像脏点，浅色主题下更刺眼）。
   *   2026-09-24 实测过：33 任务完成 的右上角就是一个 18×17 的黑泡泡。
   *
   * ⚠ 必须先切到**会放特效**的表情、并且**轮询采样**再查。
   *   粒子是**瞬态**的：cloudpuff 的泡泡走完 travel+hang+pop 就被移除，
   *   点采一次很容易撞在「已经放完了」的空档上，那时 .mm-bubble 集合为空，
   *   「没有黑色」这条就会因为「一个都没查到」而**空转通过**。
   *   这个坑 2026-09-24 真踩到了：第一版写的是 setEmotion('33') 后 sleep 1500 点采，
   *   注入对照那次正好采到 0 个 —— 于是「没落到黑色兜底」绿着通过，其实什么都没测。
   *   所以拆成两条 + 轮询：先证明泡泡确实出现过，再证明它们不是黑的。
   */
  /* 注入对照：把这三个变量强制成黑色，复现「漏了宿主 CSS」的现场。
     没跑过这一遍，「没落到黑色兜底」这条就只是**没失败过**，不算被证明。
     用法：INJECT_FX_BLACK=1 node tools/mascot-verify/verify-guobao.mjs
     期望：第 1 条仍绿（说明泡泡确实在），第 2 条变红。 */
  if (process.env.INJECT_FX_BLACK) {
    await t.evalJs(`(() => { const s = document.querySelector('.guobao-slot');
      s.style.setProperty('--mm-bubble-fill', '#000');
      s.style.setProperty('--mm-bubble-sheen', '#000');
      s.style.setProperty('--mm-speck', '#000'); })()`);
    await t.sleep(300);
    console.log("⚠ INJECT_FX_BLACK=1 —— 已把粒子颜色强制成黑色，本组第 2 条应出现失败");
  }

  await t.evalJs(`window.mascotDock.setEmotion('33')`);
  await t.sleep(600);
  await t.evalJs(`window.mascotDock.celebrate()`);   // 签名动作，直接喷泡泡
  let fxN = 0, fxBlack = 0, fxSample = [];
  for (let i = 0; i < 26; i++) {                     // ≈3.1s，覆盖泡泡整个生命周期
    const s = await t.evalJs(`(() => {
      const svg = document.querySelector('.guobao-stage svg');
      const els = [...svg.querySelectorAll('.mm-bubble, .mm-speck, .mm-sheen, .mm-spark')];
      const isBlack = (f) => f === 'rgb(0, 0, 0)' || f === 'black' || f === '#000'
                          || /^rgba?\\(0,\\s*0,\\s*0(,\\s*1)?\\)$/.test(f);
      return { n: els.length,
               black: els.filter((e) => isBlack(getComputedStyle(e).fill)).length,
               sample: els.slice(0, 2).map((e) =>
                 (e.getAttribute('class') || '?') + '=' + getComputedStyle(e).fill) };
    })()`);
    if (s.n > fxN) { fxN = s.n; fxSample = s.sample; }
    fxBlack = Math.max(fxBlack, s.black);
    await t.sleep(120);
  }
  ck("特效粒子确实出现（否则下一条会空转）", fxN > 0,
    `峰值 ${fxN} 个 · ${fxSample.join(' / ') || '（一个都没采到）'}`);
  /* ⚠ 这里把 fxN > 0 也写进条件 —— 集合为空时绝不允许判绿 */
  ck("特效粒子有配色，没落到黑色兜底", fxN > 0 && fxBlack === 0,
    `黑色 ${fxBlack} / 峰值 ${fxN} 个`);

  /* 8. 报错 */
  ck("无页面报错", t.errors.length === 0, t.errors.slice(0, 3).join(' | '));

  console.log("=== 通过 " + ok.length + " / 失败 " + fail.length + " ===");
  ok.forEach((s) => console.log("  ✓ " + s));
  fail.forEach((s) => console.log("  ✗ " + s));
  process.exitCode = fail.length ? 1 : 0;
} finally {
  await t.close();
  console.log("残留 Chrome 进程: " + leftover() + "（应为 0）");
}
