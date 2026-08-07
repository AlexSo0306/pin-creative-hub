import { renderAccountsPage } from './pages/accounts.js';
import { renderContentPlanPage } from './pages/content-plan.js';
import { renderDashboardPage } from './pages/dashboard.js';
import { renderDataReviewPage } from './pages/data-review.js';
import { renderInspirationPage } from './pages/inspiration.js';
import { renderKnowledgePage } from './pages/knowledge.js';
import { renderPlaceholder } from './pages/placeholder.js';

const root = document.getElementById('app');
const routes = new Set([
  'dashboard', 'inspiration', 'content-plan', 'review', 'accounts', 'knowledge'
]);

function currentRoute() {
  const route = (location.hash.replace(/^#\//, '').split('?')[0] || 'dashboard');
  return routes.has(route) ? route : 'dashboard';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('phj-workbench-theme', theme);
  document.querySelectorAll('[data-theme-value]').forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.themeValue === theme));
  });
}

async function renderRoute() {
  const route = currentRoute();
  document.querySelectorAll('[data-route]').forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle('on', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  if (route === 'dashboard') {
    await renderDashboardPage(root);
  } else if (route === 'accounts') {
    await renderAccountsPage(root);
  } else if (route === 'content-plan') {
    await renderContentPlanPage(root);
  } else if (route === 'review') {
    await renderDataReviewPage(root);
  } else if (route === 'inspiration') {
    await renderInspirationPage(root);
  } else if (route === 'knowledge') {
    await renderKnowledgePage(root);
  } else {
    root.innerHTML = renderPlaceholder(route);
  }

  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('[data-theme-value]').forEach((button) => {
  button.addEventListener('click', () => applyTheme(button.dataset.themeValue));
});

applyTheme(localStorage.getItem('phj-workbench-theme') || 'framer');
window.addEventListener('hashchange', renderRoute);

if (!location.hash) location.hash = '#/dashboard';
else renderRoute();
