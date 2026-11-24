import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/config.js';

const base = {
  DB_HOST: 'db.internal', DB_PORT: '3307', DB_USER: 'oms',
  DB_PASSWORD: 'secret', DB_NAME: 'sibs_oms_db',
  DB3_HOST: 'kronos.internal', DB3_PORT: '3308', DB3_USER: 'readonly',
  DB3_PASSWORD: 'other-secret', DB3_NAME: 'kronos_db',
  ENCRYPT_METHOD: 'aes-256-cbc', ENCRYPT_SECRET_KEY: 'key', ENCRYPT_SECRET_IV: 'iv',
  OMS_JWT_SECRET: 'a'.repeat(32)
};

test('loadConfig uses OMS database environment values', () => {
  assert.deepEqual(loadConfig({
    ...base, PORT: '6103'
  }), {
    port: 6103,
    nodeEnv: 'development',
    trustProxy: false,
    jwtSecret: 'a'.repeat(32),
    jwtExpiresIn: '1h',
    allowedOrigins: ['http://localhost:5017', 'http://127.0.0.1:5017', 'http://localhost:5173', 'http://127.0.0.1:5173'],
    database: { host: 'db.internal', port: 3307, user: 'oms', password: 'secret', database: 'sibs_oms_db' },
    kronosDatabase: { host: 'kronos.internal', port: 3308, user: 'readonly', password: 'other-secret', database: 'kronos_db' },
    encryption: { method: 'aes-256-cbc', key: 'key', iv: 'iv' }
  });
});

test('loadConfig rejects missing database credentials', () => {
  assert.throws(() => loadConfig({ ...base, DB_PASSWORD: '' }),
    /DB_PASSWORD/);
});

test('loadConfig rejects a missing or short OMS JWT secret', () => {
  assert.throws(() => loadConfig({ ...base, OMS_JWT_SECRET: undefined }), /OMS_JWT_SECRET/);
  assert.throws(() => loadConfig({ ...base, OMS_JWT_SECRET: 'short' }), /OMS_JWT_SECRET/);
});

test('loadConfig honors existing ALLOWED_ORIGINS and normalizes trailing slashes', () => {
  assert.deepEqual(loadConfig({ ...base, ALLOWED_ORIGINS: 'http://localhost:5017/, https://oms.example.com/' }).allowedOrigins,
    ['http://localhost:5017', 'https://oms.example.com']);
  assert.deepEqual(loadConfig({ ...base, OMS_ALLOWED_ORIGINS: 'http://localhost:5173', ALLOWED_ORIGINS: 'http://localhost:5017' }).allowedOrigins,
    ['http://localhost:5173']);
});

test('loadConfig rejects invalid JWT lifetimes and origin wildcards', () => {
  assert.throws(() => loadConfig({ ...base, OMS_JWT_EXPIRES_IN: '-1h' }), /OMS_JWT_EXPIRES_IN/);
  assert.throws(() => loadConfig({ ...base, ALLOWED_ORIGINS: '*' }), /Allowed origins/);
});
