const pageCopy = {
  dashboard: ['今日工作台', '运营指挥中心将在账号、内容和复盘数据接通后启用。'],
  inspiration: ['灵感雷达', '下一阶段将迁移对标作品、创作者、CSV 导入与灵感转选题。'],
  'content-plan': ['内容计划', '下一阶段将接入五阶段看板和内容文档。'],
  review: ['数据复盘', '内容发布记录接通后，这里将提供录入、趋势和结论沉淀。'],
  knowledge: ['知识资产', '复盘结论和可复用模板将在这里统一维护。']
};

export function renderPlaceholder(route) {
  const [title, copy] = pageCopy[route] || pageCopy.dashboard;

  return `
    <section class="page placeholder-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">MODULE / BUILDING</p>
          <h1>${title}</h1>
          <p class="lead">${copy}</p>
        </div>
      </header>
      <div class="placeholder-band">
        <span class="placeholder-index">01</span>
        <div>
          <strong>全栈基础已经运行</strong>
          <p>统一导航、主题、Express API 与 SQLite 数据库已建立。账号矩阵是当前第一个真实数据模块。</p>
        </div>
        <a class="button button-secondary" href="#/accounts">查看账号矩阵</a>
      </div>
    </section>
  `;
}
