import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { createHealthRouter } from './routes/health.js';
import { createOwnedAccountsRouter } from './routes/owned-accounts.js';
import { createContentCardsRouter } from './routes/content-cards.js';
import { createPerformanceRouter } from './routes/performance.js';
import { createReviewConclusionsRouter } from './routes/review-conclusions.js';
import { createKnowledgeAssetsRouter } from './routes/knowledge-assets.js';
import { createCalendarRouter, createDashboardRouter } from './routes/dashboard.js';
import {
  createCreatorsRouter,
  createInspirationSettingsRouter,
  createInspirationSyncRouter,
  createMonitorRouter,
  createPostsRouter
} from './routes/inspiration.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(dirname, '..', 'public');

export function createApp({ database }) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // 统一 API 响应契约：成功 { ok: true, data }，失败 { ok: false, error }
  app.use('/api', (request, response, next) => {
    const originalJson = response.json.bind(response);
    response.json = (payload) => {
      if (payload && typeof payload === 'object' && !('ok' in payload)) {
        if ('error' in payload) {
          payload = { ok: false, ...payload };
        } else if ('data' in payload) {
          payload = { ok: true, ...payload };
        }
      }
      return originalJson(payload);
    };
    next();
  });

  app.use(express.static(publicDirectory));

  app.use('/api/health', createHealthRouter());
  app.use('/api/owned-accounts', createOwnedAccountsRouter(database));
  app.use('/api/content-cards', createContentCardsRouter(database));
  app.use('/api/performance', createPerformanceRouter(database));
  app.use('/api/review-conclusions', createReviewConclusionsRouter(database));
  app.use('/api/knowledge-assets', createKnowledgeAssetsRouter(database));
  app.use('/api/dashboard', createDashboardRouter(database));
  app.use('/api/dashboard/monitor', createMonitorRouter(database));
  app.use('/api/calendar', createCalendarRouter(database));
  app.use('/api/creators', createCreatorsRouter(database));
  app.use('/api/posts', createPostsRouter(database));
  app.use('/api/inspiration/settings', createInspirationSettingsRouter(database));
  app.use('/api/sync', createInspirationSyncRouter(database));
  app.use('/api', notFoundHandler);

  app.get('*path', (request, response) => {
    response.sendFile(path.join(publicDirectory, 'index.html'));
  });

  app.use(errorHandler);

  return app;
}
