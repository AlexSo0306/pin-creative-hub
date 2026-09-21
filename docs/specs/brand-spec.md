# 拼好家运营创作中心 · 品牌规范提取

基于 `设计规范-v2.0.md`：纯黑运营画布、Framer Blue 单一交互强调、细蓝调边框与等宽数据，形成克制而高密度的内容管理界面。

```css
:root {
  --bg: oklch(0.0000 0.0000 0.00);
  --surface: oklch(0.1398 0.0000 0.00);
  --fg: oklch(1.0000 0.0000 0.00);
  --muted: oklch(0.7252 0.0000 0.00);
  --border: oklch(0.3050 0.0679 238.26);
  --accent: oklch(0.6690 0.1837 248.81);
}
```

## 字体

- Display：`"GT Walsheim Framer Medium", "GT Walsheim Medium", -apple-system, sans-serif`
- Body：`"Inter Variable", "Inter", -apple-system, sans-serif`
- Mono：`"Azeret Mono", ui-monospace, "SF Mono", monospace`

## 视觉规则

1. 纯黑背景承载信息，卡片使用接近黑色的表面层，不使用渐变。
2. Framer Blue 只用于主操作、焦点与当前选中状态；账号和平台色仅承担数据语义。
3. 卡片使用细边框和轻微高光，不使用厚重阴影。
4. 标题采用紧凑字距，数字、日期、计数和标签优先使用等宽字体。
5. 交互反馈以背景提亮、边框增强和 1px 位移完成，避免夸张动效。