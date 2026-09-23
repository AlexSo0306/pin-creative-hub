/* 一次性目检脚本：锅宝换引擎后的「表情质量」取图。
   产出：32 表情接触表 + 侧栏容器特写（scale 4，白天表情）。
   ⚠ 这不是验收套件，只是给人眼看图用的，断言在 verify-guobao.mjs。 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch, sweep, leftover } from "/Users/alexso/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs";

const ROOT = "/Users/alexso/WorkBuddy/pin-creative-hub/拼好家内容创作中心";
const OUT = path.join(ROOT, "tools/mascot-verify/shots");
const NODE = "/Users/alexso/.workbuddy-ai/binaries/node/versions/22.22.2-3/bin/node";

sweep();

/* ---------- A. 32 表情接触表（file:// 打开） ---------- */
const sheet = pathToFileURL(path.join(ROOT, "tools/mascot-verify/emotion-sheet.html")).href;
const a = await launch({ url: sheet, width: 1360, height: 1080 });
try {
  await a.waitFor("window.__sheetReady && document.querySelectorAll('.cell').length >= 32", { timeout: 25000 });
  await a.sleep(1500);
  const n = await a.evalJs("document.querySelectorAll('.cell').length");
  const svgs = await a.evalJs("document.querySelectorAll('.stage svg').length");
  const h = await a.evalJs("Math.ceil(document.body.scrollHeight)");
  console.log(`[接触表] 格子 ${n} · SVG ${svgs} · 页高 ${h} · 报错 ${a.errors.length}`);
  if (a.errors.length) console.log("  报错样本:", a.errors.slice(0, 3));
  await a.shot(path.join(OUT, "锅宝-32表情接触表.png"));
} finally { await a.close(); }

/* ---------- B. 侧栏容器特写（真实应用，白天表情） ---------- */
const b = await launch({ url: "http://127.0.0.1:4174/", width: 1440, height: 900 });
try {
  await b.waitFor("window.mascotDock && document.querySelector('.guobao-stage svg')", { timeout: 25000 });
  await b.sleep(1500);
  /* 把时钟钉在正午 —— 否则 23:00–07:00 一律走睡眠表情，看到的是闭眼 */
  await b.evalJs("window.__realGH = Date.prototype.getHours; Date.prototype.getHours = function(){ return 12; };");

  const rect = await b.evalJs(`(() => { const r = document.querySelector('.guobao-slot').getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })()`);
  console.log(`[特写] 容器 rect ${rect.join(",")}`);

  const clip = { x: rect[0] - 6, y: rect[1] - 6, width: rect[2] + 12, height: rect[3] + 12, scale: 4 };
  const fs = await import("node:fs");
  const grab = async (name) => {
    const r = await b.send("Page.captureScreenshot", { format: "png", clip });
    if (r.result?.data) {
      const dest = path.join(OUT, `${name}.png`);
      fs.writeFileSync(dest, Buffer.from(r.result.data, "base64"));
      console.log(`  已写 ${path.basename(dest)}`);
    }
  };

  for (const id of ["02", "16", "33"]) {
    await b.evalJs(`window.mascotDock.setEmotion(${JSON.stringify(id)})`);
    await b.sleep(1100);
    await grab(`锅宝-特写-${id}`);
    const now = await b.evalJs("window.mascotDock.currentEmotion()");
    console.log(`  setEmotion(${id}) → currentEmotion() = ${now}`);
  }

  /* 浅色主题下再抓一张带特效的 —— mm-* 的颜色是按主题分档的，两边都要看 */
  await b.evalJs("document.documentElement.dataset.theme = 'fluent'");
  await b.sleep(400);
  await b.evalJs(`window.mascotDock.setEmotion('33')`);
  await b.sleep(1100);
  await grab("锅宝-特写-33-浅色");
  const mmFill = await b.evalJs(`(() => {
    const el = document.querySelector('.guobao-stage svg .mm-bubble');
    return el ? getComputedStyle(el).fill : '（无泡泡）'; })()`);
  console.log(`  浅色主题 mm-bubble fill = ${mmFill}`);
  await b.evalJs("document.documentElement.dataset.theme = 'framer'");

  await b.evalJs("Date.prototype.getHours = window.__realGH;");
  console.log(`[特写] 页面报错 ${b.errors.length}`);
} finally { await b.close(); }

console.log(`残留 Chrome 进程: ${leftover()}（应为 0）`);
