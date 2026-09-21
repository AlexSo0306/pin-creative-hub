/* 锅宝 v2 · art —— 全部原创资产
 *
 * ⚠️ 本文件里的每一个形状、眼型、色值都是本项目自绘的，不来自任何第三方提取数据。
 *    参考项目里 blobPath / shapes / eyes / palette 属于 xAI 资产，只学其数据结构，不搬运。
 *
 * 数据结构与参考一致：
 *   SHAPES[name] = { path, zoom, samples, solid? }
 *     · path   —— 闭合三次贝塞尔路径串（静止态直接用，省掉每帧重建）
 *     · zoom   —— 视觉体量归一化（各形状看起来一样大）
 *     · solid  —— 可选：回转体截面圆列，有它才能「转身」
 *   形状的 96 点极坐标环由 ringOf(name) 从同一个径向函数直接生成，
 *   与 path 同源，因此静止态↔形变态切换无跳变。
 */

import { TAU, clamp, polarRing, closedSpline, circleRing } from "./core.js";

/* ─────────────── 几何基元 ─────────────── */

/* 超椭圆（n=2 是椭圆，n 越大越接近矩形） */
const superellipse = (n) => (a) => {
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
};

/* 把一条稠密闭合轮廓按等角度射线重采样 —— 保证所有形状/眼型共享同一套角度索引，
   逐点插值形变时不会打旋 */
function radialFromDense(dense, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = 0;
    for (let k = 0; k < dense.length; k++) {
      const p = dense[k];
      const q = dense[(k + 1) % dense.length];
      const ax = p[0];
      const ay = p[1];
      const bx = q[0];
      const by = q[1];
      const den = (bx - ax) * dy - (by - ay) * dx;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * dy - ay * dx) / -den;
      if (t < 0 || t > 1) continue;
      const hit = (ax + (bx - ax) * t) * dx + (ay + (by - ay) * t) * dy;
      if (hit > best) best = hit;
    }
    out.push([dx * best, dy * best]);
  }
  return out;
}

const sampleParam = (fn, n) => Array.from({ length: n }, (_, i) => fn((i / n) * TAU));

/* 圆上两角度的最短夹角（弧度，0…π）—— 径向函数里给「局部凸起」定位用 */
const angDist = (a, t) => {
  const d = Math.abs(a - t) % TAU;
  return d > Math.PI ? TAU - d : d;
};

/* 高斯凸起：在角度 t 处鼓包，w 是角宽度（越小越尖） */
const bump = (a, t, w) => Math.exp(-Math.pow(angDist(a, t) / w, 2));

/* ─────────────── 形状定义（径向函数，角度 0 = 右，顺时针向下） ─────────────── */

const SHAPE_DEF = {
  /* 团子 —— 圆润微扁，最中性的默认形 */
  dango: {
    r: (a) => 1 + 0.018 * Math.cos(2 * a) - 0.010 * Math.cos(a),
    style: 1,
  },
  /* 豆 —— 腰形，一侧微凹 */
  bean: {
    r: (a) => 1 + 0.125 * Math.cos(2 * a + 0.34) - 0.048 * Math.cos(a),
    style: 0.99,
    solid: [[-17, -100, 0, 44], [-13, -82, 0, 63], [-8, -58, 0, 78], [-3, -34, 0, 84],
      [2, -10, 0, 85], [2, 14, 0, 85], [-3, 38, 0, 84], [-8, 62, 0, 78],
      [-13, 86, 0, 63], [-17, 102, 0, 44]],
  },
  /* 蛋 —— 下重上尖 */
  egg: {
    r: (a) => 1 + 0.145 * Math.sin(a) + 0.095 * Math.pow(Math.sin(a), 3),
    style: 0.98,
  },
  /* 水滴 —— 上方收尖 */
  drop: {
    r: (a) => 1 + 0.175 * Math.sin(a) + 0.115 * Math.pow(Math.sin(a), 3) - 0.02 * Math.cos(2 * a),
    style: 0.96,
  },
  /* 叶 —— 上下尖、两侧宽 */
  leaf: {
    r: (a) => 1 + 0.215 * Math.cos(2 * a + 0.42) - 0.03 * Math.cos(4 * a),
    style: 0.98,
  },
  /* 方糖 —— 圆角方 */
  cube: {
    r: superellipse(4.2),
    style: 0.9,
    samples: 40,
  },
  /* 胶囊 —— 竖长圆角条 */
  capsule: {
    r: superellipse(2.7),
    style: 0.96,
    samples: 34,
    squash: [0.72, 1],
    solid: [[-40, 0, 0, 74], [-27, 0, 0, 74], [-13, 0, 0, 74], [0, 0, 0, 74],
      [13, 0, 0, 74], [27, 0, 0, 74], [40, 0, 0, 74]],
  },
  /* 锅 —— 扁身 + 平底 + 两侧上斜的耳。
     耳的角度位置是关键：放在正水平（a=0 / π）时整体仍然读作一个圆，
     必须抬到水平线上方约 29°，幅度也要给足，112px 的挂件尺寸下才看得出「有把手」。
     锅身压扁（squash）、底部压平、口沿微收。
     注：maxR 落在耳尖，所以 style 给 1.10 把整体顶回来，
     让锅身直径仍接近其它形状（实测体量 126 < 画框半宽 129.5）。 */
  pot: {
    r: (a) => 1
      + 0.26 * bump(a, -Math.PI / 2 - 1.05, 0.30)   // 左耳
      + 0.26 * bump(a, -Math.PI / 2 + 1.05, 0.30)   // 右耳
      - 0.085 * bump(a, Math.PI / 2, 0.55)          // 平底
      - 0.035 * bump(a, -Math.PI / 2, 0.45),        // 口沿微收
    style: 1.1,
    samples: 48,
    squash: [1.05, 0.95],
  },
};

/* ─────────────── 形状资产构建 ─────────────── */

export const R_BASE = 114.5;          // 极坐标环的基准半径（与 viewBox 中心对齐）
const RING_N = 96;                    // 环采样数
const PATH_SAMPLES = 30;              // 路径串采样数

export const SHAPES = {};

for (const [name, def] of Object.entries(SHAPE_DEF)) {
  const sq = def.squash || [1, 1];
  const radial = (a) => {
    const r = def.r(a);
    return [Math.cos(a) * r * sq[0], Math.sin(a) * r * sq[1]];
  };
  const n = def.samples || PATH_SAMPLES;
  const ctrl = Array.from({ length: n }, (_, i) => {
    const [u, v] = radial((i / n) * TAU);
    return [R_BASE + u * R_BASE, R_BASE + v * R_BASE];
  });
  const path = closedSpline(ctrl);
  const ring = Array.from({ length: RING_N }, (_, i) => {
    const a = (i / RING_N) * TAU;
    const r = def.r(a);
    return [R_BASE + Math.cos(a) * r * sq[0] * R_BASE, R_BASE + Math.sin(a) * r * sq[1] * R_BASE];
  });
  let top = Infinity;
  let bottom = -Infinity;
  let maxR = 0;
  for (const p of ring) {
    if (p[1] < top) top = p[1];
    if (p[1] > bottom) bottom = p[1];
    maxR = Math.max(maxR, Math.hypot(p[0] - R_BASE, p[1] - R_BASE));
  }
  /* zoom 自动归一：各形状最大半径统一到 R_BASE，再乘风格系数。
     这样换形状时体量一致，也不会有点越出 viewBox。 */
  SHAPES[name] = {
    name,
    path,
    ring,
    zoom: (R_BASE / maxR) * (def.style ?? 1),
    solid: def.solid || null,
    top,
    bottom,
  };
}

export const SHAPE_NAMES = Object.keys(SHAPES);

/* 形状显示体量补偿：环实际只占 229/259，乘 VIEW_SCALE 才刚好填满 viewBox */
export const VIEW = { minX: -15, minY: -15, width: 259, height: 259 };
export const VIEW_SCALE = VIEW.width / (R_BASE * 2);
export const shapeZoom = (name) => SHAPES[name]?.zoom ?? 1;
export const poseScale = (name) => shapeZoom(name) * VIEW_SCALE;
/* 眼睛尺寸随形状体量等比缩放，换形状时「眼/身」比例恒定，不会忽大忽小 */
export const shapeEyeScale = (name) => shapeZoom(name) / shapeZoom("dango");

/* ─────────────── 眼睛 ───────────────
 *
 * 尺寸基准来自对参考站点的比例测量（只取比例，不取资产）：
 *   默认眼半宽 / R = 0.1373      默认眼半高 / R = 0.1836   （宽高比 1.34，竖长条）
 *   眼心水平偏移 / R = 0.1937    眼心垂直偏移 / R = -0.4141（在中心**上方**）
 * 25 个眼型的实际尺寸分布：宽/R ∈ [0.198, 0.492]，高/R ∈ [0.161, 0.795]。
 * 因此每种眼型除形状外还带一对 [宽倍率, 高倍率]，用于覆盖同样的表达范围。
 * 双眼不重叠由 character.js 里的 _ee 守卫兜底（眼太宽会被自动缩小）。
 */

export const EYE_N = 32;
export const EYE_EW = 0.1373 * R_BASE;   // ≈ 15.72 单眼半宽
export const EYE_EH = 0.1836 * R_BASE;   // ≈ 21.02 单眼半高
export const EYE_DX = 0.1937 * R_BASE;   // ≈ 22.18 眼心水平偏移
export const EYE_DY = 0.4141 * R_BASE;   // ≈ 47.41 眼心垂直偏移（向上）

const EYE_DEF = {
  round: [(a) => [Math.cos(a), Math.sin(a)], 1, 1],
  tall: [(a) => { const r = superellipse(3.2)(a); return [Math.cos(a) * r, Math.sin(a) * r]; }, 1, 1],
  wide: [(a) => { const r = superellipse(2.4)(a); return [Math.cos(a) * r, Math.sin(a) * r * 0.62]; }, 1.34, 0.62],
  dot: [(a) => [Math.cos(a) * 0.42, Math.sin(a) * 0.42], 1.25, 0.62],
  squint: [(a) => [Math.cos(a), Math.sin(a) * 0.33], 1.06, 0.36],
  line: [(a) => [Math.cos(a), Math.sin(a) * 0.07], 1.1, 0.10],
  happy: [(a) => [Math.cos(a), Math.sin(a) * 0.48 - 0.5], 1.1, 0.62],
  sleepy: [(a) => [Math.cos(a), Math.sin(a) < 0 ? Math.sin(a) * 0.3 : Math.sin(a) * 0.95], 1.02, 0.66],
  proud: [(a) => [Math.cos(a), Math.sin(a) > 0 ? Math.sin(a) * 0.3 : Math.sin(a) * 0.95], 1.02, 0.66],
  sparkle: [(a) => { const r = 1 / (1 - 0.42 * Math.cos(4 * a)); return [Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8]; }, 1.15, 1.15],
  star: [(a) => { const r = 1 / (1 - 0.40 * Math.cos(5 * a + Math.PI / 2)); return [Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82]; }, 1.18, 1.18],
  dizzy: [(a) => { const r = 1 / (1 - 0.34 * Math.cos(6 * a)); return [Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82]; }, 1.12, 1.12],
  crescent: [(a) => { const r = 1 - 0.42 * Math.cos(a); return [Math.cos(a) * r, Math.sin(a) * r]; }, 1.0, 1.05],
  almond: [(a) => [Math.cos(a) * (1 - 0.72 * Math.pow(Math.abs(Math.sin(a)), 1.15)), Math.sin(a)], 1.3, 1.0],
  pinch: [(a) => [Math.cos(a) * 0.42, Math.sin(a)], 0.46, 1.0],
  angry: [(a) => [Math.cos(a), Math.sin(a) * 0.74 - 0.34 * Math.cos(a)], 1.12, 0.98],
  sad: [(a) => [Math.cos(a), Math.sin(a) * 0.74 + 0.34 * Math.cos(a)], 1.12, 0.98],
  surprised: [(a) => [Math.cos(a) * 1.12, Math.sin(a) * 1.12], 1.28, 1.38],
  focus: [(a) => [Math.cos(a) * 0.62, Math.sin(a)], 0.64, 1.0],
  bored: [(a) => [Math.cos(a), Math.sin(a) > 0 ? Math.sin(a) * 0.22 : Math.sin(a) * 0.88], 1.04, 0.62],
  drop: [(a) => { const r = 1 + 0.20 * Math.sin(a) + 0.12 * Math.pow(Math.sin(a), 3); return [Math.cos(a) * r, Math.sin(a) * r]; }, 1.0, 1.16],
  tear: [(a) => { const r = 1 + 0.20 * Math.sin(a) + 0.12 * Math.pow(Math.sin(a), 3); return [Math.cos(a) * r * 0.9, -Math.sin(a) * r * 0.9]; }, 0.9, 1.16],
  heart: [null, 1.22, 1.16],
  cross: [null, 1.16, 1.16],
  moon: [null, 1.0, 1.08],
};

/* 需要走「稠密轮廓 → 等角度重采样」的复杂形（心 / 十字 / 月牙），
   其余直接用径向函数。两条路最终都产出 EYE_N 个角度对齐的点。 */
const DENSE_DEF = {
  heart: (t) => [
    Math.pow(Math.sin(t), 3) * 1.02,
    -(0.8125 * Math.cos(t) - 0.3125 * Math.cos(2 * t) - 0.125 * Math.cos(3 * t) - 0.0625 * Math.cos(4 * t)),
  ],
  cross: (t) => {
    const a = t - Math.PI / 2;
    const r = 1 / (1 - 0.52 * Math.cos(4 * a));
    return [Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88];
  },
  moon: (t) => {
    const r = 1 - 0.5 * Math.cos(t) + 0.12 * Math.cos(2 * t);
    return [Math.cos(t) * r, Math.sin(t) * r];
  },
};

/* 单位眼型（左眼），点在 [-1,1]² 盒内，索引与角度一一对应。
   复杂形（心/十字/月牙）走「稠密轮廓 → 等角度重采样」，与径向形共享角度索引。 */
export const EYE_UNITS = {};
const EYE_SIZE = {};
for (const [name, def] of Object.entries(EYE_DEF)) {
  const [fn, wMul, hMul] = def;
  if (fn) EYE_UNITS[name] = Array.from({ length: EYE_N }, (_, i) => fn((i / EYE_N) * TAU));
  EYE_SIZE[name] = [wMul ?? 1, hMul ?? 1];
}
for (const [name, fn] of Object.entries(DENSE_DEF)) {
  EYE_UNITS[name] = radialFromDense(sampleParam(fn, 240), EYE_N);
}

export const EYE_NAMES = Object.keys(EYE_UNITS);

/* 把单位眼型按自己的倍率放到「左眼」的画布位置；右眼由镜像得到 */
export function eyePolys(name) {
  const unit = EYE_UNITS[name] || EYE_UNITS.tall;
  const [wMul, hMul] = EYE_SIZE[name] || [1, 1];
  const ew = EYE_EW * wMul;
  const eh = EYE_EH * hMul;
  const cx = R_BASE - EYE_DX;
  const cy = R_BASE - EYE_DY;
  const left = unit.map(([u, v]) => [cx + u * ew, cy + v * eh]);
  const right = unit.map(([u, v]) => [R_BASE * 2 - (cx + u * ew), cy + v * eh]);
  return [left, right];
}

/* 眼型索引表：状态表用数字引用，这里给出名字 ↔ 序号 */
export const EYE_INDEX = {};
EYE_NAMES.forEach((n, i) => { EYE_INDEX[n] = i; });
export const EYE_BY_INDEX = EYE_NAMES.map((n) => eyePolys(n));

/* ─────────────── 墨色 ─────────────── */

/* 11 色，每色一对 light / dark 渐变端点。角度统一 135°（左上 → 右下）。 */
export const INK_ANGLE = 135;
export const INK = {
  ink: { label: "墨", lightFrom: "#5A5A5F", lightTo: "#0B0B0E", darkFrom: "#F5F5F7", darkTo: "#B9B9C0" },
  cocoa: { label: "可可", lightFrom: "#B08A66", lightTo: "#7C5632", darkFrom: "#A57C55", darkTo: "#5C3D24" },
  chili: { label: "辣椒", lightFrom: "#FF5C6B", lightTo: "#DC1F36", darkFrom: "#FF4459", darkTo: "#9E1728" },
  pumpkin: { label: "南瓜", lightFrom: "#FF8C3C", lightTo: "#DD5A03", darkFrom: "#FF7A20", darkTo: "#BE4C00" },
  honey: { label: "蜜", lightFrom: "#FFB53C", lightTo: "#DD8A02", darkFrom: "#FFA820", darkTo: "#BE7200" },
  matcha: { label: "抹茶", lightFrom: "#1FD188", lightTo: "#00995A", darkFrom: "#02CB76", darkTo: "#00804B" },
  mint: { label: "薄荷", lightFrom: "#5CD6C8", lightTo: "#00A795", darkFrom: "#1FC5B3", darkTo: "#00796B" },
  soda: { label: "苏打", lightFrom: "#4AA2FF", lightTo: "#1176E2", darkFrom: "#2F95FF", darkTo: "#0F66C3" },
  taro: { label: "香芋", lightFrom: "#B996FF", lightTo: "#8352E2", darkFrom: "#965EFF", darkTo: "#5E3BA3" },
  peach: { label: "桃", lightFrom: "#FF7BC2", lightTo: "#E22D8B", darkFrom: "#FF4CAA", darkTo: "#A42065" },
  ash: { label: "灰", lightFrom: "#AAAAAF", lightTo: "#6C6C72", darkFrom: "#BBBBC1", darkTo: "#7A7A80" },
};

export const INK_NAMES = Object.keys(INK);

/* 主题无关的纯色（给 SVG 渐变 stop 用不了 light-dark 时的兜底） */
export const inkPair = (id, dark) => {
  const e = INK[id] || INK.ink;
  return dark ? [e.darkFrom, e.darkTo] : [e.lightFrom, e.lightTo];
};

/* ─────────────── 覆盖层（overlay）形状 ─────────────── */

export const OVERLAY_MAP = {
  thinking: "dots",
  orbit: "orbit",
  radar: "radar",
  progress: "progress",
  spawning: "gather",
  dictating: "wave",
  sending: "send",
  receiving: "receive",
  uploading: "dock",
  bouncing: "ball",
  loading: "whirl",
  "powering-down": "standby",
  writing: "pencil",
  alerting: "bang",
};

export const OVERLAY_CYCLE = new Set(["progress", "spawning"]);
export const OVERLAY_CYCLE_ON = { progress: 2500, spawning: 2000 };
export const OVERLAY_CYCLE_OFF = 1500;

export const OVERLAY_ZOOM = {
  dots: 1.5, orbit: 1.14, radar: 1.14, progress: 1.32, gather: 1.15,
  wave: 1.42, send: 1.12, receive: 1.12, dock: 1.3, ball: 1.22,
  whirl: 1.45, pencil: 1.18, bang: 1.28, standby: 1.75,
};

export const overlayViewZoom = (kind, scale) => (
  kind == null ? 1 : Math.max(OVERLAY_ZOOM[kind] / Math.max(scale, 1), 1)
);

/* 覆盖层激活时身体变成的环：默认正圆，铅笔态用一枚竖向水滴 */
export function overlayRing(kind, R) {
  if (kind === "pencil") {
    const ctrl = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * TAU;
      const r = 1 + 0.26 * Math.sin(a) + 0.14 * Math.pow(Math.sin(a), 3);
      return [R + Math.cos(a) * r * R * 0.86, R + Math.sin(a) * r * R * 0.86];
    });
    const ring = polarRing(ctrl, R);
    const n = ring.length;
    return ring.map((_, i) => ring[(i + (n >> 1)) % n]);
  }
  return circleRing(R);
}

export const CIRCLE_PATH = closedSpline(circleRing(R_BASE, 64));

export const clampRing = clamp;
