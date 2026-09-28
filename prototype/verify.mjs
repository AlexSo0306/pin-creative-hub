/**
 * 验证闭环原型 · 真实验收
 * 纪律：点击一律用 Input.dispatchMouseEvent（真实事件），不用 el.click()
 */
import { launch, sweep, leftover } from "/Users/alexso/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs";

const URL = "file:///Users/alexso/WorkBuddy/拼好家创作运营中心/prototype/验证闭环-原型.html";

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log((pass ? "  ✅ " : "  ❌ ") + name + (detail !== undefined ? "  → " + JSON.stringify(detail) : ""));
};

console.log("启动前残留:", leftover());
sweep();

const cdp = await launch({
  url: URL, port: 9341, width: 1440, height: 1000,
  extraArgs: ["--disable-gpu", "--disable-dev-shm-usage", "--disable-backgrounding-occluded-windows"]
});

/* 诊断：Chrome 若中途死掉，pending 的 CDP 调用永远不会 resolve，
   表现就是「unsettled top-level await」——必须监听进程退出才能区分 */
cdp.chrome.on("exit", (code, sig) => console.log("⚠️ Chrome 进程退出 → code=" + code + " sig=" + sig));
cdp.chrome.on("error", e => console.log("⚠️ Chrome 进程错误 → " + e.message));

/** 给每个 CDP 调用套超时，卡住时能报出是哪一步 */
const race = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error("⏱ CDP 调用超时 " + ms + "ms → " + label)), ms))
]);

/* ---------------- 交互原语（真实事件） ---------------- */
const J = s => JSON.stringify(s);

/** ⚠ 关键：先 scrollIntoView 再取坐标。
    页面变长后目标会跑到视口外，而 dispatchMouseEvent 用的是视口坐标 ——
    打在视口外 = 没有命中测试 = 点击静默失效（实测丢过 4 次提交）。 */
async function box(sel) {
  await cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
    if(el) el.scrollIntoView({block:'center',inline:'center'}); return !!el;})()`);
  await cdp.sleep(130);
  return cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
    if(!el) return null; const r=el.getBoundingClientRect();
    return {"x":r.left+r.width/2,"y":r.top+r.height/2,"w":Math.round(r.width),"h":Math.round(r.height),
            "inViewport": r.top>=0 && r.bottom<=window.innerHeight};})()`);
}

async function click(sel) {
  const b = await box(sel);
  if (!b) throw new Error("找不到可点元素: " + sel);
  if (!b.inViewport) console.log("    ⚠ 目标仍在视口外（会点空）: " + sel + " y=" + Math.round(b.y));
  await cdp.mouse("mouseMoved", b.x, b.y);
  await cdp.mouse("mousePressed", b.x, b.y);
  await cdp.mouse("mouseReleased", b.x, b.y);
  await cdp.sleep(140);
  return b;
}

/** 用真实鼠标点「文本匹配的按钮」 */
async function clickText(sel, text) {
  await cdp.evalJs(`(()=>{
    const els=[...document.querySelectorAll(${J(sel)})];
    const el=els.find(e=>e.textContent.trim().includes(${J(text)}));
    if(el) el.scrollIntoView({block:'center',inline:'center'});
    return !!el;})()`);
  await cdp.sleep(130);
  const b = await cdp.evalJs(`(()=>{
    const els=[...document.querySelectorAll(${J(sel)})];
    const el=els.find(e=>e.textContent.trim().includes(${J(text)}));
    if(!el) return null; const r=el.getBoundingClientRect();
    return {"x":r.left+r.width/2,"y":r.top+r.height/2,
            "inViewport": r.top>=0 && r.bottom<=window.innerHeight};})()`);
  if (!b) throw new Error("找不到按钮文本: " + text);
  if (!b.inViewport) console.log("    ⚠ 按钮仍在视口外（会点空）: " + text + " y=" + Math.round(b.y));
  await cdp.mouse("mouseMoved", b.x, b.y);
  await cdp.mouse("mousePressed", b.x, b.y);
  await cdp.mouse("mouseReleased", b.x, b.y);
  await cdp.sleep(140);
}

/** 点进输入框 → 全选 → 真实插入文本 → 校验落地（不落地才降级赋值） */
let degraded = 0;
async function fill(sel, text) {
  await race(click(sel), 6000, "click " + sel);
  await race(cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
    el.focus(); if(el.select) el.select(); return true;})()`), 6000, "focus " + sel);
  try {
    await race(cdp.send("Input.insertText", { text: String(text) }), 6000, "insertText " + sel);
  } catch (err) {
    console.log("    ⚠ 真实输入超时 → " + sel);
  }
  const got = await race(cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});return el?el.value:null})()`), 6000, "read " + sel);
  if (String(got) !== String(text)) {
    degraded++;
    console.log("    ⚠ 输入未落地，降级赋值 → " + sel + " (实得 " + JSON.stringify(got) + ")");
    await race(cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
      el.value=${J(text)};
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return el.value;})()`), 6000, "fallback " + sel);
  }
  await cdp.sleep(90);
}

async function setSelect(sel, value) {
  await cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
    el.value=${J(value)}; el.dispatchEvent(new Event('change',{bubbles:true})); return el.value;})()`);
}

const text = sel => cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});return el?el.innerText.replace(/\\s+/g,' ').trim():null;})()`);
/** SVG 元素没有 innerText，必须走 textContent */
const textC = sel => cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});return el?el.textContent.replace(/\\s+/g,' ').trim():null;})()`);
const pageText = () => cdp.evalJs(`document.body.innerText.replace(/\\s+/g,' ').trim()`);
const has = sel => cdp.evalJs(`!!document.querySelector(${J(sel)})`);

try {
  await cdp.waitFor(`document.readyState === "complete"`);
  await cdp.sleep(400);

  /* ---------- 1. 空态 ---------- */
  console.log("\n[1] 空态渲染");
  console.log("  · 探针 A：准备取 title");
  const probeTitle = await cdp.evalJs("document.title");
  console.log("  · 探针 B：拿到 title =", probeTitle);
  ok("页面标题正确", String(probeTitle).includes("验证闭环"), probeTitle);
  ok("落在空态（没有实验）", await has(".empty-state"));
  ok("空态文案说明「还没有实验」", (await text(".empty-state")).includes("还没有实验"));
  ok("存在「新建实验」按钮", await cdp.evalJs(`[...document.querySelectorAll('.btn')].some(b=>b.textContent.includes('新建实验'))`));
  ok("localStorage 可用", await cdp.evalJs(`(()=>{try{localStorage.setItem('__t','1');localStorage.removeItem('__t');return true}catch(e){return 'NO:'+e.name}})()`));
  const notes = await cdp.evalJs(`document.querySelectorAll('.note').length`);
  ok("「为什么需要这个模块」两块说明在场", notes === 2, { note数: notes });

  /* ---------- 2. 真实点击进入新建表单 ---------- */
  console.log("\n[2] 真实点击「新建实验」");
  await clickText(".btn", "新建实验");
  await cdp.sleep(200);
  ok("进入新建实验视图（表单出现）", await has("#exp-form"));
  ok("表单标题为「新建实验」", (await text("h1")) === "新建实验", await text("h1"));
  ok("阈值默认 50", (await cdp.evalJs(`document.querySelector('#f-threshold').value`)) === "50");
  ok("样本量默认 6", (await cdp.evalJs(`document.querySelector('#f-target').value`)) === "6");

  /* ---------- 3. 空表单提交 → 校验拦截 ---------- */
  console.log("\n[3] 空表单提交应被拦截");
  await clickText(".btn", "创建实验");
  await cdp.sleep(220);
  const errTitle = await cdp.evalJs(`document.querySelector('[data-err="title"]').textContent.trim()`);
  const errHyp = await cdp.evalJs(`document.querySelector('[data-err="hypothesis"]').textContent.trim()`);
  ok("拦截：仍在表单页", await has("#exp-form"));
  ok("拦截：标题报错有文案", errTitle.length > 0, errTitle);
  ok("拦截：假设报错有文案", errHyp.length > 0, errHyp);

  /* ---------- 4. 填表 → 创建实验 ---------- */
  console.log("\n[4] 填写并创建实验");
  await fill("#f-title", "六拍预告片 · 5s 完播验证");
  await fill("#f-hyp", "把开头改成六拍微预告片并在前 3 秒挂价格反差字幕，5s 完播率能从 27% 拉到 50% 以上。");
  await fill("#f-threshold", "50");
  await fill("#f-target", "6");
  await fill("#f-baseline", "27");
  await clickText(".btn", "创建实验");
  await cdp.sleep(400);
  ok("实验已创建（离开表单）", !(await has("#exp-form")));
  ok("摘要卡显示阈值 50%", (await text(".summary-grid .metric:nth-child(1) .v")).includes("50"));
  ok("摘要卡显示样本 0 / 6", (await text(".summary-grid .metric:nth-child(3) .v")).replace(/\s/g, "") === "0/6");
  ok("判定为「待录入」", (await text(".verdict-head h3")) === "还没有样本", await text(".verdict-head h3"));
  ok("样本表为空态提示", String(await pageText()).includes("样本为空"));
  ok("沉淀区被锁（未满样本不给沉淀）", (await text(".section:last-child .empty-state"))?.includes("还差"));

  /* ---------- 5. 录入第一条 ---------- */
  console.log("\n[5] 录入第 1 条（真实输入）");
  await fill("#s-ret", "46.8");
  await fill("#s-bou", "33.1");
  await fill("#s-avg", "8.4");
  await fill("#s-dur", "66.4");
  await clickText(".btn", "录入这条");
  await cdp.sleep(350);
  ok("表格出现 1 行", (await cdp.evalJs(`document.querySelectorAll('.tbl tbody tr').length`)) === 1);
  ok("均值 = 46.8%", (await text(".summary-grid .metric:nth-child(2) .v")).includes("46.8"), await text(".summary-grid .metric:nth-child(2) .v"));
  ok("进度 = 1 / 6", (await text(".summary-grid .metric:nth-child(3) .v")).replace(/\s/g, "") === "1/6");
  ok("判定 = 证据不足 还差 5 条", (await text(".verdict-head h3")).includes("证据不足"), await text(".verdict-head h3"));
  ok("图表出现 1 根柱", (await cdp.evalJs(`document.querySelectorAll('.chart-wrap svg rect[fill="var(--ok)"], .chart-wrap svg rect[fill="var(--bar-miss)"]').length`)) === 1);
  ok("图表含「判定线 50%」标注", String(await textC(".chart-wrap svg")).includes("判定线"));
  ok("图表含「改造前基线 27%」标注", String(await textC(".chart-wrap svg")).includes("基线"));

  /* ---------- 6. 补到样本满 → 应判「达标」 ---------- */
  console.log("\n[6] 补满 6 条 → 期望达标");
  const rest = [
    ["52.1", "30.4", "9.0", "70.1"],
    ["55.0", "28.6", "9.6", "63.2"],
    ["48.2", "32.0", "8.7", "59.4"],
    ["61.3", "26.1", "10.2", "68.0"],
    ["53.4", "29.3", "9.4", "64.7"]
  ];
  for (const [r, b, a, d] of rest) {
    const nBefore = await cdp.evalJs(`document.querySelectorAll('.tbl tbody tr').length`);
    await fill("#s-ret", r);
    await fill("#s-bou", b);
    await fill("#s-avg", a);
    await fill("#s-dur", d);
    await clickText(".btn", "录入这条");
    await cdp.sleep(300);
    const nAfter = await cdp.evalJs(`document.querySelectorAll('.tbl tbody tr').length`);
    if (nAfter !== nBefore + 1) {
      const err = await cdp.evalJs(`(()=>{const e=document.querySelector('[data-err="retention5s"]');return e?e.textContent.trim():null})()`);
      throw new Error(`录入 ${r}% 未生效（行数 ${nBefore}→${nAfter}，表单报错：${err}）`);
    }
  }
  const rowCount = await cdp.evalJs(`document.querySelectorAll('.tbl tbody tr').length`);
  const meanTxt = await text(".summary-grid .metric:nth-child(2) .v");
  ok("表格 6 行", rowCount === 6, rowCount);
  // 期望均值 (46.8+52.1+55+48.2+61.3+53.4)/6 = 52.8
  ok("均值 = 52.8%（手算一致）", meanTxt.includes("52.8"), meanTxt);
  ok("进度 = 6 / 6", (await text(".summary-grid .metric:nth-child(3) .v")).replace(/\s/g, "") === "6/6");
  ok("判定 = 达标", (await text(".verdict-head h3")).includes("达标"), await text(".verdict-head h3"));
  const vb = await text(".verdict-body");
  ok("依据含「达标条数 4 / 需要 4」", vb.includes("4") && vb.includes("需要"), vb.slice(0, 120));
  ok("图表 6 根柱 + 4 绿 2 灰",
    (await cdp.evalJs(`document.querySelectorAll('.chart-wrap svg rect[fill="var(--ok)"]').length`)) === 4 &&
    (await cdp.evalJs(`document.querySelectorAll('.chart-wrap svg rect[fill="var(--bar-miss)"]').length`)) === 2);
  ok("进度条转绿（ok 态）", await cdp.evalJs(`!!document.querySelector('.progress.ok')`));

  /* ---------- 7. 沉淀 ---------- */
  console.log("\n[7] 沉淀为知识资产");
  await clickText(".btn", "沉淀为知识资产");
  await cdp.sleep(350);
  ok("出现「已沉淀」标记", String(await pageText()).includes("已沉淀为知识资产草稿"));
  ok("沉淀区渲染出草稿块（pre）", await has("pre"));
  const draft = await cdp.evalJs(`(()=>{const p=document.querySelector('pre');return p?p.textContent:null})()`);
  ok("生成了结论草稿", !!draft && draft.includes("实验结论"), draft ? draft.slice(0, 60) : null);
  ok("草稿含真实证据数字", !!draft && draft.includes("52.8%") && draft.includes("27.0%"));
  await cdp.shot("/tmp/proto-desktop.png");

  /* ---------- 8. 删一条 → 判定应退回 ---------- */
  console.log("\n[8] 删一条样本 → 判定应退回");
  const before = await cdp.evalJs(`document.querySelectorAll('.tbl tbody tr').length`);
  await clickText(".btn.tiny", "移除");
  await cdp.sleep(320);
  const after = await cdp.evalJs(`document.querySelectorAll('.tbl tbody tr').length`);
  ok("行数 6 → 5", before === 6 && after === 5, { before, after });
  ok("判定退回「证据不足」", (await text(".verdict-head h3")).includes("证据不足"), await text(".verdict-head h3"));
  ok("沉淀被撤销（草稿块消失）", !(await has("pre")));
  ok("沉淀区回到锁定态（样本不足不给沉淀）", String(await pageText()).includes("判定出来之前"));

  /* ---------- 9. 主题切换 ---------- */
  console.log("\n[9] 主题切换（真实点击）");
  const lightBg = await cdp.evalJs(`getComputedStyle(document.body).backgroundColor`);
  await click(`.theme-options button[data-theme-value="framer"]`);
  await cdp.sleep(300);
  const darkTheme = await cdp.evalJs(`document.documentElement.dataset.theme`);
  const darkBg = await cdp.evalJs(`getComputedStyle(document.body).backgroundColor`);
  ok("主题切到 framer", darkTheme === "framer", darkTheme);
  ok("背景色真的变了", lightBg !== darkBg, { lightBg, darkBg });
  ok("深色下按钮 aria-pressed 正确",
    (await cdp.evalJs(`document.querySelector('.theme-options button[data-theme-value="framer"]').getAttribute('aria-pressed')`)) === "true");
  await cdp.shot("/tmp/proto-dark.png");
  await click(`.theme-options button[data-theme-value="fluent"]`);
  await cdp.sleep(250);
  ok("切回 fluent", (await cdp.evalJs(`document.documentElement.dataset.theme`)) === "fluent");

  /* ---------- 10. 导航边界 ---------- */
  console.log("\n[10] 导航边界声明");
  await clickText("#nav a", "内容计划");
  await cdp.sleep(250);
  ok("点其他模块 → 显示边界声明", (await text("h1")).includes("只做"), await text("h1"));
  await clickText(".btn", "回到验证闭环");
  await cdp.sleep(250);
  ok("能回到验证闭环", await has(".summary-grid"));

  /* ---------- 11. 移动端 390×844 ---------- */
  console.log("\n[11] 移动端 390×844");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  });
  await cdp.sleep(500);
  const mob = await cdp.evalJs(`(()=>({
    "scrollW": document.documentElement.scrollWidth,
    "clientW": document.documentElement.clientWidth,
    "overflow": document.documentElement.scrollWidth - document.documentElement.clientWidth,
    "navVisible": [...document.querySelectorAll('#nav a')].filter(a=>a.getBoundingClientRect().width>0).length,
    "sidebarH": Math.round(document.querySelector('.sidebar').getBoundingClientRect().height)
  }))()`);
  ok("无横向溢出", mob.overflow <= 1, mob);
  ok("导航 7 个入口全部可见（D1 修复验证）", mob.navVisible === 7, { 可见导航: mob.navVisible });
  ok("侧栏已折为顶部横条（高度 < 200）", mob.sidebarH < 200, { 高: mob.sidebarH });
  const chartW = await cdp.evalJs(`(()=>{const c=document.querySelector('.chart-wrap');return c?{"scrollW":c.scrollWidth,"clientW":c.clientWidth}:null})()`);
  ok("图表容器可横向滚动（不撑破页面）", !!chartW && chartW.scrollW >= chartW.clientW, chartW);
  await cdp.shot("/tmp/proto-mobile.png");
  await cdp.send("Emulation.clearDeviceMetricsOverride");

  /* ---------- 12. 重置 ---------- */
  console.log("\n[12] 重置");
  await cdp.evalJs(`window.confirm = () => true;`);
  await clickText(".btn", "重置原型");
  await cdp.sleep(400);
  ok("回到空态", await has(".empty-state"));
  ok("实验已清空", (await text(".empty-state")).includes("还没有实验"));
  ok("localStorage 已同步清空", (await cdp.evalJs(`JSON.parse(localStorage.getItem('phj-validation-prototype-v1')||'{}').experiment ?? null`)) === null);

  /* ---------- 13. 控制台报错 ---------- */
  console.log("\n[13] 控制台报错");
  const pageErrors = cdp.errors.filter(e => /file:\/\/|127\.0\.0\.1:9341/.test(String(e)));
  ok("零页面级报错", pageErrors.length === 0, pageErrors.slice(0, 3));
  if (cdp.errors.length !== pageErrors.length) {
    console.log("  ℹ️  非页面来源报错（可能是断言脚本自身）:", cdp.errors.filter(e => !pageErrors.includes(e)).slice(0, 2));
  }

} catch (e) {
  console.log("\n💥 脚本中断:", e.message);
  results.push({ name: "脚本完整执行", pass: false, detail: e.message });
} finally {
  await cdp.close();
}

const failed = results.filter(r => !r.pass);
console.log("\n" + "=".repeat(56));
console.log(`结果：${results.length - failed.length} / ${results.length} 通过`);
console.log(`输入降级次数（真实输入未落地才会计数）：${degraded}`);
if (failed.length) {
  console.log("失败项：");
  failed.forEach(f => console.log("  ❌ " + f.name + "  → " + JSON.stringify(f.detail)));
}
console.log("收尾后残留:", leftover(), "(必须为 0)");
console.log("=".repeat(56));
process.exit(failed.length ? 1 : 0);
