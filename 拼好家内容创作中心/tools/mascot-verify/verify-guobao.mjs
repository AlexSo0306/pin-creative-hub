/* 锅宝侧栏容器 —— 真实应用实测。
   验：容器几何（正方形、在「界面主题」上方）、角色渲染、外观契约（像素级：
       正圆 / 纯色扁平 / 白竖条眼）、路由→表情映射、气泡、明暗主题、移动端隐藏。
   ⚠ 容器尺寸**不写死**：侧栏 248 宽、padding 16×2、再减 1px 右边框 = 215。
     断言的是「正方形 + 尺寸合理」，不是某个具体数。 */
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

  /* 9. 外观契约（像素级）—— 逐条对应四条硬要求：
   *    ① 身体只要 #0099ff 圆形   ② 不需要高光   ③ 是扁平的   ④ 眼睛是白色竖线
   *
   * ⚠ 这四条**都不能靠查 DOM 属性**来验：
   *   - 引擎刻意**保留** <radialGradient id="mm0g">，只把 4 个 stop 设成同色 ——
   *     于是 fill 查出来是 url(#mm0g)，看着像有渐变，其实渲染出来是纯色；
   *   - 高光 / AO / 地面阴影是同一套路：节点都在，透明度被压到 0。
   *   - 反过来说，**节点在 ≠ 有效果**，**fill 是 url ≠ 有渐变**，属性层面全是噪音。
   *   唯一可信的验法是**直接数像素**：把角色 SVG 画进 canvas 再读回来。
   *   canvas 用透明底 → 抗锯齿像素的 RGB 仍是本体色（只有 alpha 变低），
   *   所以「身体是不是只有一种颜色」可以精确判定，不受边缘混色干扰。
   *
   * ⚠ 克隆时必须先摘掉引擎特效层（mm-bubble / speck / sheen / spark）：
   *   它们有自己的配色，会把「身体纯色」这条测歪 —— 那不是身体的颜色。 */
  const PIXEL_PROBE = `(async () => {
    const svg = document.querySelector('.guobao-stage svg');
    const clone = svg.cloneNode(true);
    /* ⚠ 摘掉两类会污染统计的图层：
     *   .mm-* 特效（bubble / speck / sheen / spark）—— 它们自带配色，
     *     混进来会把「身体只有一种颜色」测歪（那不是身体的颜色）；
     *   <text> —— 睡眠态的 zzz 字母，fill 就是 palette.zzz = #FFFFFF，
     *     不摘掉它会并进「眼睛」的白色块里：实测 00 睡眠的左眼被量成 112×17
     *     （真值是 50×14，112 是把右眼和 zzz 一起框进去的结果）。
     *     这类误测不会报错，只会给出一个「看着合理」的错数字。 */
    clone.querySelectorAll('.mm-bubble, .mm-speck, .mm-sheen, .mm-spark, text').forEach((n) => n.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 240 240');
    const N = 240;
    clone.setAttribute('width', N); clone.setAttribute('height', N);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG 转图片失败')); img.src = url; });
    const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, N, N);
    ctx.drawImage(img, 0, 0, N, N);
    const d = ctx.getImageData(0, 0, N, N).data;

    const at = (x, y) => { const o = (y * N + x) * 4; return [d[o], d[o + 1], d[o + 2], d[o + 3]]; };
    const isWhite = (R, G, B) => R > 235 && G > 235 && B > 235;
    /* 「身体核心像素」= 自身不透明且非白，且**半径 2 以内**的像素也都如此。
     * ⚠ 为什么是 2 而不是 1：
     *   canvas 的 getImageData 是**反预乘**的，任何 alpha < 255 的像素都带取整误差
     *   （实测出现 0,155,255）；眼与身体交界处更是**两种实色相混**
     *   （实测 128,204,255 = 白蓝各半、64,179,255 = 25% 白）。
     *   这两类混色都不是「身体有两种颜色」，但都会污染直方图。
     *   1px 邻域只剔得掉紧贴纯白的那一层：睡眠态的横条有 14px 厚、taper 0.05
     *   （近乎圆角矩形），上/下缘是一条很长的近似水平边，过渡带**宽到 2px**，
     *   第二层混色像素的四邻域全是实色，照样混进直方图 —— 实测就漏了个 64,179,255。
     *   腐蚀到 2px 之后，圆的外缘与眼的白边两种混色同时被挡在外面。 */
    const isCore = (x, y) => {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) return false;
          const [R, G, B, a] = at(nx, ny);
          if (a !== 255 || isWhite(R, G, B)) return false;
        }
      }
      return true;
    };

    const bodyCol = {}, whiteCol = {}, edgeCol = {};
    const solid = [];        // alpha > 127 的身体像素，用来判「是不是圆」
    const whitePts = [], whiteX = {};
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const [R, G, B, a] = at(x, y);
        if (a < 8) continue;
        if (isWhite(R, G, B)) {
          whiteCol[R + ',' + G + ',' + B] = (whiteCol[R + ',' + G + ',' + B] || 0) + 1;
          whitePts.push([x, y]); whiteX[x] = 1;
        } else {
          if (a > 127) solid.push([x, y]);
          const k = R + ',' + G + ',' + B;
          if (isCore(x, y)) bodyCol[k] = (bodyCol[k] || 0) + 1;
          else edgeCol[k] = (edgeCol[k] || 0) + 1;
        }
      }
    }
    const rank = (m) => Object.keys(m).sort((p, q) => m[q] - m[p]);
    const bb = (pts) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [x1 - x0 + 1, y1 - y0 + 1];
    };
    /* 按 x 方向的最大空档把白色像素切成左右两团 —— 两眼之间必然有空档 */
    const xs = Object.keys(whiteX).map(Number).sort((p, q) => p - q);
    let gap = 0, cut = 0;
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > gap) { gap = xs[i] - xs[i - 1]; cut = (xs[i] + xs[i - 1]) / 2; }
    const LP = whitePts.filter((p) => p[0] < cut), RP = whitePts.filter((p) => p[0] >= cut);
    const sb = solid.length ? bb(solid) : null;
    let coreN = 0;
    for (const k in bodyCol) coreN += bodyCol[k];
    return {
      bodyN: Object.keys(bodyCol).length, bodyTop: rank(bodyCol).slice(0, 3), bodyCore: coreN,
      edgeTop: rank(edgeCol).slice(0, 2),
      whiteN: Object.keys(whiteCol).length, whiteTop: rank(whiteCol).slice(0, 3),
      whitePix: whitePts.length,
      bodyBox: sb,
      solidRatio: sb ? solid.length / (sb[0] * sb[1]) : 0,
      leftBox: LP.length ? bb(LP) : null,
      rightBox: RP.length ? bb(RP) : null,
      eyeGap: gap,
    };
  })()`;

  await t.evalJs(`window.__realGH2 = Date.prototype.getHours;
    Date.prototype.getHours = function () { return 12; };`);
  await t.evalJs(`window.mascotDock.setEmotion('02')`);   // 基准态：calm 竖条
  await t.sleep(1000);
  const look = await t.evalJs(PIXEL_PROBE);

  /* ⚠ 前置闸：探针里的页面代码一旦抛错，evalJs 返回的是**空对象 {}**（不是 undefined，
   *   也不会在这里抛异常）—— 后面每条断言就都变成「undefined 上取属性」的 TypeError，
   *   报错位置和真正的原因（页面里少声明一个变量）毫无关系。
   *   实测踩过：whiteCol 忘了声明 → 报错指向 solidRatio.toFixed，查了半天。
   *   所以先验「探针结构完整」，不完整就直接说清楚。 */
  const probeOk = look && typeof look.bodyN === 'number' && typeof look.solidRatio === 'number'
    && typeof look.whiteN === 'number' && Array.isArray(look.bodyTop);
  if (!probeOk) {
    fail.push(`像素探针没跑通（返回 ${JSON.stringify(look)}）—— 后面的外观断言全部作废`);
    console.log("=== 通过 " + ok.length + " / 失败 " + fail.length + " ===");
    fail.forEach((s) => console.log("  ✗ " + s));
    console.log("页面报错：" + t.errors.slice(0, 3).join(" | "));
    process.exitCode = 1;
    await t.close();
    process.exit(1);
  }

  /* ⚠ 每条都带「非空前置」：身体/白像素一个都没测到时绝不判绿 */
  ck("① 身体是正圆（bbox 宽高相等）",
    look.bodyBox && Math.abs(look.bodyBox[0] - look.bodyBox[1]) <= 2,
    `bbox ${look.bodyBox ? look.bodyBox.join('×') : '（没测到身体像素）'}`);
  ck("① 身体实心占比 ≈ π/4（是圆，不是方/锅）",
    look.bodyBox && look.solidRatio > 0.74 && look.solidRatio < 0.83,
    `实测 ${look.solidRatio.toFixed(3)}（正圆 0.785 · 方形 1.000 · 圆角矩形 ~0.9）`);
  ck("②③ 身体只有一种颜色（无渐变 / 无高光 / 无 AO / 无地面阴影）",
    look.bodyCore > 0 && look.bodyN === 1,
    `核心像素 ${look.bodyCore} 个 · ${look.bodyN} 种：${look.bodyTop.join(' / ') || '（无）'}` +
    (look.bodyN > 1 ? ` · 边缘混色 ${look.edgeTop.join(' / ')}` : ''));
  ck("① 身体色正是 #0099FF",
    look.bodyTop[0] === '0,153,255', `实测 rgb(${look.bodyTop[0] || '-'})`);
  ck("④ 眼睛是纯白（没有虹膜 / 瞳孔 / 高光分层）",
    look.whiteN === 1 && look.whiteTop[0] === '255,255,255',
    `${look.whiteN} 种：${look.whiteTop.join(' / ') || '（无）'}`);
  ck("④ 是两只独立的眼（两个白色块）",
    !!look.leftBox && !!look.rightBox,
    `左 ${look.leftBox ? look.leftBox.join('×') : '（无）'} · 右 ${look.rightBox ? look.rightBox.join('×') : '（无）'} · 间距 ${look.eyeGap}px`);
  ck("④ 基准态眼睛是竖条（高 > 宽）",
    look.leftBox && look.leftBox[1] > look.leftBox[0] * 1.6,
    `左眼 ${look.leftBox ? look.leftBox.join('×') : '-'}（高/宽 ${look.leftBox ? (look.leftBox[1] / look.leftBox[0]).toFixed(2) : '-'}）`);

  /* 9b. 横条只留给闭眼态 —— 且不许细到看不见
   * ⚠ 这条是 2026-09-21 那次事故（把 scan 改成粗横条，19/39/40 全变闭眼）的回归网。
   *   逐情绪的全表审计在 tools/mascot-verify/check-eye-shapes.mjs，这里只抽查两格：
   *   00 睡眠 必须是横条、02 基准 必须是竖条 —— 两边都在，说明「形状在按情绪变」。 */
  await t.evalJs(`window.mascotDock.setEmotion('00')`);
  await t.sleep(1000);
  const sleep = await t.evalJs(PIXEL_PROBE);
  ck("00 睡眠是横条（闭眼态）",
    sleep.leftBox && sleep.leftBox[0] > sleep.leftBox[1] * 1.6,
    `左眼 ${sleep.leftBox ? sleep.leftBox.join('×') : '-'}（宽/高 ${sleep.leftBox ? (sleep.leftBox[0] / sleep.leftBox[1]).toFixed(2) : '-'}）`);
  ck("00 睡眠的横条不至于细成发丝（≥3px @240）",
    sleep.leftBox && sleep.leftBox[1] >= 3,
    `厚度 ${sleep.leftBox ? sleep.leftBox[1] : '-'}px`);
  ck("睡眠态仍是纯色身体（换表情不改外观契约）",
    sleep.bodyCore > 0 && sleep.bodyN === 1 && sleep.bodyTop[0] === '0,153,255',
    `核心像素 ${sleep.bodyCore} 个 · ${sleep.bodyN} 种：${sleep.bodyTop.join(' / ')}` +
    (sleep.bodyN > 1 ? ` · 边缘混色 ${sleep.edgeTop.join(' / ')}` : ''));
  await t.evalJs(`window.mascotDock.setEmotion('02')`);
  await t.sleep(600);
  await t.evalJs(`Date.prototype.getHours = window.__realGH2`);

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
