/* 锅宝 v2 · 公开入口
 *
 * createMascot(host, options) → 控制器
 *   host     挂载容器（HTMLElement）
 *   options  { state, shape, ink, eye, followPointer, onSay }
 *
 * 控制器方法：setState / setShape / setInk / setEye / unpinEye / say / pause / destroy
 * 另有 GROUPS / SHAPE_NAMES / EYE_NAMES / INK_NAMES 供 UI 构建选择器。
 */

import { Character } from "./character.js";
import { GROUPS, ALL_STATES } from "./pose.js";
import { SHAPE_NAMES, EYE_NAMES, INK_NAMES, INK } from "./art.js";

export { GROUPS, ALL_STATES, SHAPE_NAMES, EYE_NAMES, INK_NAMES, INK };

export const VERSION = "2.0.0";

export function createMascot(host, options = {}) {
  if (!host || typeof host.appendChild !== "function") {
    throw new Error("createMascot: 需要一个可挂载的容器元素");
  }
  const c = new Character(host, options);
  if (options.eye != null) c.setEye(options.eye);

  const api = {
    version: VERSION,
    el: c.svg,
    setState: (s, o) => { c.setState(s, o); return api; },
    setShape: (n) => { c.setShape(n); return api; },
    setInk: (i) => { c.setInk(i); return api; },
    setEye: (n, o) => { c.setEye(n, o); return api; },
    unpinEye: () => { c.unpinEye(); return api; },
    setInkFlat: (v) => { c.setInkFlat(v); return api; },
    spin: (turns, dir) => { c.spin(turns, dir); return api; },
    say: (t, ms) => { c.say(t, ms); return api; },
    pause: (v) => { c.setPaused(v); return api; },
    destroy: () => c.destroy(),
  };
  Object.defineProperty(api, "state", { get: () => c.state, enumerable: true });
  Object.defineProperty(api, "shape", { get: () => c.shapeName, enumerable: true });
  Object.defineProperty(api, "ink", { get: () => c.ink, enumerable: true });
  Object.defineProperty(api, "character", { get: () => c, enumerable: false });
  return api;
}

export default createMascot;
