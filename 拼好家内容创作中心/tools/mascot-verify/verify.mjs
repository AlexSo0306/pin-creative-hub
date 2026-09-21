/* 锅宝 v2 引擎无头验证（引擎自测，不需要起服务）
   用法: node verify.mjs
   重点：不看帧率（无头会误导），看结构断言 + 数值有限性 + 几何不越界。
   页面走 file://，演示台直接 import public/ 下已提交的引擎。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sweep, leftover } from "/Users/alexso/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, "demo.html");
const SHOTS = path.join(HERE, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const URL_ = "file://" + encodeURI(FILE);

const fail = [];
const ok = [];
const ck = (name, cond, extra = "") => (cond ? ok : fail).push(name + (extra ? ` — ${extra}` : ""));

/* 0a. 静态护栏：实例字段不得与原型方法同名。
   踩过的坑：character.js 里写了 this.spin = spring(0)，而类上又有 spin() 方法。
   实例属性遮蔽原型方法 → 外部调 c.spin(1) 抛 "c.spin is not a function"，
   但 typeof c.spin 是 "object"（不是 undefined），报错文本又很像「模块没加载」，
   极易误判成浏览器缓存，排查方向被带偏。这类遮蔽完全静默，必须静态查。 */
{
  /* 引擎在 public/ 下（本目录只放工具，不放引擎副本） */
  const dir = new URL("../../public/js/components/mascot/", import.meta.url);
  const files = ["core.js", "art.js", "pose.js", "overlay.js", "character.js", "index.js"];
  const clashes = [];
  let methodCount = 0;
  for (const f of files) {
    const raw = fs.readFileSync(new URL(f, dir), "utf8");
    if (!/^\s*(export\s+)?class\s/m.test(raw)) continue;  // 只查有类定义的模块
    /* 先剥注释再扫：否则文档注释里为了说明这个坑而写的 this.spin = ... 会被当成真字段。 */
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");  // 避开 "http://..." 里的双斜杠
    const methods = new Set([...code.matchAll(/^  ([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]));
    const fields = new Set([...code.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]));
    methodCount += methods.size;
    for (const m of methods) if (fields.has(m)) clashes.push(`${f}: ${m}`);
  }
  ck("实例字段没有遮蔽同名原型方法", clashes.length === 0,
    clashes.length ? `冲突: ${clashes.join(", ")}` : `扫了 ${methodCount} 个方法名，无遮蔽`);
}

sweep();
const t = await launch({ url: URL_, width: 1280, height: 1000 });

try {
  await t.waitFor("window.__ready === true", { timeout: 15000 });

  /* 0. 页面真的加载了吗（防「服务器死了→空白页→零报错」） */
  const title = await t.evalJs("document.title");
  ck("页面标题正确", title.includes("锅宝"), `title=${title}`);
  const svgCount = await t.evalJs("document.querySelectorAll('.stage-inner svg').length");
  ck("SVG 已挂载", svgCount === 1, `count=${svgCount}`);

  /* 0b. 界面文案必须全中文 —— 按钮上不能再出现英文 id。
     踩过的坑：选择器按钮的 textContent 直接用了状态/形状/眼型的英文 id
     （dango / powering-down / crescent …），整页按钮全是英文。
     判据：每个可点选项的文字里至少有一个汉字。
     ⚠ 墨色是纯色圆点、本来就没有文字，靠 aria-label 可读，所以从文字检查里排除。 */
  const i18n = await t.evalJs(`(() => {
    const sel = '.chip:not(.swatch), button.act, .stage-label, .stage-meta';
    const els = [...document.querySelectorAll(sel)];
    const bad = els.map((e) => e.textContent.trim()).filter((s) => !/[\\u4e00-\\u9fa5]/.test(s));
    const sw = [...document.querySelectorAll('.chip.swatch')];
    const swBad = sw.filter((e) => !/[\\u4e00-\\u9fa5]/.test(e.getAttribute('aria-label') || ''));
    return { total: els.length, bad, swTotal: sw.length, swBad: swBad.length };
  })()`);
  ck("选择器/标签文案全部为中文", i18n.bad.length === 0,
    i18n.bad.length ? `英文残留: ${i18n.bad.slice(0, 8).join(" / ")}` : `查了 ${i18n.total} 个文案`);
  ck("墨色圆点有中文 aria-label", i18n.swBad === 0, `${i18n.swTotal} 个圆点，缺 ${i18n.swBad} 个`);

  /* 0c. 接触表的卡片标题也必须走标签表（静态查，省一次起浏览器）。
     它没有「按钮」，但卡片下方的 caption 与按钮同性质 —— 都是给用户看的选项名。
     动态查不划算（整页 83 个实例），静态查足够抓住「改了一个文件忘了另一个」。 */
  {
    const raw = fs.readFileSync(path.join(HERE, "sheet.html"), "utf8");
    const uses = ["STATE_LABELS[s]", "SHAPE_LABELS[n]", "EYE_LABELS[n]"].filter((k) => raw.includes(k));
    const leaks = [/cell\(grid, s\)/, /cell\(grid, n\)/].filter((re) => re.test(raw));
    ck("接触表标题走中文标签表", uses.length === 3 && leaks.length === 0,
      `命中 ${uses.length}/3 处标签表，英文泄漏 ${leaks.length} 处`);
  }

  await t.sleep(1200);

  /* 1. 动画在跑：group transform 随时间变化 */
  const tf1 = await t.evalJs("document.querySelector('.stage-inner svg > g').getAttribute('transform')");
  await t.sleep(700);
  const tf2 = await t.evalJs("document.querySelector('.stage-inner svg > g').getAttribute('transform')");
  ck("待机态在动", tf1 !== tf2, `${tf1?.slice(0, 40)} → ${tf2?.slice(0, 40)}`);
  ck("transform 无 NaN", !/NaN/.test(tf1 || "") && !/NaN/.test(tf2 || ""));

  /* 2. 遍历 8 个形状：路径合法、有界、无 NaN，且路径互不相同 */
  const shapeReport = await t.evalJs(`(async () => {
    const m = window.__mascot;
    const names = ["dango","bean","egg","drop","leaf","cube","capsule","pot"];
    const out = [];
    // viewBox 是 "-15 -15 259 259"，画框中心在 114.5，半宽 129.5
    const CX = 114.5, HALF = 129.5;
    for (const n of names) {
      m.setShape(n);
      await new Promise(r => setTimeout(r, 620));
      const body = document.querySelector('.gb-body');
      const d = body.getAttribute('d');
      const g = document.querySelector('.stage-inner svg > g').getAttribute('transform');
      const mtx = document.querySelector('.stage-inner svg > g').transform.baseVal.consolidate().matrix;
      const bbox = body.getBBox();
      const corners = [[bbox.x,bbox.y],[bbox.x+bbox.width,bbox.y],[bbox.x,bbox.y+bbox.height],[bbox.x+bbox.width,bbox.y+bbox.height]];
      let maxAbs = 0;
      for (const [x,y] of corners) {
        const px = mtx.a*x + mtx.c*y + mtx.e;
        const py = mtx.b*x + mtx.d*y + mtx.f;
        maxAbs = Math.max(maxAbs, Math.abs(px-CX), Math.abs(py-CX));
      }
      out.push({ n, len: d.length, nan: /NaN/.test(d+g), half: +maxAbs.toFixed(1), hash: d.slice(0,60) });
    }
    return out;
  })()`);

  ck("8 个形状全部可切换", shapeReport.length === 8);
  ck("形状路径无 NaN", shapeReport.every(r => !r.nan), shapeReport.filter(r=>r.nan).map(r=>r.n).join(","));
  ck("形状路径互不相同", new Set(shapeReport.map(r => r.hash)).size === 8);
  const worst = shapeReport.reduce((a, b) => (b.half > a.half ? b : a));
  // 画框半宽 129.5，允许 3px 出血（描边/贝塞尔外凸）
  ck("形状未溢出画框", shapeReport.every(r => r.half <= 132.5),
    `最大 ${worst.n}=${worst.half}（上限 132.5，画框半宽 129.5）`);
  console.log("  形状外接半宽:", shapeReport.map(r => `${r.n}=${r.half}`).join(" "));

  /* 3. 遍历 25 个眼型：两只眼都在、可见、无 NaN */
  const eyeReport = await t.evalJs(`(async () => {
    const m = window.__mascot;
    m.setShape("dango");
    await new Promise(r => setTimeout(r, 500));
    const names = ${JSON.stringify(["round","tall","wide","dot","squint","line","happy","sleepy","proud","sparkle","star","dizzy","crescent","almond","pinch","angry","sad","surprised","focus","bored","drop","tear","heart","cross","moon"])};
    const out = [];
    for (const n of names) {
      m.setEye(n);
      await new Promise(r => setTimeout(r, 420));
      const els = [...document.querySelectorAll('.gb-eyes path')];
      const vis = els.filter(e => e.style.display !== 'none');
      const tfs = els.map(e => e.getAttribute('transform') || '');
      const ds  = els.map(e => e.getAttribute('d') || '');
      const nan = tfs.concat(ds).some(s => /NaN|Infinity/.test(s));
      // 左眼中心必须 < 右眼中心；并记录实际绘制尺寸（bbox × transform 里的 scale）
      const bxs = els.map(e => e.getBBox());
      const cx = bxs.map(b => b.x + b.width/2);
      const sc = tfs[0].match(/scale\\(([\\d.]+) ([\\d.]+)\\)/);
      const w = sc ? bxs[0].width * parseFloat(sc[1]) : bxs[0].width;
      const h = sc ? bxs[0].height * parseFloat(sc[2]) : bxs[0].height;
      out.push({ n, count: els.length, visible: vis.length, nan, ordered: cx[0] < cx[1],
                 sep: +(cx[1]-cx[0]).toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) });
    }
    return out;
  })()`);

  ck("25 个眼型全部可切换", eyeReport.length === 25);
  ck("每态都有两只眼", eyeReport.every(r => r.count === 2), eyeReport.filter(r=>r.count!==2).map(r=>r.n).join(","));
  ck("眼睛无 NaN/Infinity", eyeReport.every(r => !r.nan), eyeReport.filter(r=>r.nan).map(r=>r.n).join(","));
  ck("左右眼顺序正确", eyeReport.every(r => r.ordered), eyeReport.filter(r=>!r.ordered).map(r=>r.n).join(","));
  ck("眼睛可见（未被裁掉）", eyeReport.every(r => r.visible >= 1), eyeReport.filter(r=>r.visible<1).map(r=>r.n).join(","));
  const sepMin = Math.min(...eyeReport.map(r => r.sep));
  const sepMax = Math.max(...eyeReport.map(r => r.sep));
  console.log(`  眼距范围: ${sepMin} … ${sepMax}`);
  ck("眼距稳定（不重叠也不分家）", sepMin > 20 && sepMax < 120, `${sepMin}…${sepMax}`);

  /* 关键：眼型必须真的有尺寸差异，否则 _ee 守卫把 25 个形都压成一样大 */
  const talls = eyeReport.find(r => r.n === "tall");
  const ws = eyeReport.map(r => r.w);
  const hs = eyeReport.map(r => r.h);
  console.log(`  tall 眼: ${talls.w}×${talls.h}（参考基准 30.1×38.6）`);
  console.log(`  眼宽范围 ${Math.min(...ws)}…${Math.max(...ws)}  眼高范围 ${Math.min(...hs)}…${Math.max(...hs)}`);
  ck("默认眼尺寸贴合参考比例", Math.abs(talls.w - 30.1) < 3.5 && Math.abs(talls.h - 38.6) < 3.5,
    `${talls.w}×${talls.h} vs 30.1×38.6`);
  ck("眼型之间有尺寸差异", Math.max(...hs) - Math.min(...hs) > 10,
    `高差 ${(Math.max(...hs)-Math.min(...hs)).toFixed(1)}px`);

  /* 4. 遍历 39 个状态：都能切换且不报错、transform 合法 */
  const stateReport = await t.evalJs(`(async () => {
    const m = window.__mascot;
    const states = ${JSON.stringify(["sleeping","waking","idle","listening","thinking","searching","working","excited","surprised","suspicious","angry","drowsy","happy","curious","confused","bored","proud","shy","sad","laughing","scared","playful","celebrate","orbit","radar","progress","spawning","humming","loading","dictating","writing","sending","receiving","uploading","notifying","alerting","dragging","bouncing","powering-down"])};
    const bad = [];
    const seen = [];
    for (const s of states) {
      m.setState(s);
      await new Promise(r => setTimeout(r, 360));
      const g = document.querySelector('.stage-inner svg > g').getAttribute('transform');
      const d = document.querySelector('.stage-inner svg path').getAttribute('d');
      if (/NaN|Infinity/.test(g + d)) bad.push(s);
      seen.push(s);
    }
    return { bad, count: seen.length };
  })()`);
  ck("39 个状态全部可切换", stateReport.count === 39);
  ck("状态动画无 NaN/Infinity", stateReport.bad.length === 0, stateReport.bad.join(","));

  /* 4b. 每个状态下眼睛都必须「大部分时间」看得见。
     接触表暴露过 excited / playful 整块空白 —— 排查后确认不是 bug：
     这两个状态会周期性触发整圈旋转，旋转时眼睛滑到轮廓背面被隐藏（参考同样如此）。
     所以判据用「可见帧占比」而不是峰值，否则会把正常的旋转动作误判成故障。 */
  const eyeVis = await t.evalJs(`(async () => {
    const m = window.__mascot;
    m.setShape("dango");
    const states = ${JSON.stringify(["sleeping","waking","idle","listening","thinking","searching","working","excited","surprised","suspicious","angry","drowsy","happy","curious","confused","bored","proud","shy","sad","laughing","scared","playful","celebrate","orbit","radar","progress","spawning","humming","loading","dictating","writing","sending","receiving","uploading","notifying","alerting","dragging","bouncing","powering-down"])};
    const out = [];
    for (const s of states) {
      m.setState(s);
      const N = 16;
      let framesWithEye = 0, peak = 0;
      for (let k = 0; k < N; k++) {
        await new Promise(r => setTimeout(r, 120));
        let any = 0;
        for (const e of document.querySelectorAll('.gb-eyes path')) {
          if (e.style.display === 'none') continue;
          const b = e.getBBox();
          const tf = e.getAttribute('transform') || '';
          const sc = tf.match(/scale\\(([\\d.]+) ([\\d.]+)\\)/);
          const a = b.width * b.height * (sc ? parseFloat(sc[1]) * parseFloat(sc[2]) : 1);
          if (a > peak) peak = a;
          if (a > 100) any++;
        }
        if (any > 0) framesWithEye++;
      }
      out.push({ s, peak: +peak.toFixed(1), ratio: +(framesWithEye / N).toFixed(2) });
    }
    return out;
  })()`);
  const blind = eyeVis.filter(r => r.ratio < 0.55 || r.peak < 300);
  ck("每个状态眼睛大部分时间可见", blind.length === 0,
    blind.map(r => `${r.s}(可见率${r.ratio}/峰值${r.peak})`).join(" / "));
  console.log("  各状态眼睛可见率（最低 5 个）:",
    [...eyeVis].sort((a, b) => a.ratio - b.ratio).slice(0, 5)
      .map(r => `${r.s}=${r.ratio}`).join(" "));

  /* 4c. 眼睛不得高频抖动 —— 「眼睛在抖」的回归护栏。
     成因（已修）：_paint 里用 now（**毫秒**）驱动两个高频正弦当「微颤」——
       sin(now * 0.042) 周期 ≈150ms（6.7Hz）· sin(now * 0.058) 周期 ≈108ms（9.2Hz）
     振幅 1.4 / 0.9，左右眼还差一个相位；更糟的是它经 vl → liveSpan → 横向夹取
     被放大成整块跳动。
     判据选 sleeping 态：视线是 HOLD_GAZE 固定值、不眨眼、无指针、眼型 6s 后才轮播。

     ⚠ 判据用「方向反转次数」，**不要用总位移**。
       第一版写的是「总位移 < 0.2」，实测会抖：同一份代码在完整套件里测得 dy=0、
       单独跑测得 dy=0.3 —— 差的是眼型形变弹簧最后 0.1% 的**单调收敛残余**，不是抖动。
       阈值卡在 0.2 就成了掷骰子（假红）。
       反转次数则差一个数量级：单调收敛 0 次 vs 6.7Hz 微颤在 1.2s 内约 8 次。
     ⚠ 还必须同时断言「身体确实在动」：rAF 被节流时眼睛本来就不刷新，
       只查眼睛会**恒绿空转**，护栏看着绿其实什么都没测。 */
  const jitter = await t.evalJs(`(async () => {
    const m = window.__mascot;
    m.setShape("dango");
    m.setState("idle");
    await new Promise(r => setTimeout(r, 120));
    m.setState("sleeping");                       // 必须真的切一次：同态 setState 会早退
    await new Promise(r => setTimeout(r, 1400));  // 等弹簧落定，也避开 6s 后的眼型轮播
    const body = () => document.querySelector('.stage-inner svg > g').getAttribute('transform');
    const eye  = () => document.querySelector('.gb-eyes path').getAttribute('transform') || '';
    const b0 = body();
    const xs = [], ys = [];
    for (let k = 0; k < 40; k++) {
      await new Promise(r => setTimeout(r, 30));
      const mt = eye().match(/translate\\(([-\\d.]+) ([-\\d.]+)\\)/);
      if (mt) { xs.push(parseFloat(mt[1])); ys.push(parseFloat(mt[2])); }
    }
    /* 抖动 = 来回摆，不是「有位移」。0.05 死区挡掉浮点噪声。 */
    const rev = (a) => {
      let n = 0, dir = 0;
      for (let i = 1; i < a.length; i++) {
        const d = a[i] - a[i - 1];
        if (Math.abs(d) < 0.05) continue;
        const s = Math.sign(d);
        if (dir && s !== dir) n++;
        dir = s;
      }
      return n;
    };
    const span = (a) => Math.max(...a) - Math.min(...a);
    return { n: xs.length, revX: rev(xs), revY: rev(ys),
             dx: +span(xs).toFixed(2), dy: +span(ys).toFixed(2), bodyMoved: b0 !== body() };
  })()`);
  ck("抖动检测有效（采样期内身体确实在动）", jitter.bodyMoved === true,
    jitter.bodyMoved
      ? "body 在动 → 采样有效（排除「rAF 被节流导致空转通过」）"
      : "body transform 没变化 → rAF 被节流，本条护栏在空转，结论不可信");
  ck("眼睛不抖动（无高频来回摆动）",
    jitter.n >= 35 && jitter.revX <= 1 && jitter.revY <= 1,
    `采样 ${jitter.n} 帧，方向反转 水平 ${jitter.revX} / 垂直 ${jitter.revY} 次（阈值 ≤1）`
    + `；总位移 水平 ${jitter.dx} / 垂直 ${jitter.dy}（仅作参考，不作判据）`);

  /* 5. 覆盖动效层：有 overlay 的状态应产生图元 */
  const fxReport = await t.evalJs(`(async () => {
    const m = window.__mascot;
    const pairs = [["thinking","dots"],["loading","whirl"],["writing","pencil"],["alerting","bang"],["dictating","wave"],["uploading","dock"],["bouncing","ball"],["sending","send"],["receiving","receive"],["orbit","orbit"],["radar","radar"],["spawning","gather"],["powering-down","standby"],["progress","progress"]];
    const out = [];
    for (const [s] of pairs) {
      m.setState("idle");
      await new Promise(r => setTimeout(r, 260));
      m.setState(s);
      await new Promise(r => setTimeout(r, 900));
      const els = [...document.querySelectorAll('.stage-inner svg g g circle, .stage-inner svg g g rect, .stage-inner svg g g path[stroke]')];
      const shown = els.filter(e => e.style.display !== 'none' && parseFloat(e.style.opacity || 1) > 0.02);
      out.push({ s, shown: shown.length });
    }
    return out;
  })()`);
  const noFx = fxReport.filter(r => r.shown === 0);
  ck("14 种覆盖动效都有图元", noFx.length === 0, noFx.map(r => r.s).join(","));
  console.log("  覆盖图元数:", fxReport.map(r => `${r.s}=${r.shown}`).join(" "));

  /* 5b. 覆盖动效不得溢出画框 —— 用真实几何测，不靠肉眼。
     这是上一轮接触表暴露出来的真问题：alerting/uploading/bouncing 的图元跑到框外压住标签。 */
  const fxBounds = await t.evalJs(`(async () => {
    const m = window.__mascot;
    const states = ["thinking","loading","writing","alerting","dictating","uploading",
                    "bouncing","sending","receiving","orbit","radar","spawning","powering-down","progress"];
    const CX = 114.5, LIMIT = 129.5;
    const worst = [];
    for (const s of states) {
      m.setState("idle");
      await new Promise(r => setTimeout(r, 240));
      m.setState(s);
      await new Promise(r => setTimeout(r, 950));
      const g = document.querySelector('.stage-inner svg > g');
      const mtx = g.transform.baseVal.consolidate().matrix;
      let mx = 0, who = "";
      for (const e of document.querySelectorAll('.gb-fx-back > *, .gb-fx-front > *')) {
        if (e.style.display === 'none' || parseFloat(e.style.opacity || 1) < 0.02) continue;
        const b = e.getBBox();
        for (const [x,y] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]) {
          const px = mtx.a*x + mtx.c*y + mtx.e, py = mtx.b*x + mtx.d*y + mtx.f;
          const d = Math.max(Math.abs(px-CX), Math.abs(py-CX));
          if (d > mx) { mx = d; who = e.tagName; }
        }
      }
      worst.push({ s, over: +(mx - LIMIT).toFixed(1) });
    }
    return worst;
  })()`);
  const spill = fxBounds.filter(r => r.over > 0);
  ck("覆盖动效不出画框", spill.length === 0,
    spill.map(r => `${r.s} 超 ${r.over}px`).join(" / "));
  console.log("  覆盖图元最大外接（超出量，≤0 为安全）:",
    fxBounds.map(r => `${r.s}=${r.over}`).join(" "));

  /* 6. 墨色：切换后渐变 stop 变化；主题切换后同一墨色解析成不同端点 */
  const inkReport = await t.evalJs(`(async () => {
    const m = window.__mascot;
    const out = [];
    for (const n of ["ink","chili","matcha","soda","taro"]) {
      m.setInk(n);
      await new Promise(r => setTimeout(r, 200));
      const stops = [...document.querySelectorAll('.gb-mascot stop')].map(s => s.getAttribute('stop-color'));
      const grad = document.querySelector('.gb-mascot linearGradient');
      out.push({ n, stops, units: grad.getAttribute('gradientUnits'), x1: grad.getAttribute('x1') });
    }
    return out;
  })()`);
  ck("墨色切换生效", new Set(inkReport.map(r => JSON.stringify(r.stops))).size === 5);
  ck("渐变为 userSpaceOnUse 实色", inkReport.every(r => r.units === "userSpaceOnUse"
    && r.stops.every(s => /^#[0-9A-Fa-f]{6}$/.test(s))),
  inkReport[0].stops.join(",") + " / " + inkReport[0].units);
  ck("渐变起点随角度落在画框外沿", Math.abs(parseFloat(inkReport[0].x1) - (-15)) < 0.5,
    `x1=${inkReport[0].x1}（期望 -15）`);

  /* 同一墨色在亮/暗主题下必须解析成不同端点 */
  const themeInk = await t.evalJs(`(async () => {
    const m = window.__mascot;
    m.setInk("chili");
    const read = () => [...document.querySelectorAll('.gb-mascot stop')].map(s => s.getAttribute('stop-color')).join("|");
    document.documentElement.setAttribute('data-theme','light');
    await new Promise(r => setTimeout(r, 250));
    const light = read();
    document.documentElement.setAttribute('data-theme','dark');
    await new Promise(r => setTimeout(r, 250));
    const dark = read();
    return { light, dark };
  })()`);
  ck("同一墨色随主题换端点", themeInk.light !== themeInk.dark, `${themeInk.light} vs ${themeInk.dark}`);
  ck("眼睛填充为背景色（挖空）", await t.evalJs(
    "getComputedStyle(document.querySelector('.gb-eyes path')).fill") !== "none");

  /* 7. 主题切换不崩 */
  await t.evalJs("document.documentElement.setAttribute('data-theme','dark')");
  await t.sleep(600);
  const darkOk = await t.evalJs("(()=>{const g=document.querySelector('.stage-inner svg > g').getAttribute('transform');return !/NaN/.test(g)})()");
  ck("暗色主题下仍正常", darkOk === true);

  /* 8. 性能：每帧同步耗时（真正的指标） */
  const cost = await t.evalJs("document.getElementById('cost').textContent");
  console.log("  每帧同步耗时:", cost);
  ck("每帧同步耗时 < 2ms", parseFloat(cost) < 2, cost);

  /* 9. 截图 */
  await t.evalJs("document.documentElement.setAttribute('data-theme','light')");
  await t.evalJs("window.__mascot.setState('idle')");
  await t.sleep(900);
  await t.shot(path.join(SHOTS, "实拍-演示台-亮.png"));
  await t.evalJs("document.documentElement.setAttribute('data-theme','dark')");
  await t.evalJs("window.__mascot.setState('thinking')");
  await t.sleep(1200);
  await t.shot(path.join(SHOTS, "实拍-演示台-暗.png"));

  /* 控制台报错 */
  const errs = t.errors.filter(e => !/favicon/i.test(e));
  ck("无控制台报错", errs.length === 0, errs.slice(0, 3).join(" | "));

} catch (e) {
  fail.push("脚本异常: " + e.message);
} finally {
  await t.close();
}

console.log("\n===== 通过 " + ok.length + " =====");
for (const o of ok) console.log("  ✓ " + o);
if (fail.length) {
  console.log("\n===== 失败 " + fail.length + " =====");
  for (const f of fail) console.log("  ✗ " + f);
}
const rest = leftover();
console.log("\n残留 Chrome 进程: " + rest + (rest === 0 ? " ✓" : " ✗ 需 sweep"));
process.exit(fail.length ? 1 : 0);
