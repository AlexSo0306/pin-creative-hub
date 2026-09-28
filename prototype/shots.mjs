/**
 * 验证闭环原型 · 演示路径验收 + 出图
 * 覆盖 verify-prototype.mjs 没测的「载入演示进度」分支，并产出可交付截图。
 * 纪律：点击一律真实事件；取坐标前先 scrollIntoView（坑 40）。
 */
import fs from "node:fs";
import { launch, sweep, leftover } from "/Users/alexso/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs";

const URL = "file:///Users/alexso/WorkBuddy/拼好家创作运营中心/prototype/验证闭环-原型.html";
const OUT = "/Users/alexso/WorkBuddy/拼好家创作运营中心/prototype/shots";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (n, p, d) => { results.push({ n, p, d }); console.log((p ? "  ✅ " : "  ❌ ") + n + (d !== undefined ? "  → " + JSON.stringify(d) : "")); };
const J = s => JSON.stringify(s);

sweep();
const cdp = await launch({ url: URL, port: 9361, width: 1280, height: 900,
  extraArgs: ["--disable-gpu", "--disable-dev-shm-usage"] });

const race = (p, ms, label) => Promise.race([p,
  new Promise((_, rj) => setTimeout(() => rj(new Error("⏱ 超时 → " + label)), ms))]);

async function clickText(sel, text) {
  await race(cdp.evalJs(`(()=>{const els=[...document.querySelectorAll(${J(sel)})];
    const el=els.find(e=>e.textContent.trim().includes(${J(text)}));
    if(el) el.scrollIntoView({block:'center'}); return !!el;})()`), 6000, "scroll " + text);
  await cdp.sleep(140);
  const b = await race(cdp.evalJs(`(()=>{const els=[...document.querySelectorAll(${J(sel)})];
    const el=els.find(e=>e.textContent.trim().includes(${J(text)}));
    if(!el) return null; const r=el.getBoundingClientRect();
    return {"x":r.left+r.width/2,"y":r.top+r.height/2,
            "inViewport": r.top>=0 && r.bottom<=window.innerHeight};})()`), 6000, "rect " + text);
  if (!b) throw new Error("找不到按钮: " + text);
  if (!b.inViewport) throw new Error("按钮在视口外（坑 40）: " + text);
  await cdp.mouse("mouseMoved", b.x, b.y);
  await cdp.mouse("mousePressed", b.x, b.y);
  await cdp.mouse("mouseReleased", b.x, b.y);
  await cdp.sleep(160);
}

async function fill(sel, val) {
  await race(cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
    el.scrollIntoView({block:'center'}); return true;})()`), 6000, "scroll " + sel);
  await cdp.sleep(120);
  const b = await race(cdp.evalJs(`(()=>{const r=document.querySelector(${J(sel)}).getBoundingClientRect();
    return {"x":r.left+r.width/2,"y":r.top+r.height/2,
            "inViewport": r.top>=0 && r.bottom<=window.innerHeight};})()`), 6000, "rect " + sel);
  if (!b.inViewport) throw new Error("输入框在视口外: " + sel);
  await cdp.mouse("mouseMoved", b.x, b.y);
  await cdp.mouse("mousePressed", b.x, b.y);
  await cdp.mouse("mouseReleased", b.x, b.y);
  await cdp.sleep(90);
  await race(cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
    el.focus(); if(el.select) el.select(); return true;})()`), 6000, "focus " + sel);
  await race(cdp.send("Input.insertText", { text: String(val) }), 6000, "type " + sel);
  const got = await race(cdp.evalJs(`document.querySelector(${J(sel)}).value`), 6000, "read " + sel);
  if (String(got) !== String(val)) {
    await race(cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
      el.value=${J(val)}; el.dispatchEvent(new Event('input',{bubbles:true})); return el.value;})()`), 6000, "fallback " + sel);
  }
  await cdp.sleep(80);
}

async function setDish(name) {
  await race(cdp.evalJs(`(()=>{const el=document.querySelector('#s-dish');
    el.value=${J(name)}; el.dispatchEvent(new Event('change',{bubbles:true})); return el.value;})()`), 6000, "dish");
}

async function fullShot(dest) {
  // ⚠ position:fixed 的元素（侧栏 / toast）在 captureBeyondViewport 下会画在
  //   「当前滚动位置」，出图前先回页顶 + 藏掉 toast，否则会飘在页面中间（技能坑 5 同类伪影）
  await cdp.evalJs(`(()=>{window.scrollTo(0,0);
    const t=document.getElementById('toast'); if(t) t.style.display='none'; return true;})()`);
  await cdp.sleep(200);
  const r = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(dest, Buffer.from(r.result.data, "base64"));
  return dest;
}

/** 元素级裁切特写（用 send，clip 用视口坐标；见技能坑 16 / 17） */
async function clipShot(sel, dest, scale = 2) {
  const b = await cdp.evalJs(`(()=>{const el=document.querySelector(${J(sel)});
    if(!el) return null; el.scrollIntoView({block:'center'}); return true;})()`);
  if (!b) throw new Error("裁切目标不存在: " + sel);
  await cdp.sleep(250);
  const r0 = await cdp.evalJs(`(()=>{const r=document.querySelector(${J(sel)}).getBoundingClientRect();
    return {"x":r.left,"y":r.top + window.scrollY,"w":r.width,"h":r.height};})()`);
  // ⚠ 实测（2026-09-23，sha256 对照实验）：captureBeyondViewport:true 时 clip 用【文档坐标】，
  //   必须加 window.scrollY。只传视口坐标会截到页面上方完全不相干的一块，且零报错。
  const r = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: r0.x, y: r0.y, width: r0.w, height: r0.h, scale: scale }
  });
  fs.writeFileSync(dest, Buffer.from(r.result.data, "base64"));
  return dest;
}

const text = () => cdp.evalJs(`document.body.innerText.replace(/\\s+/g,' ').trim()`);
const rows = () => cdp.evalJs(`document.querySelectorAll('.tbl tbody tr').length`);

try {
  await cdp.waitFor(`document.readyState === "complete"`);
  await cdp.sleep(400);

  console.log("\n[A] 空态出图");
  await fullShot(OUT + "/01-空态.png");
  ok("空态已出图", fs.existsSync(OUT + "/01-空态.png"));

  console.log("\n[B] 新建实验表单出图");
  await clickText(".btn", "新建实验");
  await cdp.sleep(250);
  ok("表单已出现", await cdp.evalJs(`!!document.querySelector('#exp-form')`));
  await fullShot(OUT + "/02-新建实验.png");

  console.log("\n[C] 载入演示进度（这条路径此前没测过）");
  await clickText(".btn", "取消");
  await cdp.sleep(250);
  await clickText(".btn", "载入演示进度");
  await cdp.sleep(450);
  ok("演示实验已载入", await cdp.evalJs(`!!document.querySelector('.summary-grid')`));
  ok("样本 4 条", (await rows()) === 4, await rows());
  ok("进度 4 / 6", String(await cdp.evalJs(`document.querySelector('.summary-grid .metric:nth-child(3) .v').innerText`)).replace(/\s/g, "") === "4/6");
  ok("判定为证据不足（还差 2 条）", String(await text()).includes("还差 2 条"));
  ok("四条样本内容各不相同（一菜一发）",
    (await cdp.evalJs(`new Set([...document.querySelectorAll('.tbl tbody tr td:nth-child(2)')].map(t=>t.textContent.trim())).size`)) === 4);
  ok("图表有 4 根柱 + 2 个待录入占位",
    (await cdp.evalJs(`document.querySelectorAll('.chart-wrap svg rect[fill="var(--ok)"], .chart-wrap svg rect[fill="var(--bar-miss)"]').length`)) === 4 &&
    (await cdp.evalJs(`document.querySelectorAll('.chart-wrap svg rect[stroke="var(--border-soft)"]').length`)) === 2);

  console.log("\n[D] 补满 6 条 → 期望「未达标」（这正是验证模块该说的话）");
  const more = [["京葱鸡胸肉饭", "58.4", "27.4", "9.7", "67.3"], ["徐福烩饭复刻", "61.2", "25.8", "10.4", "69.5"]];
  for (const [dish, r5, b2, avg, dur] of more) {
    const before = await rows();
    await setDish(dish);
    await fill("#s-ret", r5);
    await fill("#s-bou", b2);
    await fill("#s-avg", avg);
    await fill("#s-dur", dur);
    await clickText(".btn", "录入这条");
    await cdp.sleep(320);
    const after = await rows();
    if (after !== before + 1) throw new Error(`录入 ${dish} 未生效（${before}→${after}）`);
  }
  ok("表格 6 行", (await rows()) === 6, await rows());
  // 手算：(40.2+46.8+52.1+43.6+58.4+61.2)/6 = 302.3/6 = 50.383… → 50.4%
  const mean = await cdp.evalJs(`document.querySelector('.summary-grid .metric:nth-child(2) .v').innerText`);
  ok("均值 = 50.4%（手算一致）", String(mean).includes("50.4"), mean);
  // 达标条数(≥50) = 52.1 / 58.4 / 61.2 = 3 条 < 需要 4 条
  ok("判定 = 未达标（均值过线但条数不足）", String(await text()).includes("未达标"), String(await cdp.evalJs(`document.querySelector('.verdict-head h3').innerText`)));
  // 内容一致性：旁边那句话必须和数字自洽（曾实测此处写成「均值未达标」而均值 50.4% > 阈值 50.0%）
  const vb = String(await cdp.evalJs(`document.querySelector('.verdict-body').innerText.replace(/\\s+/g,' ')`));
  ok("内容自洽：均值行说「均值达标」", vb.includes("均值达标") && !vb.includes("均值未达标"), vb.slice(0, 90));
  ok("内容自洽：条数行说「条数不足」", vb.includes("条数不足"), vb.slice(0, 140));
  ok("图表 3 绿 3 灰",
    (await cdp.evalJs(`document.querySelectorAll('.chart-wrap svg rect[fill="var(--ok)"]').length`)) === 3 &&
    (await cdp.evalJs(`document.querySelectorAll('.chart-wrap svg rect[fill="var(--bar-miss)"]').length`)) === 3);
  ok("进度条转红（未达标）", await cdp.evalJs(`!!document.querySelector('.progress.bad')`));
  ok("沉淀区可沉淀（已出结论）", await cdp.evalJs(`[...document.querySelectorAll('.btn')].some(b=>b.textContent.includes('沉淀为知识资产'))`));

  console.log("\n[E] 出图 · 浅色 / 深色 / 移动端");
  // ⚠ position:fixed 的元素在 captureBeyondViewport 下会画在「当前滚动位置」，
  //   不回页顶就会看到侧栏飘在页面中间（技能坑 5 的同类伪影）
  await cdp.evalJs(`window.scrollTo(0,0)`);
  await cdp.sleep(300);
  await fullShot(OUT + "/03-实验详情-浅色.png");
  ok("浅色详情图已出", fs.existsSync(OUT + "/03-实验详情-浅色.png"));
  await clipShot(".chart-wrap", OUT + "/06-图表特写.png", 3);
  await clipShot(".verdict", OUT + "/07-判定卡特写.png", 2);
  ok("图表 / 判定卡特写已出",
    fs.existsSync(OUT + "/06-图表特写.png") && fs.existsSync(OUT + "/07-判定卡特写.png"));

  await cdp.evalJs(`(()=>{document.documentElement.dataset.theme='framer';
    document.querySelectorAll('.theme-options button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeValue==='framer')));return true;})()`);
  await cdp.sleep(400);
  await fullShot(OUT + "/04-实验详情-深色.png");
  ok("深色详情图已出", fs.existsSync(OUT + "/04-实验详情-深色.png"));

  await cdp.evalJs(`(()=>{document.documentElement.dataset.theme='fluent';
    document.querySelectorAll('.theme-options button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeValue==='fluent')));return true;})()`);
  await cdp.sleep(300);

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.sleep(600);
  const mob = await cdp.evalJs(`(()=>({
    "overflow": document.documentElement.scrollWidth - document.documentElement.clientWidth,
    "nav": [...document.querySelectorAll('#nav a')].filter(a=>a.getBoundingClientRect().width>0).length
  }))()`);
  ok("移动端无横向溢出 + 导航 7 个可见", mob.overflow <= 1 && mob.nav === 7, mob);
  await fullShot(OUT + "/05-实验详情-手机390.png");
  ok("移动端图已出", fs.existsSync(OUT + "/05-实验详情-手机390.png"));
  await cdp.send("Emulation.clearDeviceMetricsOverride");

  console.log("\n[F] 报错");
  const pageErrors = cdp.errors.filter(e => /file:\/\//.test(String(e)));
  ok("零页面级报错", pageErrors.length === 0, pageErrors.slice(0, 3));

} catch (e) {
  console.log("\n💥 中断:", e.message);
  results.push({ n: "脚本完整执行", p: false, d: e.message });
} finally {
  await cdp.close();
}

const failed = results.filter(r => !r.p);
console.log("\n" + "=".repeat(50));
console.log(`演示路径验收：${results.length - failed.length} / ${results.length} 通过`);
failed.forEach(f => console.log("  ❌ " + f.n + " → " + JSON.stringify(f.d)));
console.log("截图目录：" + OUT);
console.log("收尾后残留:", leftover());
console.log("=".repeat(50));
process.exit(failed.length ? 1 : 0);
