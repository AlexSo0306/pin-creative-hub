/* 锅宝 v2 · core —— 弹簧 / 缓动 / 路径展平 / 极坐标环 / 跨度表 / 3D 旋转
 *
 * 架构对标 grok-icon-study（clean-room 重写，仅学算法与结构，不含任何原资产）：
 *   · 半隐式欧拉弹簧，参数为 [frequency, dampingRatio]，固定 1/120 s 子步进
 *   · 形状统一转成「等角度 96 点极坐标环」，形变 = 环与环逐点插值
 *   · 面部定位靠 buildSpan 预计算的 160 段水平跨度表（或形变中的 spanPoly 实时跨度）
 *   · 立体回转体（solid of revolution）在偏航角下重算轮廓半径，实现「转身」
 */

/* ─────────────── 弹簧 ─────────────── */

export const DT = 1 / 120;
export const springSteps = (dt) => Math.max(1, Math.ceil(dt / DT));
export const spring = (x) => ({ x, v: 0, t: x });

export function stepSpring(s, freq, damp, dt) {
  s.v += (-2 * damp * freq * s.v - freq * freq * (s.x - s.t)) * dt;
  s.x += s.v * dt;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) {
    s.x = s.t;
    s.v = 0;
  }
}

export const springBusy = (s) => Math.abs(s.x - s.t) > 0.002 || Math.abs(s.v) > 0.04;

export function snapSpring(s, v) {
  s.x = v;
  s.v = 0;
  s.t = v;
}

/* ─────────────── 基础数学 / 缓动 ─────────────── */

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const sign = () => (Math.random() < 0.5 ? -1 : 1);
export const TAU = Math.PI * 2;

export const K2 = (n) => (n < 0.5 ? 4 * n * n * n : 1 - Math.pow(-2 * n + 2, 3) / 2);
export const Rc = (n) => 1 - Math.pow(1 - n, 3);
export const y1e = (n) => 1 + 2.70158 * Math.pow(n - 1, 3) + 1.70158 * Math.pow(n - 1, 2);
export const Dke = (n) => n * n * (3 - 2 * n);
export const x_t = (n, e) => 1 - Math.exp(Math.log(1 - n) * 60 * e);
export const Rn = (n, bs = 1 / 60) => x_t(n, bs);

/* ─────────────── 多边形工具 ─────────────── */

export const polyPath = (pts) =>
  "M" + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L") + "Z";

export function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

export const lerpPoly = (a, b, t) =>
  a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);

export const lerpRing = lerpPoly;

/* 按弧长均匀重采样一个闭合多边形到 n 点 —— 让不同点数的手绘眼型可以互相形变 */
export function resamplePoly(pts, n) {
  if (!pts || pts.length < 2) return Array.from({ length: n }, () => [0, 0]);
  const segs = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-6;
  });
  const total = segs.reduce((a, b) => a + b, 0);
  const out = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (acc + segs[i % segs.length] < target && i < pts.length * 2) {
      acc += segs[i % segs.length];
      i++;
    }
    const a = pts[i % pts.length];
    const b = pts[(i + 1) % pts.length];
    const sl = segs[i % segs.length];
    const t = clamp((target - acc) / sl, 0, 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/* 把多边形归一化：质心移到原点，再按最长半径缩放到半径 1 */
export function normalizePoly(pts) {
  const [cx, cy] = centroid(pts);
  const moved = pts.map((p) => [p[0] - cx, p[1] - cy]);
  let r = 0;
  for (const p of moved) r = Math.max(r, Math.hypot(p[0], p[1]));
  if (r < 1e-6) return moved;
  return moved.map((p) => [p[0] / r, p[1] / r]);
}

/* ─────────────── 闭合 Catmull-Rom → 三次贝塞尔 ─────────────── */

export function closedSpline(pts) {
  const e = pts.length;
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let s = 0; s < e; s++) {
    const r = pts[(s - 1 + e) % e];
    const i = pts[s];
    const o = pts[(s + 1) % e];
    const l = pts[(s + 2) % e];
    d += `C${(i[0] + (o[0] - r[0]) / 6).toFixed(2)} ${(i[1] + (o[1] - r[1]) / 6).toFixed(2)} `
      + `${(o[0] - (l[0] - i[0]) / 6).toFixed(2)} ${(o[1] - (l[1] - i[1]) / 6).toFixed(2)} `
      + `${o[0].toFixed(2)} ${o[1].toFixed(2)}`;
  }
  return d + "Z";
}

/* ─────────────── 路径展平（M / L / Q / C / Z） ─────────────── */

export function flattenPath(d, step = 4) {
  const tk = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out = [];
  let r = 0;
  let cmd = "";
  let ox = 0;
  let oy = 0;
  let sx = 0;
  let sy = 0;
  const rd = () => parseFloat(tk[r++]);
  const push = (fn, dist) => {
    const n = Math.max(2, Math.ceil(dist / step));
    for (let k = 1; k <= n; k++) out.push(fn(k / n));
  };
  while (r < tk.length) {
    if (/[a-z]/i.test(tk[r])) cmd = tk[r++].toUpperCase();
    if (cmd === "Z") {
      if (Math.hypot(sx - ox, sy - oy) > 0.01) {
        push((f) => [ox + (sx - ox) * f, oy + (sy - oy) * f], Math.hypot(sx - ox, sy - oy));
      }
      ox = sx;
      oy = sy;
      continue;
    }
    if (r >= tk.length) break;
    if (cmd === "M") {
      ox = rd();
      oy = rd();
      sx = ox;
      sy = oy;
      out.push([ox, oy]);
      cmd = "L";
    } else if (cmd === "L") {
      const x = rd();
      const y = rd();
      push((f) => [ox + (x - ox) * f, oy + (y - oy) * f], Math.hypot(x - ox, y - oy));
      ox = x;
      oy = y;
    } else if (cmd === "Q") {
      const cx = rd();
      const cy = rd();
      const x = rd();
      const y = rd();
      const px = ox;
      const py = oy;
      push((f) => {
        const u = 1 - f;
        return [u * u * px + 2 * u * f * cx + f * f * x, u * u * py + 2 * u * f * cy + f * f * y];
      }, Math.hypot(cx - ox, cy - oy) + Math.hypot(x - cx, y - cy));
      ox = x;
      oy = y;
    } else if (cmd === "C") {
      const c1x = rd();
      const c1y = rd();
      const c2x = rd();
      const c2y = rd();
      const x = rd();
      const y = rd();
      const px = ox;
      const py = oy;
      push((f) => {
        const u = 1 - f;
        return [
          u * u * u * px + 3 * u * u * f * c1x + 3 * u * f * f * c2x + f * f * f * x,
          u * u * u * py + 3 * u * u * f * c1y + 3 * u * f * f * c2y + f * f * f * y,
        ];
      }, Math.hypot(c1x - ox, c1y - oy) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x - c2x, y - c2y));
      ox = x;
      oy = y;
    } else r++;
  }
  return out;
}

/* ─────────────── 极坐标环 ─────────────── */

/* 从中心 (R,R) 向等角度射线求与多边形的最远交点 → 96 点环。
   所有形状共用同一组角度，因此可以逐点插值形变。 */
export function polarRing(pts, R, n = 96) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const q = pts[(k + 1) % pts.length];
      const ax = p[0] - R;
      const ay = p[1] - R;
      const bx = q[0] - R;
      const by = q[1] - R;
      const den = (bx - ax) * dy - (by - ay) * dx;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * dy - ay * dx) / -den;
      if (t < 0 || t > 1) continue;
      const hit = (ax + (bx - ax) * t) * dx + (ay + (by - ay) * t) * dy;
      if (hit > best) best = hit;
    }
    return [R + dx * best, R + dy * best];
  });
}

export function circleRing(R, n = 96) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    return [R + Math.cos(a) * R, R + Math.sin(a) * R];
  });
}

/* 环整体绕中心旋转 k 个采样步 */
export function rotateRing(ring, k, R) {
  const n = ring.length;
  const a = (k / n) * TAU;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Array.from({ length: n }, (_, i) => {
    const [px, py] = ring[(((i - k) % n) + n) % n];
    const dx = px - R;
    const dy = py - R;
    return [R + dx * c - dy * s, R + dx * s + dy * c];
  });
}

export const ringBBox = (ring) => {
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const p of ring) {
    if (p[1] < top) top = p[1];
    if (p[1] > bottom) bottom = p[1];
    if (p[0] < left) left = p[0];
    if (p[0] > right) right = p[0];
  }
  return { top, bottom, left, right };
};

/* 某水平线上的左右边界（实时，用于形变过程中） */
export function spanHalf(ring, y, R) {
  let left = -Infinity;
  let right = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if ((a[1] <= y) === (b[1] <= y)) continue;
    const x = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    if (x <= R) {
      if (x > left) left = x;
    } else if (x < right) right = x;
  }
  return [Number.isFinite(left) ? left : R, Number.isFinite(right) ? right : R];
}

/* ─────────────── 跨度表 ─────────────── */

export function buildSpan(pts, R, n = 160) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const h = maxY - minY;
  const yOf = (i) => minY + (h * (i + 0.5)) / n;
  const L = new Float64Array(n);
  const Rt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const y = yOf(i);
    let lo = -Infinity;
    let hi = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % pts.length];
      if ((a[1] <= y) === (b[1] <= y)) continue;
      const x = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
      if (x <= R) {
        if (x > lo) lo = x;
      } else if (x < hi) hi = x;
    }
    L[i] = Number.isFinite(lo) ? lo : R;
    Rt[i] = Number.isFinite(hi) ? hi : R;
  }
  return (y) => {
    const f = clamp(((y - minY) / h) * n - 0.5, 0, n - 1);
    const k = Math.floor(f);
    const t = f - k;
    const j = Math.min(k + 1, n - 1);
    return [L[k] + (L[j] - L[k]) * t, Rt[k] + (Rt[j] - Rt[k]) * t];
  };
}

const spanCache = new Map();
export function spanAt(path, R) {
  let fn = spanCache.get(path);
  if (!fn) {
    fn = buildSpan(flattenPath(path), R);
    spanCache.set(path, fn);
  }
  return fn;
}

export const spanPoly = (ring, y, R) => spanHalf(ring, y, R);

/* ─────────────── 3D 旋转 ─────────────── */

export function rot3(turn, tilt, roll) {
  const d = Math.PI / 180;
  const ct = Math.cos(turn * d);
  const st = Math.sin(turn * d);
  const cp = Math.cos(tilt * d);
  const sp = Math.sin(tilt * d);
  const cr = Math.cos(roll * d);
  const sr = Math.sin(roll * d);
  return [
    cr * ct - sr * sp * st, -sr * cp, cr * st + sr * sp * ct,
    sr * ct + cr * sp * st, cr * cp, sr * st - cr * sp * ct,
    -cp * st, sp, cp * ct,
  ];
}

/* pose 相对 home 的旋转矩阵 */
export function relRot(pose, home) {
  const a = rot3(pose.turn, pose.tilt, pose.roll);
  const b = rot3(home.turn, home.tilt, home.roll);
  return [
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    a[0] * b[3] + a[1] * b[4] + a[2] * b[5],
    a[0] * b[6] + a[1] * b[7] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[1] + a[5] * b[2],
    a[3] * b[3] + a[4] * b[4] + a[5] * b[5],
    a[3] * b[6] + a[4] * b[7] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[1] + a[8] * b[2],
    a[6] * b[3] + a[7] * b[4] + a[8] * b[5],
    a[6] * b[6] + a[7] * b[7] + a[8] * b[8],
  ];
}

/* 回转体在偏航角 angle 下的轮廓半径采样（环状光源求交 + 5 点平滑） */
export function solidRadii(solid, angle, n = 96) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pts = solid.map(([x, y, z, rad]) => [x * c + z * s, y, rad]);
  const raw = Array.from({ length: n }, (_, i) => {
    const u = (i / n) * TAU;
    const dx = Math.cos(u);
    const dy = Math.sin(u);
    let best = 0;
    for (const [h, y, k] of pts) {
      const v = dx * h + dy * y;
      const b = v * v - (h * h + y * y) + k * k;
      if (b <= 0) continue;
      const x = v + Math.sqrt(b);
      if (x > best) best = x;
    }
    return best;
  });
  const o = raw.length;
  return raw.map((_, i) => (
    raw[(i - 2 + o) % o] + 4 * raw[(i - 1 + o) % o] + 6 * raw[i]
    + 4 * raw[(i + 1) % o] + raw[(i + 2) % o]
  ) / 16);
}

/* 把静止环按 solidRadii(yaw)/solidRadii(0) 缩放 → 转身轮廓 */
export function makeTurnAt(solid, ring, R) {
  const rest = solidRadii(solid, 0);
  return (yaw) => {
    let v = solidRadii(solid, yaw).map((x, i) => clamp((x + 12) / (rest[i] + 12), 0.32, 1.5));
    const n = v.length;
    for (let p = 0; p < 3; p++) {
      const prev = v;
      v = prev.map((_, i) => (
        prev[(i - 2 + n) % n] + 4 * prev[(i - 1 + n) % n] + 6 * prev[i]
        + 4 * prev[(i + 1) % n] + prev[(i + 2) % n]
      ) / 16);
    }
    return ring.map(([x, y], i) => [R + (x - R) * v[i], R + (y - R) * v[i]]);
  };
}

/* ─────────────── 指针映射 ─────────────── */

/* 把屏幕指针映射到角色周围的一个椭圆上（用于视线跟随） */
export function mapPointer(rect, pt, pull = 0.6, xIn = 22, yIn = 14, radIn = 2) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  const o = Math.min(1, Math.sqrt(Math.hypot(dx, dy) / (rect.width * radIn)));
  const a = Math.atan2(dy, dx);
  return {
    x: cx + pull * (yIn / xIn) * o * Math.cos(a) * rect.width,
    y: cy + pull * o * Math.sin(a) * rect.height,
  };
}
