import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

async function withApp(run, overrides = {}) {
  const server = createApp({
    db: { query: async () => [[{ connected: 1 }]] },
    kronosDb: { query: async () => [[{ connected: 1 }]] },
    allowedOrigins: ['http://localhost:5017'], logger: { error() {} }, ...overrides
  }).listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('API sends security headers and allows credentialed CORS preflight', async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/test`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const preflight = await fetch(`${base}/api/auth/login`, {
      method: 'OPTIONS', headers: {
        Origin: 'http://localhost:5017', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5017');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  });
});

test('API rejects unapproved origins with JSON', async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/test`, { headers: { Origin: 'https://unapproved.example' } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'Origin is not allowed.');
  });
});

test('API returns JSON for malformed, oversized, and missing requests', async () => {
  await withApp(async (base) => {
    const invalid = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, 'Invalid JSON body.');
    const large = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(60000) })
    });
    assert.equal(large.status, 413);
    assert.equal((await large.json()).error, 'Request body is too large.');
    const missing = await fetch(`${base}/api/missing`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'Route not found.');
  });
});

test('readiness checks OMS and Kronos databases', async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'sibs-oms' });
  });
});

test('readiness reports database failure without exposing connection details', async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable', service: 'sibs-oms' });
  }, { kronosDb: { query: async () => { throw new Error('private connection details'); } } });
});

test('cookie login rejects foreign origins and rate limits repeated attempts', async () => {
  await withApp(async (base) => {
    const foreign = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { Origin: 'https://unapproved.example' }
    });
    assert.equal(foreign.status, 403);
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await fetch(`${base}/api/auth/login`, { method: 'POST' });
      assert.equal(response.status, 400);
      await response.arrayBuffer();
    }
    const limited = await fetch(`${base}/api/auth/login`, { method: 'POST' });
    assert.equal(limited.status, 429);
  });
});
