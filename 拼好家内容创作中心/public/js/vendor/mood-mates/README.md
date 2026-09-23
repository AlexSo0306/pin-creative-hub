# vendor/mood-mates —— 第三方表情引擎（原样引入，未修改）

## 来源

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/sam70361/aora-bot |
| 取用子项目 | `mood-mates/` |
| 引入日期 | 2026-09-24 |
| 引入方式 | 复制上游文件，**一字未改**（哈希可比对） |

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

锅宝的角色定义是我们自己写的，见 `public/js/components/guobao.js`。

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
