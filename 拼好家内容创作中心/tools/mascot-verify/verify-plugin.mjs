/* 锅宝挂件 · 工作台集成验证（要起真实应用，不是静态服务）
   跑法：
     DB_PATH=/tmp/wv.db PORT=4174 node server.js   # ⚠ 必须指一次性副本！
     node tools/mascot-verify/verify-plugin.mjs http://127.0.0.1:4174/
   ⚠ 绝不要对真实库直接跑 server.js —— createDatabase() 会执行 schema.sql 并 seed（src/db.js:21）。
   重点：v1 栽在「挂件完全点不动」——所以这里必须用真实指针/触摸事件，不能用 el.click()。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sweep, leftover } from "/Users/alexso/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs";

const URL_ = process.argv[2] || "http://127.0.0.1:4174/";
const SHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
fs.mkdirSync(SHOT, { recursive: true });

sweep();
const t = await launch({ url: URL_, width: 1440, height: 900 });
const fail = [];
const ok = [];
const ck = (n, c, e = "") => (c ? ok : fail).push(n + (e ? ` — ${e}` : ""));

try {
  await t.waitFor("window.mascotDock && document.querySelector('.pm-dock .gb-mascot')", { timeout: 20000 });
  await t.sleep(1600);

  /* 0. 页面确实加载了（防空页零报错假通过） */
  const title = await t.evalJs("document.title");
  ck("工作台页面已加载", /拼好家|工作台|运营/.test(title), `title=${title}`);

  /* 1. 挂件结构与默认形态 */
  const info = await t.evalJs(`(() => {
    const svg = document.querySelector('.pm-dock .gb-mascot');
    const dock = document.querySelector('.pm-dock');
    const r = svg.getBoundingClientRect();
    return {
      hasSvg: !!svg,
      shape: window.mascotDock.mascot.shape,
      ink: window.mascotDock.mascot.ink,
      state: window.mascotDock.mascot.state,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      pe: getComputedStyle(svg).pointerEvents,
      bodyFill: document.querySelector('.gb-body').getAttribute('fill'),
      eyeFill: getComputedStyle(document.querySelector('.gb-eyes path')).fill,
      dockScheme: getComputedStyle(dock).getPropertyValue('--gb-scheme').trim(),
      eyes: document.querySelectorAll('.gb-eyes path').length,
      fx: document.querySelectorAll('.gb-fx-back > *, .gb-fx-front > *').length,
    };
  })()`);
  ck("挂件已挂载到工作台", info.hasSvg === true);
  ck("默认形状是锅", info.shape === "pot", `shape=${info.shape}`);
  ck("两只眼 + 覆盖层图元池就位", info.eyes === 2 && info.fx > 30, `eyes=${info.eyes} fx=${info.fx}`);
  ck("主题探针为 dark", info.dockScheme === "dark", `--gb-scheme=${info.dockScheme}`);
  ck("墨色走纯色（品牌规范：不用渐变）", info.bodyFill === "var(--fg)", `fill=${info.bodyFill}`);
  ck("眼睛是挖空（填充背景色）", info.eyeFill === "rgb(0, 0, 0)", `eye fill=${info.eyeFill}`);
  ck("挂件在视口内", info.rect[0] > 0 && info.rect[1] > 0
    && info.rect[0] + info.rect[2] <= 1440 && info.rect[1] + info.rect[3] <= 900,
    `rect=${info.rect.join(",")}`);

  /* 2. 命中测试：必须用真实鼠标事件（el.click() 会绕过 hit-test） */
  ck("pointer-events 不是 none", info.pe !== "none", `pointer-events=${info.pe}`);

  const cx = info.rect[0] + info.rect[2] / 2;
  const cy = info.rect[1] + info.rect[3] / 2;
  const hitTop = await t.evalJs(`(() => {
    const el = document.elementFromPoint(${cx}, ${cy});
    return el ? (el.tagName + '.' + (el.getAttribute('class') || '')) : 'null';
  })()`);
  ck("挂件中心点命中自己（没被别的层盖住）",
    /path|svg|circle|rect/.test(hitTop), `elementFromPoint=${hitTop}`);

  const before = await t.evalJs("document.querySelector('.pm-dock-bubble').classList.contains('is-on')");
  await t.mouse("mousePressed", cx, cy);
  await t.mouse("mouseReleased", cx, cy);
  await t.sleep(450);
  const after = await t.evalJs("document.querySelector('.pm-dock-bubble').classList.contains('is-on')");
  ck("真实点击能钉住气泡", before === false && after === true, `${before} → ${after}`);
  const bubbleText = await t.evalJs("document.querySelector('.pm-dock-bubble').textContent");
  ck("气泡文案有内容", bubbleText.length > 2, `"${bubbleText}"`);

  /* 气泡现在是绝对定位在挂件左侧（曾经是 flex 子元素，会把挂件推着走）。
     断言它真的在左边、且有宽度 —— 换定位方式最容易出「跑到屏幕外 / 宽度塌成 0」。 */
  const bub = await t.evalJs(`(() => {
    const b = document.querySelector('.pm-dock-bubble').getBoundingClientRect();
    const h = document.querySelector('.pm-dock-holder').getBoundingClientRect();
    return { bRight: Math.round(b.right), bW: Math.round(b.width),
             hLeft: Math.round(h.left), hRight: Math.round(h.right) };
  })()`);
  ck("气泡落在挂件左侧且没塌成 0 宽",
    bub.bW > 40 && bub.bRight <= bub.hLeft + 1,
    `气泡右边=${bub.bRight} 挂件左边=${bub.hLeft} 气泡宽=${bub.bW}`);
  await t.shot(`${SHOT}/集成-气泡展开.png`);

  /* 点击应该顺带转一圈 */
  const spun = await t.evalJs("!!window.mascotDock.mascot.character.spinTurn");
  ck("点击触发整圈旋转", spun === true);

  /* API 面自诊断：曾经出现过「源码里明明有 spin，页面里却报 c.spin is not a function」。
     那次是浏览器缓存了旧模块图，排查被带偏很久。这条断言让同类故障一次说清。 */
  const api = await t.evalJs(`(() => {
    const m = window.mascotDock.mascot;
    const c = m.character;
    return {
      version: m.version,
      ctor: c && c.constructor ? c.constructor.name : "?",
      apiSpin: typeof m.spin,
      charSpin: typeof c.spin,
      proto: c ? Object.getOwnPropertyNames(Object.getPrototypeOf(c)).length : 0,
      hasState: typeof c.setState,
      hasShape: typeof c.setShape,
    };
  })()`);
  ck("角色实例 API 面完整（v2 / Character / spin 在原型上）",
    api.version === "2.0.0" && api.ctor === "Character"
    && api.apiSpin === "function" && api.charSpin === "function"
    && api.hasState === "function" && api.hasShape === "function",
    `v${api.version} ${api.ctor} 原型 ${api.proto} 法 · api.spin=${api.apiSpin} char.spin=${api.charSpin}`);

  /* 再点一次取消钉住 */
  await t.mouse("mousePressed", cx, cy);
  await t.mouse("mouseReleased", cx, cy);
  await t.sleep(400);
  const off = await t.evalJs("document.querySelector('.pm-dock-bubble').classList.contains('is-on')");
  ck("再点一次取消钉住", off === false);

  /* 3. 六个路由都要能切到合法状态 */
  const routes = ["dashboard", "inspiration", "content-plan", "review", "accounts", "knowledge"];
  const routeStates = [];
  for (const r of routes) {
    await t.evalJs(`location.hash = '#/${r}'`);
    await t.sleep(420);
    routeStates.push({ r, s: await t.evalJs("window.mascotDock.mascot.state") });
  }
  ck("六个路由都映射到合法状态",
    routeStates.every(x => x.s && x.s !== "undefined"),
    routeStates.map(x => `${x.r}=${x.s}`).join(" "));
  console.log("  路由 → 状态:", routeStates.map(x => `${x.r}→${x.s}`).join("  "));

  /* 4. 主题切换：浅色主题下墨色端点必须换一套 */
  await t.evalJs("location.hash = '#/dashboard'");
  await t.sleep(300);
  const darkEye = await t.evalJs("getComputedStyle(document.querySelector('.gb-eyes path')).fill");
  await t.evalJs("document.documentElement.setAttribute('data-theme','fluent')");
  await t.sleep(500);
  const lightInfo = await t.evalJs(`(() => ({
    scheme: getComputedStyle(document.querySelector('.pm-dock')).getPropertyValue('--gb-scheme').trim(),
    eye: getComputedStyle(document.querySelector('.gb-eyes path')).fill,
    body: document.querySelector('.gb-body').getAttribute('fill'),
  }))()`);
  ck("浅色主题探针切到 light", lightInfo.scheme === "light", `--gb-scheme=${lightInfo.scheme}`);
  ck("浅色主题下眼睛改为浅色挖空", lightInfo.eye !== darkEye, `${darkEye} → ${lightInfo.eye}`);
  await t.shot(`${SHOT}/集成-工作台-浅色.png`);

  await t.evalJs("document.documentElement.setAttribute('data-theme','')");
  await t.sleep(700);
  await t.shot(`${SHOT}/集成-工作台-深色.png`);

  /* 5. 各状态在真实页面里都能跑 */
  const states = ["idle", "working", "thinking", "writing", "curious", "drowsy", "celebrate",
    "alerting", "notifying", "loading", "uploading", "listening", "searching", "excited"];
  const bad = [];
  for (const s of states) {
    await t.evalJs(`window.mascotDock.setState(${JSON.stringify(s)})`);
    await t.sleep(320);
    const g = await t.evalJs("document.querySelector('.pm-dock .gb-mascot > g').getAttribute('transform')");
    const d = await t.evalJs("document.querySelector('.gb-body').getAttribute('d')");
    if (/NaN|Infinity/.test(g + d)) bad.push(s);
  }
  ck("14 个状态在工作台里都不产生 NaN", bad.length === 0, bad.join(","));

  /* 6. 换形状 / 换墨色 / 换眼型 */
  const swaps = await t.evalJs(`(async () => {
    const m = window.mascotDock.mascot;
    const seen = [];
    for (const sh of ["dango","bean","egg","drop","leaf","cube","capsule","pot"]) {
      m.setShape(sh);
      await new Promise(r => setTimeout(r, 380));
      seen.push(document.querySelector('.gb-body').getAttribute('d').length);
    }
    m.setInk("soda");
    await new Promise(r => setTimeout(r, 260));
    const inkNow = m.ink;
    m.setInk("ink");
    return { distinct: new Set(seen).size, inkNow };
  })()`);
  ck("8 个形状在工作台里都能切", swaps.distinct === 8, `不同路径数=${swaps.distinct}`);
  ck("换墨色生效", swaps.inkNow === "soda", `ink=${swaps.inkNow}`);

  /* 7. 移动端 390×844：尺寸收紧 + 仍然点得动 */
  await t.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await t.evalJs("location.hash = '#/dashboard'");
  await t.sleep(900);
  const m = await t.evalJs(`(() => {
    const svg = document.querySelector('.pm-dock .gb-mascot');
    const r = svg.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height),
             left: Math.round(r.left), top: Math.round(r.top),
             bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight };
  })()`);
  console.log(`  移动端挂件: ${m.w}×${m.h} @ (${m.left},${m.top}) 视口 ${m.vw}×${m.vh}`);
  ck("移动端挂件已收紧到 76px", m.w <= 80 && m.w >= 60, `${m.w}px`);
  ck("移动端挂件不超出视口", m.left >= 0 && m.left + m.w <= m.vw && m.bottom <= m.vh,
    `left=${m.left} right=${m.left + m.w} bottom=${m.bottom}`);

  const mcx = m.left + m.w / 2;
  const mcy = m.top + m.h / 2;
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mcx, y: mcy }] });
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sleep(400);
  const onM = await t.evalJs("document.querySelector('.pm-dock-bubble').classList.contains('is-on')");
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mcx, y: mcy }] });
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sleep(400);
  const offM = await t.evalJs("document.querySelector('.pm-dock-bubble').classList.contains('is-on')");
  ck("移动端触摸能开能关", onM === true && offM === false, `${onM} → ${offM}`);
  await t.shot(`${SHOT}/集成-手机390.png`);

  /* 移动端「触摸拖拽」—— 这才是用户真正要的手势（上面那组是鼠标拖）。
     顺带把挂件拖到卡片上方的空白区，拍一张证明「压内容」的问题解掉了。 */
  await t.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mcx, y: mcy }] });
  await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mcx - 110, y: mcy - 150 }] });
  await t.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mcx - 210, y: mcy - 300 }] });
  await t.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await t.sleep(450);
  const md = await t.evalJs(`(() => {
    const r = document.querySelector('.pm-dock-holder').getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top),
             bubble: document.querySelector('.pm-dock-bubble').classList.contains('is-on') };
  })()`);
  ck("移动端触摸能拖动挂件",
    Math.abs(md.x - m.left) > 80 && Math.abs(md.y - m.top) > 120,
    `(${m.left},${m.top}) → (${md.x},${md.y})`);
  ck("触摸拖拽不误触发点击（气泡没被钉住）", md.bubble === false, `bubble=${md.bubble}`);
  await t.shot(`${SHOT}/集成-手机390-拖后.png`);

  await t.send("Emulation.clearDeviceMetricsOverride", {});
  await t.sleep(400);

  /* 9. 拖拽（真实指针事件）。
     移动端的结论是「改成可拖拽」，这里是它的回归测试。
     最可能出的 bug 是「拖完把这一下误当成点击」→ 气泡被意外钉住，所以专门断言它。 */
  const holderRect = () => t.evalJs(`(() => {
    const r = document.querySelector('.pm-dock-holder').getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  })()`);

  await t.evalJs("window.mascotDock.resetPos()");
  await t.sleep(300);
  const d0 = await holderRect();
  await t.evalJs("document.querySelector('.pm-dock-bubble').classList.remove('is-on')");

  const cx0 = d0.x + d0.w / 2;
  const cy0 = d0.y + d0.h / 2;
  await t.mouse("mousePressed", cx0, cy0);
  await t.mouse("mouseMoved", cx0 - 120, cy0 - 90);
  await t.mouse("mouseMoved", cx0 - 260, cy0 - 180);
  await t.mouse("mouseReleased", cx0 - 260, cy0 - 180);
  await t.sleep(350);

  const d1 = await t.evalJs(`(() => {
    const r = document.querySelector('.pm-dock-holder').getBoundingClientRect();
    const d = document.querySelector('.pm-dock');
    return {
      x: Math.round(r.left), y: Math.round(r.top),
      bubble: document.querySelector('.pm-dock-bubble').classList.contains('is-on'),
      dragging: d.classList.contains('is-dragging'),
      stored: localStorage.getItem('phj-workbench-mascot-pos'),
    };
  })()`);

  ck("拖拽能改变挂件位置",
    Math.abs(d1.x - d0.x) > 100 && Math.abs(d1.y - d0.y) > 80,
    `(${d0.x},${d0.y}) → (${d1.x},${d1.y})`);
  ck("拖拽不误触发点击（气泡没被钉住）", d1.bubble === false, `bubble=${d1.bubble}`);
  ck("拖拽结束清掉拖拽态", d1.dragging === false, `is-dragging=${d1.dragging}`);
  ck("位置写入 localStorage", !!d1.stored, `stored=${d1.stored}`);

  /* 位置要能跨刷新保住 */
  await t.evalJs("setTimeout(() => location.reload(), 60); 1");
  await t.sleep(700);
  await t.waitFor("window.mascotDock && document.querySelector('.pm-dock .gb-mascot')", { timeout: 20000 });
  await t.sleep(700);
  const d2 = await holderRect();
  ck("刷新后位置被还原", Math.abs(d2.x - d1.x) <= 2 && Math.abs(d2.y - d1.y) <= 2,
    `期望 (${d1.x},${d1.y}) 实得 (${d2.x},${d2.y})`);

  /* 拖出屏幕必须被夹住 —— 否则再也抓不回来 */
  const cx2 = d2.x + d2.w / 2;
  const cy2 = d2.y + d2.h / 2;
  await t.mouse("mousePressed", cx2, cy2);
  await t.mouse("mouseMoved", -600, -600);
  await t.mouse("mouseReleased", -600, -600);
  await t.sleep(300);
  const d3 = await holderRect();
  ck("拖出屏幕会被夹在视口内", d3.x >= 0 && d3.y >= 0, `left=${d3.x} top=${d3.y}`);

  /* 贴到左边时，气泡必须翻到挂件右侧 —— 否则它会飘到屏幕外，用户看不见。
     这里用 say() 直接触发显示（比点一下更确定：点击是开/关切换，依赖 pinned 的内部状态）。 */
  await t.evalJs("window.mascotDock.say('气泡翻转测试', 0)");
  await t.sleep(300);
  const flip = await t.evalJs(`(() => {
    const b = document.querySelector('.pm-dock-bubble').getBoundingClientRect();
    const h = document.querySelector('.pm-dock-holder').getBoundingClientRect();
    return { flipped: document.querySelector('.pm-dock-bubble').classList.contains('is-flipped'),
             bLeft: Math.round(b.left), bW: Math.round(b.width), hRight: Math.round(h.right) };
  })()`);
  ck("挂件贴左边时气泡翻到右侧",
    flip.flipped === true && flip.bW > 40 && flip.bLeft >= flip.hRight - 1,
    `flipped=${flip.flipped} 气泡左=${flip.bLeft} 挂件右=${flip.hRight} 气泡宽=${flip.bW}`);

  /* 复位逃生口 */
  await t.evalJs("window.mascotDock.resetPos()");
  await t.sleep(350);
  const d4 = await holderRect();
  const posCleared = await t.evalJs("localStorage.getItem('phj-workbench-mascot-pos')");
  ck("resetPos() 能放回默认角落", d4.x > 1440 * 0.7 && d4.y > 900 * 0.4, `(${d4.x},${d4.y})`);
  ck("resetPos() 清掉存储的位置", posCleared === null, `stored=${posCleared}`);

  /* 8. 控制台报错 */
  const errs = t.errors.filter(e => !/favicon/i.test(e) && !/api\//i.test(e));
  ck("无前端报错", errs.length === 0, errs.slice(0, 3).join(" | "));

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
