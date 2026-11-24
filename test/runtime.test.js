import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { startRuntime } from '../src/runtime.js';
import { createApp } from '../src/app.js';

test('runtime handles a port conflict and releases resources on shutdown', async () => {
  const signals = new EventEmitter();
  let closed = 0;
  const runtime = await startRuntime({ app: createApp(), port: 0, host: '127.0.0.1',
    processTarget: signals, logger: { info() {}, error() {} },
    closeResources: async () => { closed++; }
  });
  try {
    await assert.rejects(startRuntime({ app: createApp(), port: runtime.server.address().port,
      host: '127.0.0.1' }), { code: 'EADDRINUSE' });
  } finally {
    signals.emit('SIGTERM');
    await runtime.shutdown();
    await runtime.shutdown();
  }
  assert.equal(closed, 1);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(runtime.server.listening, false);
});
