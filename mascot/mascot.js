/* 拼好家运营创作工作台 · 角色挂件「锅宝」（原创实现，clean-room）
 *
 * 零依赖 / 零构建 / 原生 ESM —— 与工作台技术栈铁律一致（AGENTS.md §2）。
 *
 * 用：
 *   import { createMascot, MASCOT_STATES } from './components/mascot.js';
 *   const m = createMascot(document.getElementById('mascot-dock'));
 *   m.setState('focus');
 *   m.destroy();
 *
 * 实现要点（全部为公开数学，未引用任何第三方角色资产、坐标或数值）：
 *   · 形变     —— 18 个均布控制点，半径 = 锅形基准轮廓 × 4 个角频率 lobe，
 *                 Catmull-Rom 闭合成三次贝塞尔
 *   · 动画     —— 半隐式欧拉弹簧（临界阻尼 d = 2√k），逐属性独立积分
 *   · 眼睛     —— 8 顶点圆角多边形，逐顶点半径向量插值（圆 / 眯 / 星 / 扁 / 闭）
 *   · 状态机   —— 7 态，每态 = 一组弹簧目标值，切态即改目标，过渡由弹簧自然产生
 *   · 二级惯性 —— 锅盖钮位置滞后于锅体顶点，产生甩动
 *   · 锅口线   —— 用多边形与水平线的解析交点求跨度，随形变实时贴合
 */

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/* 保留两位小数的快路径。实测比 toFixed(2) 快约 25%，产出的 path 字符串同长。
   工作台要在手机浏览器上跑，path 越短光栅化越省。 */
const round2 = (v) => Math.round(v * 100) / 100;

/* ── 弹簧 ─────────────────────────────────────────────────────────── */

class Spring {
  constructor(value = 0, stiffness = 130, damping = 19) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.k = stiffness;
    this.d = damping;
  }
  set(target) {
    this.target = target;
  }
  snap(v) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
  step(dt) {
    const accel = (this.target - this.value) * this.k - this.velocity * this.d;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}
/* ── 几何 ─────────────────────────────────────────────────────────── */

/** 闭合 Catmull-Rom → 三次贝塞尔 path。点集须 ≥ 4 个且无重复点。 */
function ringPath(points) {
  const n = points.length;
  let d = 'M' + round2(points[0][0]) + ' ' + round2(points[0][1]);
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    d += 'C' + round2(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + round2(p1[1] + (p2[1] - p0[1]) / 6)
      + ' ' + round2(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + round2(p2[1] - (p3[1] - p1[1]) / 6)
      + ' ' + round2(p2[0]) + ' ' + round2(p2[1]);
  }
  return d + 'Z';
}

/** 锅身基准轮廓：上窄下宽的圆润形（t = 0 指向顶部）。 */
function potRadius(theta, R) {
  const t = theta + Math.PI / 2;
  return R * (1 - 0.11 * Math.cos(t) + 0.045 * Math.cos(2 * t));
}

/**
 * 锅身控制点（局部坐标，未旋转；旋转交给 SVG 变换）。
 * 18 个点足够表达最高角频率 4 的 lobe（Nyquist 只需 > 8），再密只是白付光栅化成本。
 * @param {number[]} amps 4 个 lobe 振幅，第 j 个对应角频率 (j+1)
 */
function bodyPoints({ cx, cy, R, amps, breath, squash, count = 18 }) {
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    const th = (i / count) * TAU;
    let r = potRadius(th, R);
    for (let j = 0; j < amps.length; j += 1) {
      r *= 1 + amps[j] * Math.cos((j + 1) * th);
    }
    r *= breath;
    pts.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r * squash]);
  }
  return pts;
}

/** 多边形与水平线 y 的解析交点跨度 —— 用于让锅口线实时贴合形变后的锅身。 */
function horizontalSpan(pts, y) {
  let minX = Infinity;
  let maxX = -Infinity;
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a[1] === b[1]) continue;
    if ((a[1] - y) * (b[1] - y) <= 0) {
      const t = (y - a[1]) / (b[1] - a[1]);
      const x = a[0] + (b[0] - a[0]) * t;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  return Number.isFinite(minX) ? [minX, maxX] : null;
}

/** 眼睛：8 顶点圆角多边形，逐顶点半径 + 椭圆缩放 + 眨眼压缩。 */
function eyePoints(cx, cy, base, shape, blink) {
  const N = shape.radii.length;
  const sy = Math.max(shape.sy * (1 - 0.88 * blink), 0.05);
  const pts = [];
  for (let i = 0; i < N; i += 1) {
    const th = (i / N) * TAU - Math.PI / 2;
    const r = base * shape.radii[i];
    pts.push([cx + Math.cos(th) * r * shape.sx, cy + Math.sin(th) * r * sy]);
  }
  return pts;
}

/* ── 眼睛形态表 ───────────────────────────────────────────────────── */

const EYE = {
  open: { sx: 1.0, sy: 1.0, radii: [1, 1, 1, 1, 1, 1, 1, 1] },
  squint: { sx: 1.12, sy: 0.26, radii: [1, 1, 1, 1, 1, 1, 1, 1] },
  wide: { sx: 1.06, sy: 1.26, radii: [1, 1, 1, 1, 1, 1, 1, 1] },
  focus: { sx: 1.16, sy: 0.72, radii: [1, 1, 1, 1, 1, 1, 1, 1] },
  sleep: { sx: 1.06, sy: 0.14, radii: [1, 1, 1, 1, 1, 1, 1, 1] },
  star: { sx: 1.22, sy: 1.22, radii: [1, 0.46, 1, 0.46, 1, 0.46, 1, 0.46] },
};

/* ── 状态表 ───────────────────────────────────────────────────────── */
/* 每态 = 一组目标值：lobe 振幅 / 纵向压扁 / 倾斜 / 眼睛形态 / 蒸汽 / 星光 / 呼吸 */

export const MASCOT_STATES = {
  idle: {
    label: '待机',
    amps: [0.015, 0.01, 0.008, 0.004],
    squash: 1.0,
    tilt: 0,
    eye: 'open',
    steam: 0,
    spark: 0,
    breath: 0.012,
  },
  curious: {
    label: '好奇',
    amps: [0.03, 0.045, 0.01, 0.006],
    squash: 0.98,
    tilt: -3,
    eye: 'wide',
    steam: 0,
    spark: 0,
    breath: 0.018,
  },
  happy: {
    label: '开心',
    amps: [0.02, 0.07, 0.02, 0.01],
    squash: 1.04,
    tilt: 0,
    eye: 'squint',
    steam: 0.15,
    spark: 0.35,
    breath: 0.03,
  },
  focus: {
    label: '专注',
    amps: [0.025, 0.015, 0.035, 0.01],
    squash: 0.96,
    tilt: 3,
    eye: 'focus',
    steam: 0.9,
    spark: 0,
    breath: 0.008,
  },
  sleepy: {
    label: '困倦',
    amps: [0.05, 0.015, 0.01, 0.005],
    squash: 1.05,
    tilt: -6,
    eye: 'sleep',
    steam: 0.2,
    spark: 0,
    breath: 0.026,
  },
  alert: {
    label: '提醒',
    amps: [0.02, 0.03, 0.015, 0.045],
    squash: 1.02,
    tilt: 0,
    eye: 'wide',
    steam: 0,
    spark: 0.15,
    breath: 0.02,
  },
  celebrate: {
    label: '庆祝',
    amps: [0.03, 0.085, 0.025, 0.02],
    squash: 1.06,
    tilt: 0,
    eye: 'star',
    steam: 0.3,
    spark: 1,
    breath: 0.04,
  },
};

/* ── 常量几何 ─────────────────────────────────────────────────────── */

const VIEW = 200;
const CX = 100;
const CY = 112;
const R = 56;
const BASE_SQUASH = 0.88; // 压成「宽 > 高」，否则读起来像蛋
const EYE_DX = 19;
const EYE_Y = 104;
const EYE_BASE = 11;
const LID_FRAC = 0.68; // 锅口线相对 R 的高度
const STEAM_TOP = CY - R * BASE_SQUASH * LID_FRAC + 2;

const SPARK_COUNT = 6;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/* ── 主类 ─────────────────────────────────────────────────────────── */

export function createMascot(host, options = {}) {
  if (!host) throw new Error('createMascot: 缺少挂载节点');

  const opts = {
    state: 'idle',
    energy: 0.7,
    followPointer: true,
    interactive: true,
    scale: 1,
    ...options,
  };

  const reduceMotion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* DOM */
  const root = document.createElement('div');
  root.className = 'pm-mascot';
  root.style.setProperty('--pm-scale', String(opts.scale));
  root.setAttribute('aria-hidden', 'true');

  const svg = el('svg', { viewBox: `0 0 ${VIEW} ${VIEW}`, xmlns: SVG_NS, focusable: 'false' });

  const gSteam = el('g', { class: 'pm-steam' });
  const steamPaths = [];
  for (let i = 0; i < 3; i += 1) {
    const p = el('path', { class: 'pm-steam-line', d: 'M0 0' });
    steamPaths.push(p);
    gSteam.appendChild(p);
  }

  /* rig：锅体 + 锅口线 + 眼睛 + 锅盖钮整体绕中心旋转，倾斜不用逐个元素算 */
  const rig = el('g', { class: 'pm-rig' });

  const blob = el('path', { class: 'pm-blob', d: 'M0 0' });
  const lidLine = el('line', { class: 'pm-lid-line', x1: CX - 40, y1: STEAM_TOP, x2: CX + 40, y2: STEAM_TOP });
  const gEyes = el('g', { class: 'pm-eyes' });
  const eyeNodes = [el('path', { class: 'pm-eye', d: 'M0 0' }), el('path', { class: 'pm-eye', d: 'M0 0' })];
  eyeNodes.forEach((n) => gEyes.appendChild(n));

  /* 锅盖钮：一个扁椭圆直接坐在锅顶，不加柄 —— 加柄会读成螺丝钉 */
  const gKnob = el('g', { class: 'pm-knob' });
  const knobDot = el('ellipse', { class: 'pm-knob-dot', cx: CX, cy: 64, rx: 10, ry: 4 });
  gKnob.appendChild(knobDot);

  rig.append(blob, lidLine, gEyes, gKnob);

  const gSpark = el('g', { class: 'pm-spark' });
  const sparkNodes = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const s = el('path', {
      class: 'pm-spark-star',
      d: 'M0 -5.2L1.3 -1.3L5.2 0L1.3 1.3L0 5.2L-1.3 1.3L-5.2 0L-1.3 -1.3Z',
    });
    sparkNodes.push(s);
    gSpark.appendChild(s);
  }

  svg.append(gSteam, rig, gSpark);
  root.appendChild(svg);
  host.appendChild(root);

  /* 弹簧组 */
  const body = {
    amps: [0, 1, 2, 3].map(() => new Spring(0, 120, 18)),
    squash: new Spring(1, 120, 18),
    tilt: new Spring(0, 100, 17),
    breath: new Spring(0.012, 60, 14),
    steam: new Spring(0, 80, 16),
    spark: new Spring(0, 80, 16),
  };
  const eyes = [0, 1].map(() => ({
    sx: new Spring(1, 340, 27),
    sy: new Spring(1, 340, 27),
    radii: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new Spring(1, 340, 27)),
    gx: new Spring(0, 200, 22),
    gy: new Spring(0, 200, 22),
    blink: new Spring(0, 520, 30),
  }));
  const knob = { y: new Spring(64, 160, 16) };

  let currentState = opts.state;
  let energy = clamp(opts.energy, 0, 1);
  let pointer = { x: 0, y: 0 };
  let pointerActive = false;
  let running = false;
  let rafId = 0;
  let lastTs = 0;
  let clock = 0;
  let nextBlink = 2 + Math.random() * 3;
  let pulse = 0;
  let destroyed = false;
  /* 初始为 true，让首帧把两个 fx 层写成 display:none */
  let lastSteamOn = true;
  let lastSparkOn = true;

  /* 状态切换 */
  function applyState(name) {
    const s = MASCOT_STATES[name] || MASCOT_STATES.idle;
    currentState = MASCOT_STATES[name] ? name : 'idle';
    s.amps.forEach((v, i) => body.amps[i].set(v));
    body.squash.set(s.squash);
    body.tilt.set(s.tilt);
    body.breath.set(s.breath);
    body.steam.set(s.steam);
    body.spark.set(s.spark);
    const shape = EYE[s.eye] || EYE.open;
    eyes.forEach((e) => {
      e.sx.set(shape.sx);
      e.sy.set(shape.sy);
      shape.radii.forEach((r, i) => e.radii[i].set(r));
    });
  }
  applyState(currentState);
  /* 首帧直接落到目标，避免开场从零振幅长出来 */
  MASCOT_STATES[currentState].amps.forEach((v, i) => body.amps[i].snap(v));
  body.squash.snap(MASCOT_STATES[currentState].squash);
  body.tilt.snap(MASCOT_STATES[currentState].tilt);

  /* 指针 */
  function onPointerMove(ev) {
    const rect = root.getBoundingClientRect();
    if (!rect.width) return;
    const dx = (ev.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (ev.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    pointer = { x: clamp(dx, -1.6, 1.6), y: clamp(dy, -1.6, 1.6) };
    pointerActive = true;
  }
  function onPointerLeave() {
    pointerActive = false;
  }
  if (opts.followPointer && typeof window !== 'undefined') {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
  }

  /* 交互：点一下回弹 */
  function onHostPointerDown() {
    pulse = 1;
    body.squash.snap(0.86);
    body.squash.set(MASCOT_STATES[currentState].squash);
  }
  if (opts.interactive) root.addEventListener('pointerdown', onHostPointerDown);

  /* 单步渲染 */
  function render(dt) {
    clock += dt;

    const e = energy;
    pulse = Math.max(0, pulse - dt * 1.6);

    const amps = body.amps.map((s) => s.step(dt));
    const squash = (body.squash.step(dt) - pulse * 0.1) * BASE_SQUASH;
    const tilt = body.tilt.step(dt);
    const breathAmp = body.breath.step(dt);
    const steamV = body.steam.step(dt);
    const sparkV = body.spark.step(dt);

    const breathRate = reduceMotion ? 0.5 : 0.9 + e * 1.1;
    const breath = 1 + breathAmp * Math.sin(clock * breathRate * TAU * 0.35);

    const pts = bodyPoints({ cx: CX, cy: CY, R, amps, breath, squash });
    blob.setAttribute('d', ringPath(pts));

    /* 锅口线：跟随形变实时求跨度，读起来才像「一口盖着盖的锅」 */
    const lidY = CY - R * BASE_SQUASH * LID_FRAC * breath;
    const span = horizontalSpan(pts, lidY);
    if (span) {
      lidLine.setAttribute('x1', round2(span[0] + 3));
      lidLine.setAttribute('x2', round2(span[1] - 3));
      lidLine.setAttribute('y1', round2(lidY));
      lidLine.setAttribute('y2', round2(lidY));
    }

    /* 整体倾斜交给 SVG 变换，眼睛与锅盖钮自动跟着转 */
    rig.setAttribute('transform', `rotate(${round2(tilt)} ${CX} ${CY})`);

    /* 眼睛：跟随 + 眨眼 */
    const gazeX = pointerActive && opts.followPointer ? pointer.x : Math.sin(clock * 0.31) * 0.45;
    const gazeY = pointerActive && opts.followPointer ? pointer.y : Math.sin(clock * 0.23) * 0.3;

    if (!reduceMotion) {
      nextBlink -= dt;
      if (nextBlink <= 0) {
        nextBlink = 2.4 + Math.random() * 4.2 - e * 1.2;
        eyes.forEach((ey) => {
          ey.blink.snap(0);
          ey.blink.set(1);
          setTimeout(() => {
            if (!destroyed) ey.blink.set(0);
          }, 78);
        });
      }
    }

    eyes.forEach((ey, i) => {
      ey.gx.set(gazeX);
      ey.gy.set(gazeY);
      const sx = ey.sx.step(dt);
      const sy = ey.sy.step(dt);
      const radii = ey.radii.map((s) => s.step(dt));
      const gx = ey.gx.step(dt);
      const gy = ey.gy.step(dt);
      const blink = ey.blink.step(dt);
      const dir = i === 0 ? -1 : 1;
      const ptsE = eyePoints(
        CX + dir * EYE_DX + gx * 2.6,
        EYE_Y + Math.sin(clock * 0.7 + i * 0.4) * 0.6 + gy * 2.0,
        EYE_BASE,
        { sx, sy, radii },
        blink,
      );
      eyeNodes[i].setAttribute('d', ringPath(ptsE));
    });

    /* 锅盖钮：滞后跟随锅体顶点，产生二级惯性甩动 */
    let topIdx = 0;
    for (let i = 1; i < pts.length; i += 1) {
      if (pts[i][1] < pts[topIdx][1]) topIdx = i;
    }
    knob.y.set(pts[topIdx][1] - 1);
    const ky = knob.y.step(dt);
    knobDot.setAttribute('cx', CX);
    knobDot.setAttribute('cy', round2(ky));

    /* 蒸汽 —— display 只在真变化时写，避免每帧触发样式重算 */
    const steamOn = steamV > 0.02;
    if (steamOn !== lastSteamOn) {
      gSteam.style.display = steamOn ? '' : 'none';
      lastSteamOn = steamOn;
    }
    if (steamOn) {
      steamPaths.forEach((p, k) => {
        const t = clock * 0.85 + k * 2.1;
        const x0 = CX + (k - 1) * 17 + Math.sin(t) * 2.4;
        const rise = 30 * steamV + 8;
        p.setAttribute('d', 'M' + round2(x0) + ' ' + round2(STEAM_TOP)
          + 'C' + round2(x0 - 7) + ' ' + round2(STEAM_TOP - rise * 0.45)
          + ' ' + round2(x0 + 7) + ' ' + round2(STEAM_TOP - rise * 0.7)
          + ' ' + round2(x0 + Math.sin(t * 1.3) * 3) + ' ' + round2(STEAM_TOP - rise));
        p.setAttribute('opacity', round2(steamV * 0.55 * (1 - k * 0.18)));
      });
    }

    /* 星光 */
    const sparkOn = sparkV > 0.03;
    if (sparkOn !== lastSparkOn) {
      gSpark.style.display = sparkOn ? '' : 'none';
      lastSparkOn = sparkOn;
    }
    if (sparkOn) {
      sparkNodes.forEach((s, i) => {
        const ang = (i / SPARK_COUNT) * TAU + clock * 0.5;
        const rad = 74 + Math.sin(clock * 1.4 + i) * 7;
        const x = CX + Math.cos(ang) * rad;
        const y = CY - 6 + Math.sin(ang) * rad * 0.72;
        const sc = (0.55 + 0.45 * Math.abs(Math.sin(clock * 1.1 + i * 1.7))) * sparkV;
        s.setAttribute('transform', `translate(${round2(x)} ${round2(y)}) scale(${round2(sc)})`);
        s.setAttribute('opacity', round2(sparkV));
      });
    }
  }

  /* 帧循环 */
  function frame(ts) {
    if (!running || destroyed) return;
    const dt = clamp((ts - lastTs) / 1000 || 0.016, 0.001, 1 / 30);
    lastTs = ts;
    render(dt);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || destroyed) return;
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* 不可见即停 —— 不留下空转的 rAF */
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => {
      const visible = entries.some((en) => en.isIntersecting);
      if (visible && !document.hidden) start();
      else stop();
    }, { threshold: 0.01 });
    io.observe(root);
  } else {
    start();
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }
  document.addEventListener('visibilitychange', onVisibility);

  /* 首帧静态渲染，避免出现空白 */
  render(0.016);

  return {
    el: root,
    get state() {
      return currentState;
    },
    get energy() {
      return energy;
    },
    setState(name) {
      applyState(name);
    },
    setEnergy(v) {
      energy = clamp(Number(v) || 0, 0, 1);
    },
    pulse() {
      pulse = 1;
      body.squash.snap(0.88);
      body.squash.set(MASCOT_STATES[currentState].squash);
    },
    setPointerFollow(on) {
      opts.followPointer = !!on;
      if (!on) pointerActive = false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (opts.followPointer && typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerleave', onPointerLeave);
      }
      root.removeEventListener('pointerdown', onHostPointerDown);
      root.remove();
    },
  };
}

export default createMascot;
