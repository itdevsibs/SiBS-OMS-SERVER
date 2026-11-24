import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKronosAuth, encryptHrisStylePassword } from '../src/services/kronosAuth.js';

const encryption = { method: 'aes-256-cbc', key: 'test-key', iv: 'test-iv' };

test('Kronos password encryption matches the ticketing login format', () => {
  assert.equal(encryptHrisStylePassword('pass123', encryption), 'R3FjMjdWQjhoWWx0dTg3b0NNd0t0QT09');
});

test('Kronos login accepts only an active user with a matching password', async () => {
  const row = {
    gy_user_id: 42, gy_user_code: 'S123', gy_username: 'sample',
    gy_full_name: 'Sample User', gy_password: 'R3FjMjdWQjhoWWx0dTg3b0NNd0t0QT09'
  };
  const pool = { execute: async (sql, params) => {
    assert.match(sql, /gy_user_status=0/);
    assert.deepEqual(params, ['sample', 'sample']);
    return [[row]];
  } };
  const auth = createKronosAuth(pool, encryption);
  assert.deepEqual(await auth.login('sample', 'pass123'), {
    id: '42', sibs_id: 'S123', name: 'Sample User', username: 'sample'
  });
  assert.equal(await auth.login('sample', 'wrong'), null);
});
