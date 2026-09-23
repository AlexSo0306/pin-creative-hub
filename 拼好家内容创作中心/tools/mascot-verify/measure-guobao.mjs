/* 量锅宝当前渲染出来的「眼条 / 正圆」尺寸，跟原版目标值对比。
   目标（原版 PCA 量得，占身直径）：
     眼条 长 0.1978 · 宽 0.0925 · 长宽比 2.14
     身体 宽高比 1.0004（正圆） */
import { launch, sweep, leftover } from "/Users/alexso/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs";

const TARGET = { eyeW: 0.0925, eyeH: 0.1978, aspect: 2.14, circle: 1.0004 };

sweep();
const t = await launch({ url: "http://127.0.0.1:4174/", width: 1440, height: 900 });
try {
  await t.waitFor("window.mascotDock && document.querySelector('.guobao-stage svg')", { timeout: 25000 });
  await t.evalJs("window.__r = Date.prototype.getHours; Date.prototype.getHours = function(){ return 12; };");
  await t.evalJs(`window.mascotDock.setEmotion('02')`);
  await t.sleep(1600);

  const m = await t.evalJs(`(() => {
    const svg = document.querySelector('.guobao-stage svg');
    const paths = [...svg.querySelectorAll('path')];
    /* 身体：bbox 最大的那条 path */
    const boxes = paths.map((p) => { const b = p.getBBox();
      return { w: b.width, h: b.height, x: b.x, y: b.y, cx: b.x + b.width/2, cy: b.y + b.height/2 }; });
    boxes.sort((a, b) => b.w * b.h - a.w * a.h);
    const body = boxes[0];
    /* 眼睛：剩下的两条白色实心 path，按面积排前两（排除 AO / 特效） */
    const rest = boxes.slice(1).filter((b) => b.w > 2 && b.h > 2 && b.w * b.h < body.w * body.h * 0.2);
    rest.sort((a, b) => b.w * b.h - a.w * a.h);
    const eyes = rest.slice(0, 2).map((e) => ({
      w: +e.w.toFixed(2), h: +e.h.toFixed(2), cx: +e.cx.toFixed(2), cy: +e.cy.toFixed(2),
      aspect: +(e.h / e.w).toFixed(3),
      wRel: +(e.w / body.w).toFixed(4), hRel: +(e.h / body.h).toFixed(4),
    }));
    const fills = paths.slice(0, 6).map((p) => getComputedStyle(p).fill);
    return { body: { w: +body.w.toFixed(2), h: +body.h.toFixed(2),
                     cx: +body.cx.toFixed(2), cy: +body.cy.toFixed(2),
                     circle: +(body.w / body.h).toFixed(4) },
             eyes, eyeCount: eyes.length,
             gap: eyes.length === 2 ? +(eyes[1].cx - eyes[0].cx).toFixed(2) : null,
             gapRel: eyes.length === 2 ? +((eyes[1].cx - eyes[0].cx) / body.w).toFixed(4) : null,
             bodyFill: fills[0] };
  })()`);

  console.log("身体 :", JSON.stringify(m.body), ` 目标宽高比 ${TARGET.circle}`);
  console.log("眼睛数:", m.eyeCount, " 两眼中距:", m.gap, `(占身宽 ${m.gapRel})`);
  m.eyes.forEach((e, i) => console.log(`  眼${i + 1} ${JSON.stringify(e)}`));
  if (m.eyes[0]) {
    const e = m.eyes[0];
    console.log("\n—— 与原版目标对比（占身直径）——");
    console.log(`  眼宽比  ${e.wRel}  vs 目标 ${TARGET.eyeW}   ${e.wRel > TARGET.eyeW ? "偏宽" : "偏窄"}`);
    console.log(`  眼长比  ${e.hRel}  vs 目标 ${TARGET.eyeH}   ${e.hRel > TARGET.eyeH ? "偏长" : "偏短"}`);
    console.log(`  长宽比  ${e.aspect}  vs 目标 ${TARGET.aspect}   ${e.aspect > TARGET.aspect ? "偏细" : "偏粗"}`);
  }
  console.log("\n身体 fill:", m.bodyFill, "（应是纯色 rgb，不是 url(#…)）");
  await t.evalJs("Date.prototype.getHours = window.__r;");
} finally {
  await t.close();
  console.log(`残留 Chrome 进程: ${leftover()}（应为 0）`);
}
