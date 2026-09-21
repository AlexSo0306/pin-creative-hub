/* 锅宝 v2 · overlay —— 覆盖动效层
 *
 * 参考实现里，覆盖层激活时身体本身会变成一个正圆，视觉身份来自围绕它的粒子/图元。
 * 本文件沿用这个分工：character.js 负责把身体 morph 成圆，这里负责画图元。
 *
 * 14 种 kind：dots / orbit / radar / progress / gather / wave / send / receive
 *             dock / ball / whirl / pencil / bang / standby
 * 全部用可复用元素池绘制，不每帧创建节点。
 */

import { TAU, clamp, K2, Rc, y1e, Dke, rand } from "./core.js";
import { R_BASE } from "./art.js";

const NS = "http://www.w3.org/2000/svg";
const POOL = 26;

const el = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

export class OverlayLayer {
  constructor() {
    this.uid = `gb-${Math.random().toString(36).slice(2, 8)}`;
    this.dots = [];
    this.bars = [];
    this.spokes = [];
    this.arcs = [];
    this.attached = false;
  }

  attach(svg, group) {
    if (this.attached) return;
    this.back = el("g", { class: "gb-fx-back", "pointer-events": "none" });
    this.front = el("g", { class: "gb-fx-front", "pointer-events": "none" });
    const R = R_BASE;
    for (let i = 0; i < POOL; i++) {
      const c = el("circle", { r: 0, cx: R, cy: R, fill: "currentColor", style: "display:none" });
      this.back.appendChild(c);
      this.dots.push(c);
    }
    for (let i = 0; i < 8; i++) {
      const r = el("rect", { rx: 6, ry: 6, fill: "currentColor", style: "display:none" });
      this.back.appendChild(r);
      this.bars.push(r);
    }
    for (let i = 0; i < 12; i++) {
      const p = el("path", { fill: "none", stroke: "currentColor", "stroke-linecap": "round", style: "display:none" });
      this.front.appendChild(p);
      this.spokes.push(p);
    }
    for (let i = 0; i < 3; i++) {
      const c = el("circle", { r: 0, cx: R, cy: R, fill: "none", stroke: "currentColor", style: "display:none" });
      this.front.appendChild(c);
      this.arcs.push(c);
    }
    group.appendChild(this.back);
    group.appendChild(this.front);
    this.svg = svg;
    this.attached = true;
  }

  _hideAll() {
    for (const d of this.dots) d.style.display = "none";
    for (const b of this.bars) b.style.display = "none";
    for (const s of this.spokes) s.style.display = "none";
    for (const a of this.arcs) a.style.display = "none";
  }

  /* 单点：把索引 i 的第 k 个点放到 (R + dx, R + dy)，半径 r，透明度 o */
  _dot(i, dx, dy, r, o) {
    const d = this.dots[i];
    if (!d) return;
    d.setAttribute("cx", (R_BASE + dx).toFixed(2));
    d.setAttribute("cy", (R_BASE + dy).toFixed(2));
    d.setAttribute("r", Math.max(0, r).toFixed(2));
    d.style.opacity = clamp(o, 0, 1).toFixed(3);
    d.style.display = r > 0.4 && o > 0.01 ? "" : "none";
  }

  _bar(i, x, y, w, h, rx, o) {
    const b = this.bars[i];
    if (!b) return;
    b.setAttribute("x", (R_BASE + x - w / 2).toFixed(2));
    b.setAttribute("y", (R_BASE + y - h / 2).toFixed(2));
    b.setAttribute("width", Math.max(0, w).toFixed(2));
    b.setAttribute("height", Math.max(0, h).toFixed(2));
    b.setAttribute("rx", rx.toFixed(2));
    b.setAttribute("ry", rx.toFixed(2));
    b.style.opacity = clamp(o, 0, 1).toFixed(3);
    b.style.display = o > 0.01 ? "" : "none";
  }

  _spoke(i, d, width, o) {
    const s = this.spokes[i];
    if (!s) return;
    s.setAttribute("d", d);
    s.setAttribute("stroke-width", width.toFixed(2));
    s.style.opacity = clamp(o, 0, 1).toFixed(3);
    s.style.display = o > 0.01 ? "" : "none";
  }

  _arc(i, r, width, dash, o) {
    const a = this.arcs[i];
    if (!a) return;
    a.setAttribute("cx", R_BASE);
    a.setAttribute("cy", R_BASE);
    a.setAttribute("r", Math.max(0, r).toFixed(2));
    a.setAttribute("stroke-width", width.toFixed(2));
    if (dash) {
      a.setAttribute("stroke-dasharray", dash);
      a.setAttribute("transform", `rotate(-90 ${R_BASE} ${R_BASE})`);
    } else {
      a.removeAttribute("stroke-dasharray");
      a.removeAttribute("transform");
    }
    a.style.opacity = clamp(o, 0, 1).toFixed(3);
    a.style.display = o > 0.01 ? "" : "none";
  }

  /* 主绘制：kind 为当前覆盖类型，mix 为 0..1 的进出权重 */
  paint(now, stateAt, kind, prevKind, mix, R) {
    if (!this.attached) return;
    this._hideAll();
    if (!kind || mix <= 0.004) return;
    const k = clamp(mix, 0, 1);
    const t = (now - stateAt) / 1000;
    /* grow：出现的前 28% 权重里淡入；之后恒为 1。
       注意不要再乘一个「尾部淡出」——覆盖层的退场是由 character 把 overlay 权重
       拉回 0 来完成的，这里若再淡出一次，k=1 时 alpha 会变成 0，整个图层不可见。 */
    const alpha = clamp(Dke(clamp(k / 0.28, 0, 1)), 0, 1);
    const A = R * 1.05;

    switch (kind) {
      /* 思考：一圈小点缓慢公转 */
      case "dots": {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + t * 0.9;
          const pulse = 0.62 + 0.38 * Math.sin(t * 2.2 + i * 0.9);
          this._dot(i, Math.cos(a) * A, Math.sin(a) * A, 7.5 * pulse, alpha * pulse);
        }
        break;
      }
      /* 环绕：单点沿椭圆轨道跑 */
      case "orbit": {
        const a = t * 1.5;
        this._dot(0, Math.cos(a) * A * 1.02, Math.sin(a) * A * 0.46, 9, alpha);
        const a2 = a - 1.1;
        this._dot(1, Math.cos(a2) * A * 0.86, Math.sin(a2) * A * 0.4, 5.5, alpha * 0.5);
        break;
      }
      /* 雷达：同心弧 + 扫描线 */
      case "radar": {
        const sweep = (t * 0.9) % 1;
        for (let i = 0; i < 3; i++) {
          this._arc(i, A * (0.42 + i * 0.28), 2.4, null, alpha * (0.5 - i * 0.1));
        }
        const a = sweep * TAU - Math.PI / 2;
        const len = A * 0.95;
        this._spoke(0, `M${R_BASE} ${R_BASE}L${(R_BASE + Math.cos(a) * len).toFixed(2)} ${(R_BASE + Math.sin(a) * len).toFixed(2)}`, 3, alpha * 0.9);
        this._dot(0, Math.cos(a) * len, Math.sin(a) * len, 6, alpha);
        break;
      }
      /* 进度：一圈弧按时长填充 */
      case "progress": {
        const u = clamp(t / 2.4, 0, 1);
        const r = A * 0.88;
        const c = TAU * r;
        this._arc(0, r, 5, `${(c * u).toFixed(2)} ${c.toFixed(2)}`, alpha * 0.95);
        this._arc(1, r, 5, `${c.toFixed(2)} ${c.toFixed(2)}`, alpha * 0.16);
        break;
      }
      /* 聚合：外围小点向心收拢 */
      case "gather": {
        const n = 9;
        for (let i = 0; i < n; i++) {
          const u = ((t * 0.55 + i / n) % 1);
          const e = Rc(u);
          const a = (i / n) * TAU + t * 0.35;
          const rr = A * (1.05 - 0.62 * e);
          this._dot(i, Math.cos(a) * rr, Math.sin(a) * rr, 6.5 * (1 - e * 0.6), alpha * (1 - e));
        }
        break;
      }
      /* 口述：底部竖条随音量起伏 */
      case "wave": {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const ph = t * 5.2 + i * 1.15;
          const h = 12 + Math.abs(Math.sin(ph)) * 34;
          const x = (i - (n - 1) / 2) * 17;
          this._bar(i, x, A * 0.94, 9, h * alpha, 4.5, alpha);
        }
        break;
      }
      /* 发送：小点向右飞出一段距离 */
      case "send": {
        for (let i = 0; i < 4; i++) {
          const u = ((t * 0.85 + i * 0.24) % 1);
          const e = K2(u);
          this._dot(i, A * (0.35 + 0.75 * e), -A * 0.18, 7, alpha * (1 - u));
        }
        break;
      }
      /* 接收：小点从右侧飞入 */
      case "receive": {
        for (let i = 0; i < 4; i++) {
          const u = ((t * 0.8 + i * 0.26) % 1);
          const e = K2(u);
          this._dot(i, A * (1.1 - 0.75 * e), -A * 0.18, 7, alpha * u);
        }
        break;
      }
      /* 上传：点落进下方的小托盘 */
      case "dock": {
        for (let i = 0; i < 5; i++) {
          const u = ((t * 0.7 + i * 0.2) % 1);
          const e = Rc(u);
          this._dot(i, (i - 2) * 13, -A * 0.5 + e * A * 1.28, 6, alpha * (1 - u * 0.7));
        }
        this._bar(6, 0, A * 0.86, 74, 11, 5.5, alpha * 0.85);
        break;
      }
      /* 弹跳：上方一颗球来回弹 */
      case "ball": {
        const u = (t * 1.35) % 1;
        const y = -A * 0.6 - Math.abs(Math.sin(u * Math.PI)) * A * 0.5;
        const sq = u < 0.08 || u > 0.92 ? 0.82 : 1;
        this._dot(0, 0, y, 11, alpha);
        this._bar(7, 0, A * 0.82, 52 * sq, 9 * sq, 4.5, alpha * 0.6);
        break;
      }
      /* 载入：螺旋点阵旋转 */
      case "whirl": {
        const n = 12;
        for (let i = 0; i < n; i++) {
          const u = i / n;
          const a = u * TAU * 1.7 + t * 1.9;
          const rr = A * (0.3 + u * 0.72);
          const o = (1 - u) * 0.95;
          this._dot(i, Math.cos(a) * rr, Math.sin(a) * rr, 4 + (1 - u) * 5, alpha * o);
        }
        break;
      }
      /* 书写：一段来回描的短线 */
      case "pencil": {
        const u = (t * 0.42) % 1;
        const span = 0.86;
        const x = (u < 0.5 ? u * 2 : (1 - u) * 2) * span - span / 2;
        const y = A * 0.86 + Math.sin(t * 3.1) * 3;
        this._spoke(1, `M${(R_BASE - A * 0.46).toFixed(2)} ${(R_BASE + A * 0.86).toFixed(2)}L${(R_BASE + A * 0.46).toFixed(2)} ${(R_BASE + A * 0.86).toFixed(2)}`, 3, alpha * 0.3);
        this._spoke(2, `M${(R_BASE + x * A).toFixed(2)} ${(R_BASE + y).toFixed(2)}l-9 -9`, 3.4, alpha);
        break;
      }
      /* 告警：向外放射的短线（长度收在 1.26R 内，配合 character 的覆盖态收缩才不会出框） */
      case "bang": {
        const n = 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + 0.2;
          const pop = y1e(clamp((t * 1.6) % 1, 0, 1));
          const r0 = A * (0.96 + pop * 0.10);
          const r1 = r0 + A * 0.14 * (1 - Math.abs(pop - 0.5) * 1.2);
          this._spoke(i, `M${(R_BASE + Math.cos(a) * r0).toFixed(2)} ${(R_BASE + Math.sin(a) * r0).toFixed(2)}`
            + `L${(R_BASE + Math.cos(a) * r1).toFixed(2)} ${(R_BASE + Math.sin(a) * r1).toFixed(2)}`, 4, alpha);
        }
        break;
      }
      /* 待机：三点依次呼吸 */
      case "standby": {
        for (let i = 0; i < 3; i++) {
          const ph = ((t * 0.7 - i * 0.16) % 1 + 1) % 1;
          const o = Math.sin(ph * Math.PI) ** 2;
          this._dot(i, (i - 1) * 26, 0, 8, alpha * (0.18 + 0.82 * o));
        }
        break;
      }
      default:
        break;
    }
  }

  /* 一次性爆发粒子（醒来 / 完成时用） */
  burst(n = 12, spread = 0.9) {
    if (!this.attached) return;
    for (let i = 0; i < Math.min(n, this.dots.length); i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3);
      const r = rand(0.9, 1.25) * R_BASE;
      this._dot(i, Math.cos(a) * r * spread, Math.sin(a) * r * spread, 5, 0.9);
    }
  }
}
