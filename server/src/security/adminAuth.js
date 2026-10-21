import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { Router } from 'express';
import { HttpError } from '../utils/http.js';

export const ADMIN_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
export const ADMIN_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_MAX_ATTEMPTS = 10;

const DUMMY_PASSWORD_HASH = argon2.hash(randomBytes(32), { type: argon2.argon2id });

export function normalizeAdminEmail(email) {
  return email.trim().toLowerCase();
}

export function isValidAdminEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongAdminPassword(password) {
  return typeof password === 'string'
    && password.length >= 6
    && password.length <= 20
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader !== 'string') return null;
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function safeEqual(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string') return false;
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function cookieNames(production) {
  return production
    ? { session: '__Host-manglam_admin_session', csrf: '__Host-manglam_admin_csrf' }
    : { session: 'manglam_admin_session', csrf: 'manglam_admin_csrf' };
}

function commonCookieOptions(production) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'strict',
    path: '/',
  };
}

function setCsrfCookie(response, csrfCookieName, token, production) {
  response.cookie(csrfCookieName, token, {
    ...commonCookieOptions(production),
    maxAge: ADMIN_ABSOLUTE_TTL_MS,
  });
}

function clearCsrfCookie(response, csrfCookieName, production) {
  response.clearCookie(csrfCookieName, commonCookieOptions(production));
}

function setSessionCookie(response, sessionCookieName, token, production, absoluteExpiresAt) {
  response.cookie(sessionCookieName, token, {
    ...commonCookieOptions(production),
    sameSite: 'lax',
    expires: absoluteExpiresAt,
  });
}

function clearSessionCookie(response, sessionCookieName, production) {
  response.clearCookie(sessionCookieName, {
    ...commonCookieOptions(production),
    sameSite: 'lax',
  });
}

export function safeAdminProfile(admin) {
  return {
    id: String(admin._id),
    email: admin.email,
    ...(admin.name ? { name: admin.name } : {}),
  };
}

function assertAllowedOrigin(request, allowedOrigins) {
  const origin = request.get('origin');
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new HttpError(403, 'Request origin is not allowed.');
  }
  if (request.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Cross-site requests are not allowed.');
  }
}

function assertJsonRequest(request) {
  if (!request.is('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
}

function assertCsrf(request, csrfCookieName) {
  const cookieToken = getCookie(request, csrfCookieName);
  const headerToken = request.get('x-csrf-token');
  if (
    !cookieToken
    || !headerToken
    || !/^[A-Za-z0-9_-]{40,64}$/.test(cookieToken)
    || !safeEqual(cookieToken, headerToken)
  ) {
    throw new HttpError(403, 'CSRF validation failed.');
  }
  return cookieToken;
}

async function readActiveSession(request, models, sessionCookieName, now = new Date()) {
  const token = getCookie(request, sessionCookieName);
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const tokenHash = hashSessionToken(token);
  const session = await models.AdminSession.findOne({ tokenHash })
    .select('+csrfTokenHash')
    .lean();
  if (!session) return null;

  const idleCutoff = new Date(now.getTime() - ADMIN_IDLE_TTL_MS);
  if (
    session.lastActivityAt <= idleCutoff
    || session.idleExpiresAt <= now
    || session.absoluteExpiresAt <= now
    || session.expiresAt <= now
  ) {
    await models.AdminSession.deleteOne({ _id: session._id });
    return null;
  }

  const admin = await models.Admin.findById(session.adminId)
    .select('_id email name isActive')
    .lean();
  if (!admin?.isActive) {
    await models.AdminSession.deleteOne({ _id: session._id });
    return null;
  }

  const idleExpiresAt = new Date(Math.min(
    now.getTime() + ADMIN_IDLE_TTL_MS,
    session.absoluteExpiresAt.getTime(),
  ));
  const updated = await models.AdminSession.updateOne(
    {
      _id: session._id,
      lastActivityAt: { $gt: idleCutoff },
      absoluteExpiresAt: { $gt: now },
      expiresAt: { $gt: now },
    },
    { $set: { lastActivityAt: now, idleExpiresAt, expiresAt: idleExpiresAt } },
  );
  if (updated.matchedCount !== 1) {
    await models.AdminSession.deleteOne({ _id: session._id });
    return null;
  }

  return {
    admin,
    session: {
      _id: session._id,
      adminId: session.adminId,
      createdAt: session.createdAt,
      lastActivityAt: now,
      idleExpiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      expiresAt: idleExpiresAt,
      csrfTokenHash: session.csrfTokenHash,
    },
  };
}

async function consumeLoginAttempt(models, request, now = new Date()) {
  const windowIndex = Math.floor(now.getTime() / ADMIN_LOGIN_WINDOW_MS);
  const key = hashSessionToken(`${request.ip}:${windowIndex}`);
  const windowEndsAt = new Date((windowIndex + 1) * ADMIN_LOGIN_WINDOW_MS);
  const expiresAt = new Date((windowIndex + 2) * ADMIN_LOGIN_WINDOW_MS);
  let bucket;
  try {
    bucket = await models.AdminLoginAttempt.findOneAndUpdate(
      { windowKey: key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    bucket = await models.AdminLoginAttempt.findOneAndUpdate(
      { windowKey: key },
      { $inc: { count: 1 } },
      { returnDocument: 'after' },
    ).lean();
  }
  if (bucket.count > ADMIN_LOGIN_MAX_ATTEMPTS) {
    const error = new HttpError(429, 'Too many login attempts. Please try again later.');
    error.retryAfterSeconds = Math.max(1, Math.ceil((windowEndsAt.getTime() - now.getTime()) / 1000));
    throw error;
  }
}

function validateLoginBody(body) {
  if (
    !body
    || typeof body !== 'object'
    || Array.isArray(body)
    || Object.keys(body).some((key) => !['email', 'password'].includes(key))
    || !isValidAdminEmail(body.email)
    || typeof body.password !== 'string'
    || body.password.length < 1
    || body.password.length > 128
  ) {
    throw new HttpError(400, 'Provide a valid email address and password.');
  }
}

export function createRequireAdmin({ models, isDatabaseReady, sessionCookieName, production }) {
  return async function requireAdmin(request, response, next) {
    response.set('Cache-Control', 'no-store');
    if (!isDatabaseReady()) return next(new HttpError(503, 'Database is currently unavailable.'));

    try {
      const authentication = await readActiveSession(request, models, sessionCookieName);
      if (!authentication) {
        clearSessionCookie(response, sessionCookieName, production);
        return next(new HttpError(401, 'Authentication is required.'));
      }
      request.admin = safeAdminProfile(authentication.admin);
      request.adminSession = authentication.session;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

// Share exactly the same cookies, active-session checks and CSRF rules with
// management routes. CSRF must also be bound to the authenticated session.
export function createAdminProtection({
  models,
  isDatabaseReady,
  allowedOrigins,
  production = false,
  allowMultipart = false,
}) {
  const { session: sessionCookieName, csrf: csrfCookieName } = cookieNames(production);
  const requireAdmin = createRequireAdmin({ models, isDatabaseReady, sessionCookieName, production });
  function protectRequest(request, _response, next) {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        assertAllowedOrigin(request, allowedOrigins);
        const multipartAllowed = typeof allowMultipart === 'function'
          ? allowMultipart(request)
          : allowMultipart;
        if (!(multipartAllowed && request.is('multipart/form-data'))) assertJsonRequest(request);
        const token = assertCsrf(request, csrfCookieName);
        if (!safeEqual(request.adminSession.csrfTokenHash, hashSessionToken(token))) {
          throw new HttpError(403, 'CSRF validation failed.');
        }
      } else if ((request.get('origin') && !allowedOrigins.includes(request.get('origin')))
        || request.get('sec-fetch-site') === 'cross-site') {
        throw new HttpError(403, 'Request origin is not allowed.');
      }
      next();
    } catch (error) { next(error); }
  }
  return [requireAdmin, protectRequest];
}

export function createAdminAuthRouter({
  models,
  isDatabaseReady,
  allowedOrigins,
  production = false,
}) {
  const router = Router();
  const { session: sessionCookieName, csrf: csrfCookieName } = cookieNames(production);
  const requireAdmin = createRequireAdmin({
    models,
    isDatabaseReady,
    sessionCookieName,
    production,
  });

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/csrf', async (request, response, next) => {
    try {
      if (request.get('origin') && !allowedOrigins.includes(request.get('origin'))) {
        throw new HttpError(403, 'Request origin is not allowed.');
      }
      const token = createOpaqueToken();
      const authentication = isDatabaseReady()
        ? await readActiveSession(request, models, sessionCookieName)
        : null;
      if (authentication) {
        await models.AdminSession.updateOne(
          { _id: authentication.session._id },
          { $set: { csrfTokenHash: hashSessionToken(token) } },
        );
      }
      setCsrfCookie(response, csrfCookieName, token, production);
      response.json({ data: { csrfToken: token } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', async (request, response, next) => {
    try {
      assertAllowedOrigin(request, allowedOrigins);
      assertJsonRequest(request);
      assertCsrf(request, csrfCookieName);
      if (!isDatabaseReady()) throw new HttpError(503, 'Database is currently unavailable.');
      await consumeLoginAttempt(models, request);
      validateLoginBody(request.body);

      const email = normalizeAdminEmail(request.body.email);
      const admin = await models.Admin.findOne({ email })
        .select('+passwordHash')
        .lean();
      const passwordHash = admin?.passwordHash ?? await DUMMY_PASSWORD_HASH;
      const passwordMatches = await argon2.verify(passwordHash, request.body.password);
      if (!admin || !admin.isActive || !passwordMatches) {
        throw new HttpError(401, 'Email or password is incorrect.');
      }

      const existingSessionToken = getCookie(request, sessionCookieName);
      if (existingSessionToken) {
        await models.AdminSession.deleteOne({ tokenHash: hashSessionToken(existingSessionToken) });
      }

      const now = new Date();
      const absoluteExpiresAt = new Date(now.getTime() + ADMIN_ABSOLUTE_TTL_MS);
      const csrfToken = createOpaqueToken();
      const sessionToken = createOpaqueToken();
      await models.AdminSession.create({
        adminId: admin._id,
        tokenHash: hashSessionToken(sessionToken),
        csrfTokenHash: hashSessionToken(csrfToken),
        createdAt: now,
        lastActivityAt: now,
        idleExpiresAt: new Date(now.getTime() + ADMIN_IDLE_TTL_MS),
        absoluteExpiresAt,
        expiresAt: new Date(now.getTime() + ADMIN_IDLE_TTL_MS),
      });
      clearCsrfCookie(response, csrfCookieName, production);
      setSessionCookie(response, sessionCookieName, sessionToken, production, absoluteExpiresAt);
      setCsrfCookie(response, csrfCookieName, csrfToken, production);
      response.json({ data: { admin: safeAdminProfile(admin), csrfToken } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAdmin, (request, response) => {
    response.json({ data: { admin: request.admin } });
  });

  router.post('/logout', async (request, response, next) => {
    try {
      assertAllowedOrigin(request, allowedOrigins);
      assertJsonRequest(request);
      assertCsrf(request, csrfCookieName);
      if (!isDatabaseReady()) throw new HttpError(503, 'Database is currently unavailable.');

      const sessionToken = getCookie(request, sessionCookieName);
      if (sessionToken && /^[A-Za-z0-9_-]{40,64}$/.test(sessionToken)) {
        const tokenHash = hashSessionToken(sessionToken);
        const session = await models.AdminSession.findOne({ tokenHash })
          .select('+csrfTokenHash')
          .lean();
        if (
          session
          && session.expiresAt > new Date()
          && !safeEqual(
            session.csrfTokenHash,
            hashSessionToken(getCookie(request, csrfCookieName)),
          )
        ) {
          throw new HttpError(403, 'CSRF validation failed.');
        }
        await models.AdminSession.deleteOne({ tokenHash });
      }

      clearSessionCookie(response, sessionCookieName, production);
      clearCsrfCookie(response, csrfCookieName, production);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
