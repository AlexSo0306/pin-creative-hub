/* 在 Node 里加载引擎的 geometry.js，对「每个眼形槽位 × 锅宝的眼型基调」
 * 算出真实多边形，并做退化检测。目的：在截图之前就用数字抓出 ▲ 这种坏形状。
 *
 * ⚠ 指标本身必须先被验证（本项目的老教训）。见文件末尾的 --self-test：
 *   它拿**未覆盖**的上游 happy/happy2（就是当初渲染成 ▲ 的那两个）跑同一套指标，
 *   指标必须把它们判为坏 —— 否则指标就是无效的。
 *
 * 检测项：
 *   面积/凸包      自交的蝴蝶结形会掉到 ~0.5；正常凸形 ≈ 1.0
 *   窗口转向角     每点转向角会被密采样摊薄（端点采样密 → 相邻段只转 1~3°），
 *                  所以改成看 ±W 点的**弦转角**，真正的尖角才会冒尖
 *   内缘间隙       两眼是否挤在一起
 *   出画           眼睛是否超出身体轮廓
 */
import fs from 'node:fs';
import path from 'node:path';

const SELF_TEST = process.argv.includes('--self-test');
const DUMP_JSON = process.argv.includes('--json');

const ROOT = '/Users/alexso/WorkBuddy/pin-creative-hub/拼好家内容创作中心';
const CORE = path.join(ROOT, 'public/js/vendor/mood-mates/core');
global.window = {};
new Function(fs.readFileSync(path.join(CORE, 'geometry.js'), 'utf8'))();
const GEO = window.MoodMates.geo;

/* ---- 锅宝参数：**从真文件读**，不在本脚本里抄一份 ----
 * ⚠ 2026-09-21 教训：本脚本原来把 STYLE / CUSTOM 手抄在源码里。
 *   结果 guobao.js 里一个多余的 `*` 把整个文件打成语法错误、浏览器加载不了
 *   （接触表 32 格只剩 1 格、控制台报 SyntaxError），而本脚本照样报
 *   「22 槽位全绿、退化 0 个」—— 因为它压根没碰那个文件。
 *   **体检脚本若不读被测文件，绿灯就是假的。**
 *   手抄的表还会与真表悄悄漂移（这个坑在对拍脚本上已经踩过一次）。
 *   现在改成：给 characters 挂一个桩，加载真 guobao.js，捕获 register 的参数。
 *   表与真源从此同一份；guobao.js 一旦坏掉，本脚本第一时间红。 */
let CAPTURED = null;
window.MoodMates.characters = { register: (def) => { CAPTURED = def; } };
try {
  new Function(fs.readFileSync(path.join(ROOT, 'public/js/components/guobao.js'), 'utf8'))();
} catch (e) {
  console.error('❌ guobao.js 加载失败 —— 体检无法进行（这本身就是最该拦住的缺陷）：');
  console.error('   ' + e.constructor.name + ': ' + e.message);
  process.exit(3);
}
if (!CAPTURED) {
  console.error('❌ guobao.js 没有调用 window.MoodMates.characters.register()，取不到角色定义');
  process.exit(3);
}
const STYLE = CAPTURED.eyeStyle;
const CUSTOM = CAPTURED.eyeShapes || {};
/* 非空断言：别让「表读空了」也走成绿灯 —— 空集合上的断言恒真。 */
if (!STYLE || typeof STYLE.w !== 'number' || typeof STYLE.h !== 'number') {
  console.error('❌ guobao.js 的 eyeStyle 缺失或 w/h 不是数字');
  process.exit(3);
}
if (Object.keys(CUSTOM).length === 0) {
  console.error('❌ guobao.js 的 eyeShapes 为空');
  process.exit(3);
}
/* ⚠ 这行走 stderr：--json 的 stdout 必须是纯 JSON，对拍脚本要 JSON.parse 它。 */
if (!DUMP_JSON) {
  console.error(`[源] guobao.js 已加载 · eyeStyle ${STYLE.w}×${STYLE.h} · eyeShapes ${Object.keys(CUSTOM).length} 个`);
}

/* ---------------- 几何小工具 ---------------- */
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0; } return a / 2; };
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
/* 窗口弦转角：看第 i-W 点到 i 点、i 点到 i+W 点两条弦的夹角。
 * 密采样不会摊薄它；真正的尖角会留下大角度。 */
function maxChordTurn(p, W = 4) {
  const n = p.length;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = p[(i - W + n) % n], b = p[i], c = p[(i + W) % n];
    const v1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const v2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    const d = Math.abs(((v2 - v1) * 180 / Math.PI + 540) % 360 - 180);
    if (d > m) m = d;
  }
  return m;
}
const bbox = (p) => { const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };

/* 阈值 —— 不是拍脑袋，是拿**原项目自己的 25 个眼形**量出来的（脚本 /tmp/grok-ref/calib.mjs）：
 *   原版凸包比 0.965 ~ 1.000（均值 0.993）  → 阈值取 0.95，低于它说明自交/退化
 *   原版弦转角 31.6° ~ 89.1°（均值 61.5°） → 阈值取 95°，高于它说明端部折成了尖角
 * ⚠ 第一版阈值（0.80 / 62°）是猜的，结果把基准眼 calm 都判成坏 —— 指标先于被测对象出错。
 *   教训：定阈值要对着「目标」量，不要对着直觉猜。 */
const MIN_AR = 0.95;
const MAX_TURN = 95;
const MIN_GAP = 4;

/* 身体半径：puff r=1.10 waves=[] → 正圆。放在最前，因为自检也要用它做出画判定。 */
const bodyRing = GEO.buildBody({ type: 'puff', r: 1.10, waves: [] });
const BODY_R = (Math.max(...bodyRing.map((p) => p[0])) - Math.min(...bodyRing.map((p) => p[0]))) / 2;

function evalSlot(name, custom) {
  const merged = Object.assign({ w: STYLE.w, h: STYLE.h, taper: STYLE.taper, tilt: STYLE.tilt, bend: STYLE.bend }, custom || {});
  /* 补丁 ④：形状自带 dx 时用它，否则回落角色级 STYLE.dx */
  const dx = (custom && custom.dx != null) ? custom.dx : STYLE.dx;
  const pair = custom
    ? [GEO.lens(GEO.C - dx, STYLE.cy, merged, 1), GEO.lens(GEO.C + dx, STYLE.cy, merged, -1)]
    : GEO.buildEyePair(name, STYLE);
  const [L, R] = pair;
  const b = bbox(L);
  const ar = Math.abs(area(L)) / Math.abs(area(hull(L)));
  const turn = maxChordTurn(L, 4);
  const gap = Math.min(...R.map((p) => p[0])) - Math.max(...L.map((p) => p[0]));
  const issues = [];
  if (ar < MIN_AR) issues.push(`自交(凸包比 ${ar.toFixed(2)})`);
  if (turn > MAX_TURN) issues.push(`尖角(弦转 ${turn.toFixed(0)}°)`);
  if (gap < MIN_GAP) issues.push('两眼过近');
  /* 出画：眼睛必须整体落在身体圆内（留 6px 余量），否则会被剪影切掉 */
  const rs = [...L, ...R];
  const far = Math.max(...rs.map((p) => Math.hypot(p[0] - GEO.C, p[1] - GEO.C)));
  if (far > BODY_R - 6) issues.push(`出画(${far.toFixed(0)}>${(BODY_R - 6).toFixed(0)})`);
  return { b, ar, turn, gap, dx, far, issues };
}

/* ---------------- 自检：指标必须抓得住当初那个 ▲ ---------------- */
const upstream = GEO.eyeSlots;

/* 单一真源：别的脚本（对拍图、断言）要形状表时走 `--json` 拿，不要各自抄一份。
 * ⚠ 曾因此踩坑：对拍脚本自己抄了一份旧 taper，改完 guobao.js 后对拍数字纹丝不动，
 *   差点当成「改动没生效」。表只有一份，谁要谁问。 */
if (DUMP_JSON) {
  console.log(JSON.stringify({ style: STYLE, shapes: CUSTOM, bodyRadius: BODY_R, center: GEO.C }, null, 2));
  process.exit(0);
}

if (SELF_TEST) {
  console.log('=== 指标自检：拿「未覆盖的上游拱形槽位」跑同一套阈值 ===');
  console.log('（当初渲染成 ▲ 的就是这两个；指标必须判它们坏，否则指标无效）\n');
  let caught = 0;
  for (const n of ['happy', 'happy2']) {
    const r = evalSlot(n, null);          // custom = null → 走上游原版
    const bad = r.issues.length > 0;
    if (bad) caught++;
    console.log(`  上游 ${n.padEnd(7)} bbox ${r.b.w.toFixed(1)}×${r.b.h.toFixed(1)}  凸包比 ${r.ar.toFixed(3)}  弦转 ${r.turn.toFixed(1)}°  → ${bad ? '✅ 已捕获：' + r.issues.join(' ') : '❌ 漏检'}`);
  }
  console.log(`\n自检结果：${caught}/2 ${caught === 2 ? '✅ 指标有效' : '❌ 指标无效，先修指标'}\n`);
  if (caught !== 2) process.exit(2);
}

/* ---------------- 全槽位体检 ---------------- */
console.log(`身体：中心 ${GEO.C}  半径 ${BODY_R.toFixed(1)}  直径 ${(BODY_R * 2).toFixed(1)}`);
const overridden = Object.keys(CUSTOM).filter((k) => upstream.includes(k));
console.log(`上游槽位 ${upstream.length} 个；同名覆盖 ${overridden.length} 个：${overridden.join(', ')}`);
console.log(`自定义新增：${Object.keys(CUSTOM).filter((k) => !upstream.includes(k)).join(', ') || '（无）'}\n`);

console.log('槽位      | 来源  | 单眼 bbox w×h  | 凸包比 | 弦转角 | dx   | 内缘间隙 | 离圆心最远 | 判定');
console.log('----------+-------+----------------+--------+--------+------+----------+------------+------');
let bad = 0;
for (const n of [...new Set([...upstream, ...Object.keys(CUSTOM)])].sort()) {
  const r = evalSlot(n, CUSTOM[n] || null);
  const src = CUSTOM[n] ? (upstream.includes(n) ? '覆盖' : '新增') : '上游';
  if (r.issues.length) bad++;
  console.log(
    n.padEnd(9) + ' | ' + src.padEnd(5) + ' | ' +
    (r.b.w.toFixed(1) + '×' + r.b.h.toFixed(1)).padStart(14) + ' | ' +
    r.ar.toFixed(3).padStart(6) + ' | ' +
    (r.turn.toFixed(1) + '°').padStart(6) + ' | ' +
    r.dx.toFixed(1).padStart(4) + ' | ' +
    r.gap.toFixed(1).padStart(8) + ' | ' +
    r.far.toFixed(0).padStart(10) + ' | ' +
    (r.issues.length ? '❌ ' + r.issues.join(' ') : '✅')
  );
}
console.log(`\n退化槽位：${bad} 个`);

/* ---------------- 横条许可审计 ----------------
 * 原版语汇里真正的「横条」（主轴长/短 ≈ 3.6~4.1）只有 idx 4 / 13 / 22 三个，
 * 且只出现在 sleeping / drowsy / bored / sad 四种状态里；它的 searching 用的是**近圆**
 * （idx 9/12/18 长/短 = 1.09/1.09/1.03）。也就是说：横条在我们的语汇里**等于闭眼**。
 *
 * 我们的横条形状 = closed / closed2 / sleepy。任何情绪的池子里只要含这三个，
 * 轮换到那一格就会渲染成闭眼。所以必须逐情绪审一遍：**谁有资格用横条**。
 *
 * ⚠ 这条断言为什么必须存在：
 *   2026-09-21 把 scan / scan2 / scan3 从上游扁眼改成了 50.4×14.1 的粗横条，
 *   于是 19 满意 / 39 输出回复 / 40 检索资料（池子里都带 scan，其中两个 scan 在首位）
 *   连同 03 好奇 / 30 思考中 一起变成闭眼。当时**没有任何断言拦得住**，
 *   是靠人眼盯接触表发现的。改共享槽位 → 影响面是全表，必须有自动审计。
 */
new Function(fs.readFileSync(path.join(ROOT, 'public/js/vendor/mood-mates/data/emotions.js'), 'utf8'))();
const SEED = window.EMOTION_SEED;
const OVR = CAPTURED.emotions || {};

/* 每个槽位的长/短比（用主轴近似：tilt=0 时 bbox 就是主轴） */
const ratioOf = {};
for (const n of [...new Set([...upstream, ...Object.keys(CUSTOM)])]) {
  const r = evalSlot(n, CUSTOM[n] || null);
  ratioOf[n] = r.b.h / r.b.w;
}
/* 横条阈值 **按数据定，不是拍脑袋**：
 *   实测算下来的长/短比，横条族是 closed 0.28 / closed2 0.26 / sleepy 0.24，
 *   而次低的槽位是 scan3 0.60 —— 中间空着一大段（0.28 → 0.60）。
 *   取空档中点 0.44 ≈ **0.45** 做分界。
 *   ⚠ 第一版取 0.62（凭「看着扁」的印象），把 scan3 误判成横条，审计当场误报。 */
const BAR_RATIO = 0.45;
const BAR_SLOTS = Object.keys(ratioOf).filter((k) => ratioOf[k] < BAR_RATIO);
/* 有资格用横条的情绪：闭眼 / 醒来 / 发呆 / 困倦 / 难过 / 害羞 / 停止。
 * 14 害羞 是上游种子里就带 closed2 的（害羞时把眼闭紧），保留 —— 但在此**显式登记**，
 * 免得日后有人往别处加横条时，顺手把这一条也一起放宽。 */
const BAR_ALLOWED = new Set(['00', '01', '04', '06', '07', '12', '14', '15', '41']);
/* 有效厚度下限：openness 是**乘在眼睛短轴上的**（engine.js:1076 openS → pose.open）。
 * 低于 4px 就会被压成一根发丝 —— 2026-09-21 的 00 睡眠就是这么坏的
 * （closed 高 14.1 × openness 0.08 = 1.1px，接触表上整格看着像空的）。 */
const MIN_THICK = 4;

console.log(`\n=== 横条许可审计（横条槽位：${BAR_SLOTS.join(' / ')}）===`);
console.log(`（横条 = 单眼 长/短 < ${BAR_RATIO}。原版只有 sleeping/drowsy/bored/sad 用横条）\n`);

let viol = 0, examined = 0, withBars = 0;
for (const d of SEED) {
  examined++;
  const o = OVR[d.id] || {};
  const pool = o.pool || d.pool || [];
  const bars = pool.filter((s) => BAR_SLOTS.includes(s));
  if (bars.length) withBars++;
  const open = o.openness != null ? o.openness : (d.openness != null ? d.openness : 1);
  /* 池子里最薄的那一格 × openness = 该情绪可能出现的最细状态 */
  const thin = Math.min(...pool.map((s) => (evalSlot(s, CUSTOM[s] || null).b.h) * open));
  const problems = [];
  if (bars.length && !BAR_ALLOWED.has(d.id)) problems.push(`非闭眼态却含横条 ${bars.join(',')}`);
  if (pool.length && thin < MIN_THICK) problems.push(`最细时 ${thin.toFixed(1)}px（<${MIN_THICK}）会被压成发丝`);
  if (!pool.length) problems.push('池子为空');
  if (problems.length) {
    viol++;
    console.log(`  ❌ ${d.id} ${String(d.name).padEnd(8)} pool ${JSON.stringify(pool)} → ${problems.join('；')}`);
  }
}
/* 非空断言：审了 0 个情绪、或一个含横条的都没有 → 说明数据没读到，绝不允许判绿 */
if (examined !== SEED.length || examined === 0) {
  console.log(`  ❌ 只审到 ${examined} 个情绪（种子 ${SEED.length} 个）—— 数据没读全`);
  viol++;
}
if (withBars === 0) {
  console.log('  ❌ 一个含横条的情绪都没有 —— 横条槽位判定失效，本审计等于空转');
  viol++;
}
console.log(`\n审了 ${examined} 个情绪 · ${withBars} 个允许含横条 · 越权 ${viol} 个 ${viol ? '❌' : '✅'}`);
console.log(`（显式登记的闭眼态：${[...BAR_ALLOWED].sort().join(' ')}）`);

process.exit(bad || viol ? 1 : 0);
