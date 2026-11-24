import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

export function createSampleRouter(db, jwtSecret, auth) {
  const router = Router();
  router.get('/', async (_request, response) => {
    try {
      await db.query('SELECT 1 AS connected');
      response.json({ database: 'connected' });
    } catch {
      response.status(503).json({ database: 'unavailable' });
    }
  });
  router.get('/protected', requireAuth(jwtSecret, auth), (request, response) => {
    response.json({ authenticated: true, subject: request.auth.subject });
  });
  return router;
}
