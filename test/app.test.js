import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createApp } from '../src/app.js';

const server = createApp().listen(0, '127.0.0.1');
after(() => server.close());

test('GET /api/test identifies the OMS server', async () => {
  if (!server.listening) {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  }
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/test`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'SiBS OMS API is running.'
  });
});

test('GET /api/sample confirms a database query succeeded', async () => {
  const { createApp } = await import('../src/app.js');
  const app = createApp({
    db: { query: async (sql) => {
      assert.equal(sql, 'SELECT 1 AS connected');
      return [[{ connected: 1 }]];
    } }
  });
  const sampleServer = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      sampleServer.once('listening', resolve);
      sampleServer.once('error', reject);
    });
    const response = await fetch(`http://127.0.0.1:${sampleServer.address().port}/api/sample`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { database: 'connected' });
  } finally {
    sampleServer.close();
  }
});

test('GET /api/sample does not expose database errors', async () => {
  const { createApp } = await import('../src/app.js');
  const app = createApp({ db: { query: async () => { throw new Error('private database detail'); } } });
  const sampleServer = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      sampleServer.once('listening', resolve);
      sampleServer.once('error', reject);
    });
    const response = await fetch(`http://127.0.0.1:${sampleServer.address().port}/api/sample`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { database: 'unavailable' });
  } finally {
    sampleServer.close();
  }
});
