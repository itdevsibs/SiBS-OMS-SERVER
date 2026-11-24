import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { authenticateSession, COOKIE_NAME, requireAuth, sessionCookieOptions } from '../middleware/requireAuth.js';

export function createAuthRouter({ auth, jwtSecret, jwtExpiresIn = '1h', nodeEnv = 'development' }) {
  const router = Router();
  const cookieOptions = sessionCookieOptions(nodeEnv);
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7',
    legacyHeaders: false, message: { error: 'Too many login attempts.' } });

  function issueSession(response, user) {
    const token = jwt.sign({ source: 'kronos', sibs_id: user.sibs_id }, jwtSecret, {
      subject: String(user.id), algorithm: 'HS256', issuer: 'sibs-oms',
      audience: 'sibs-oms-client', expiresIn: jwtExpiresIn
    });
    const claims = jwt.decode(token);
    const expiresAt = new Date(claims.exp * 1000).toISOString();
    response.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: (claims.exp - claims.iat) * 1000 });
    response.set('Cache-Control', 'no-store');
    return { expiresAt };
  }

  router.post('/login', limiter, async (request, response, next) => {
    const username = request.body?.username ?? request.body?.sibsId;
    const password = request.body?.password;
    if (typeof username !== 'string' || !username.trim() || username.length > 150 ||
        typeof password !== 'string' || !password || password.length > 250) {
      return response.status(400).json({ error: 'Username and password are required.' });
    }
    try {
      const user = await auth.login(username.trim(), password);
      if (!user) return response.status(401).json({ error: 'Invalid credentials.' });
      return response.json({ success: true, user, ...issueSession(response, user) });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/session', async (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    try {
      const session = await authenticateSession(request.cookies?.[COOKIE_NAME], jwtSecret, auth);
      if (!session && request.cookies?.[COOKIE_NAME]) {
        response.clearCookie(COOKIE_NAME, cookieOptions);
      }
      return response.json(session
        ? { authenticated: true, user: session.user, expiresAt: session.expiresAt }
        : { authenticated: false, user: null });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', requireAuth(jwtSecret, auth), (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ user: request.auth.user, expiresAt: request.auth.expiresAt });
  });

  router.post('/refresh', requireAuth(jwtSecret, auth), (request, response) => {
    response.json({ authenticated: true, user: request.auth.user,
      ...issueSession(response, { ...request.auth.user, id: request.auth.subject }) });
  });

  router.post('/logout', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.clearCookie(COOKIE_NAME, cookieOptions);
    response.json({ success: true });
  });
  return router;
}
