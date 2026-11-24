import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'sibs_oms_session';

export function sessionCookieOptions(nodeEnv) {
  return { httpOnly: true, secure: nodeEnv === 'production', sameSite: 'lax', path: '/' };
}

export async function authenticateSession(token, secret, auth) {
  if (!token) return null;
  let claims;
  try {
    claims = jwt.verify(token, secret, {
      algorithms: ['HS256'], issuer: 'sibs-oms', audience: 'sibs-oms-client'
    });
  } catch {
    return null;
  }
  if (typeof claims !== 'object' || claims.source !== 'kronos' ||
      typeof claims.sub !== 'string' || !claims.sub.trim() ||
      typeof claims.sibs_id !== 'string' || !claims.sibs_id.trim() ||
      !Number.isSafeInteger(claims.exp)) return null;
  const user = await auth.findActiveUser(claims.sub, claims.sibs_id);
  return user ? { subject: claims.sub, user, expiresAt: new Date(claims.exp * 1000).toISOString() } : null;
}

export function requireAuth(secret, auth) {
  return async (request, response, next) => {
    try {
      const session = await authenticateSession(request.cookies?.[COOKIE_NAME], secret, auth);
      if (!session) return response.status(401).json({ error: 'Unauthorized' });
      request.auth = session;
      request.user = session.user;
      response.set('Cache-Control', 'no-store');
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
