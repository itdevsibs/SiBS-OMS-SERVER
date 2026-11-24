import jwt from 'jsonwebtoken';

function parsePort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

export function loadConfig(source = process.env) {
  for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
    'DB3_HOST', 'DB3_USER', 'DB3_PASSWORD', 'DB3_NAME',
    'ENCRYPT_SECRET_KEY', 'ENCRYPT_SECRET_IV']) {
    if (!String(source[name] ?? '').trim()) {
      throw new Error(`${name} is required.`);
    }
  }
  if (source.ENCRYPT_METHOD !== 'aes-256-cbc') {
    throw new Error('ENCRYPT_METHOD must be aes-256-cbc.');
  }
  if (String(source.OMS_JWT_SECRET ?? '').trim().length < 32 || /^replace-/i.test(source.OMS_JWT_SECRET)) {
    throw new Error('OMS_JWT_SECRET must contain at least 32 characters.');
  }
  const jwtExpiresIn = source.OMS_JWT_EXPIRES_IN || '1h';
  try {
    const claims = jwt.decode(jwt.sign({}, source.OMS_JWT_SECRET, { expiresIn: jwtExpiresIn }));
    if (claims.exp <= claims.iat) throw new Error();
  } catch {
    throw new Error('OMS_JWT_EXPIRES_IN must be a positive duration such as 1h.');
  }
  const allowedOrigins = String(source.OMS_ALLOWED_ORIGINS || source.ALLOWED_ORIGINS || source.CLIENT_ORIGIN ||
    'http://localhost:5017,http://127.0.0.1:5017,http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean);
  for (const origin of allowedOrigins) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error();
    } catch { throw new Error('Allowed origins must be complete http(s) origins without paths or wildcards.'); }
  }

  return {
    port: parsePort(source.PORT || 6103, 'PORT'),
    nodeEnv: source.NODE_ENV || 'development',
    trustProxy: source.TRUST_PROXY === '1',
    jwtSecret: source.OMS_JWT_SECRET,
    jwtExpiresIn,
    allowedOrigins,
    database: {
      host: source.DB_HOST,
      port: parsePort(source.DB_PORT || 3306, 'DB_PORT'),
      user: source.DB_USER,
      password: source.DB_PASSWORD,
      database: source.DB_NAME
    },
    kronosDatabase: {
      host: source.DB3_HOST,
      port: parsePort(source.DB3_PORT || 3306, 'DB3_PORT'),
      user: source.DB3_USER,
      password: source.DB3_PASSWORD,
      database: source.DB3_NAME
    },
    encryption: {
      method: source.ENCRYPT_METHOD,
      key: source.ENCRYPT_SECRET_KEY,
      iv: source.ENCRYPT_SECRET_IV
    }
  };
}
