/* 锅宝 v2 · character —— 角色实例
 *
 * 每帧流程（对标参考）：
 *   1. applyPose 产出「意图」{spin,tx,ty,squash,lid,eyeBoost}
 *   2. 意图写入各弹簧的 target
 *   3. 固定 1/120 s 子步进积分所有弹簧（帧率无关）
 *   4. 眼型轮播 / 眨眼队列 / 视线目标推进
 *   5. 绘制：身体路径（静止态用缓存 path，形变/转身/覆盖态用实时环重建）、眼睛、覆盖图元
 */

import {
  DT, springSteps, spring, stepSpring, springBusy, snapSpring,
  clamp, lerp, rand, sign, K2, Dke, Rn, TAU,
  closedSpline, lerpRing, lerpPoly, centroid, spanAt, spanPoly, rotateRing,
  ringBBox, relRot, makeTurnAt,
} from "./core.js";

import {
  SHAPES, R_BASE, VIEW, VIEW_SCALE, poseScale, shapeEyeScale,
  EYE_BY_INDEX, EYE_NAMES, INK, inkPair, INK_ANGLE,
  OVERLAY_MAP, OVERLAY_CYCLE, OVERLAY_CYCLE_ON, OVERLAY_CYCLE_OFF,
  overlayViewZoom, overlayRing, CIRCLE_PATH,
} from "./art.js";

import {
  GROUPS, ALL_STATES, SPRINGS, FACE, FACE_TUNE, POSE,
  applyPose, nextGaze, HOLD_GAZE, HOLD_EYE, WINK_STATES,
  EYE_PLAYLIST, EYE_HOLD_MS, BLINK_MS,
} from "./pose.js";

import { OverlayLayer } from "./overlay.js";

const NS = "http://www.w3.org/2000/svg";
const G9E = 21;        // 眼睛距轮廓的最小垂直余量（对齐参考的 G9e）
const VJT = 0;         // 双眼内距预留；统一眼型模式下参考取 0，靠 _ee 守卫兜底

const el = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/* 眨眼队列：四个关键帧 + 14% 概率补一次连眨 */
export function queueBlink(q, now) {
  q.push(
    { at: now, v: 0.05 },
    { at: now + 70, v: 0.05 },
    { at: now + 150, v: 1.08 },
    { at: now + 300, v: 1 },
  );
  if (Math.random() < 0.14) {
    q.push({ at: now + 370, v: 0.05 }, { at: now + 480, v: 1 });
  }
}

export function consumeBlink(q, now) {
  let key = null;
  while (q.length && now >= q[0].at) key = q.shift().v;
  return key;
}

/* 挤眼：单侧眼皮压下去再弹回来 */
function winkLid(base, now, winkAt, winkEye, i) {
  let lid = Math.max(base, 0.04);
  if (i === winkEye && now < winkAt + 320) {
    const u = (now - winkAt) / 320;
    const f = u < 0.42 ? 1 - u / 0.42 : (u - 0.42) / 0.58;
    lid = Math.max(lid * clamp(f, 0, 1), 0.04);
  }
  return lid;
}

export class Character {
  constructor(host, options = {}) {
    this.host = host;
    this.opts = options;
    this.reduceMotion = typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.shapeName = options.shape && SHAPES[options.shape] ? options.shape : "dango";
    this.ink = options.ink && INK[options.ink] ? options.ink : "ink";
    this.inkFlat = options.inkFlat || null;
    this.state = options.state && ALL_STATES.includes(options.state) ? options.state : "idle";
    this.eyePinned = null;

    this.t0 = performance.now();
    this.stateAt = this.t0;
    this.last = this.t0;
    this.paused = false;
    this.destroyed = false;
    this.followPointer = options.followPointer !== false;

    this.ctx = {
      prev: { spin: 0, tx: 0, ty: 0, squash: 1 },
      nodUntil: 0, nodEnd: 0, impulseAt: 0, stAt: 0,
      spinKick: 0, tyKick: 0, shakeUntil: 0, slumpAt: 0, dragCycle: -1,
      notifyPop: false, wakingBurst: false, wakeEye: null, wantSpinTurn: null,
      wantBlink: false, wantBurst: null,
    };

    /* 弹簧组
       注意：字段名不能与原型方法同名。这里若写成 this.spin = spring(0)，
       实例属性会遮蔽原型上的 spin() 方法，外部调用 c.spin(1) 直接 TypeError
       （报错信息是「c.spin is not a function」，但 typeof 出来是 object —— 极易误判成缓存问题）。 */
    this.spinSpring = spring(0);
    this.tx = spring(0);
    this.ty = spring(0);
    this.squash = spring(1);
    this.blink = spring(1);
    this.eyeScale = spring(1);
    this.gazeX = spring(0);
    this.gazeY = spring(0);
    this.notify = spring(0);
    this.overlay = spring(0);
    this.overlayMix = spring(1);
    this.overlayTurn = spring(0);
    this.shapeSpring = spring(1);
    this.eyeMorph = spring(1);
    this.spinTurn = null;
    this.manualMix = spring(0);

    this.prevRing = SHAPES[this.shapeName].ring;
    this.prevBelt = null;

    /* 眼型 */
    this.eyeFrom = EYE_PLAYLIST[this.state][0];
    this.eyeTo = this.eyeFrom;
    this._fromPolys = null;
    this.eyeStiffness = 7;
    this.playlistHold = this.t0 + rand(...EYE_HOLD_MS[this.state]);
    this.playlistIndex = 0;
    this.blinkAt = BLINK_MS[this.state] ? this.t0 + rand(...BLINK_MS[this.state]) : Infinity;
    this.blinkQueue = [];
    this.blinkX = 1;
    this.winkAt = -1e9;
    this.winkEye = -1;

    /* 视线 */
    this.gazeTarget = { x: 0, y: 0 };
    this.gazeHold = this.t0 + rand(...(HOLD_GAZE[this.state] ? [3000, 6000] : nextGaze(this.state).hold));
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.pointerRaw = null;
    this.rectCache = null;
    this.rectAt = 0;

    /* 覆盖层 */
    this.ovKind = null;
    this.ovPrev = null;
    this.ovTarget = undefined;
    this.ovOn = false;
    this.ovTurnAcc = 0;
    this.ovTurnDir = 1;
    this.ovRest = false;
    this.ovRestAt = 0;
    this.ovAt = 0;
    this.ovSpin = 0;

    this._build();
    this._bindPointer();

    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  /* ─────────────── DOM ─────────────── */

  _build() {
    const svg = el("svg", {
      class: "gb-mascot",
      viewBox: `${VIEW.minX} ${VIEW.minY} ${VIEW.width} ${VIEW.height}`,
      xmlns: NS,
      "aria-hidden": "true",
      focusable: "false",
    });
    const defs = el("defs");
    const gid = `gb-ink-${Math.random().toString(36).slice(2, 8)}`;
    this.gid = gid;

    /* 墨色渐变：必须用 userSpaceOnUse。
       objectBoundingBox + light-dark() 在 SVG stop 上不可靠（实测不生效），
       所以角度对应的起止点由 viewBox 算出，色值由 JS 按当前主题解析成实色。 */
    const grad = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse" });
    this.stopFrom = el("stop", { offset: "0" });
    this.stopTo = el("stop", { offset: "1" });
    grad.appendChild(this.stopFrom);
    grad.appendChild(this.stopTo);
    defs.appendChild(grad);
    this.grad = grad;

    const clip = el("clipPath", { id: `${gid}-clip` });
    this.clipPath = el("path", { d: SHAPES[this.shapeName].path });
    clip.appendChild(this.clipPath);
    defs.appendChild(clip);
    svg.appendChild(defs);

    this.group = el("g");
    this.body = el("path", { class: "gb-body", d: SHAPES[this.shapeName].path });
    this.eyesG = el("g", { class: "gb-eyes", "clip-path": `url(#${gid}-clip)` });
    /* 眼睛是「挖空」：填充背景色，不是墨色。这是整个角色的视觉身份。 */
    this.eyeEls = [el("path", { fill: "var(--gb-eye, var(--gb-bg, #f6f7f9))" }),
      el("path", { fill: "var(--gb-eye, var(--gb-bg, #f6f7f9))" })];
    for (const e of this.eyeEls) this.eyesG.appendChild(e);
    this.badge = el("circle", { class: "gb-badge", r: 0, style: "display:none" });
    this.group.appendChild(this.body);
    this.group.appendChild(this.eyesG);
    this.group.appendChild(this.badge);
    svg.appendChild(this.group);

    this.fx = new OverlayLayer();
    this.fx.attach(svg, this.group);

    this.svg = svg;
    this.host.appendChild(svg);
    this._applyInk();
    this._watchTheme();
  }

  /* 当前主题：优先读宿主给的 --gb-scheme，读不到再退回系统偏好 */
  _scheme() {
    try {
      const v = getComputedStyle(this.host).getPropertyValue("--gb-scheme").trim();
      if (v === "dark" || v === "light") return v;
    } catch { /* ignore */ }
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }

  /* 墨色解析：默认用 light/dark 两套端点画渐变（参考的做法）；
     若宿主给了 inkFlat（可以是 'var(--fg)' 这样的 CSS 值），就改用纯色填充 —— 
     品牌规范禁止渐变的场景走这条路，其余逻辑完全不变。 */
  _applyInk() {
    const dark = this._scheme() === "dark";
    const [f0, f1] = inkPair(this.ink, dark);
    const cx = VIEW.minX + VIEW.width / 2;
    const cy = VIEW.minY + VIEW.height / 2;
    const rad = (INK_ANGLE * Math.PI) / 180;
    const span = Math.hypot(VIEW.width, VIEW.height) / 2;
    const dx = Math.sin(rad) * span;
    const dy = -Math.cos(rad) * span;
    this.grad.setAttribute("x1", (cx - dx).toFixed(2));
    this.grad.setAttribute("y1", (cy - dy).toFixed(2));
    this.grad.setAttribute("x2", (cx + dx).toFixed(2));
    this.grad.setAttribute("y2", (cy + dy).toFixed(2));
    this.stopFrom.setAttribute("stop-color", f0);
    this.stopTo.setAttribute("stop-color", f1);
    if (this.inkFlat) {
      this.body.setAttribute("fill", this.inkFlat);
      this.svg.style.color = this.inkFlat;
    } else {
      this.body.setAttribute("fill", `url(#${this.gid})`);
      /* 覆盖动效用 currentColor，跟着墨色走 */
      this.svg.style.color = f0;
    }
  }

  /* 传入 CSS 颜色值启用纯色墨（如 'var(--fg)'）；传 null 恢复渐变 */
  setInkFlat(v) {
    this.inkFlat = v || null;
    this._applyInk();
  }

  /* 主题一变就重解析墨色（宿主可能用 data-theme / class / 系统偏好任意一种） */
  _watchTheme() {
    const re = () => { if (!this.destroyed) this._applyInk(); };
    if (typeof MutationObserver === "function" && this.svg.ownerDocument?.documentElement) {
      this._mo = new MutationObserver(re);
      this._mo.observe(this.svg.ownerDocument.documentElement, {
        attributes: true, attributeFilter: ["class", "data-theme", "style"],
      });
    }
    if (typeof matchMedia === "function") {
      this._mq = matchMedia("(prefers-color-scheme: dark)");
      this._mqListener = re;
      this._mq.addEventListener?.("change", re);
    }
  }

  _bindPointer() {
    if (this.opts.followPointer === false) return;
    this._onMove = (e) => { this.pointerRaw = { x: e.clientX, y: e.clientY }; };
    this._onLeave = () => { this.pointerRaw = null; };
    window.addEventListener("pointermove", this._onMove, { passive: true });
    window.addEventListener("pointerleave", this._onLeave);
  }

  /* ─────────────── 公开 API ─────────────── */

  setState(name, opts = {}) {
    if (!ALL_STATES.includes(name) || name === this.state) return;
    this.state = name;
    this.stateAt = performance.now();
    this.playlistIndex = 0;
    this.playlistHold = this.stateAt + (opts.holdMs ?? rand(...EYE_HOLD_MS[name]));
    this.blinkAt = BLINK_MS[name] ? this.stateAt + rand(...BLINK_MS[name]) : Infinity;
    this.blinkQueue = [];
    this.winkAt = -1e9;
    Object.assign(this.ctx, {
      notifyPop: false, wakingBurst: false, slumpAt: 0, dragCycle: -1,
      nodUntil: 0, nodEnd: 0, impulseAt: 0, stAt: 0, wakeEye: null, wantSpinTurn: null,
    });
    const g = HOLD_GAZE[name];
    if (g) {
      this.gazeTarget = { ...g };
      this.gazeHold = Infinity;
    } else {
      const n = nextGaze(name);
      this.gazeTarget = { x: n.x, y: n.y };
      this.gazeHold = this.stateAt + rand(...n.hold);
    }
    if (!opts.keepEyes) this._morphEyes(this._homeEye());
  }

  setShape(name) {
    if (!SHAPES[name] || name === this.shapeName) return;
    this.prevRing = this._currentRing();
    this.prevBelt = null;
    this.shapeName = name;
    this.shapeSpring.x = 0;
    this.shapeSpring.v = 0;
    this.shapeSpring.t = 1;
  }

  setInk(id) {
    if (!INK[id]) return;
    this.ink = id;
    this._applyInk();
  }

  setEye(name, opts = {}) {
    const idx = this._eyeIndex(name);
    if (idx < 0 || idx >= EYE_BY_INDEX.length) return;
    this.eyePinned = idx;
    this._morphEyes(idx, opts.stiffness ?? 7);
  }

  unpinEye() { this.eyePinned = null; }

  /* 立刻来一次整圈旋转（挂件点击反馈用） */
  spin(turns = 1, dir) {
    if (this.reduceMotion) return;
    const d = dir === 1 || dir === -1 ? dir : sign();
    const base = this.spinTurn ? this.spinTurn.t : 0;
    this.spinTurn = spring(base);
    this.spinTurn.x = base;
    this.spinTurn.t = base + d * turns;
  }

  say(text, holdMs = 2600) {
    const prev = this.opts.onSay;
    if (typeof prev === "function") prev(text, holdMs);
  }

  setPaused(v) {
    this.paused = !!v;
    if (!this.paused) {
      this.last = performance.now();
      this._raf = requestAnimationFrame((t) => this._tick(t));
    }
  }

  destroy() {
    this.destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._onMove) {
      window.removeEventListener("pointermove", this._onMove);
      window.removeEventListener("pointerleave", this._onLeave);
    }
    this._mo?.disconnect();
    if (this._mq && this._mqListener) this._mq.removeEventListener?.("change", this._mqListener);
    this.svg.remove();
  }

  /* ─────────────── 内部工具 ─────────────── */

  /* 名字 → 眼型序号；名字非法返回 -1（调用方据此跳过） */
  _eyeIndex(name) {
    if (typeof name === "number") return Number.isInteger(name) ? name : -1;
    return EYE_NAMES.indexOf(name);
  }

  _homeEye() {
    const pin = HOLD_EYE[this.state];
    if (pin != null) return pin;
    if (this.eyePinned != null) return this.eyePinned;
    const list = EYE_PLAYLIST[this.state] || [0];
    return list[0];
  }

  _morphEyes(index, stiffness = 7) {
    if (index === this.eyeTo && this.eyeMorph.t === 1) return;
    this._fromPolys = this._currentPolys(clamp(this.eyeMorph.x, 0, 1));
    this.eyeFrom = this.eyeTo;
    this.eyeTo = index;
    this.eyeMorph.x = 0;
    this.eyeMorph.v = 0;
    this.eyeMorph.t = 1;
    this.eyeStiffness = stiffness;
  }

  _currentPolys(t) {
    const from = this._fromPolys || EYE_BY_INDEX[this.eyeFrom];
    const to = EYE_BY_INDEX[this.eyeTo];
    if (!to) return EYE_BY_INDEX[0];
    if (!from) return to;
    return [lerpPoly(from[0], to[0], t), lerpPoly(from[1], to[1], t)];
  }

  _currentRing() {
    const k = K2(clamp(this.shapeSpring.x, 0, 1));
    const target = SHAPES[this.shapeName].ring;
    if (k >= 0.999) return target;
    return lerpRing(this.prevRing, target, k);
  }

  /* ─────────────── 主循环 ─────────────── */

  _tick(now) {
    if (this.destroyed || this.paused) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this._step(now, dt);
    this._paint(now);
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _step(now, dt) {
    const mt = (now - this.t0) / 1000;
    const dtState = (now - this.stateAt) / 1000;
    const ctx = this.ctx;

    const pose = applyPose(this.state, mt, dtState, now, ctx, undefined);
    ctx.prev = { spin: pose.spin, tx: pose.tx, ty: pose.ty, squash: pose.squash };

    /* 事件型附加：点头 / 冲击 / 旋转 */
    let kickSpin = 0;
    if (ctx.spinKick) {
      kickSpin = ctx.spinKick;
      ctx.spinKick = 0;
    }
    this.spinSpring.t = pose.spin + kickSpin;
    this.tx.t = pose.tx;
    this.ty.t = pose.ty + (ctx.tyKick || 0);
    ctx.tyKick = 0;
    this.squash.t = pose.squash;
    this.eyeScale.t = pose.eyeBoost;

    /* 眨眼 */
    if (this.blinkAt !== Infinity && now >= this.blinkAt) {
      queueBlink(this.blinkQueue, now);
      this.blinkAt = BLINK_MS[this.state] ? now + rand(...BLINK_MS[this.state]) : Infinity;
    }
    if (ctx.wantBlink) {
      ctx.wantBlink = false;
      queueBlink(this.blinkQueue, now);
    }
    const key = consumeBlink(this.blinkQueue, now);
    if (key != null) this.blink.t = key;
    else if (this.blinkQueue.length === 0) this.blink.t = 1;

    /* 挤眼 */
    if (WINK_STATES.has(this.state) && Math.random() < 0.0016) {
      this.winkAt = now;
      this.winkEye = Math.random() < 0.5 ? 0 : 1;
    }

    /* 眼型轮播 */
    if (this.eyePinned == null) {
      if (now >= this.playlistHold) {
        const list = EYE_PLAYLIST[this.state] || [0];
        this.playlistIndex = (this.playlistIndex + 1) % list.length;
        this._morphEyes(list[this.playlistIndex], this.state === "searching" || this.state === "excited" ? 10 : 6);
        this.playlistHold = now + rand(...(EYE_HOLD_MS[this.state] || [2000, 3600]));
      }
    }
    const wakeEye = ctx.wakeEye;
    if (wakeEye && this.eyePinned == null) {
      const idx = wakeEye[this.playlistIndex % wakeEye.length];
      if (idx !== this.eyeTo) this._morphEyes(idx, 9);
      ctx.wakeEye = null;
    }

    /* 视线 */
    if (this.gazeHold !== Infinity && now >= this.gazeHold) {
      const n = nextGaze(this.state);
      this.gazeTarget = { x: n.x, y: n.y };
      this.gazeHold = now + rand(...n.hold);
    }
    this.gazeX.t = this.gazeTarget.x;
    this.gazeY.t = this.gazeTarget.y;

    /* 旋转整圈 */
    if (ctx.wantSpinTurn) {
      const [turns, dir] = ctx.wantSpinTurn;
      ctx.wantSpinTurn = null;
      if (!this.reduceMotion) {
        const base = this.spinTurn ? this.spinTurn.t : 0;
        this.spinTurn = spring(base);
        this.spinTurn.x = base;
        this.spinTurn.t = base + dir * turns;
      }
    }

    /* 覆盖层状态机 */
    this._stepOverlay(now);

    /* 通知 */
    this.notify.t = this.state === "notifying" ? 1 : 0;
    this.overlay.t = this.ovOn ? 1 : 0;

    if (this.reduceMotion) {
      this.spinSpring.t = 0; this.tx.t = 0; this.ty.t = 0;
      this.squash.t = 1; this.blink.t = 1; this.eyeScale.t = 1;
      this.overlay.t = 0;
      this.spinTurn = null;
    }

    /* 固定子步进积分 */
    const n = springSteps(dt);
    const step = dt / n;
    for (let i = 0; i < n; i++) {
      stepSpring(this.eyeMorph, this.eyeStiffness, 1, step);
      if (this.spinTurn) stepSpring(this.spinTurn, ...SPRINGS.spinTurn, step);
      stepSpring(this.spinSpring, ...SPRINGS.spin, step);
      stepSpring(this.tx, ...SPRINGS.x, step);
      stepSpring(this.ty, ...SPRINGS.y, step);
      stepSpring(this.squash, ...SPRINGS.squash, step);
      stepSpring(this.blink, ...SPRINGS.blink, step);
      stepSpring(this.eyeScale, ...SPRINGS.eyeScale, step);
      stepSpring(this.notify, ...SPRINGS.notify, step);
      stepSpring(this.gazeX, ...SPRINGS.gazeX, step);
      stepSpring(this.gazeY, ...SPRINGS.gazeY, step);
      stepSpring(this.overlay, ...SPRINGS.overlay, step);
      stepSpring(this.overlayMix, ...SPRINGS.overlayMix, step);
      stepSpring(this.shapeSpring, ...SPRINGS.shape, step);
      stepSpring(this.overlayTurn, ...SPRINGS.overlayTurn, step);
    }

    if (this.spinTurn && Math.abs(this.spinTurn.x - this.spinTurn.t) < 0.002 && Math.abs(this.spinTurn.v) < 0.04) {
      this.spinTurn = null;
    }

    /* 指针跟随 */
    this._updatePointer(now);
  }

  _stepOverlay(now) {
    const want = OVERLAY_MAP[this.state] || null;
    if (want !== this.ovTarget) {
      this.ovTarget = want;
      this.ovAt = now;
      this.ovRest = false;
      this.ovRestAt = 0;
    }
    let on = want != null;
    if (want && OVERLAY_CYCLE.has(this.state)) {
      if (!this.ovRest && now - this.ovAt > (OVERLAY_CYCLE_ON[this.state] || 2500)) {
        this.ovRest = true;
        this.ovRestAt = now;
      } else if (this.ovRest && now - this.ovRestAt > OVERLAY_CYCLE_OFF) {
        this.ovRest = false;
        this.ovAt = now;
      }
      on = !this.ovRest;
    }
    this._ovOn = on;
    if (on !== this.ovOn) {
      this.ovTurnDir = sign();
      this.ovTurnAcc += Math.PI * this.ovTurnDir;
      this.overlayTurn.t = this.ovTurnAcc;
      this.ovOn = on;
    }
    if (want && want !== this.ovKind) {
      if (this.ovKind && this.overlay.x > 0.02) {
        this.ovPrev = this.ovKind;
        this.overlayMix.x = 0;
        this.overlayMix.v = 0;
        this.overlayMix.t = 1;
      } else {
        this.ovPrev = null;
        this.overlayMix.x = 1;
        this.overlayMix.v = 0;
      }
      this.ovKind = want;
      this.ovAt = now;
    }
    if (!want && this.overlay.x < 0.004) {
      this.ovKind = null;
      this.ovPrev = null;
    }
    if (this.overlayMix.x > 0.996) this.ovPrev = null;
  }

  _updatePointer(now) {
    const src = this.pointerRaw;
    if (!src || !this.svg.getBoundingClientRect) {
      this.pointer.tx = 0;
      this.pointer.ty = 0;
      return;
    }
    if (now - this.rectAt > 200) {
      this.rectCache = this.svg.getBoundingClientRect();
      this.rectAt = now;
    }
    const rect = this.rectCache;
    if (!rect || rect.width <= 0) return;
    this.pointer.tx = clamp((src.x - (rect.left + rect.width / 2)) / rect.width, -0.6, 0.6) * 22;
    this.pointer.ty = clamp((src.y - (rect.top + rect.height / 2)) / rect.height, -0.6, 0.6) * 14;
  }

  /* ─────────────── 绘制 ─────────────── */

  _paint(now) {
    const R = R_BASE;
    const shape = SHAPES[this.shapeName];
    const bodyW = poseScale(this.shapeName);
    const yl = clamp(this.overlay.x, 0, 1);
    const mix = 1;
    const ov = { wre: 0, wl: 0, rX: { tone: 0, lift: 0 }, aX: 0, fade: 0, Lee: yl };

    const tx = this.tx.x * bodyW;
    const ty = this.ty.x * bodyW;
    const rot = this.spinSpring.x;
    /* 覆盖动效激活时整体收缩，给特效让出画框内的空间。
       参考站点是直接 overflow:visible 让图元溢出到页面上；
       挂件场景没有那个余量，所以改成收缩（0.76 是让最长的 alerting 尖刺也落在框内的上限）。 */
    const ovShrink = 1 - 0.24 * yl;
    const sx = bodyW * ovShrink;
    const sy = this.squash.x * bodyW * ovShrink;
    this.group.setAttribute(
      "transform",
      `translate(${(R + tx).toFixed(2)} ${(R + ty).toFixed(2)}) rotate(${rot.toFixed(2)}) `
      + `scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-R} ${-R})`,
    );

    /* 旋转整圈 → 环旋转 + 眼睛沿轮廓滑动 */
    const spinAngle = this.spinTurn ? this.spinTurn.x * TAU : 0;
    const spinning = !!this.spinTurn;

    const morphK = K2(clamp(this.shapeSpring.x, 0, 1));
    const morphing = morphK < 0.999;
    let restRing = morphing ? lerpRing(this.prevRing, shape.ring, morphK) : shape.ring;

    /* 回转体转身 */
    let turned = false;
    const yaw = spinning ? spinAngle : 0;
    if (!morphing && shape.solid && Math.abs(yaw) > 1e-4) {
      const turnAt = makeTurnAt(shape.solid, shape.ring, R);
      restRing = turnAt(yaw);
      turned = true;
    }
    let liveRing = restRing;
    if (spinning && shape.solid == null) {
      liveRing = rotateRing(restRing, Math.round((spinAngle / TAU) * restRing.length), R);
    }

    let faceTop = shape.top;
    let faceBottom = shape.bottom;
    if (morphing || turned) {
      const bb = ringBBox(liveRing);
      faceTop = bb.top;
      faceBottom = bb.bottom;
    }

    /* 身体路径 */
    const Jc = clamp(yl / 0.62, 0, 1);
    let bodyD;
    if (Jc >= 1) {
      bodyD = CIRCLE_PATH;
    } else if (Jc <= 0 && !morphing && !turned && !spinning) {
      bodyD = shape.path;
    } else {
      const to = overlayRing(this.ovKind || this.ovPrev, R);
      bodyD = closedSpline(Jc <= 0 ? liveRing : lerpRing(liveRing, to, K2(Jc)));
    }
    this.body.setAttribute("d", bodyD);
    this.clipPath.setAttribute("d", bodyD);

    this.fx.paint(now, this.ovAt, this.ovKind, this.ovPrev, clamp(this.overlayMix.x, 0, 1), R);

    /* viewBox 保持固定。
       参考会用 overlayViewZoom 放大视野（配合 overflow:visible 让图元溢出到页面上）；
       挂件是固定尺寸的方框，放大就等于把特效推出框外，所以这里不缩放，
       改由上面的 ovShrink 在框内腾空间。overlayViewZoom 仍导出，供页面级用法选用。 */
    void overlayViewZoom;
    void mix;

    /* 眼睛 */
    const morphT = clamp(this.eyeMorph.x, 0, 1);
    const polys = this._currentPolys(morphT);
    const pulse = 1 + 0.07 * Math.sin(morphT * Math.PI);
    const eyeTune = {
      sx: FACE.sx * FACE_TUNE.gap,
      sy: FACE.sy * FACE_TUNE.height,
      eye: FACE.eye * FACE_TUNE.size,
    };
    const cents = [centroid(polys[0]), centroid(polys[1])];
    let a1 = 0;
    let o1 = 0;
    for (const p of polys[0]) a1 = Math.max(a1, Math.abs(p[0] - cents[0][0]));
    for (const p of polys[1]) o1 = Math.max(o1, Math.abs(p[0] - cents[1][0]));
    const l1 = Math.abs(cents[1][0] - cents[0][0]) * eyeTune.sx;
    const _ee = a1 + o1 > 0.5 ? clamp((l1 - VJT) / (a1 + o1), 0.35, 4) : 4;
    const oX = Math.min(clamp(this.eyeScale.x, 0.2, 2) * shapeEyeScale(this.shapeName), _ee / pulse);
    const hee0 = Math.min(oX * FACE_TUNE.eyeWidth, _ee / pulse);
    const u10 = oX * FACE_TUNE.eyeHeight;

    const liveSpan = (morphing || turned || spinning)
      ? (y) => spanPoly(liveRing, y, R)
      : spanAt(shape.path, R);

    const badgeRing = liveRing;
    const badgePt = badgeRing[Math.round((badgeRing.length * 7) / 8) % badgeRing.length];

    for (let i = 0; i < 2; i++) {
      const poly = polys[i];
      const [gx, gy] = cents[i];
      this.eyeEls[i].setAttribute("d", polyPathOf(poly));
      const lid = winkLid(this.blink.x, now, this.winkAt, this.winkEye, i);

      let ca = R + FACE.x;
      let wo = (gx - R) * eyeTune.sx;
      let cScale = 1;
      let vScale = 1;
      let visible = true;
      let fade = 1;
      let sre = clamp(R + FACE.y + (gy - R) * eyeTune.sy, faceTop + 2, faceBottom - 2);

      /* 眼睛沿轮廓滑动（转身 / 整圈旋转） */
      const yawAmt = spinning ? spinAngle : 0;
      if (Math.abs(yawAmt) > 1e-4 || turned) {
        const [spL, spR] = liveSpan(sre);
        const rad = Math.max((spR - spL) / 2, 12);
        ca = (spL + spR) / 2;
        const li0 = Math.asin(clamp(wo / rad, -1, 1));
        const bl0 = li0 + yawAmt;
        const io0 = Math.cos(bl0);
        visible = io0 > 0.02;
        cScale = Math.max(io0, 0.02) / Math.max(Math.cos(li0), 0.02);
        wo = rad * Math.sin(bl0);
        fade = Dke(clamp(io0 / 0.5, 0, 1));
      }

      /* 视线 + 指针（不再叠加「微颤」）
         这里原来还有一层高频噪声，读起来就是「眼睛在抖」：
           Math.sin(now * 0.042) → 周期 ≈150ms（≈6.7Hz），振幅 1.4
           Math.sin(now * 0.058) → 周期 ≈108ms（≈9.2Hz），振幅 0.9
         两者都以**毫秒**为自变量，所以频率落在最刺眼的 6–9Hz 区间；
         左右眼还差一个相位（+i），视觉上是两只眼各抖各的。
         更糟的是它经 vl → liveSpan → 横向夹取边界被放大成跳动：
         纵向抖 0.9 会让 vl 变化，夹取区间 lo/hi 随之跳，眼睛就整块位移。
         角色的「活感」由视线弹簧（gazeX/gazeY，2–8s 换一次目标，弹簧平滑）
         和指针跟随提供，不需要这层噪声。 */
      let jx = 0;
      let jy = 0;
      const zl = Rn(0.16);
      this.pointer.x += (this.pointer.tx - this.pointer.x) * zl;
      this.pointer.y += (this.pointer.ty - this.pointer.y) * zl;
      jx += this.pointer.x + this.gazeX.x;
      jy += this.pointer.y + this.gazeY.x;

      const ntf = clamp(this.notify.x, 0, 1);
      jx -= 10 * ntf;
      jy += 7 * ntf;

      const vee = clamp(cScale * hee0 * pulse, 0.02, 2.4);
      const vsc = clamp(vScale * lid * u10 * pulse, 0.02, 2.4);
      this.eyeEls[i].style.display = visible ? "" : "none";
      const margin = G9E * vsc + 2;
      const vl = clamp(sre + jy * eyeTune.sy, faceTop + margin, faceBottom - margin);

      /* 横向夹在轮廓内 */
      let lo = -Infinity;
      let hi = Infinity;
      for (let p = 0; p < poly.length; p += 2) {
        const halfW = (poly[p][0] - gx) * vee;
        const [sl, sr] = liveSpan(vl + (poly[p][1] - gy) * vsc);
        if (sl - halfW > lo) lo = sl - halfW;
        if (sr - halfW < hi) hi = sr - halfW;
      }
      const want = ca + wo + jx * eyeTune.sx;
      const lx = lo <= hi ? clamp(want, lo, hi) : (lo + hi) / 2;
      const dd = lx + (want - lx) * (1 - fade);
      const yy = vl;

      this.eyeEls[i].setAttribute(
        "transform",
        `translate(${dd.toFixed(2)} ${yy.toFixed(2)}) scale(${vee.toFixed(4)} ${vsc.toFixed(4)}) `
        + `translate(${(-gx).toFixed(2)} ${(-gy).toFixed(2)})`,
      );
    }

    /* 通知角标 */
    const amt = clamp(this.notify.x, 0, 1.4);
    if (amt <= 0.01) {
      this.badge.style.display = "none";
    } else {
      this.badge.style.display = "";
      this.badge.style.fill = "var(--gb-badge, #2f8bff)";
      this.badge.setAttribute("cx", badgePt[0].toFixed(1));
      this.badge.setAttribute("cy", badgePt[1].toFixed(1));
      this.badge.setAttribute("r", (20 * amt).toFixed(2));
    }
  }
}

/* 多边形 → 路径串（比 core 的 polyPath 少一位小数，减小 DOM 字符串体积） */
function polyPathOf(pts) {
  let d = `M${Math.round(pts[0][0])} ${Math.round(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${Math.round(pts[i][0])} ${Math.round(pts[i][1])}`;
  return d + "Z";
}

export { GROUPS, ALL_STATES };
