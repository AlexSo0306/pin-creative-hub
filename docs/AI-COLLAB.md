# AI 协作手册 & 共享开发日志（两机共同维护）

> 硬性公约在 `AGENTS.md`。本文件是**两只 AI 的共享记忆**：
> 每次收工都在下面的「共享开发日志」追加一行，另一台机器 `git pull` 后即可恢复上下文。
> 本文件应始终留在 main 分支 —— 它本身就是跨机器的同步媒介。

---

## 1. 分工约定（两机如何不冲突）

| 机器 | 默认负责（建议） | 改文件前留意 |
|---|---|---|
| 电脑 A（后端优先） | `server.js`、`src/`、`test/`、`data/` | 跑 `npm test` |
| 电脑 B（前端优先） | `public/index.html`、`public/js/`、`public/css/` | 逐屏自查 |

- 两人都要碰的文件（如 `src/schema.sql`、`public/index.html`）：提前在开发日志里认领，避免同时编辑。
- 分支命名：前端 `feature/fe-*`，后端 `feature/dev-*`，一眼区分归属。

## 2. 一次完整的协同步骤

```
A、B 开工前：git checkout main && git pull origin main   # 两边都在最新
A 建分支 → 改后端 → npm test → 更新日志 → push
B 建分支 → 改前端 → 自查 → 更新日志 → push
合入 main 前：git pull 解决冲突 → review → merge → 删本地分支
```

## 3. 合入 main 前 check（逐条确认）

- [ ] `npm test` 通过
- [ ] 未提交文件不含 `.env` / `*.db` / `node_modules/`
- [ ] 共享开发日志已更新（含"下一步"）
- [ ] 无强推（force push）

---

## SHARED DEV LOG（共享开发日志）— 最新在上

<!-- 约定格式：
---
### YYYY-MM-DD HH:MM · 机器A/B · 主题
- 做了什么 / 改到哪
- 卡在哪 / 踩过的坑
- 决策依据（为什么这么写）
- 下一步（供对侧接续）
-->

---

### 2026-09-24 01:20 · 机器B · 换引擎：锅宝改用 mood-mates 表情引擎 + 固定进侧栏正方形容器

**Alex 的两条指令**：①「外形和原版相差太远」→ ② 给了 `github.com/sam70361/aora-bot`，
说「这个项目可以解决你画不好表情的问题」。**先诊断，再决定怎么用。**

**根因诊断（不是眼形问题，是通道问题）**：我们的自研引擎图元只有
`gb-body` + `gb-eye` —— **没有嘴、没有腮红、没有眉毛、没有高光**。
39 个状态全靠两只眼扛，所以怎么调都单薄。上游是完整面部骨架：
20 个语义眼形槽位（48 点 lens 双缘包络）+ **9 个嘴形槽位** + 腮红 + 眉毛 + 定光源高光
+ 32 套表情编排，且**角色定义是纯参数（~80 行）**。

**许可先划清（Alex 定为「纯自用内部工具」）**：
- 上游是 **Mood Mates 社区许可（非商业）** —— 免费可改，**禁止商业用途**，分发须保留许可声明
- 商用须邮件授权 `1251579308@qq.com`；且**商用必须配自有角色形象**
- 仓库根目录还有个 `emotion-ball/` 子项目，其**视觉形象「仅学习、永不商业」** ——
  **我们只取 `mood-mates/`，不碰 `emotion-ball/` 的任何形象资产**
- ✅ 结论：纯自用 = 允许。已把 `LICENSE` / `LICENSE-COMMERCIAL.md` / 两篇上游文档
  一并放进 `public/js/vendor/mood-mates/legal/`，并在同目录 README 里写明
  **「一旦工作台对外，必须先取得授权或换回自研」**

**引入方式**：引擎文件**一字未改**复制到 `public/js/vendor/mood-mates/`（与既有
`dompurify` / `marked` 同处）；锅宝的角色定义我们自己写。

**锅宝的角色参数**（`public/js/components/guobao.js`，纯数据）：
- 剪影：`puff` 谐波（`k1 amp .045` 下宽上窄 = 锅形 + `k2` 略竖长 + `k3` 手绘不对称）。
  ⚠ 出画检查 `r × 104 × (1+最大隆起) ≤ 118` → `0.985×104×1.073 = 109.9` ✓
- 眼：**瞳孔眼**（眼白/虹膜/瞳孔/双高光），`taper 0.72` 出叶形感，`tilt 3` 微外斜
- 五官：`mouth {w:22, dy:33}` + 腮红；眉毛关掉（与云宝同路，留白更干净）
- 配色：品牌主色 Framer Blue `#0099ff`，**7 个 states 全部填齐**（缺省会「生气不变红」）
- 特效皮肤 `cloudpuff` —— 小云泡读作**锅里的热气**，正合角色
- 专属轮廓 `eyeShapes.delight / .intent` + `mouthShapes.bigGrin`，给关键表情独有长相

**布局改动（Alex 原话：「固定在左边导航栏、界面主题上方、正方形容器框住」）**：
- `index.html` 侧栏内、`.sidebar-spacer` 之后、`.theme-control` 之前插入 `.guobao-slot`
- 尺寸 = 侧栏 248 − padding 32 − 右边框 1 = **215×215**（写 216 会差 1px，别写死）
- **不再是浮动挂件**：不拖拽、不记位置、`resetPos()` 取消
- 移动端（≤640px）与 `.theme-control` 一起隐藏（侧栏那时收成顶部横条）
- ⚠ 气泡必须 `position: fixed`：`.sidebar` 有 `overflow: hidden`，absolute 会被裁掉
- 新增：跨 23:00/07:00 自动切睡眠（每分钟对一次）—— 只靠 `hashchange` 触发不到

**API 断代（旧引擎已不在页面上）**：
`setState('working')` → `setEmotion('32')` · `setShape`/`setEye` 取消 ·
`setInk('soda')` → 无（体色是角色色板，只能 create 时用 `color` 覆盖）· `resetPos` 取消

**实测证据**：
- `verify-guobao.mjs` **25/25**（新套件，打在真实 Express 应用上）
- `emotion-sheet.html` 32 格全部渲染、零报错（`autostart:false` 静态渲染）
- `npm test` **18/18**（本次未动后端）
- 残留 Chrome `0`

> ⚠️ **本轮最值得记的是「空转通过」**：新套件第一版跑出 22/2，
> 但其中 6 条路由断言**全是假的绿** —— 跑的时候正好是凌晨，夜间规则把 6 条路由
> 全部覆盖成 `00`，`routeEmotion()` 与 `currentEmotion()` 当然相等。
> **被「时间/环境」分支保护的断言，必须先把那个分支显式钉死再测另一支。**
> 修法：夜间断言单独用 `Date.prototype.getHours = () => 3` 钉死；
> 路由断言先用 `() => 12` 钉死白天，跑完还原。
> 另修两条**期望值写错**的断言：容器不是 216（漏了 1px 右边框）；
> 气泡的 `left` 本来就落在侧栏内 7px，该断言的是「**伸出**侧栏且完整可见」。

**遗留（待 Alex 定）**：
- 旧自研引擎 `public/js/components/mascot/`（6 模块 108KB）+ `mascot.js` 已不在页面上，
  但 `tools/mascot-verify/` 里的 `demo.html` / `sheet.html` / `verify.mjs` / `verify-plugin.mjs`
  仍指向它 —— **`verify-plugin.mjs` 现在必然失败**（它找 `.pm-dock .gb-mascot`）。
  已在工具链 README 顶部加「两代引擎并存」对照表标明。要删要留请说。
- 渐变：品牌规范规则 1「不使用渐变」针对的是**UI 表面**（背景/卡片）；
  角色插画保留了引擎的体积渐变 + 釉面高光。若要一律拉平，说一声。

---
### 2026-09-21 21:50 · 机器B · 更正一条被写错的硬规则：`DB_PATH` 副本的真实理由

**背景**：Alex 问「网页地址是什么」。要给一个**能直接打开、且改动会真的存下来**的地址，
就必须先把「真实库能不能直接跑 `server.js`」这件事定下来 —— 结果发现我们一直抄的那条
⚠️ 规则**理由是错的**。

**核过的代码**（不是推测）：

| 检查项 | 实测 |
|---|---|
| `src/schema.sql` | 16 张表**全部** `CREATE TABLE IF NOT EXISTS`，无一处裸 `CREATE TABLE` |
| `src/seed.js` 的 4 个 seeder | 每个都先 `SELECT COUNT(*)`，有数据即 `return`（`:198 / :262 / :335 / :370`） |
| 结论 | `createDatabase()` **幂等**，`npm start` 打真实库**不会灌种子** |

**更正**：原话「绝不要对真实库直接跑 `server.js`，因为会灌种子数据」→ 理由不成立。
**但规则本身保留，换成正当理由**：`DB_PATH` 是这个项目**唯一的隔离开关**
（`src/db.js:11`），而 `verify-plugin.mjs` 现在虽然只写 `localStorage`，
**将来一旦新增写路径，就会静默改真实库** —— 那时不会有任何提示。
→ **日常自己看页面：`npm start` 打真实库，改动真存。跑自动化套件：指一次性副本。**

**踩到的坑（已进技能库）**：`nohup node server.js &` 在 Bash 工具调用里**活不过一次调用**
—— 第 16 秒探到已 listen，下一次工具调用就 `Connection refused`、进程消失。
根因是子进程随该次调用的进程组一起被回收，**表现为「服务悄悄死」**，
和技能库里坑 30/31 同源。改用工具的托管后台方式才稳住。

**实测证据**：
- 真实库 checksum 全程 `2fb9e76bc8b8bb820a77e21342abe7b079f687749503315e13c0cf95106675e0` 未变
- 无头探针打真实应用：挂件 112×112 挂在右下、`2/2` 眼睛可见、状态 `working / pot / ink`
- 残留 Chrome `0`、端口 4174 由托管任务持有

**未动**：`知识资产-v2.html:695` 的 `SOP` 按钮（缩写 + 独立原型，不在挂件范围）。

---
### 2026-09-21 19:25 · 机器B · 挂件：按钮文案全中文 + 去掉眼睛抖动

Alex 报了两个问题：**「按钮都换成中文的，眼睛不要抖动」**。两个都定位到根因，都补了回归断言。

**① 按钮英文 —— 引擎缺中文标签表**

选择器按钮的 `textContent` 直接印了状态/形状/眼型的**英文 id**（`dango` / `powering-down` /
`crescent` …），演示台整页按钮全英文；接触表的卡片标题同样。

- 新增三张标签表（**按钮文案的单一事实来源**，共 83 项，与名称列表一一对应、零重复）：
  - `art.js` → `SHAPE_LABELS`（8）/ `EYE_LABELS`（25）
  - `pose.js` → `STATE_LABELS`（39）
  - 墨色本来就有 `INK[n].label`（11），保持原样
  - 三者都从 `index.js` 导出，`mascot.js` 兼容入口同步转发
- `demo.html` / `sheet.html` 改为查表；`only=` 查询参数**同时接受英文 id 与中文名**（卡片上现在印中文，用户会照中文抄）。
- ⚠ **两个刻意的命名区分**（否则接触表会出现同名不同物）：
  眼型 `drop`＝「泪滴」而形状 `drop`＝「水滴」；`crescent`＝「月牙」而 `moon`＝「残月」。
- ⚠ **踩到一个真坑**：眼型按钮的高亮原先靠 `o.textContent === eyeOn` 比对，
  文案一改中文就和 id 不再相等 → **高亮会全灭**。已改为 `o.dataset.id`，真实值一律放 dataset。
- 顺带给 11 个纯色圆点补了 `aria-label`（圆点没有文字，此前屏幕阅读器读不出来）。

**② 眼睛抖动 —— `_paint` 里的「微颤」以毫秒为自变量**

```js
// 删掉的这两行（now 的单位是毫秒，所以频率高得离谱）
let jx = (Math.sin(now * 0.042 + i) * 1.4 + Math.sin(now * 0.001 + i * 2) * 0.5);
let jy = Math.sin(now * 0.058 + i) * 0.9;
```

- 周期 ≈150ms（6.7Hz）与 ≈108ms（9.2Hz），振幅 1.4 / 0.9，**左右眼还差一个相位**（`+i`）——
  读起来就是两只眼各抖各的。
- 更糟的是它**被下游放大**：纵向抖 0.9 → `vl` 变 → `liveSpan` 变 → 横向夹取区间 `lo/hi` 跳
  → 眼睛整块位移。
- 修法：微颤归零，**保留**视线弹簧（`gazeX/gazeY`，2–8s 换一次目标）与指针跟随 ——
  角色的「活感」由它们提供，不需要这层高频噪声。实测抖动位移 2.85 → 0。

**③ 新增 5 条回归断言（`verify.mjs` 30 → 35）**

| 断言 | 判据 |
|---|---|
| 选择器/标签文案全部为中文 | 每个可点选项的文字里至少一个汉字（查了 77 个） |
| 墨色圆点有中文 `aria-label` | 11 个圆点 |
| 接触表标题走中文标签表 | 静态查（省一次起浏览器），抓「改了一个文件忘了另一个」 |
| 抖动检测**有效** | 采样期内 body 确实在动 |
| 眼睛**不抖动** | 方向反转次数 ≤1 |

⚠ **抖动这条断言的第一版判据是错的，值得记下来**：
一开始写的是「总位移 < 0.2」。结果**同一份代码在完整套件里测得 dy=0、单独跑测得 dy=0.3** ——
差的是眼型形变弹簧最后 0.1% 的**单调收敛残余**，不是抖动。阈值卡在 0.2 就是掷骰子（假红）。
→ 改用**方向反转次数**：单调收敛 0 次 vs 6.7Hz 微颤在 1.2s 内约 8 次，差一个数量级。
→ 并做了**注入对照**证明护栏不是恒绿：把微颤注回 `character.js`，探针从「反转 0 次」变成
  「反转 4 次 / 位移 2.85」，随后 `cp` 还原并 `shasum` 字节比对确认复原。
→ 同理，「抖动检测有效」这条是必需的：rAF 被节流时眼睛本来就不刷新，
  **只查眼睛会恒绿空转**，护栏看着绿其实什么都没测。

**④ 验证结果**（位置/行为变了就得重跑，这是纪律）

- `verify.mjs` **35/35**（`file://`，不用起服务）
- `verify-plugin.mjs` **37/37**，打在**真实 Express 应用**上
  （`DB_PATH=/tmp/workbench-verify.db PORT=4174`，启动约 14s）
- 收尾复验：端口 4174 已释放 · `server.js` 0 个 · 无头 Chrome 0 个 ·
  **真实库 `data/workbench.db` checksum 与跑前完全一致**
- ⚠ 无头 Chrome 在沙箱里那批 `file-write-unlink`（RLZ / GoogleUpdater 写 `~/Library`）
  是 **Chrome 自己的后台行为**，不是断言失败；它会让后台任务的退出码看起来是 failed，
  **以脚本自己打印的「通过 N / 失败 N」为准**。

**下一步（供对侧接续）**：标签表已就位，若以后加状态/形状/眼型，**必须同时补对应标签**，
否则界面上会漏出英文 id —— 目前只有 `verify.mjs` 的中文断言能兜住这一条。

---
### 2026-09-21 19:00 · 机器B · 挂件验收工具链入库（`tools/mascot-verify/`）

- **动机**：引擎与 30+37 条断言此前只存在于工作区沙盒，**没有任何版本控制**；
  另一台机器既看不到验证方法，也没法复跑。
- **新增** `拼好家内容创作中心/tools/mascot-verify/`：
  - `verify.mjs`（引擎自测 30 条，走 `file://`，不用起服务）
  - `verify-plugin.mjs`（工作台集成 37 条，要起真实应用）
  - `demo.html` / `sheet.html`（演示台与接触表，人工排查用）
  - `README.md`（跑法 + 为什么用无头 Chrome 而不是单测）
  - `shots/`（跑一次自动生成的截图，就是证据）
- **引擎只有一份**：演示台/接触表直接 `import "../../public/js/components/mascot/index.js"`，
  **不在 tools/ 里放引擎副本** —— 否则引擎一改、演示台还跑旧代码，两边必然漂移。
- `AGENTS.md` §3 目录地图补了 3 行（挂件 / 挂件样式 / 工具链），另一台机器能直接找到。
- **搬运后复跑确认**（位置变了就得重验，这是纪律）：
  - `verify.mjs` **30/30** —— 途中被自己的静态护栏拦下一次：它按脚本同目录读引擎文件，
    搬家后引擎在 `public/` 下 → `ENOENT core.js`。改成 `../../public/js/components/mascot/` 后通过。
  - `verify-plugin.mjs` **37/37**，打在真实 Express 应用上（`DB_PATH` 一次性副本）
  - ⚠ 无头 Chrome 在沙箱里会有一批 `file-write-unlink` 拦截（RLZ / GoogleUpdater 的
    `~/Library` 写入），那是 **Chrome 自己的后台行为**，不是断言失败 —— 别被它的红字带偏。
- ⚠ **给对侧的提醒（本机专属，不在仓库里）**：`~/WorkBuddy/拼好家创作运营中心/` 那个目录
  **是个没有任何提交的 git 仓库，而它的 `origin` 指向本仓库的 URL**
  （`github.com/AlexSo0306/pin-creative-hub`）。在那里 `git add . && git push`
  会把一个无关的根提交推到本仓库 `main`。**别在那里执行任何 git 写操作。**

---
### 2026-09-21 18:50 · 机器B · 锅宝挂件支持拖拽（Alex 定的移动端方案）+ 真实应用复验

- **决策**：移动端 76px 挂件会压住卡片内容（实测压住「本周发布进度」的星期行与
  「待补表现 1 条」）→ **Alex 定「改成可拖拽」**；墨色**保持纯色**，不开渐变例外。
- 改动（只动两个文件，引擎一行没碰）：
  - `public/js/components/mascot-dock.js`：指针拖拽 + 位置持久化 + `resetPos()` 逃生口
  - `public/css/mascot.css`：`touch-action: none`（不加就变成页面滚动，根本拖不动）、
    拖拽态样式、气泡改为绝对定位
- **拖拽与点击的冲突**是这里唯一的难点（两者都从 `pointerdown` 开始）：
  用 6px 位移阈值区分；过阈值才算拖拽，`pointerup` 时置 `suppressClick` 吃掉紧随的 click。
  `suppressClick` **在每次 pointerdown 复位** —— 否则某次拖拽没紧跟 click（pointercancel）
  会把下一次真实点击误吞。专门写了断言守它：**「拖拽不误触发点击」**（鼠标 + 触摸各一条）。
- **顺手抓到并修掉一个真 bug**：气泡原本是 `.pm-dock` 的 flex 子元素，
  它的宽度会**把挂件推着走**（有文字时宽、没文字时窄）→
  「拖到某处 → 刷新后挂件位置偏移」，实测差 **122px**。
  改为绝对定位后，存储的位置精确等于挂件位置，刷新后分毫不差。
- **改绝对定位后又踩一个坑**：只给 `max-width` 时，abspos 的宽度按 shrink-to-fit 算，
  而可用宽度被 `.pm-dock` 的固定宽度压成负数 → **气泡塌到最小内容宽（实测 36px）**。
  正解是显式 `width: max-content` + `max-width` 收口（194px）。
  → 附带补了个边界：挂件贴左边时气泡**翻到右侧**（`is-flipped`），否则会飘出屏幕外。
- **验证**：`verify-plugin.mjs` **37/37**（从 25 条加到 37 条），新增 12 条覆盖
  鼠标拖拽 / 触摸拖拽 / 不误触发点击 / 位置持久化 / 刷新还原 / 越界夹取 /
  `resetPos()` / 气泡不塌宽 / 气泡翻边。
  **全部打在真实 Express 应用上**（`DB_PATH` 指一次性副本，真实库未动）。
  实拍：`集成-气泡展开.png`、`集成-手机390-拖后.png`。
- ⚠ **两条给对侧的纪律**：
  1. **绝不对真实库直接 `node server.js`** —— `createDatabase()` 会执行 `schema.sql`
     **并 `seedDatabase()`**（`src/db.js:21`）。用 `DB_PATH` 指一次性副本
     （`src/db.js:11` 支持），实测真实库 checksum 与 mtime 均未变。
  2. **后台起服务要多等**：我 4s / 10s 各探一次都判「起不来」（无输出、无端口、无库文件），
     实际启动要 ~15s。**又一次是测量太早，不是被测对象有问题。**
- **下一步**：拖拽位置存在 `localStorage['phj-workbench-mascot-pos']`，
  与「隐藏」开关（`…-mascot = 'off'`）是两个独立的键。接真实业务数据仍**不要改本文件**，
  由页面调 `window.mascotDock.setState/setShape/setInk/say`；拖飞了调 `resetPos()`。

---
### 2026-09-21 17:05 · 机器B · 挂件引擎按参考站点 clean-room 重写为 v2（39 状态 / 8 形状 / 25 眼型 / 11 墨色）

- **背景**：Alex 给了参考站点 `https://grok-icon-study.vercel.app/`，要求「不用自己发挥，照现成的参考对齐」。
  上一版（v1，单文件 19 KB）的引擎是自己拍的；这版按参考的**架构**重写。
- **法律边界（先划清）**：参考仓库的 `geometry-data.js` 头部写着
  `Extracted from Grok Bot.app v0.18.0 app.asar` —— 里面的 `blobPath` / `shapes` / `eyes` / `palette`
  是 xAI 资产，**只学结构与算法，一个坐标一个色值都不搬**。
  本版 8 形状、25 眼型、11 墨色**全部自绘**；从参考只取**比例**当标定基准
  （眼半宽/R=0.1373、眼半高/R=0.1836、眼心偏移/R=0.1937 与 −0.4141）。
  实测默认眼 31×40.3 px，参考基准 30.1×38.6 —— 比例对上了，形状是原创的。
- **学到的架构（这版的核心，逐条都验过）**：
  1. 半隐式欧拉弹簧 `v += (−2ζω·v − ω²(x−t))·dt`，参数写成 `[频率, 阻尼比]`；
     **固定 1/120 s 子步进**（`steps = ceil(dt/DT)`）—— 帧率无关的关键，不是可选项。
  2. 所有形状统一转成**96 点等角度极坐标环**（从中心 (R,R) 出发）。形状共享角度索引
     → 逐点 lerp 形变不打旋。这是「换形状不扭曲」的全部原因。
  3. `buildSpan`：预计算 160 段水平跨度表，让眼睛自动贴合任意剪影。
  4. **眼睛是「挖空」** —— 填**背景色**，不是墨色。这是整个角色的视觉身份。
     （v1 我填的是墨色，眼睛直接看不见了。）
  5. 墨色渐变必须 `gradientUnits="userSpaceOnUse"` + 在 JS 里把颜色**解析成实色**；
     `light-dark()` 在 SVG `<stop>` 上不可靠，`objectBoundingBox` 也不行。
- **文件变化（认领 `public/js/components/mascot*` + `public/css/mascot.css`）**：
  - `public/js/components/mascot.js`：19 KB 单文件 → **5442 B 转发 shim**（保住旧 import 路径不断链）
  - **新增** `public/js/components/mascot/`：`core.js`(14 KB 数学) / `art.js`(15 KB 资产) /
    `pose.js`(20 KB 状态表 + applyPose) / `overlay.js`(11 KB，14 种覆盖动效) /
    `character.js`(29 KB 引擎) / `index.js`(1.8 KB 公开入口)
  - `mascot-dock.js` 重写（路由→状态表、点击转圈）；`mascot.css` 重写
  - **`public/index.html` 一行没动** —— 两条路径没变，所以 v1→v2 对页面零改动
- ⚠️ **破坏性变更（v1 → v2），对侧务必注意**：
  `MASCOT_STATES` 没了（改 `GROUPS` / `ALL_STATES`，39 状态分 4 组）；
  **`setEnergy(0..1)` 没了**（v2 没有「精力」维度，用状态表达）；
  `pulse()` → `spin()`。**若页面里已写了 `setEnergy`，会静默失效。**
- **实测证据**（无头 Chrome + CDP，全部真实事件，非读代码推断）：
  - 引擎自测 **30/30**：8 形状可切、互不相同、不出画框（最大 131.8，上限 132.5）/
    25 眼型互不相同（宽 13–43.2，高 1.9–55.6）/ 39 状态全可切且无 NaN /
    每状态眼睛可见率 ≥ 0.88 / 14 种覆盖动效都有图元且不出画框 /
    同一墨色随主题换端点 / **每帧同步耗时 0.103 ms**
  - 工作台集成 **25/25**：真实 `Input.dispatchMouseEvent` 点击钉住气泡（v1 栽的那个 bug 已回归测试）/
    `elementFromPoint` 命中 `path.gb-body` / 6 路由全部映射到合法状态 /
    浅色主题下眼睛 `rgb(0,0,0)` → `rgb(243,245,248)` /
    移动端 390×844 实测 76×76 且在视口内、真实 `dispatchTouchEvent` 能开能关
  - `npm test` 18/18（本次未动后端）
- **真实应用复验（比无头静态服务强得多）**：上面那轮 25/25 是打在**我自搭的无后端静态服务**上的
  （页面因此显示「今日工作台载入失败」）。随后又在**真实 Express 应用**上复验了一遍：
  `DB_PATH=/tmp/xxx.db PORT=4174 node server.js` 起真服务（真路由 / 真 schema / 真种子数据），
  **仍是 25/25、零前端报错**，实拍见 `集成-工作台-深色.png`（带真实数据：总播放 82,200）。
  → ⚠ **绝不要对真实库直接 `node server.js`** —— `createDatabase()` 会执行 `schema.sql`
    **并 `seedDatabase()`**（`src/db.js:21`）。要用 `DB_PATH` 指到一次性副本
    （`src/db.js:11` 支持），实测真实库 checksum 前后一致、mtime 未变。
    > 🔁 **2026-09-21 更正**：这条的**理由**写错了 —— 实测 `seedDatabase()` 幂等
    > （`schema.sql` 16 张表全 `IF NOT EXISTS`，4 个 seeder 都先 `COUNT` 再早退），
    > `npm start` 打真实库是安全的。**指副本的正当理由换成了另一条**：套件将来
    > 新增写路径时会静默改真实库。详见文首 2026-09-21 那条。
  → 教训：**后台起服务要多等**。我 4s / 10s 各探一次都判「起不来」，实际是启动慢于我的等待
    —— 又一次是**测量太早**，不是被测对象有问题。
- 📱 **移动端实测暴露的真问题**：390×844 下 76px 挂件**压住了「本周发布进度」卡片的
  星期行与「待补表现 1 条」**（见 `集成-手机390.png`）。浮动挂件的固有代价。
  → **待 Alex 定**：接受 / 手机端默认隐藏 / 改成可拖拽（三种都是几行 CSS 的事）。
- 🐞 **本轮最贵的坑：实例字段遮蔽了同名原型方法。**
  `character.js` 里写了 `this.spin = spring(0)`，而类上又有 `spin()` 方法。
  → 外部调 `c.spin(1)` 抛 `TypeError: c.spin is not a function`，
  但 `typeof c.spin` 是 **`"object"`**（不是 `undefined`）—— 报错文本看着像「模块没加载」，
  于是我先怀疑浏览器缓存：查服务端字节、`shasum` 比对、换端口重启，**方向错了半个多小时**。
  → 真正的定位动作是**在页面里打印 `typeof`**，一次就出来了。
  → 已改名 `this.spinSpring`（与 `spinTurn` 成对），并在 `verify.mjs` 加了一道**静态护栏**：
  剥掉注释后扫「2 空格缩进的类方法名」∩「`this.X =` 字段名」，有交集就红。
  已用注入对照验证它真抓得到（把 `spinSpring` 改回 `spin` → 报 `冲突: spin`）。
  → **教训：这类遮蔽完全静默，光靠「跑起来看看」测不出来，必须静态查。**
- 🐞 **另一处：接触表暴露 `pot` 和 `capsule` 长得几乎一样。**
  `pot` 原本是「圆 + 正水平方向一点点凸起」，在 112px 挂件尺寸下**整体仍读作一个圆**，
  而它是挂件默认形状、账号就叫「锅宝」。已重做剪影：耳抬到水平线上方约 29°、幅度 0.26、
  锅身压扁 `[1.05, 0.95]`、底部压平。放大对比见 `放大-形状组.png`。
  → **教训：默认形状必须在真实尺寸（112px）下肉眼验收，光看 96 点环的数字不算。**
- **下一步（接续点）**：
  1. 驱动仍是「路由 + 本地时间（23:00–07:00 强制 sleeping）」占位。接真实业务
     **不要改 mascot-dock.js**，由页面调：`window.mascotDock.setState('celebrate', { say: '…' })` /
     `setShape('pot')` / `setInk('soda')` / `say('数据已同步', 2600)`。
     最自然的接入点是 `pages/dashboard.js` 拿到今日排期之后。
  2. 逃生口：`localStorage['phj-workbench-mascot'] = 'off'` 永久隐藏。
  3. **待 Alex 定**：移动端挂件固定 76px（占屏宽 19%），是否改成「默认隐藏 + 可拖拽」？
  4. 品牌规范规则 1 写的是「不使用渐变」，所以挂件走 `inkFlat: 'var(--fg)'` 纯色；
     参考引擎的墨色是渐变 —— **要不要为角色开个例外**？这是产品决定，我没擅自改。
  5. 引擎源码与验证脚本在 `拼好家创作运营中心/mascot/v2/`（另一个仓库），
     插件里的是**逐字节相同**的副本（`shasum -a 256` 已比对）。
- ⚠ **合并顺序提醒（沿用上一条）**：`feature/dev-dashboard-today` 也在改本文件。
  本分支从 `main`(41023fe) 切出，两边都是**纯追加**，冲突时取两边新增即可。

---
### 2026-09-21 15:51 · 机器B · 新增「锅宝」角色挂件（前端，零侵入）
- **认领 `public/index.html`**（按 §1 约定，两人都要碰的文件需先认领）。本机只加了 2 行：
  `<link rel="stylesheet" href="/css/mascot.css">` 与 `<script type="module" src="/js/components/mascot-dock.js">`。
  **未改 `public/js/app.js`、未改 `public/css/app.css`** —— 挂件自挂载，对既有代码零侵入。
- 新增 3 个文件：`public/js/components/mascot.js`（引擎，19 KB）、
  `public/js/components/mascot-dock.js`（挂载 + 路由驱动）、`public/css/mascot.css`（3 KB）。
- 配色全部走既有 token（`--surface-raised` / `--accent` / `--fg` / `--meta`），
  因此 `framer`（深）与 `fluent`（浅）两套主题自动跟随，**没有新增主题分支**。
- **实测证据**（无头 Chrome + CDP，非读代码推断）：
  挂载成功 / 路由驱动生效（dashboard→focus、inspiration→curious、knowledge→sleepy，
  每次 blob path 均变化）/ `window.mascotDock.setState()` 与 `setEnergy()` 生效 /
  浅色主题下锅身 `rgb(16,16,16)→rgb(255,255,255)` / 页面零横向溢出 / 与 `.toast` 不重叠 /
  **控制台零报错**。`npm test` 18/18 通过（本次未动后端）。
- **性能口径（重要，别被数字骗）**：无头软件渲染下 rAF 帧率读数只有 5–9 fps，
  但用 `performance.now()` 包住 rAF 回调实测**每帧同步耗时仅 0.088 ms（2 实例）**，
  且「空转基线」比「带 2 个实例」还慢 —— 说明帧率读数是无头环境的调度伪影，
  与代码无关。**排查性能问题要先怀疑测量方法**。
- 已完成的两处有据可依的优化：path 生成 `toFixed(2)` → `Math.round`；
  控制点 24 → 18（最高角频率只有 4，Nyquist 只需 >8）。path 字符串 957 → 698 字符（−27%）。
- **下一步（接续点）**：默认状态驱动是「路由 + 本地时间（23:00–07:00 强制 sleepy）」，
  这是占位驱动。接真实业务数据**不要改 mascot-dock.js**，改由页面调用：
  `window.mascotDock.setState('celebrate', { say: '今天的排期都发完了' })` /
  `window.mascotDock.setEnergy(0..1)`。最自然的接入点是 `pages/dashboard.js`
  拿到今日排期数据之后。逃生口：`localStorage['phj-workbench-mascot'] = 'off'` 即永久隐藏。
- ⚠ **合并顺序提醒**：本分支从 `main`(41023fe) 切出，`feature/dev-dashboard-today`
  也在改本文件（110 行 vs main 46 行）。若两者都合 main，**本文件的日志段会冲突**，
  解决时取两边新增内容即可（纯追加，无逻辑冲突）。
- 🐞 **补记（同日 16:0x，修掉一个自测漏掉的真 bug）**：`mascot.css` 里写的是
  `.pm-dock > .pm-mascot`（**直接**子元素），但实际 DOM 是 `.pm-dock > div > .pm-mascot`
  —— 引擎自己创建根节点，外面还套了一层挂载容器。选择器不匹配 →
  `.pm-mascot` 从 `.pm-dock` 继承到 `pointer-events: none` → **挂件完全点不动**。
  **为什么上一轮没测出来**：只验了 `window.mascotDock.setState()` 这个 JS API，
  没做真实点击。而 `el.click()` 绕过 hit-test 仍然能通 → 单看 JS 层一切正常。
  → **教训：验收必须打「真实指针/触摸事件」这一层**（`Input.dispatchMouseEvent` /
  `Input.dispatchTouchEvent`），程序化 `.click()` 不能替代它。
  → 已改为后代选择器 `.pm-dock .pm-mascot`（两处：主规则 + `prefers-reduced-motion`）。
  桌面真实点击、移动端 `dispatchTouchEvent` 三连点（开→关→开）均已实测通过。
- 📱 **移动端实测（`Emulation.setDeviceMetricsOverride` 390×844，不是靠 `--window-size`）**：
  挂件 92px 时占屏宽 24%、会压住卡片右下角内容 → **已缩到 76px（19%）**；
  距右 10px、距底 66px（让开居中 toast）；与 toast 不重叠、页面零横向溢出、零控制台错误。
