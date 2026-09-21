# tools/mascot-verify —— 锅宝挂件的验证工具链

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

> ⚠️ **绝不要对真实库直接跑 `server.js`。**
> `createDatabase()` 会执行 `schema.sql` **并 `seedDatabase()`**（`src/db.js:21`），
> 会给真实库灌种子数据。用 `DB_PATH` 指到一次性副本（`src/db.js:11` 支持）。
>
> ⚠️ 后台起服务**要多等**（实测约 15s 才 listen）。4s / 10s 就探端口会得出
> 「起不来」的错误结论 —— 这条踩过。

截图落在 `shots/`（脚本会自己建目录）。

## 为什么用无头 Chrome 而不是单元测试

这个挂件的问题几乎全在**渲染与交互**上，纯逻辑单测测不到：

- v1 的致命 bug 是 CSS 选择器层级写错 → 挂件 `pointer-events: none` **完全点不动**，
  而 `el.click()` 绕过命中测试**照样能过** → 只测 JS 逻辑会全绿。
- 所以凡「点得动吗 / 拖得动吗」类断言，**必须用真实事件**
  （`Input.dispatchMouseEvent` / `Input.dispatchTouchEvent`）。

依赖 `~/.workbuddy-ai/skills/headless-chrome-verify/assets/cdp.mjs`（本机技能，不在本仓库内）。
