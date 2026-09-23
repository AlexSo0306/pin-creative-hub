# tools/mascot-verify —— 锅宝的验证工具链

## ⚠️ 两代引擎并存，先看清你验的是哪一代

2026-09-24 起，页面上的锅宝换成了**第三方 mood-mates 引擎**（`public/js/vendor/mood-mates/`），
自研引擎（`public/js/components/mascot/`）**已不在页面上**。两代引擎的验收脚本不能混跑：

| 套件 | 验的是哪一代 | 还能跑吗 |
|---|---|---|
| `verify-guobao.mjs` | ✅ **当前**（mood-mates 引擎 + 侧栏容器） | 要起服务 |
| `emotion-sheet.html` | ✅ **当前**（32 表情接触表，人工看） | 不用，`file://` |
| `verify.mjs` | ⚠️ 旧自研引擎（`demo.html`） | 能跑，但验的对象已不在页面上 |
| `sheet.html` | ⚠️ 旧自研引擎（83 个实例接触表） | 能跑，同上 |
| `verify-plugin.mjs` | ❌ 旧自研引擎 + 旧浮动挂件 | **必然失败** —— 它找 `.pm-dock .gb-mascot`，页面上已经没有 |

> 旧那三件先留着不删（是否清理待 Alex 定），但**不要拿它们的结果判断线上页面**。

---

## 当前引擎（mood-mates）

产品代码：
- `public/js/vendor/mood-mates/` —— 引擎本体（第三方，一字未改）+ 许可文件
- `public/js/components/guobao.js` —— 锅宝的角色定义（纯参数，我们写的）
- `public/js/components/mascot-dock.js` —— 挂载 + 路由映射 + 视线跟随
- `public/css/mascot.css` —— 侧栏 215×215 正方形容器

```bash
# 起真服务
node server.js                     # 或 DB_PATH=/tmp/wv.db PORT=4174 node server.js
# 验收
node tools/mascot-verify/verify-guobao.mjs http://127.0.0.1:4174/

# 32 表情接触表（浏览器直接开，别用单文件预览面板）
#   tools/mascot-verify/emotion-sheet.html
#   ?only=00,10,33 只看某几个
```

`verify-guobao.mjs` 共 **25 条**：容器几何（正方形 / 在「界面主题」上方 / 有边框）·
角色注册 · 32 表情 · **夜间规则（显式把时钟钉到 03:00）** · 6 条路由 → 表情映射
（**显式把时钟钉到 12:00**）· 气泡（伸出侧栏且完整可见）· 明暗主题 · 移动端隐藏 · 零报错。

> ⚠️ **被「时间/环境」分支保护的断言，必须先把那个分支显式钉死。**
> 上一版这里栽过：跑的时候正好是凌晨，6 条路由全被夜间规则吃掉变成 `00`，
> `routeEmotion()` 与 `currentEmotion()` 当然相等 —— 断言全绿，实际什么都没测。

---

## 旧自研引擎（legacy）

这里放的是「锅宝」角色挂件的**验收工具**，不是产品代码。
产品代码在 `public/js/components/mascot/`（引擎）与 `public/js/components/mascot-dock.js`（挂载）。

**引擎只有一份，在 `public/` 下。** 本目录的演示台/接触表直接
`import "../../public/js/components/mascot/index.js"`，不复制副本 ——
否则引擎一改、演示台还跑旧代码，两边就漂移了。

## 两个套件

| 文件 | 验什么 | 要不要起服务 |
|---|---|---|
| `verify.mjs` | **引擎自测**（30 条）：8 形状不出画框 / 25 眼型互异 / 39 状态无 NaN / 每态眼睛可见率 / 14 种覆盖动效不出框 / 墨色与主题 / 每帧同步耗时 | 不用，走 `file://` |
| `verify-plugin.mjs` | **工作台集成**（37 条）：真实指针与触摸事件、路由映射、主题跟随、移动端 390×844、拖拽与点击的区分、位置持久化 | **要**，见下 |

辅助页面（人工排查用，不参与断言）：

- `demo.html` —— 交互演示台：39 状态 / 8 形状 / 25 眼型 / 11 墨色 选择器 + fps 与每帧耗时读数
- `sheet.html` —— 接触表：一次铺开全部 83 个实例，肉眼扫视觉问题
  - `?cell=200&only=pot,capsule` 可放大只看某几项（`only` 对状态/形状/眼型都生效）

## 跑法

```bash
# 1) 引擎自测（不需要服务）
node tools/mascot-verify/verify.mjs

# 2) 集成验证 —— ⚠ 数据库必须指一次性副本
DB_PATH=/tmp/wv.db PORT=4174 node server.js &
node tools/mascot-verify/verify-plugin.mjs http://127.0.0.1:4174/
```

> ⚠️ **跑自动化套件时，库要指一次性副本**（`DB_PATH` 是唯一的隔离开关，`src/db.js:11`）。
>
> 但这里原先写的理由是错的，2026-09-21 核过代码后更正：**`seedDatabase()` 是幂等的，不会
> 灌脏真实库** —— `schema.sql` 的 16 张表全是 `CREATE TABLE IF NOT EXISTS`，
> `seedDatabase()` 的 4 个 seeder 每个都先 `SELECT COUNT(*)` 再早退
> （`src/seed.js:198 / 262 / 335 / 370`）。所以 **`npm start` 直接打真实库是安全的**
> —— 你自己看页面就照常这么跑，改的内容会真的存下来。
>
> **仍然要指副本的理由是另一条**：套件将来一旦新增写路径（`verify-plugin.mjs` 现在只写
> `localStorage`，不碰库），就会**静默**改真实库，而那时你不会收到任何提示。
>
> ⚠️ 后台起服务**要多等**（实测约 15s 才 listen）。4s / 10s 就探端口会得出
> 「起不来」的错误结论 —— 这条踩过。

截图落在 `shots/`（脚本会自己建目录）。

> **打开 `demo.html` / `sheet.html` 的方式**：直接用浏览器打开（`file://`）即可，
> 这也是 `verify.mjs` 的跑法。它们通过 `../../public/...` 引用引擎，
> 而**单文件预览器通常不允许向上跨目录**，所以别用「只服务单个 HTML 的预览面板」打开 ——
> 那样会白屏，看起来像引擎坏了，其实只是模块没解析到。
> 需要 http 时用仓库根起服务：`npx serve 拼好家内容创作中心` 或任意静态服务。

## 为什么用无头 Chrome 而不是单元测试

这个挂件的问题几乎全在**渲染与交互**上，纯逻辑单测测不到：

- v1 的致命 bug 是 CSS 选择器层级写错 → 挂件 `pointer-events: none` **完全点不动**，
  而 `el.click()` 绕过命中测试**照样能过** → 只测 JS 逻辑会全绿。
- 所以凡「点得动吗 / 拖得动吗」类断言，**必须用真实事件**
  （`Input.dispatchMouseEvent` / `Input.dispatchTouchEvent`）。

依赖 `~/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs`（本机技能，不在本仓库内）。
