/* ============================================================
 * 锅宝 · 角色定义（Mood Mates 引擎的角色数据包）
 *
 * 一个角色 = 一个自包含的纯数据文件，**不需要改动任何引擎代码**
 * （依据 vendor/mood-mates/legal/CHARACTER-DESIGN.md 的 Schema）。
 *
 * 为什么换成这套引擎：我们自研的挂件只有 gb-body + gb-eye 两个图元 ——
 * 没有嘴、没有腮红、没有眉毛、没有高光，39 个状态全靠两只眼扛，所以表情单薄。
 * 这套引擎是完整的面部骨架：20 个语义眼形槽位 + 9 个嘴形槽位 + 腮红 + 眉毛 +
 * 定光源高光 + 32 套表情编排，且角色定义是纯参数。
 *
 * 剪影：锅 —— 下宽上窄的圆润锅身，用 puff 谐波生成（无手绘坐标）。
 *   ⚠ 出画检查（CHARACTER-DESIGN.md §二）：r × 104 × (1 + 最大隆起) ≤ 118
 *     0.985 × 104 × (1 + 0.073) = 109.9  ✓
 *
 * 配色：品牌主色 Framer Blue（--accent #0099ff），锅宝 = 一口珐琅蓝的锅。
 *   ⚠ 7 个 states 全部填齐 —— 缺省会回退主体色，导致「生气不变红」。
 *
 * 加载顺序：必须在 vendor/mood-mates/core/engine.js 之后。
 * ============================================================ */
window.MoodMates.characters.register({
  id: 'guobao',
  name: '锅宝',
  en: { name: 'Guobao', desc: 'An enamel-blue pot with big iris eyes that keeps the workbench company' },
  industry: 'general',
  desc: '珐琅蓝的圆润小锅，大瞳孔眼 + 嘴形，32 种表情随页面切换',

  /* 1. 身体剪影 —— 下宽上窄 = 锅形；再加极轻的手绘不对称，避免死板 */
  body: {
    type: 'puff',
    r: 0.985,
    waves: [
      { k: 1, amp: 0.045, phase: 0 },            // 下鼓上收 → 锅 / 碗
      { k: 2, amp: 0.020, phase: -Math.PI / 2 }, // 略竖长
      { k: 3, amp: 0.008, phase: 0.7 }           // 手绘感
    ]
  },

  /* 2. 面部拟合 —— 锅身重心偏下，五官整体上移一点才居中 */
  face: { x: 0, y: -3, sx: 1, sy: 1, eye: 1 },

  /* 3. 色板 */
  palette: {
    body: '#0099FF',
    eye: '#0A1A2B',
    eyeHighlight: '#FFFFFF',
    blush: '#FF9DB0',
    mouth: '#0A1A2B',
    zzz: '#7FC4FF',
    gloss: 0.28,
    states: {
      base: '#0099FF',
      dim: '#0A6FB8',   // 低落 / 睡眠
      soft: '#4FB8FF',  // 柔和 / 开心
      blush: '#FF9DB0', // 泛红
      angry: '#FF6B6B', // 涨红
      alert: '#EF4444', // 出错（对齐 --danger）
      off: '#5A7A94'    // 停止
    }
  },

  /* 4. 眼型基调 —— 瞳孔眼（分层眼球），比豆眼更有神。
     大眼 + 端部略收尖（taper 0.72）= 叶形感，微外斜 tilt 3。 */
  eyeStyle: {
    dx: 30,
    cy: 101,
    w: 27,
    h: 33,
    taper: 0.72,
    tilt: 3,
    bend: 0.03,
    pupil: {
      irisR: 11.5,
      pupilR: 5.4,
      irisColor: '#0A1A2B',
      socket: '#FFFFFF',
      highlights: [
        { dx: -3.8, dy: -4.6, r: 3.5 },
        { dx: 4.4, dy: 3.0, r: 1.6, opacity: 0.6 }
      ]
    }
  },

  /* 4b. 专属轮廓 —— 给「任务完成」和「思考中」各一个独有的长相 */
  eyeShapes: {
    /* 笑到眼睛弯成月牙，比通用 happy 更眯 */
    delight: { w: 29, h: 13, bend: 0.72, taper: 1.25 },
    /* 专注：上缘压平、略窄高 */
    intent: { w: 25, h: 30, bend: 0.06, taper: 0.5 }
  },
  mouthShapes: {
    bigGrin: { w: 21, h: 10, bend: -0.4, taper: 0.5 }
  },

  /* 5. 五官 */
  features: {
    mouth: { w: 22, dy: 33 },
    blush: { dx: 42, dy: 21, rx: 11, ry: 6.5, max: 0.85 },
    brows: false   // 与云宝同路：情绪已由眼睑开合 + 视线 + 嘴形表达，留白更干净
  },

  /* 6. 特效皮肤 —— cloudpuff 的小云泡读作「锅里的热气」，正合角色 */
  fxSkin: 'cloudpuff',

  /* 7. 性格：锅宝是「在岗的伙伴」，不是宠物 —— 待机动作收敛、轮换放慢 */
  emotions: {
    '02': {
      poolMs: [11000, 18000],
      anims: [
        { target: 'eyes', prop: 'lookX', type: 'glance', amp: 7, period: 6200 },
        { target: 'eyes', prop: 'lookY', type: 'sine', amp: 2, period: 5400, phase: 0.8 }
      ]
    },
    '16': {
      desc: '眼睛收窄、视线锁住，嘴角微抿 —— 在干活',
      pool: ['intent'],
      mouth: 'flat',
      eyes: { both: { open: 0.92 } }
    },
    '30': {
      desc: '视线慢慢扫，偶尔往上飘 —— 在想事情',
      anims: [
        { target: 'eyes', prop: 'lookX', type: 'sine', amp: 9, period: 4200 },
        { target: 'eyes', prop: 'lookY', type: 'sine', amp: 4, period: 3300, phase: 1.4 }
      ]
    },
    '32': {
      desc: '眼睑半合、身体轻微起伏 —— 手上正忙',
      anims: [{ target: 'body', prop: 'y', type: 'sine', amp: 1.6, period: 1700 }]
    },
    '33': {
      desc: '笑眼眯成月牙，腮红浮上来，咧嘴',
      pool: ['delight'],
      mouth: 'bigGrin',
      body: { y: -2, confetti: 0.8 },
      eyes: { both: { y: -3 } },
      face: { blush: 0.42 }
    },
    '40': {
      desc: '视线快速左右扫读 —— 在翻资料',
      pool: ['scan', 'scan2', 'scan3'],
      mouth: 'flat',
      anims: [{ target: 'eyes', prop: 'lookX', type: 'sine', amp: 11, period: 1500 }]
    }
  }
});
