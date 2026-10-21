import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import Admin from '../src/models/Admin.js';
import AdminLoginAttempt from '../src/models/AdminLoginAttempt.js';
import AdminSession from '../src/models/AdminSession.js';
import {
  ADMIN_IDLE_TTL_MS,
  hashSessionToken,
  isStrongAdminPassword,
  normalizeAdminEmail,
} from '../src/security/adminAuth.js';

const allowedOrigin = 'http://127.0.0.1:5173';
const goodPassword = 'ManglamAdmin!Secure2026';
const adminId = 'admin-fixture-id';
const admins = new Map();
const sessions = new Map();
const attempts = new Map();
const servers = new Set();

function makeQuery(value) {
  return {
    select() { return this; },
    lean: async () => value,
  };
}

const models = {
  Admin: {
    findOne: ({ email }) => makeQuery(admins.get(email) ?? null),
    findById: (id) => makeQuery([...admins.values()].find((admin) => admin._id === id) ?? null),
  },
  AdminSession: {
    findOne: ({ tokenHash }) => makeQuery([...sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null),
    create: async (session) => {
      const created = { ...session, _id: `session-${sessions.size + 1}` };
      sessions.set(created._id, created);
      return created;
    },
    updateOne: async (filter, update) => {
      const session = sessions.get(filter._id);
      if (!session) return { matchedCount: 0 };
      Object.assign(session, update.$set);
      return { matchedCount: 1 };
    },
    deleteOne: async (filter) => {
      const entry = [...sessions.entries()].find(([, session]) => (
        (filter._id && session._id === filter._id)
        || (filter.tokenHash && session.tokenHash === filter.tokenHash)
      ));
      if (entry) sessions.delete(entry[0]);
      return { deletedCount: entry ? 1 : 0 };
    },
  },
  AdminLoginAttempt: {
    findOneAndUpdate: (filter, update) => ({
      lean: async () => {
        const entry = attempts.get(filter.windowKey) ?? {
          windowKey: filter.windowKey,
          count: 0,
          expiresAt: update.$setOnInsert?.expiresAt,
        };
        entry.count += update.$inc.count;
        attempts.set(filter.windowKey, entry);
        return entry;
      },
    }),
  },
};

async function startServer({ databaseReady = true, production = false } = {}) {
  const server = createApp({
    models,
    isDatabaseReady: () => databaseReady,
    adminConfig: { allowedOrigins: [allowedOrigin], production },
  }).listen(0, '127.0.0.1');
  servers.add(server);
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function resetFixture() {
  admins.clear();
  sessions.clear();
  attempts.clear();
}

async function addAdmin({ isActive = true } = {}) {
  const passwordHash = await argon2.hash(goodPassword, { type: argon2.argon2id });
  admins.set('admin@example.com', {
    _id: adminId,
    email: 'admin@example.com',
    name: 'Hotel Administrator',
    passwordHash,
    isActive,
  });
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function updateCookieJar(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair, ...attributes] = cookie.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (attributes.some((attribute) => /^max-age=0$/i.test(attribute.trim()))) jar.delete(name);
    else jar.set(name, value);
  }
}

async function request(baseUrl, path, { jar = new Map(), ...options } = {}) {
  const headers = new Headers(options.headers);
  if (jar.size) headers.set('Cookie', cookieHeader(jar));
  const response = await fetch(`${baseUrl}/api/admin${path}`, { ...options, headers });
  updateCookieJar(response, jar);
  return response;
}

async function getCsrf(baseUrl, jar = new Map()) {
  const response = await request(baseUrl, '/csrf', { jar });
  assert.equal(response.status, 200);
  const body = await response.json();
  return { jar, token: body.data.csrfToken };
}

async function login(baseUrl, jar, csrfToken, password = goodPassword) {
  return request(baseUrl, '/login', {
    jar,
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ email: 'admin@example.com', password }),
  });
}

after(async () => {
  await Promise.all([...servers].map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

test('admin password creation policy and Argon2id hashing are enforced', async () => {
  for (const password of ['Hotel123', 'Manglam2026', 'Hotel1']) {
    assert.equal(isStrongAdminPassword(password), true);
  }
  for (const password of [
    'hotel123',
    'HOTEL123',
    'Hotelabc',
    'Ab123',
    'Hotel1234567890123456',
    'Aabc1',
  ]) {
    assert.equal(isStrongAdminPassword(password), false, `${password.length} characters: ${password}`);
  }
  assert.equal(isStrongAdminPassword('Hotel1!'), true, 'symbols are optional');
  const passwordHash = await argon2.hash(goodPassword, { type: argon2.argon2id });
  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(passwordHash, goodPassword), true);
  assert.equal(await argon2.verify(passwordHash, 'wrong-password'), false);
  assert.equal(normalizeAdminEmail('  ADMIN@Example.com '), 'admin@example.com');
});

test('admin, session and login-attempt models declare safe fields and indexes', async () => {
  const adminRecord = new Admin({
    email: ' ADMIN@EXAMPLE.COM ',
    passwordHash: '$argon2id$fixture',
  });
  await adminRecord.validate();
  assert.equal(adminRecord.email, 'admin@example.com');
  assert.equal(adminRecord.isActive, true);
  assert.equal(Admin.schema.path('passwordHash').options.select, false);
  assert.ok(Admin.schema.indexes().some(([keys, options]) => keys.email === 1 && options.unique));
  assert.equal(Admin.schema.options.timestamps, true);
  assert.equal(AdminSession.schema.path('tokenHash').options.select, false);
  assert.ok(AdminSession.schema.indexes().some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
  assert.ok(AdminLoginAttempt.schema.indexes().some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test('login distinguishes neither unknown email nor incorrect password', async () => {
  resetFixture();
  await addAdmin();
  const baseUrl = await startServer();
  const errors = [];
  for (const emailPassword of [
    { email: 'admin@example.com', password: 'incorrect-password' },
    { email: 'unknown@example.com', password: 'incorrect-password' },
  ]) {
    const { jar, token } = await getCsrf(baseUrl);
    const response = await request(baseUrl, '/login', {
      jar,
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      body: JSON.stringify(emailPassword),
    });
    errors.push([response.status, await response.json()]);
  }
  assert.deepEqual(errors[0], errors[1]);
  assert.equal(errors[0][0], 401);
  assert.deepEqual(errors[0][1], { error: { message: 'Email or password is incorrect.' } });
});

test('active admin can log in, reload the current profile, and log out', async () => {
  resetFixture();
  await addAdmin();
  const baseUrl = await startServer();
  const { jar, token } = await getCsrf(baseUrl);
  const loginResponse = await login(baseUrl, jar, token);
  if (loginResponse.status !== 200) {
    assert.fail(`Login failed: ${await loginResponse.text()}`);
  }
  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.deepEqual(loginBody.data.admin, {
    id: adminId,
    email: 'admin@example.com',
    name: 'Hotel Administrator',
  });
  assert.equal('passwordHash' in loginBody.data.admin, false);
  assert.equal(sessions.size, 1);
  assert.equal([...sessions.values()][0].tokenHash.length, 64);
  assert.equal(
    [...sessions.values()].some((session) => session.tokenHash === hashSessionToken(jar.get('manglam_admin_session'))),
    true,
    'login response should set the matching session cookie',
  );

  const meResponse = await request(baseUrl, '/me', { jar });
  if (meResponse.status !== 200) {
    assert.fail(`Me failed with ${meResponse.status}: ${await meResponse.text()}`);
  }
  assert.equal(meResponse.status, 200);
  assert.deepEqual(await meResponse.json(), { data: { admin: loginBody.data.admin } });
  assert.equal(meResponse.headers.get('cache-control'), 'no-store');
  assert.ok([...sessions.values()][0].lastActivityAt.getTime() >= Date.now() - ADMIN_IDLE_TTL_MS);

  const logoutResponse = await request(baseUrl, '/logout', {
    jar,
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': loginBody.data.csrfToken,
    },
    body: '{}',
  });
  assert.equal(logoutResponse.status, 204);
  assert.equal(sessions.size, 0);
  assert.equal((await request(baseUrl, '/me', { jar })).status, 401);
});

test('inactive admin and missing, expired, or revoked sessions are rejected', async () => {
  resetFixture();
  await addAdmin({ isActive: false });
  const baseUrl = await startServer();
  let { jar, token } = await getCsrf(baseUrl);
  assert.equal((await login(baseUrl, jar, token)).status, 401);
  assert.equal((await request(baseUrl, '/me')).status, 401);

  admins.get('admin@example.com').isActive = true;
  ({ jar, token } = await getCsrf(baseUrl));
  const loginResponse = await login(baseUrl, jar, token);
  const loginBody = await loginResponse.json();
  const session = [...sessions.values()][0];

  const expiredFields = [
    { expiresAt: new Date(0) },
    { idleExpiresAt: new Date(0) },
    { absoluteExpiresAt: new Date(0) },
    { lastActivityAt: new Date(Date.now() - ADMIN_IDLE_TTL_MS - 1000) },
  ];
  for (const [index, fields] of expiredFields.entries()) {
    const token = String.fromCharCode(97 + index).repeat(43);
    const expiredJar = new Map(jar);
    expiredJar.set('manglam_admin_session', token);
    const expiredSession = {
      ...session,
      ...fields,
      _id: `expired-session-${index}`,
      tokenHash: hashSessionToken(token),
    };
    sessions.set(expiredSession._id, expiredSession);
    assert.equal((await request(baseUrl, '/me', { jar: expiredJar })).status, 401);
    assert.equal(sessions.has(expiredSession._id), false);
  }

  sessions.delete(session._id);
  assert.equal((await request(baseUrl, '/me', { jar })).status, 401);
  assert.equal(typeof loginBody.data.admin.email, 'string');
});

test('logout safely clears cookies for an already expired session', async () => {
  resetFixture();
  await addAdmin();
  const baseUrl = await startServer();
  const { jar, token } = await getCsrf(baseUrl);
  const loginResponse = await login(baseUrl, jar, token);
  const loginBody = await loginResponse.json();
  [...sessions.values()][0].expiresAt = new Date(0);
  const response = await request(baseUrl, '/logout', {
    jar,
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': loginBody.data.csrfToken,
    },
    body: '{}',
  });
  assert.equal(response.status, 204);
  assert.equal(sessions.size, 0);
});

test('production cookies use secure __Host names and host-only paths', async () => {
  resetFixture();
  await addAdmin();
  const baseUrl = await startServer({ production: true });
  const { jar, token } = await getCsrf(baseUrl);
  const response = await login(baseUrl, jar, token);
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some((cookie) => cookie.startsWith('__Host-manglam_admin_session=')));
  assert.ok(cookies.some((cookie) => cookie.includes('Path=/') && cookie.includes('Secure') && cookie.includes('HttpOnly')));
  assert.ok(cookies.some((cookie) => cookie.startsWith('__Host-manglam_admin_csrf=')));
});

test('origin, CSRF, content type, and body validation fail closed', async () => {
  resetFixture();
  await addAdmin();
  const baseUrl = await startServer();
  const { jar, token } = await getCsrf(baseUrl);
  const wrongOrigin = await request(baseUrl, '/login', {
    jar,
    method: 'POST',
    headers: {
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify({ email: 'admin@example.com', password: goodPassword }),
  });
  assert.equal(wrongOrigin.status, 403);
  const wrongToken = await request(baseUrl, '/login', {
    jar,
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'invalid',
    },
    body: JSON.stringify({ email: 'admin@example.com', password: goodPassword }),
  });
  assert.equal(wrongToken.status, 403);
  const wrongContentType = await request(baseUrl, '/login', {
    jar,
    method: 'POST',
    headers: { Origin: allowedOrigin, 'X-CSRF-Token': token },
    body: 'email=admin%40example.com',
  });
  assert.equal(wrongContentType.status, 415);
  const malformedBody = await request(baseUrl, '/login', {
    jar,
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify({ email: 'admin@example.com', password: goodPassword, role: 'admin' }),
  });
  assert.equal(malformedBody.status, 400);

  const validLogin = await login(baseUrl, jar, token);
  assert.equal(validLogin.status, 200);
  const validLoginBody = await validLogin.json();
  const mismatchedCsrf = 'd'.repeat(43);
  jar.set('manglam_admin_csrf', mismatchedCsrf);
  const logoutResponse = await request(baseUrl, '/logout', {
    jar,
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': mismatchedCsrf,
    },
    body: '{}',
  });
  assert.equal(logoutResponse.status, 403);
  assert.equal(sessions.size, 1);
  assert.equal(typeof validLoginBody.data.csrfToken, 'string');
});

test('MongoDB-backed limiter blocks additional attempts and sends Retry-After', async () => {
  resetFixture();
  await addAdmin();
  const baseUrl = await startServer();
  let response;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    const { jar, token } = await getCsrf(baseUrl);
    response = await request(baseUrl, '/login', {
      jar,
      method: 'POST',
      headers: {
        Origin: allowedOrigin,
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      body: '{}',
    });
    if (attempt < 10) assert.equal(response.status, 400);
  }
  assert.equal(response.status, 429);
  assert.match(response.headers.get('retry-after'), /^\d+$/);
});

test('auth endpoints return 503 when MongoDB is not ready', async () => {
  resetFixture();
  const baseUrl = await startServer({ databaseReady: false });
  const { jar, token } = await getCsrf(baseUrl);
  const response = await request(baseUrl, '/login', {
    jar,
    method: 'POST',
    headers: {
      Origin: allowedOrigin,
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
    },
    body: JSON.stringify({ email: 'admin@example.com', password: goodPassword }),
  });
  assert.equal(response.status, 503);
  assert.equal((await request(baseUrl, '/me')).status, 503);
});
