import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createAuthRouter } from './routes/auth.js';
import { createSampleRouter } from './routes/sample.js';

export function createApp({ db, kronosDb, auth, jwtSecret, jwtExpiresIn, nodeEnv, trustProxy = false, logger = console,
  allowedOrigins = ['http://localhost:5017', 'http://localhost:5173'] } = {}) {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = new Set(allowedOrigins);
  app.use(cors({ credentials: true, origin(origin, callback) {
    if (!origin || origins.has(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed.');
    error.status = 403;
    callback(error);
  } }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());
  app.use((request, response, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.get('Origin');
      if (origin && !origins.has(origin)) return response.status(403).json({ error: 'Origin is not allowed.' });
    }
    next();
  });
  app.get('/api/test', (_request, response) => {
    response.json({ success: true, message: 'SiBS OMS API is running.' });
  });
  app.get('/api/health', async (_request, response) => {
    try {
      await Promise.all([db.query('SELECT 1'), kronosDb.query('SELECT 1')]);
      response.json({ status: 'ok', service: 'sibs-oms' });
    } catch {
      response.status(503).json({ status: 'unavailable', service: 'sibs-oms' });
    }
  });
  app.use('/api/auth', createAuthRouter({ auth, jwtSecret, jwtExpiresIn, nodeEnv }));
  app.use('/api/sample', createSampleRouter(db, jwtSecret, auth));
  app.use((_request, response) => response.status(404).json({ error: 'Route not found.' }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Invalid JSON body.' });
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Request body is too large.' });
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'That record already exists.' });
    const unavailable = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ER_ACCESS_DENIED_ERROR',
      'ER_BAD_DB_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(error.code);
    const status = unavailable ? 503 : (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500);
    if (status >= 500) logger.error('OMS request failed.', { method: request.method, path: request.path, code: error.code || 'INTERNAL_ERROR' });
    response.status(status).json({ error: status === 503 ? 'Service unavailable.' :
      status >= 500 ? 'An unexpected server error occurred.' : error.message });
  });
  return app;
}
