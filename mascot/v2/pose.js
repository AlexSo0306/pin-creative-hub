/* 锅宝 v2 · pose —— 状态表 + 逐帧姿态 + 视线目标
 *
 * 结构对标参考：每个状态一个 case，返回 {spin, tx, ty, squash, lid, eyeBoost}。
 * spin/tx/ty 是「意图」，真正的运动由弹簧积分产生（见 character.js），
 * 因此状态切换不会瞬移，且事件型动作（点头、冲击）可以叠加在基线上。
 * 所有数值为本项目自行调校。
 */

import { clamp, rand, sign, K2, TAU } from "./core.js";
import { EYE_INDEX } from "./art.js";

/* ─────────────── 状态分组 ─────────────── */

export const GROUPS = [
  { label: "生命周期", states: ["sleeping", "waking", "idle", "listening", "thinking", "searching", "working"] },
  { label: "情绪反应", states: ["excited", "surprised", "suspicious", "angry", "drowsy", "happy", "curious", "confused", "bored", "proud", "shy", "sad", "laughing", "scared", "playful", "celebrate"] },
  { label: "角色形变", states: ["orbit", "radar", "progress"] },
  { label: "流程状态", states: ["spawning", "humming", "loading", "dictating", "writing", "sending", "receiving", "uploading", "notifying", "alerting", "dragging", "bouncing", "powering-down"] },
];

export const ALL_STATES = GROUPS.flatMap((g) => g.states);

/* ─────────────── 弹簧参数 [frequency, dampingRatio] ─────────────── */

export const SPRINGS = {
  spin: [5, 0.9],
  x: [3.5, 1],
  y: [4, 1],
  squash: [10, 0.8],
  blink: [26, 1],
  eyeScale: [9, 0.85],
  gazeX: [13, 1],
  gazeY: [13, 1],
  notify: [9, 0.55],
  overlay: [14, 1],
  overlayMix: [11, 1],
  shape: [10, 1],
  overlayTurn: [14, 1],
  spinTurn: [6.2, 1],
  manualMix: [7, 1],
};

/* ─────────────── 面部与姿态基准 ─────────────── */

export const FACE = { x: 0, y: 0, sx: 0.8614, sy: 0.91, eye: 0.88 };
export const FACE_TUNE = { size: 0.86, gap: 1.18, height: 1, eyeWidth: 0.96, eyeHeight: 0.92 };
export const POSE = { turn: 17, tilt: -14, roll: 29, scale: 1 };
export const POSE_HOME = { turn: 33, tilt: -19, roll: 38 };
export const UNIFORM_EYES = true;

/* 眨眼 / 挤眼允许出现的状态 */
export const WINK_STATES = new Set(["idle", "happy", "excited", "curious", "playful"]);

/* ─────────────── 眼型播放表 ─────────────── */

const RAW_PLAYLIST = {
  sleeping: ["sleepy", "line", "bored"],
  waking: ["sleepy"],
  idle: ["tall", "round"],
  listening: ["surprised", "round", "focus"],
  thinking: ["round", "star", "almond", "crescent", "squint"],
  searching: ["focus", "sparkle", "dot", "wide", "crescent", "moon"],
  working: ["squint", "almond", "pinch", "surprised"],
  excited: ["wide", "crescent", "heart", "dot", "pinch"],
  surprised: ["dot", "heart"],
  suspicious: ["almond", "squint", "moon"],
  angry: ["squint", "almond"],
  drowsy: ["squint", "bored", "sleepy"],
  happy: ["wide", "pinch", "crescent", "focus"],
  curious: ["dot", "heart", "tall", "focus"],
  confused: ["almond", "squint", "round"],
  bored: ["squint", "bored", "tall"],
  proud: ["focus", "round", "wide"],
  shy: ["tall", "moon", "sleepy"],
  sad: ["squint", "sleepy", "bored"],
  laughing: ["wide", "pinch", "crescent"],
  scared: ["dot", "heart"],
  playful: ["wide", "crescent", "pinch", "round"],
  celebrate: ["wide", "round", "crescent"],
  orbit: ["tall", "round"],
  radar: ["tall", "round"],
  progress: ["tall", "round"],
  spawning: ["dot", "tall"],
  humming: ["tall", "round"],
  loading: ["tall", "round"],
  dictating: ["surprised", "round", "focus"],
  writing: ["focus", "sparkle"],
  sending: ["tall", "round"],
  receiving: ["focus", "tall", "round"],
  uploading: ["focus", "sparkle", "round"],
  notifying: ["dot", "heart", "tall"],
  alerting: ["dot", "heart"],
  dragging: ["dot", "focus", "tall"],
  bouncing: ["wide", "crescent"],
  "powering-down": ["sleepy", "bored"],
};

export const EYE_PLAYLIST = {};
for (const [k, list] of Object.entries(RAW_PLAYLIST)) {
  EYE_PLAYLIST[k] = list.map((n) => EYE_INDEX[n] ?? 0);
}

/* 每种状态换眼型的停留区间（毫秒） */
export const EYE_HOLD_MS = {
  sleeping: [6000, 10000], waking: [800, 800], idle: [9000, 16000],
  listening: [2800, 5000], thinking: [2000, 3600], searching: [1000, 1800],
  working: [1800, 3200], excited: [1100, 2000], surprised: [2500, 4000],
  suspicious: [2600, 4500], angry: [2200, 3800], drowsy: [4000, 8000],
  happy: [2500, 4500], curious: [1800, 3200], confused: [2200, 3800],
  bored: [3500, 6000], proud: [3500, 6000], shy: [3000, 5500],
  sad: [4000, 7000], laughing: [1200, 2400], scared: [900, 1800],
  playful: [1500, 3000], celebrate: [1400, 2600], orbit: [4000, 8000],
  radar: [4000, 8000], progress: [4000, 8000], spawning: [1200, 1200],
  humming: [5000, 9000], loading: [6000, 10000], dictating: [4000, 8000],
  sending: [4000, 8000], receiving: [4000, 8000], uploading: [4000, 8000],
  writing: [4000, 8000], notifying: [1500, 2600], alerting: [2000, 3600],
  bouncing: [3000, 6000], dragging: [1600, 3000], "powering-down": [6000, 9000],
};

/* 眨眼节奏（毫秒）；null = 该状态不眨 */
export const BLINK_MS = {
  sleeping: null, waking: null, idle: [6000, 14000], listening: [3000, 7000],
  thinking: [3500, 7000], searching: [1600, 4000], working: [2800, 5500],
  excited: [2000, 4000], surprised: [1800, 3500], suspicious: [4500, 8000],
  angry: [3500, 7000], drowsy: null, happy: [2500, 5000], curious: [2500, 5500],
  confused: [2800, 5500], bored: [4000, 8000], proud: [3500, 7000],
  shy: [3000, 6000], sad: [4000, 8000], laughing: [2500, 5000],
  scared: [1200, 3000], playful: [2000, 4500], celebrate: [2200, 4500],
  orbit: null, radar: null, progress: null, spawning: null, humming: [4000, 8000],
  loading: null, dictating: null, sending: null, receiving: null, uploading: null,
  writing: null, notifying: [2000, 4000], alerting: null, bouncing: null,
  dragging: [2200, 4500], "powering-down": null,
};

/* 某些状态眼型锁死，不参与轮播 */
export const HOLD_EYE = { shy: EYE_INDEX.moon };

/* ─────────────── 姿态 ─────────────── */

export function applyPose(state, mt, dtState, now, ctx) {
  const prev = ctx.prev || { spin: 0, tx: 0, ty: 0, squash: 1 };
  let { spin, tx, ty, squash } = prev;
  let lid = 1;
  let eyeBoost = 1;

  switch (state) {
    case "sleeping": {
      const e = Math.min(dtState / 2, 1);
      const settle = Math.sin(clamp(dtState / 0.5, 0, 1) * Math.PI);
      spin = 4 * e + Math.sin(mt * 0.25) * 2;
      tx = -2 * e;
      ty = 8 * e + Math.sin(mt * 0.55) * 3 - settle * 5;
      squash = 1 + Math.sin(mt * 0.55) * 0.016 + settle * 0.05;
      lid = dtState < 1.2 ? Math.max(0.08, 1 - Math.min(1, dtState) * (1 + 0.15 * Math.sin(dtState * 6.5))) : 0.08;
      break;
    }
    case "waking": {
      if (dtState < 0.5) {
        lid = 0.07;
        ty = 6;
        ctx.wakeEye = [EYE_INDEX.sleepy, EYE_INDEX.tall];
      } else if (dtState < 1.2) {
        lid = 1;
        eyeBoost = 1.12;
        ty = -5;
        spin = 0;
        squash = 1.04;
        if (!ctx.wakingBurst) ctx.wantBurst = [rand(9, 13), 0.8];
      } else if (dtState < 2.2) {
        ty = 0;
        squash = 1;
        ctx.wakeEye = [EYE_INDEX.tall, EYE_INDEX.round];
        if (dtState < 1.4) ctx.wantBlink = true;
      } else {
        const e = Math.min((dtState - 2.2) / 0.8, 1);
        ctx.wakeEye = [EYE_INDEX.tall, EYE_INDEX.round];
        spin = Math.sin(e * Math.PI * 3) * 6 * (1 - e);
        ty = Math.sin(mt * 0.9) * 2;
      }
      break;
    }
    case "idle":
      spin = Math.sin(mt * 0.5) * 1.5 + Math.sin(mt * 0.17) * 0.6;
      tx = Math.sin(mt * 0.27) * 1;
      ty = Math.sin(mt * 0.85) * 1.2;
      squash = 1 + Math.sin(mt * 0.85) * 0.007;
      break;
    case "listening":
      spin = 8 + Math.sin(mt * 0.5) * 1.5;
      tx = 2;
      ty = -2 + Math.sin(mt * 0.8) * 0.8;
      squash = 1.015;
      if (now >= ctx.nodUntil) {
        ctx.nodUntil = now + rand(1800, 3200);
        ctx.nodEnd = now + 380;
      }
      if (now < ctx.nodEnd) {
        const e = 1 - (ctx.nodEnd - now) / 380;
        ty += Math.sin(e * Math.PI) * 4.5;
        spin += Math.sin(e * Math.PI) * 2;
      }
      break;
    case "thinking":
      spin = -9 + Math.sin(mt * 0.35) * 5;
      tx = Math.sin(mt * 0.3) * 5;
      ty = Math.sin(mt * 0.6) * 2.5;
      break;
    case "searching": {
      const e = Math.sin(mt * 1.3);
      spin = e * 13;
      tx = e * 7;
      ty = Math.sin(mt * 1.7) * 3;
      if (now >= ctx.stAt) {
        ctx.wantSpinTurn = [1, sign()];
        ctx.stAt = now + rand(4000, 7000);
      }
      break;
    }
    case "working": {
      const e = Math.sin(mt * TAU * 1.6);
      spin = 4 + e * 2.5;
      tx = 3;
      ty = 1.5 + Math.max(0, e) * 3;
      squash = 1 - Math.max(0, e) * 0.02;
      if (now >= ctx.stAt) {
        ctx.wantSpinTurn = [1, 1];
        ctx.stAt = now + rand(6000, 9000);
      }
      break;
    }
    case "excited": {
      const e = (mt * 2.2) % 1;
      const s = Math.sin(e * Math.PI);
      ty = -s * 10 + 2;
      squash = e < 0.1 ? 0.92 : e < 0.3 ? 1.05 : 1;
      tx = Math.sin(mt * 1.1) * 4;
      eyeBoost = 1.06;
      spin = Math.sin(mt * TAU * 1.1) * 7;
      if (now >= ctx.stAt) {
        ctx.wantSpinTurn = [1, sign()];
        ctx.stAt = now + rand(2800, 5000);
      }
      break;
    }
    case "surprised": {
      const e = Math.min(dtState / 1.2, 1);
      tx = -4 * (1 - e);
      ty = -8 * (1 - e);
      squash = dtState < 0.2 ? 1.08 : 1;
      eyeBoost = 1.15 - e * 0.08;
      spin = Math.sin(mt * 11) * 1.5 * (1 - e);
      break;
    }
    case "suspicious":
      spin = -6 + Math.sin(mt * 0.3) * 3;
      tx = Math.sin(mt * 0.25) * -4;
      ty = 1 + Math.sin(mt * 0.45) * 1.2;
      lid = 0.85;
      if (now >= ctx.impulseAt) {
        ctx.spinKick = 30;
        ctx.impulseAt = now + rand(4000, 7000);
      }
      break;
    case "angry":
      if (now >= ctx.impulseAt) {
        ctx.shakeUntil = now + 420;
        ctx.tyKick = 70;
        ctx.impulseAt = now + rand(1800, 3200);
      }
      spin = now < ctx.shakeUntil ? Math.sin(now * 0.05) * 4.5 : 0;
      ty = 3.5;
      squash = 0.975;
      break;
    case "drowsy": {
      spin = Math.sin(mt * 0.32) * 2.5;
      tx = Math.sin(mt * 0.2) * 1.5;
      ty = 6 + Math.sin(mt * 0.36) * 2.2;
      squash = 1 + Math.sin(mt * 0.36) * 0.022;
      lid = 0.34 + Math.sin(mt * 0.8) * 0.07;
      if (now >= ctx.nodUntil && !ctx.slumpAt) ctx.slumpAt = now;
      if (ctx.slumpAt) {
        const t = (now - ctx.slumpAt) / 1000;
        const DOWN = 1.7;
        const HOLD = 0.3;
        const UP = 1.5;
        if (t < DOWN) {
          const u = t / DOWN;
          const u2 = u * u;
          ty = 6 + u2 * 19 + Math.sin(u * Math.PI * 2.5) * 2.2 * (1 - u);
          spin = u2 * 10;
          lid = 0.34 - u2 * 0.30;
          squash = 1 - u2 * 0.045;
        } else if (t < DOWN + HOLD) {
          const u = (t - DOWN) / HOLD;
          const s = Math.sin(u * Math.PI);
          ty = 25 - s * 7;
          spin = 10 - s * 4;
          lid = 0.04 + s * 0.42;
        } else if (t < DOWN + HOLD + UP) {
          const u = (t - DOWN - HOLD) / UP;
          const e = 1 - Math.pow(1 - u, 2.2);
          ty = 25 - 19 * e;
          spin = 10 * (1 - e);
          lid = 0.46 + (0.34 - 0.46) * e;
          if (u > 0.32 && u < 0.46) lid = 0.05;
        } else {
          ctx.slumpAt = 0;
          ctx.nodUntil = now + rand(1500, 3500);
        }
      }
      break;
    }
    case "happy": {
      const e = Math.sin(mt * 2.4);
      spin = Math.sin(mt * 1.2) * 3;
      tx = Math.sin(mt * 1.1) * 2.5;
      ty = -Math.abs(e) * 3;
      squash = 1 + e * 0.02;
      eyeBoost = 1.05;
      break;
    }
    case "curious":
      spin = 10 + Math.sin(mt * 0.7) * 6;
      tx = Math.sin(mt * 0.6) * 5;
      ty = -2 + Math.sin(mt * 0.9) * 1.5;
      squash = 1.01;
      eyeBoost = 1.08;
      if (now >= ctx.nodUntil) {
        ctx.nodUntil = now + rand(1600, 2800);
        ctx.nodEnd = now + 440;
      }
      if (now < ctx.nodEnd) {
        const e = 1 - (ctx.nodEnd - now) / 440;
        tx += Math.sin(e * Math.PI) * 8;
        spin += Math.sin(e * Math.PI) * 5;
      }
      break;
    case "confused": {
      const e = Math.sin(mt * 0.8);
      spin = e * 12;
      tx = e * 3;
      ty = Math.sin(mt * 0.5) * 2;
      lid = 0.9;
      if (now >= ctx.impulseAt) {
        ctx.spinKick = 22;
        ctx.impulseAt = now + rand(2600, 4200);
      }
      break;
    }
    case "bored":
      spin = -3 + Math.sin(mt * 0.25) * 4;
      tx = Math.sin(mt * 0.2) * 4;
      ty = 5 + Math.sin(mt * 0.35) * 1.5;
      squash = 0.99;
      lid = 0.6;
      eyeBoost = 0.98;
      if (now >= ctx.impulseAt) {
        ctx.nodEnd = now + 600;
        ctx.impulseAt = now + rand(4000, 7000);
      }
      if (now < ctx.nodEnd) {
        const e = 1 - (ctx.nodEnd - now) / 600;
        squash = 1 + Math.sin(e * Math.PI) * 0.05;
        ty += Math.sin(e * Math.PI) * 3;
      }
      break;
    case "proud":
      spin = Math.sin(mt * 0.4) * 2.5;
      tx = Math.sin(mt * 0.35) * 2;
      ty = -4 + Math.sin(mt * 0.6);
      squash = 1.03;
      eyeBoost = 1.02;
      lid = 0.9;
      break;
    case "shy":
      spin = -8 + Math.sin(mt * 0.5) * 3;
      tx = -3 + Math.sin(mt * 0.4) * 2;
      ty = 3;
      squash = 0.98;
      eyeBoost = 0.95;
      lid = 0.85;
      break;
    case "sad":
      spin = 3 + Math.sin(mt * 0.3) * 2;
      tx = Math.sin(mt * 0.25) * 1.5;
      ty = 7 + Math.sin(mt * 0.4);
      squash = 0.97;
      lid = 0.7;
      eyeBoost = 0.97;
      break;
    case "laughing": {
      const e = Math.sin(mt * TAU * 3.2);
      spin = e * 4;
      tx = Math.sin(mt * 2) * 2;
      ty = -Math.abs(e) * 5;
      squash = 1 + e * 0.03;
      lid = 0.7;
      break;
    }
    case "scared":
      spin = Math.sin(now * 0.04) * 2;
      tx = -2 + Math.sin(now * 0.05) * 1.5;
      ty = 2 + Math.sin(mt * 1.5);
      squash = 0.97;
      eyeBoost = 1.12;
      lid = 1.05;
      break;
    case "playful":
      spin = Math.sin(mt * 1.4) * 8;
      tx = Math.sin(mt * 1.1) * 4;
      ty = -Math.abs(Math.sin(mt * 2.2)) * 3;
      squash = 1 + Math.sin(mt * 2.2) * 0.015;
      eyeBoost = 1.06;
      if (now >= ctx.stAt) {
        ctx.wantSpinTurn = [1, sign()];
        ctx.stAt = now + rand(3500, 6000);
      }
      break;
    case "celebrate":
      ty = -Math.abs(Math.sin(mt * 1.6)) * 2.5;
      eyeBoost = 1.1;
      lid = 1.1;
      break;
    case "dragging": {
      const e = (dtState % 3.4) / 3.4;
      if (e < 0.12) {
        tx = -16;
        ty = -22;
        spin = -5;
      } else if (e < 0.62) {
        const u = (e - 0.12) / 0.5;
        tx = -16 + 32 * K2(u);
        ty = -22 + Math.sin(mt * 1.4) * 2;
        spin = Math.sin(mt * 2.6) * 6;
        eyeBoost = 1.06;
      } else {
        const cycle = Math.floor(dtState / 3.4);
        if (cycle !== ctx.dragCycle) {
          ctx.dragCycle = cycle;
          ctx.tyKick = 90;
        }
        tx = 16;
        ty = 0;
      }
      break;
    }
    case "humming":
      spin = Math.sin(mt * 0.4) * 2;
      tx = Math.sin(mt * 0.3) * 1.5;
      ty = Math.sin(mt * 0.7) * 1.5;
      break;
    case "spawning": {
      const e = Math.min(dtState / 1.1, 1);
      squash = 0.55 + 0.45 * K2(e);
      ty = (1 - K2(e)) * 12;
      eyeBoost = 0.7 + 0.3 * e;
      break;
    }
    case "loading": {
      spin = Math.sin(mt * 0.9) * 3;
      tx = Math.sin(mt * 0.7) * 2;
      ty = 1 + Math.sin(mt * 1.1) * 1.5;
      squash = 1 + Math.sin(mt * 1.1) * 0.012;
      break;
    }
    case "writing":
      spin = -6 + Math.sin(mt * 0.9) * 3;
      tx = 2 + Math.sin(mt * 0.6) * 1.5;
      ty = 2 + Math.sin(mt * 1.3) * 1.2;
      break;
    case "dictating":
      spin = Math.sin(mt * 0.6) * 3;
      tx = Math.sin(mt * 0.8) * 1.5;
      ty = -1 + Math.sin(mt * 1.6) * 2.5;
      squash = 1 + Math.sin(mt * 1.6) * 0.018;
      break;
    case "sending":
      spin = 5 + Math.sin(mt * 0.5) * 2;
      tx = 3;
      ty = -1;
      break;
    case "receiving": {
      if (now >= ctx.stAt) {
        ctx.tyKick = -18;
        ctx.stAt = now + rand(2200, 4200);
      }
      spin = -4 + Math.sin(mt * 0.5) * 2;
      tx = -2;
      break;
    }
    case "uploading":
      spin = 4;
      tx = 1;
      ty = -1 + Math.sin(mt * 1.2) * 1.5;
      squash = 1 - Math.sin(mt * 1.2) * 0.012;
      break;
    case "notifying":
      if (!ctx.notifyPop && dtState > 0.12) {
        ctx.notifyPop = true;
        ctx.tyKick = -26;
        ctx.wantBlink = true;
      }
      eyeBoost = 1 + 0.05 * Math.exp(-dtState * 3);
      spin = 3;
      tx = 2;
      ty = -1;
      break;
    case "alerting":
      if (now >= ctx.impulseAt) {
        ctx.spinKick = 26;
        ctx.tyKick = 46;
        ctx.impulseAt = now + rand(1500, 2800);
      }
      spin = -3;
      ty = -2;
      squash = 1.02;
      break;
    case "bouncing": {
      const e = (mt * 1.7) % 1;
      const s = Math.sin(e * Math.PI);
      ty = -s * 9;
      squash = e < 0.12 ? 0.9 : e < 0.34 ? 1.06 : 1;
      break;
    }
    case "orbit":
    case "radar":
    case "progress":
      spin = Math.sin(mt * 0.35) * 2;
      tx = Math.sin(mt * 0.3) * 1.5;
      ty = Math.sin(mt * 0.6) * 1.2;
      break;
    case "powering-down": {
      const e = Math.min(dtState / 1.4, 1);
      squash = 1 - 0.22 * K2(e);
      ty = 10 * K2(e);
      lid = 1 - 0.9 * e;
      eyeBoost = 1 - 0.35 * e;
      break;
    }
    default:
      break;
  }
  return { spin, tx, ty, squash, lid, eyeBoost };
}

/* ─────────────── 视线目标 ─────────────── */

export function nextGaze(state) {
  const X = 15;
  const Y = 9;
  switch (state) {
    case "idle": return { x: 0, y: 0, hold: [2500, 5500] };
    case "listening": return { x: rand(-0.3, 0.3) * X, y: rand(-0.25, 0.25) * Y, hold: [2200, 4200] };
    case "thinking": return { x: sign() * rand(0.5, 1) * X, y: -rand(0.4, 1) * Y, hold: [1500, 2800] };
    case "searching": return { x: sign() * rand(0.7, 1) * X, y: rand(-1, 1) * Y, hold: [550, 1150] };
    case "working": return { x: rand(-0.4, 0.4) * X, y: rand(0.4, 1) * Y, hold: [1200, 2400] };
    case "excited": return { x: rand(-1, 1) * X, y: rand(-1, 0.3) * Y, hold: [700, 1400] };
    case "surprised": return { x: 0, y: 0, hold: [1600, 2600] };
    case "suspicious": return { x: sign() * X, y: 0.3 * Y, hold: [2200, 4200] };
    case "angry": return { x: rand(-0.2, 0.2) * X, y: 0.2 * Y, hold: [1800, 3200] };
    case "drowsy": return { x: rand(-0.4, 0.4) * X, y: rand(0.4, 1) * Y, hold: [2500, 4500] };
    case "happy": return { x: rand(-0.7, 0.7) * X, y: -rand(0, 0.6) * Y, hold: [1800, 3400] };
    case "curious": return { x: sign() * rand(0.6, 1) * X, y: rand(-1, 1) * Y, hold: [950, 1900] };
    case "confused": return { x: sign() * rand(0.5, 1) * X, y: rand(-0.6, 1) * Y, hold: [1100, 2300] };
    case "bored": return { x: sign() * rand(0.7, 1) * X, y: rand(0.4, 0.9) * Y, hold: [3000, 6000] };
    case "proud": return { x: rand(-0.3, 0.3) * X, y: -rand(0.3, 0.7) * Y, hold: [2600, 4600] };
    case "shy": return { x: sign() * rand(0.6, 1) * X, y: rand(0.5, 1) * Y, hold: [2000, 4000] };
    case "sad": return { x: rand(-0.3, 0.3) * X, y: rand(0.6, 1) * Y, hold: [2800, 5000] };
    case "laughing": return { x: rand(-0.5, 0.5) * X, y: -rand(0.2, 0.6) * Y, hold: [800, 1700] };
    case "scared": return { x: sign() * rand(0.7, 1) * X, y: rand(-0.6, 0.6) * Y, hold: [450, 1050] };
    case "playful": return { x: sign() * rand(0.5, 1) * X, y: -rand(0, 0.6) * Y, hold: [900, 1800] };
    case "notifying": {
      const look = Math.random() < 0.72;
      return { x: (look ? 0.45 : 0.1) * X, y: -(look ? 0.3 : 0.05) * Y, hold: [1200, 2400] };
    }
    default: return { x: rand(-0.4, 0.4) * X, y: rand(-0.3, 0.3) * Y, hold: [2500, 5000] };
  }
}

/* 固定视线（不随机漂移的状态） */
export const HOLD_GAZE = {
  sleeping: { x: 0, y: 4 },
  waking: { x: 0, y: 0 },
};
