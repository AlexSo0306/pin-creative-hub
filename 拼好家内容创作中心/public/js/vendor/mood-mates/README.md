# vendor/mood-mates —— 第三方表情引擎（原样引入 + 5 处本地补丁）

## 来源

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/sam70361/aora-bot |
| 取用子项目 | `mood-mates/` |
| 引入日期 | 2026-09-24 |
| 引入方式 | 复制上游文件，**另有 5 处本地补丁**（见下节；哈希**不可**与上游比对） |

> ⚠️ 2026-09-21 更正：本节原来写的是「复制上游文件，**一字未改**（哈希可比对）」。
> 那句话在写下当天就过期了 —— 为了做「纯色扁平圆 + 白竖条眼」，
> `core/render.js` 打了 4 处、`core/geometry.js` 打了 1 处补丁。
> **一份声称「未修改」的 vendor 说明比没有说明更危险**：后来的人会据此
> 直接拿上游文件覆盖，把补丁全部抹掉，而且覆盖完看不出任何异常。
> 凡是写了「原样引入」，就必须同时维护下面这张补丁清单。

## 本地补丁清单（共 5 处，改前必读）

| # | 文件 | 位置 | 改了什么 | 为什么 |
|---|---|---|---|---|
| ① | `core/render.js` | `setBodyColor()` | `palette.flat` 时把身体渐变的 4 个 stop 设成同色 | 原版是**纯色扁平**圆，不要体积渐变。**刻意保留** `<radialGradient>` 节点 —— `applySketchChrome()` 靠 `fill: none ↔ url(#…g)` 切换线稿 |
| ② | `core/render.js` | AO 路径创建处 | `palette.flat` 时 `ao.opacity = 0` | 关掉底部环境光遮蔽（一层灰晕） |
| ③ | `core/render.js` | 地面投影创建处 | `palette.flat` 时 `shadow.opacity = 0` | 原版角色是「悬空的一枚纯色圆」，脚下没有影子 |
| ③b | `core/render.js` | 每帧更新（约 679 行） | `palette.flat` 时 `shOp = 0` | **③ 的补漏**。③ 只改创建时，而这一行每帧都把 opacity 写回 `0.16`，③ 实际无效 —— 实测属性值是 `"0.160"`（三位小数即 `toFixed(3)` 的产物） |
| ④ | `core/geometry.js` | `buildCustomEyePair()` | 允许**每个眼形自带 `dx`** | 上游把 `dx` 定死在角色级，眼形一宽双眼就叠在一起；原版是按形状给 dx（19.6~35.8） |

**通用纪律（两次都栽在同一处）**：补丁要打在**真正写那个属性的地方**。
- ③ 栽在「改初始化、被每帧覆盖」；
- ① 栽在「节点还在、只是颜色相同」——所以**查 DOM 属性验不出效果**，
  外观必须用 `verify-guobao.mjs` 里的**像素级**断言来守。

> 除这 5 处外，`core/` 与 `data/` 的其余内容与上游一致。
> 改之前先 `grep -rn "本地补丁" public/js/vendor/mood-mates/core/` 把清单拉出来。

## 为什么引入

我们的自研挂件引擎只有两个图元（`gb-body` + `gb-eye`），**没有嘴、没有腮红、没有眉毛、没有高光** ——
39 个状态全靠两只眼扛，所以表情单薄。这套引擎是完整的面部骨架：

| 通道 | 上游实现 |
|---|---|
| 眼 | 20 个语义槽位，48 点 lens（双缘包络）拓扑，逐点弹簧插值 |
| **嘴** | 9 个槽位（smile / grin / o / flat / frown / wavy / pout / open / dot），24 点同拓扑 |
| **腮红** | 2 枚椭圆，透明度由 `pose.face.blush` 0~1 驱动 |
| **眉毛** | 2 条 lens 短条（tilt / raise） |
| 高光 | 定光源高光，按眼开合度缩放，偏移钳制不出眶 |
| 表情编排 | 32 套（眼形池 + 动画原语 + 关键帧序列），ID 分段即对外契约 |
| 角色定义 | 纯参数，~80 行一个角色 |

> ⚠️ 上表是**引擎提供的能力**，不等于锅宝在用。锅宝刻意只取「眼」这一路：
> `palette.gloss: 0` 关高光、`palette.flat: true` 压平体积渐变、
> `features.mouth/blush/brows` 全关、**不写 `pupil`**（走 render.js 的「bean 豆眼」分支，
> 每只眼就是一条 path 填 `palette.eye`）。理由：原版登录页角色就是
> **一枚纯色扁平圆 + 两条白色眼条**，加嘴/腮红/高光都会偏离 1:1 复刻的目标。

## 许可（**重要，勿删本目录**）

上游采用 **Mood Mates 社区许可（非商业）**：

- ✅ 免费查看 / 下载 / 运行 / **修改**；非商业场景可分享（需注明出处）
- ❌ **禁止任何商业用途** —— 售卖、付费授权、集成到商业产品或服务、商业推广
- 📌 **分发时必须保留许可声明与版权信息** ← 所以 `legal/` 目录里的文件必须留着
- 📧 如需商业授权：`1251579308@qq.com`

**本项目用途**：`拼好家 · 运营创作中心` 是**纯自用内部工作台**，不对外提供、不售卖、不嵌入对外产品 ——
落在社区许可的允许范围内。

> ⚠️ **一旦这个工作台变成对外产品/服务，就必须先取得上游商业授权，或把引擎换成自研实现。**
> 这条约束写在 `legal/LICENSE` 第 3 / 6 条，不要凭记忆判断。

另注：上游仓库根目录还有一个 `emotion-ball/` 子项目（球形角色），其**视觉形象**是
「仅学习、永不商业」。**我们只用 `mood-mates/`，不碰 `emotion-ball/` 的任何形象资产。**

## 文件清单（全部来自上游 `mood-mates/`）

```
core/geometry.js     ← src/core/geometry.js    轮廓生成库（身体环 96 点 / 眼环 48 点 / 嘴环 24 点）
core/render.js       ← src/core/render.js      渲染层
core/features.js     ← src/core/features.js    五官与配饰联动层
core/fx.js           ← src/core/fx.js          粒子与特效
data/emotions.js     ← src/data/emotions.js    32 套表情编排（纯数据）
core/engine.js       ← src/core/engine.js      rAF 状态机 + 对外 SDK
legal/LICENSE        ← LICENSE                 社区许可（非商业）
legal/LICENSE-COMMERCIAL.md ← LICENSE-COMMERCIAL.md
legal/INTEGRATION.md ← docs/INTEGRATION.md     上游集成指南
legal/CHARACTER-DESIGN.md ← docs/CHARACTER-DESIGN.md
```

**没有引入**：`src/characters/nimbo.js`、`src/characters/twinkle.js`（上游角色，我们不用）、
`site/`（展示站外壳）、`tools/`。

> ⚠️ **`site/` 不是「纯外壳」，里面有一样东西是必需的** —— 见下一节。
> 当初按「只搬引擎」的原则跳过 `site/`，结果漏掉了 `site/style.css` 里的特效配色，
> 导致粒子渲染成黑色。已补在 `public/css/mascot.css`。

锅宝的角色定义是我们自己写的，见 `public/js/components/guobao.js`。

## ⚠️ 宿主必须补的样式（`mm-*` 类名契约）

**引擎不带样式表。** 特效层 `core/fx.js` 建图元时**只挂类名、不给 `fill`**：

```js
el('path',    { d: cloudD, class: 'mm-bubble' })   // ← 没有 fill
el('circle',  { r: 1,      class: 'mm-speck'  })   // ← 没有 fill
el('ellipse', { cx: -5.2,  class: 'mm-sheen'  })   // ← 没有 fill
```

它们的颜色规则写在上游**演示站**的 `site/style.css`（第 754–760 行），不在 `core/` 里。
宿主不补这段 CSS，这些图元就落到 SVG 默认值 `fill: #000` ——
表现为角色旁边飘出一个**黑泡泡**（深色主题像脏点，浅色主题更刺眼）。

引擎实际发出的类名一共 6 个：

| 类名 | 谁建的 | 需要宿主补色？ |
|---|---|---|
| `mm-bubble` | `fx.js` 冒热气泡泡 | ✅ 必需 |
| `mm-sheen` | 泡泡上的高光 | ✅ 必需 |
| `mm-speck` | 泡泡炸开的小点 | ✅ 必需 |
| `mm-spark` | 星芒（orbit 节点） | ❌ 已内联 `fill`（取 `palette.fx \|\| 皮肤色板`） |
| `mm-body` | 身体路径 | ❌ 已由角色色板给色 |
| `mm-svg` | 根 `<svg>` | ❌ 只是个标记 |

**我们的实现**：`public/css/mascot.css` 的「引擎样式契约」段落，
颜色按锅宝的蓝重配过（上游的 `#C6D6F5` 是配紫白系角色的），并按明暗主题分两档。

**回归守卫**：`tools/mascot-verify/verify-guobao.mjs` 有两条断言盯着这件事
（「特效粒子确实出现」+「没落到黑色兜底」），并支持注入对照复现现场：

```bash
INJECT_FX_BLACK=1 node tools/mascot-verify/verify-guobao.mjs   # 期望：第 2 条变红
```

另注：`site/style.css` 里还有两条与出框有关的规则，我们也按同样思路处理了 ——
`.stage svg { overflow: visible }`（别把出框的泡泡裁掉）。

## 加载顺序（固定，不可调换）

```html
<script src="/js/vendor/mood-mates/core/geometry.js"></script>
<script src="/js/vendor/mood-mates/core/render.js"></script>
<script src="/js/vendor/mood-mates/core/features.js"></script>
<script src="/js/vendor/mood-mates/core/fx.js"></script>
<script src="/js/vendor/mood-mates/data/emotions.js"></script>
<script src="/js/vendor/mood-mates/core/engine.js"></script>
```

坐标系：`viewBox 0 0 240 240`，头部中心 `C = 120`，基准半径 `R = 104`。
