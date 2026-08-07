import { Router } from 'express';

export function createHealthRouter() {
  const router = Router();

  router.get('/', (request, response) => {
    response.json({
      ok: true,
      service: 'pinhaojia-content-workbench',
      time: new Date().toISOString()
    });
  });

  return router;
}
