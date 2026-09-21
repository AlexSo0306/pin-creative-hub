/* 锅宝 · 兼容入口（v1 单文件 → v2 多模块）
 *
 * v1 是单文件引擎，外部只 import 这个路径。v2 拆成了多模块（./mascot/），
 * 本文件保留旧路径做转发，避免任何既有 import 断链。
 *
 * 旧 API 与新 API 的差异：
 *   · MASCOT_STATES   —— v1 的 7 状态表；v2 用 GROUPS / ALL_STATES（39 状态，分 4 组）
 *   · setEnergy(v)    —— v2 没有「精力」维度，改为用状态表达（见 mascot-dock.js）
 *   · pulse()         —— v2 用 spin()（整圈旋转）
 *   · 形状/眼型/墨色   —— v2 新增 setShape / setEye / setInk 三个维度
 *
 * v2 的架构对标 grok-icon-study（clean-room 重写）：
 *   半隐式欧拉弹簧 + 1/120 固定子步进 / 96 点极坐标环形变 / buildSpan 跨度定位 /
 *   逐状态眼型播放表 + 眨眼队列 / 14 种覆盖动效。
 * 全部形状、眼型、色值均为本项目原创。
 */

export {
  createMascot,
  default,
  VERSION,
  GROUPS,
  ALL_STATES,
  SHAPE_NAMES,
  EYE_NAMES,
  INK_NAMES,
  INK,
} from "./mascot/index.js";
