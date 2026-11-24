import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const jwtSecret = 'test-only-secret-with-at-least-32-characters';
const user = { sibs_id: 'S123', name: 'Sample User', username: 'sample' };

async function withServer(auth, run) {
  const server = createApp({ auth, jwtSecret }).listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function token(options = {}) {
  return jwt.sign({ source: 'kronos', sibs_id: user.sibs_id }, jwtSecret, {
    subject: '42', issuer: 'sibs-oms', audience: 'sibs-oms-client',
    algorithm: 'HS256', expiresIn: '1h', ...options
  });
}

test('login issues an HttpOnly OMS cookie and protected route rechecks the user', async () => {
  let lookedUp = false;
  const auth = {
    login: async (username, password) => {
      assert.equal(username, 'sample');
      assert.equal(password, 'correct-password');
      return { ...user, id: '42' };
    },
    findActiveUser: async (id, sibsId) => {
      lookedUp = true;
      assert.equal(id, '42');
      assert.equal(sibsId, 'S123');
      return user;
    }
  };
  await withServer(auth, async (base) => {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sample', password: 'correct-password' })
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).success, true);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /^sibs_oms_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    const cookie = setCookie.split(';')[0];
    const protectedResponse = await fetch(`${base}/api/sample/protected`, { headers: { Cookie: cookie } });
    assert.equal(protectedResponse.status, 200);
    assert.deepEqual(await protectedResponse.json(), { authenticated: true, subject: '42' });
    assert.equal(lookedUp, true);
    const session = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
    assert.equal((await session.json()).authenticated, true);
    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal((await me.json()).user.sibs_id, 'S123');
    const refresh = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST', headers: { Cookie: cookie }
    });
    assert.equal(refresh.status, 200);
    assert.match(refresh.headers.get('set-cookie'), /^sibs_oms_session=/);
  });
});

test('login rejects invalid credentials without issuing a cookie', async () => {
  await withServer({ login: async () => null }, async (base) => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sample', password: 'wrong' })
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  });
});

test('protected route rejects missing, expired, and inactive sessions', async () => {
  await withServer({ findActiveUser: async () => null }, async (base) => {
    const missing = await fetch(`${base}/api/sample/protected`);
    assert.equal(missing.status, 401);
    const expired = await fetch(`${base}/api/sample/protected`, {
      headers: { Cookie: `sibs_oms_session=${token({ expiresIn: -1 })}` }
    });
    assert.equal(expired.status, 401);
    const inactive = await fetch(`${base}/api/sample/protected`, {
      headers: { Cookie: `sibs_oms_session=${token()}` }
    });
    assert.equal(inactive.status, 401);
    const session = await fetch(`${base}/api/auth/session`, {
      headers: { Cookie: `sibs_oms_session=${token()}` }
    });
    assert.deepEqual(await session.json(), { authenticated: false, user: null });
    assert.match(session.headers.get('set-cookie'), /^sibs_oms_session=;/);
  });
});

test('protected route rejects a token from another SIBS application', async () => {
  await withServer({ findActiveUser: async () => user }, async (base) => {
    const ticketingToken = jwt.sign({ source: 'kronos', sibs_id: 'S123' }, jwtSecret, {
      subject: '42', issuer: 'sibs-ticketing', audience: 'sibs-ticketing-client',
      algorithm: 'HS256', expiresIn: '1h'
    });
    const response = await fetch(`${base}/api/sample/protected`, {
      headers: { Cookie: `sibs_oms_session=${ticketingToken}` }
    });
    assert.equal(response.status, 401);
  });
});

test('logout clears the OMS session cookie', async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /^sibs_oms_session=;/);
  });
});
