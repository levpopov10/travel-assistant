import express from 'express';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(securityHeaders);
app.use(express.json());
app.use(simpleRateLimit);
app.use(requestLogger);

const PORT = process.env.PORT || 3001;
const RATE_API_KEY = process.env.RATE_API_KEY || 'd3ad0777ab37e159d0b181696cc94023';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_SESSIONS_PER_USER = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_DB_DIR = path.join(__dirname, 'data');
const USERS_DB_FILE = path.join(USERS_DB_DIR, 'users.json');
const AUDIT_LOG_FILE = path.join(USERS_DB_DIR, 'audit.log');
const SERVER_LOG_FILE = path.join(USERS_DB_DIR, 'server.log');
const API_KEYS_FILE = path.join(USERS_DB_DIR, 'api_keys.json');
const WEBHOOKS_FILE = path.join(USERS_DB_DIR, 'webhooks.json');
const MAX_HISTORY_ITEMS = 10;
const rateLimitStore = new Map();

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}

async function appendServerLog(record) {
  try {
    await ensureUsersDb();
    await fs.appendFile(SERVER_LOG_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // ignore logger failures
  }
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const requestId = crypto.randomBytes(8).toString('hex');
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const rawIp =
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    appendServerLog({
      at: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: clip(rawIp, 120),
      userAgent: clip(req.headers['user-agent'] || '', 240),
    });
  });

  next();
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(testHash, 'hex'));
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function hashToken(token = '') {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isValidEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

function clip(value = '', maxLen = 200) {
  return String(value).trim().slice(0, maxLen);
}

function sanitizeSession(session) {
  if (!session || typeof session !== 'object') return null;
  const tokenHash = clip(session.tokenHash, 256);
  const createdAt = clip(session.createdAt, 80);
  const expiresAt = clip(session.expiresAt, 80);
  if (!tokenHash || !createdAt || !expiresAt) return null;
  return { tokenHash, createdAt, expiresAt };
}

function pruneSessions(input = []) {
  const now = Date.now();
  return input
    .map(sanitizeSession)
    .filter(Boolean)
    .filter((session) => {
      const ts = Date.parse(session.expiresAt);
      return !Number.isNaN(ts) && ts > now;
    })
    .slice(0, MAX_SESSIONS_PER_USER);
}

function issueSession(user) {
  const token = makeToken();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const sessions = [
    { tokenHash: hashToken(token), createdAt: nowIso, expiresAt },
    ...pruneSessions(user.sessions),
  ].slice(0, MAX_SESSIONS_PER_USER);
  return { token, sessions };
}

function getBearerToken(req) {
  const auth = clip(req.headers.authorization || '', 500);
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

function simpleRateLimit(req, res, next) {
  try {
    const now = Date.now();
    const rawIp =
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const ip = String(rawIp);
    const entry = rateLimitStore.get(ip);

    if (!entry || now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.set(ip, { startedAt: now, count: 1 });
      return next();
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
      const retryAfter = Math.max(
        1,
        Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.startedAt)) / 1000)
      );
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'too many requests' });
    }

    entry.count += 1;
    rateLimitStore.set(ip, entry);
    return next();
  } catch {
    return next();
  }
}

function findUserByBearer(users, req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = Date.now();
  return users.find((user) =>
    pruneSessions(user.sessions).some((session) => {
      const expiresAt = Date.parse(session.expiresAt);
      return session.tokenHash === tokenHash && !Number.isNaN(expiresAt) && expiresAt > now;
    })
  );
}

function sanitizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const destination = String(entry.destination || '').trim();
  if (!destination) return null;
  const origin = String(entry.origin || '').trim();
  const createdAt = String(entry.createdAt || '').trim();
  const rawId = String(entry.id || '').trim();
  return {
    id: rawId || `${createdAt}|${origin}|${destination}`,
    origin,
    destination,
    createdAt,
  };
}

function sanitizePushSubscription(input) {
  if (!input || typeof input !== 'object') return null;
  const endpoint = clip(input.endpoint, 2000);
  if (!endpoint) return null;
  const keys =
    input.keys && typeof input.keys === 'object'
      ? {
          p256dh: clip(input.keys.p256dh, 500),
          auth: clip(input.keys.auth, 500),
        }
      : { p256dh: '', auth: '' };
  return {
    endpoint,
    keys,
    createdAt: new Date().toISOString(),
  };
}

function sanitizeNotificationPrefs(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    enabled: Boolean(src.enabled),
    weather: src.weather !== false,
    safety: src.safety !== false,
    reminders: src.reminders !== false,
  };
}

function normalizeRole(inputRole = '') {
  const role = clip(inputRole || 'user', 20).toLowerCase();
  if (role === 'admin') return 'admin';
  return 'user';
}

function normalizeAdminLevel(inputLevel) {
  const num = Number(inputLevel || 0) || 0;
  // normalize to 1..3 where 1 = top admin, 3 = read-only
  const lvl = Math.max(1, Math.min(3, Math.floor(num) || 3));
  return lvl;
}

function normalizePlan(inputPlan = '') {
  const plan = clip(inputPlan || 'free', 20).toLowerCase();
  if (plan === 'pro') return 'pro';
  return 'free';
}

function normalizePlanStatus(inputStatus = '') {
  const status = clip(inputStatus || '', 20).toLowerCase();
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'canceled';
  return 'inactive';
}

function normalizeIsoDate(input = '') {
  const value = clip(input || '', 80);
  if (!value) return '';
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return '';
  return new Date(ts).toISOString();
}

function normalizeUserRecord(rawUser) {
  const user = rawUser && typeof rawUser === 'object' ? rawUser : {};
  const normalizedHistory = Array.isArray(user.searchHistory)
    ? user.searchHistory.map(sanitizeHistoryEntry).filter(Boolean).slice(0, MAX_HISTORY_ITEMS)
    : [];
  const normalizedSessions = Array.isArray(user.sessions) ? pruneSessions(user.sessions) : [];
  const normalizedPushSubscriptions = Array.isArray(user.pushSubscriptions)
    ? user.pushSubscriptions.map(sanitizePushSubscription).filter(Boolean).slice(0, 20)
    : [];
  const normalizedNotificationPrefs = sanitizeNotificationPrefs(user.notificationPrefs);
  const normalizedNotificationQueue = Array.isArray(user.notificationQueue)
    ? user.notificationQueue
        .map((item) =>
          item && typeof item === 'object'
            ? {
                id: clip(item.id || '', 120) || `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
                type: clip(item.type || 'info', 40),
                title: clip(item.title || '', 160),
                body: clip(item.body || '', 400),
                createdAt: clip(item.createdAt || new Date().toISOString(), 80),
                readAt: clip(item.readAt || '', 80),
              }
            : null
        )
        .filter(Boolean)
        .slice(0, 200)
    : [];

  return {
    ...user,
    adminLevel: normalizeAdminLevel(user.adminLevel),
    role: normalizeRole(user.role),
    plan: normalizePlan(user.plan),
    planStatus: normalizePlanStatus(user.planStatus),
    planExpiresAt: normalizeIsoDate(user.planExpiresAt),
    searchHistory: normalizedHistory,
    sessions: normalizedSessions,
    pushSubscriptions: normalizedPushSubscriptions,
    notificationPrefs: normalizedNotificationPrefs,
    notificationQueue: normalizedNotificationQueue,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (!entry || now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

async function ensureUsersDb() {
  await fs.mkdir(USERS_DB_DIR, { recursive: true });
  try {
    await fs.access(USERS_DB_FILE);
  } catch {
    await fs.writeFile(USERS_DB_FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
  try {
    await fs.access(API_KEYS_FILE);
  } catch {
    await fs.writeFile(API_KEYS_FILE, JSON.stringify({ keys: [] }, null, 2), 'utf8');
  }
  try {
    await fs.access(WEBHOOKS_FILE);
  } catch {
    await fs.writeFile(WEBHOOKS_FILE, JSON.stringify({ webhooks: [] }, null, 2), 'utf8');
  }
}

async function readJsonFile(filePath, key) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return Array.isArray(parsed[key]) ? parsed[key] : [];
  } catch {
    return [];
  }
}

async function writeJsonFile(filePath, key, items) {
  const obj = { [key]: items };
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

async function readUsersDb() {
  await ensureUsersDb();
  const raw = await fs.readFile(USERS_DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.users) ? parsed.users.map(normalizeUserRecord) : [];
  } catch {
    return [];
  }
}

async function writeUsersDb(users) {
  await ensureUsersDb();
  await fs.writeFile(
    USERS_DB_FILE,
    JSON.stringify({ users: users.map(normalizeUserRecord) }, null, 2),
    'utf8'
  );
}

async function appendAudit(event, req, payload = {}) {
  try {
    await ensureUsersDb();
    const rawIp =
      String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const record = {
      at: new Date().toISOString(),
      event: clip(event, 80),
      ip: clip(rawIp, 120),
      userId: clip(payload.userId || '', 80),
      email: normalizeEmail(payload.email || ''),
      status: clip(payload.status || '', 40),
      reason: clip(payload.reason || '', 200),
    };
    await fs.appendFile(AUDIT_LOG_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    // ignore audit logger failures
  }
}

async function requireUserAuth(req, res, next) {
  try {
    const requestedUserId = clip(req.params.userId || '', 80);
    const users = await readUsersDb();
    const user = findUserByBearer(users, req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    // allow admins to act on other users; otherwise require user id match
    if (requestedUserId && user.id !== requestedUserId && normalizeRole(user.role) !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }
    req.authUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: normalizeRole(user.role),
      adminLevel: normalizeAdminLevel(user.adminLevel),
    };
    return next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'auth check failed' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const currentRole = normalizeRole(req.authUser?.role);
    if (currentRole !== normalizeRole(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  };
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = clip(req.body?.name, 80);
    const email = normalizeEmail(clip(req.body?.email, 160));
    const password = String(req.body?.password || '').slice(0, 256);

    if (!name || !email || !password) {
      await appendAudit('auth.register', req, { email, status: 'reject', reason: 'missing_fields' });
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!isValidEmail(email)) {
      await appendAudit('auth.register', req, { email, status: 'reject', reason: 'invalid_email' });
      return res.status(400).json({ error: 'invalid email format' });
    }
    if (password.length < 6) {
      await appendAudit('auth.register', req, { email, status: 'reject', reason: 'weak_password' });
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    const users = await readUsersDb();
    const exists = users.some((u) => normalizeEmail(u.email) === email);
    if (exists) {
      await appendAudit('auth.register', req, { email, status: 'reject', reason: 'already_exists' });
      return res.status(409).json({ error: 'user already exists' });
    }

    const { token, sessions } = issueSession({});
    const hasAdmin = users.some((u) => normalizeRole(u.role) === 'admin');
    const user = {
      id: Date.now().toString(36),
      name,
      email,
      role: hasAdmin ? 'user' : 'admin',
      adminLevel: hasAdmin ? 3 : 1,
      plan: 'free',
      planStatus: 'inactive',
      planExpiresAt: '',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      searchHistory: [],
      sessions,
    };
    users.push(user);
    await writeUsersDb(users);
    await appendAudit('auth.register', req, { userId: user.id, email, status: 'ok' });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        adminLevel: normalizeAdminLevel(user.adminLevel),
        plan: normalizePlan(user.plan),
        planStatus: normalizePlanStatus(user.planStatus),
        planExpiresAt: normalizeIsoDate(user.planExpiresAt),
      },
    });
  } catch (err) {
    console.error(err);
    await appendAudit('auth.register', req, { email: req.body?.email, status: 'error', reason: 'exception' });
    return res.status(500).json({ error: 'register failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const rawIdentifier = clip(req.body?.identifier || req.body?.email || '', 160);
    const identifier = rawIdentifier.toLowerCase();
    const password = String(req.body?.password || '').slice(0, 256);
    if (!identifier || !password) {
      await appendAudit('auth.login', req, { email: identifier, status: 'reject', reason: 'missing_fields' });
      return res.status(400).json({ error: 'login/email and password are required' });
    }

    const users = await readUsersDb();
    const user = users.find((u) => {
      const emailMatch = normalizeEmail(u.email) === identifier;
      const loginMatch = String(u.name || '').trim().toLowerCase() === identifier;
      return emailMatch || loginMatch;
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await appendAudit('auth.login', req, { email: identifier, status: 'reject', reason: 'invalid_credentials' });
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const userIndex = users.findIndex((u) => u.id === user.id);
    if (userIndex === -1) {
      await appendAudit('auth.login', req, { email: identifier, status: 'reject', reason: 'user_not_found' });
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const { token, sessions } = issueSession(user);
    users[userIndex] = {
      ...users[userIndex],
      sessions,
    };
    await writeUsersDb(users);
    await appendAudit('auth.login', req, { userId: user.id, email: user.email, status: 'ok' });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        adminLevel: normalizeAdminLevel(user.adminLevel),
        plan: normalizePlan(user.plan),
        planStatus: normalizePlanStatus(user.planStatus),
        planExpiresAt: normalizeIsoDate(user.planExpiresAt),
      },
    });
  } catch (err) {
    console.error(err);
    await appendAudit('auth.login', req, { email: req.body?.identifier || req.body?.email, status: 'error', reason: 'exception' });
    return res.status(500).json({ error: 'login failed' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const users = await readUsersDb();
    const user = findUserByBearer(users, req);
    if (!user) {
      await appendAudit('auth.me', req, { status: 'reject', reason: 'unauthorized' });
      return res.status(401).json({ error: 'unauthorized' });
    }
    await appendAudit('auth.me', req, { userId: user.id, email: user.email, status: 'ok' });
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user.role),
        adminLevel: normalizeAdminLevel(user.adminLevel),
        plan: normalizePlan(user.plan),
        planStatus: normalizePlanStatus(user.planStatus),
        planExpiresAt: normalizeIsoDate(user.planExpiresAt),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to resolve session' });
  }
});

app.get('/api/billing/plans', async (_req, res) => {
  return res.json({
    plans: [
      { id: 'free', name: 'Free', price: 0, interval: 'month' },
      { id: 'pro', name: 'Pro', price: 0, interval: 'month', demo: true },
    ],
  });
});

app.post('/api/billing/demo/upgrade', requireUserAuth, async (req, res) => {
  try {
    const authUserId = clip(req.authUser?.id || '', 80);
    if (!authUserId) return res.status(401).json({ error: 'unauthorized' });

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === authUserId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    users[userIndex] = {
      ...users[userIndex],
      plan: 'pro',
      planStatus: 'active',
      planExpiresAt: expiresAt,
    };
    await writeUsersDb(users);
    await appendAudit('billing.demo.upgrade', req, { userId: authUserId, email: users[userIndex].email, status: 'ok' });
    const u = normalizeUserRecord(users[userIndex]);
    return res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: normalizeRole(u.role),
        plan: normalizePlan(u.plan),
        planStatus: normalizePlanStatus(u.planStatus),
        planExpiresAt: normalizeIsoDate(u.planExpiresAt),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to upgrade demo subscription' });
  }
});

app.post('/api/billing/demo/cancel', requireUserAuth, async (req, res) => {
  try {
    const authUserId = clip(req.authUser?.id || '', 80);
    if (!authUserId) return res.status(401).json({ error: 'unauthorized' });

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === authUserId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });

    users[userIndex] = {
      ...users[userIndex],
      plan: 'free',
      planStatus: 'inactive',
      planExpiresAt: '',
    };
    await writeUsersDb(users);
    await appendAudit('billing.demo.cancel', req, { userId: authUserId, email: users[userIndex].email, status: 'ok' });
    const u = normalizeUserRecord(users[userIndex]);
    return res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: normalizeRole(u.role),
        plan: normalizePlan(u.plan),
        planStatus: normalizePlanStatus(u.planStatus),
        planExpiresAt: normalizeIsoDate(u.planExpiresAt),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to cancel demo subscription' });
  }
});

app.get('/api/admin/users', requireUserAuth, requireRole('admin'), async (_req, res) => {
  try {
    const users = await readUsersDb();
    const items = users.map((u) => {
      const nu = normalizeUserRecord(u);
      return {
        id: nu.id,
        name: nu.name,
        email: nu.email,
        role: normalizeRole(nu.role),
        adminLevel: normalizeAdminLevel(nu.adminLevel),
        plan: normalizePlan(nu.plan),
        planStatus: normalizePlanStatus(nu.planStatus),
        planExpiresAt: normalizeIsoDate(nu.planExpiresAt),
        createdAt: normalizeIsoDate(nu.createdAt),
      };
    });
    return res.json({ items, total: items.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to load users' });
  }
});

// CSV export endpoints
app.get('/api/admin/export/users', requireUserAuth, requireRole('admin'), async (_req, res) => {
  try {
    const users = await readUsersDb();
    const header = 'id,name,email,role,adminLevel,plan,planStatus,createdAt\n';
    const lines = users.map((u) => {
      const nu = normalizeUserRecord(u);
      return [nu.id, nu.name, nu.email, normalizeRole(nu.role), normalizeAdminLevel(nu.adminLevel), normalizePlan(nu.plan), normalizePlanStatus(nu.planStatus), normalizeIsoDate(nu.createdAt)]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',');
    });
    res.setHeader('Content-Type', 'text/csv');
    res.send(header + lines.join('\n'));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to export users' });
  }
});

app.get('/api/admin/export/audit', requireUserAuth, requireRole('admin'), async (_req, res) => {
  try {
    await ensureUsersDb();
    const raw = await fs.readFile(AUDIT_LOG_FILE, 'utf8').catch(() => '');
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          const obj = JSON.parse(l);
          return [obj.at, obj.event, obj.email, obj.userId, obj.status, obj.reason].map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(',');
        } catch {
          return '"' + l.replace(/"/g, '""') + '"';
        }
      });
    res.setHeader('Content-Type', 'text/csv');
    res.send('at,event,email,userId,status,reason\n' + lines.join('\n'));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to export audit' });
  }
});

// CSV import (users) - top-level admin only
app.post('/api/admin/import/users', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    const actorLevel = normalizeAdminLevel(req.authUser.adminLevel);
    if (actorLevel !== 1) return res.status(403).json({ error: 'only_top_level_can_import' });
    const bodyText = String(req.body?.csv || '');
    if (!bodyText) return res.status(400).json({ error: 'csv body required (send JSON { csv: "..." })' });
    const rows = bodyText.split('\n').map((r) => r.trim()).filter(Boolean);
    // assume header exists
    const header = rows.shift() || '';
    const created = [];
    for (const row of rows) {
      // naive CSV split by comma, trim quotes
      const cols = row.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const [id, name, email, role, adminLevelRaw] = cols;
      if (!email || !isValidEmail(email)) continue;
      const users = await readUsersDb();
      const exists = users.some((u) => normalizeEmail(u.email) === normalizeEmail(email));
      if (exists) continue;
      const newUser = {
        id: Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
        name: name || '',
        email,
        role: role === 'admin' ? 'admin' : 'user',
        adminLevel: normalizeAdminLevel(Number(adminLevelRaw) || 3),
        plan: 'free',
        planStatus: 'inactive',
        planExpiresAt: '',
        passwordHash: '',
        createdAt: new Date().toISOString(),
        searchHistory: [],
        sessions: [],
      };
      users.push(newUser);
      await writeUsersDb(users);
      created.push(newUser.email);
    }
    await appendAudit('admin.import.users', req, { email: req.authUser.email, status: 'ok', reason: `created:${created.length}` });
    return res.json({ created });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to import users' });
  }
});

// Update user fields (name, email) - admin only; actor must have higher privilege than target
app.patch('/api/admin/users/:userId', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const users = await readUsersDb();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'user not found' });

    const target = normalizeUserRecord(users[idx]);
    const actorLevel = normalizeAdminLevel(req.authUser.adminLevel);
    const targetLevel = normalizeAdminLevel(target.adminLevel);
    if (!(actorLevel < targetLevel || (actorLevel === 2 && targetLevel === 2))) {
      return res.status(403).json({ error: 'insufficient_admin_level' });
    }

    const name = clip(req.body?.name || target.name, 80);
    const email = normalizeEmail(clip(req.body?.email || target.email, 160));

    users[idx] = {
      ...users[idx],
      name,
      email,
    };
    await writeUsersDb(users);
    await appendAudit('admin.user.update', req, { userId, email, status: 'ok' });
    const u = normalizeUserRecord(users[idx]);
    return res.json({ user: { id: u.id, name: u.name, email: u.email, role: normalizeRole(u.role), adminLevel: normalizeAdminLevel(u.adminLevel) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to update user' });
  }
});

app.patch('/api/admin/users/:userId/subscription', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const plan = normalizePlan(req.body?.plan || '');
    const planStatus = plan === 'pro' ? normalizePlanStatus(req.body?.planStatus || 'active') : 'inactive';
    const planExpiresAt = plan === 'pro' ? normalizeIsoDate(req.body?.planExpiresAt || '') : '';

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });

      const target = normalizeUserRecord(users[userIndex]);
      const actorLevel = normalizeAdminLevel(req.authUser.adminLevel);
      const targetLevel = normalizeAdminLevel(target.adminLevel);
      if (!(actorLevel < targetLevel || (actorLevel === 2 && targetLevel === 2))) {
        return res.status(403).json({ error: 'insufficient_admin_level' });
      }

    users[userIndex] = {
      ...users[userIndex],
      plan,
      planStatus,
      planExpiresAt,
    };
    await writeUsersDb(users);
    await appendAudit('admin.user.subscription', req, { userId, email: users[userIndex].email, status: 'ok' });

    const u = normalizeUserRecord(users[userIndex]);
    return res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: normalizeRole(u.role),
        plan: normalizePlan(u.plan),
        planStatus: normalizePlanStatus(u.planStatus),
        planExpiresAt: normalizeIsoDate(u.planExpiresAt),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to update subscription' });
  }
});

// Change user role (admin only)
app.patch('/api/admin/users/:userId/role', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const role = normalizeRole(String(req.body?.role || 'user'));
    const requestedLevel = normalizeAdminLevel(req.body?.adminLevel);

    // Only allow admin changes if current user has higher adminLevel than target
    const users = await readUsersDb();
    const targetIndex = users.findIndex((u) => u.id === userId);
    if (targetIndex === -1) return res.status(404).json({ error: 'user not found' });
    const targetUser = normalizeUserRecord(users[targetIndex]);
    if (normalizeRole(req.authUser.role) !== 'admin') return res.status(403).json({ error: 'forbidden' });
    const actorLevel = normalizeAdminLevel(req.authUser.adminLevel);

    // If attempting to grant or demote admin or set adminLevel, only top-level admin (1) can do that
    const grantingAdmin = role === 'admin' && normalizeRole(targetUser.role) !== 'admin';
    const demotingAdmin = normalizeRole(targetUser.role) === 'admin' && role !== 'admin';
    if (grantingAdmin || demotingAdmin || (typeof requestedLevel === 'number' && requestedLevel >= 1)) {
      if (actorLevel !== 1) {
        return res.status(403).json({ error: 'only_top_level_can_manage_admins' });
      }
    }

    // otherwise require actor to have strictly higher privilege (lower numeric level)
    if (!(actorLevel < normalizeAdminLevel(targetUser.adminLevel))) {
      return res.status(403).json({ error: 'insufficient_admin_level' });
    }

    // apply changes
    users[targetIndex] = {
      ...users[targetIndex],
      role,
      adminLevel: requestedLevel || users[targetIndex].adminLevel || 3,
    };
    await writeUsersDb(users);
    await appendAudit('admin.user.role', req, { userId, email: users[targetIndex].email, status: 'ok' });

    const u = normalizeUserRecord(users[targetIndex]);
    return res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: normalizeRole(u.role),
        adminLevel: normalizeAdminLevel(u.adminLevel),
        plan: normalizePlan(u.plan),
        planStatus: normalizePlanStatus(u.planStatus),
        planExpiresAt: normalizeIsoDate(u.planExpiresAt),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to update role' });
  }
});

// Delete user (admin only) - prevent deleting self
app.delete('/api/admin/users/:userId', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    // prevent admin deleting themselves
    if (req.authUser && req.authUser.id === userId) {
      return res.status(400).json({ error: 'cannot delete yourself' });
    }

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });

    const target = normalizeUserRecord(users[userIndex]);
    const actorLevel = normalizeAdminLevel(req.authUser.adminLevel);
    const targetLevel = normalizeAdminLevel(target.adminLevel);
    if (!(actorLevel < targetLevel || (actorLevel === 2 && targetLevel === 2))) {
      return res.status(403).json({ error: 'insufficient_admin_level' });
    }

    const removed = users.splice(userIndex, 1)[0];
    await writeUsersDb(users);
    await appendAudit('admin.user.delete', req, { userId, email: removed?.email || '', status: 'ok' });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to delete user' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      await appendAudit('auth.logout', req, { status: 'reject', reason: 'no_token' });
      return res.status(401).json({ error: 'unauthorized' });
    }
    const tokenHash = hashToken(token);
    const users = await readUsersDb();
    const userIndex = users.findIndex((u) =>
      pruneSessions(u.sessions).some((session) => session.tokenHash === tokenHash)
    );
    if (userIndex === -1) {
      await appendAudit('auth.logout', req, { status: 'reject', reason: 'invalid_session' });
      return res.status(401).json({ error: 'unauthorized' });
    }

    users[userIndex] = {
      ...users[userIndex],
      sessions: pruneSessions(users[userIndex].sessions).filter((s) => s.tokenHash !== tokenHash),
    };
    await writeUsersDb(users);
    await appendAudit('auth.logout', req, {
      userId: users[userIndex].id,
      email: users[userIndex].email,
      status: 'ok',
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'logout failed' });
  }
});

// API keys endpoints (allow admin levels 1 and 2 to manage)
function allowIntegrationManager(req) {
  const lvl = normalizeAdminLevel(req.authUser?.adminLevel);
  return lvl <= 2; // 1 or 2
}

app.get('/api/admin/api-keys', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!allowIntegrationManager(req)) return res.status(403).json({ error: 'insufficient_admin_level' });
    const keys = await readJsonFile(API_KEYS_FILE, 'keys');
    return res.json({ items: keys });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to list api keys' });
  }
});

app.post('/api/admin/api-keys', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!allowIntegrationManager(req)) return res.status(403).json({ error: 'insufficient_admin_level' });
    const keys = await readJsonFile(API_KEYS_FILE, 'keys');
    const id = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    const secret = crypto.randomBytes(16).toString('hex');
    const key = { id, secret, createdAt: new Date().toISOString(), owner: req.authUser.email };
    keys.push(key);
    await writeJsonFile(API_KEYS_FILE, 'keys', keys);
    await appendAudit('admin.api_key.create', req, { email: req.authUser.email, status: 'ok' });
    return res.status(201).json({ key });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to create api key' });
  }
});

app.delete('/api/admin/api-keys/:keyId', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!allowIntegrationManager(req)) return res.status(403).json({ error: 'insufficient_admin_level' });
    const keyId = clip(req.params.keyId || '', 120);
    const keys = await readJsonFile(API_KEYS_FILE, 'keys');
    const idx = keys.findIndex((k) => k.id === keyId);
    if (idx === -1) return res.status(404).json({ error: 'key not found' });
    const removed = keys.splice(idx, 1)[0];
    await writeJsonFile(API_KEYS_FILE, 'keys', keys);
    await appendAudit('admin.api_key.delete', req, { email: req.authUser.email, status: 'ok' });
    return res.json({ ok: true, removed: removed.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to delete api key' });
  }
});

// Webhooks endpoints
app.get('/api/admin/webhooks', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!allowIntegrationManager(req)) return res.status(403).json({ error: 'insufficient_admin_level' });
    const items = await readJsonFile(WEBHOOKS_FILE, 'webhooks');
    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to list webhooks' });
  }
});

app.post('/api/admin/webhooks', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!allowIntegrationManager(req)) return res.status(403).json({ error: 'insufficient_admin_level' });
    const url = String(req.body?.url || '').trim();
    const event = String(req.body?.event || '').trim() || 'all';
    if (!url) return res.status(400).json({ error: 'url required' });
    const items = await readJsonFile(WEBHOOKS_FILE, 'webhooks');
    const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const rec = { id, url, event, createdAt: new Date().toISOString(), owner: req.authUser.email };
    items.push(rec);
    await writeJsonFile(WEBHOOKS_FILE, 'webhooks', items);
    await appendAudit('admin.webhook.create', req, { email: req.authUser.email, status: 'ok' });
    return res.status(201).json({ webhook: rec });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to create webhook' });
  }
});

app.delete('/api/admin/webhooks/:id', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    if (!allowIntegrationManager(req)) return res.status(403).json({ error: 'insufficient_admin_level' });
    const id = clip(req.params.id || '', 120);
    const items = await readJsonFile(WEBHOOKS_FILE, 'webhooks');
    const idx = items.findIndex((w) => w.id === id);
    if (idx === -1) return res.status(404).json({ error: 'webhook not found' });
    const removed = items.splice(idx, 1)[0];
    await writeJsonFile(WEBHOOKS_FILE, 'webhooks', items);
    await appendAudit('admin.webhook.delete', req, { email: req.authUser.email, status: 'ok' });
    return res.json({ ok: true, removed: removed.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to delete webhook' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const site = clip(req.query.site || 'airbnb', 20).toLowerCase();
    const destination = clip(req.query.destination || '', 120);
    const checkin = clip(req.query.checkin || '', 20);
    const checkout = clip(req.query.checkout || '', 20);
    const adultsRaw = parseInt(String(req.query.adults || '2'), 10);
    const adults = Number.isFinite(adultsRaw) ? Math.min(16, Math.max(1, adultsRaw)) : 2;

    if (!destination) return res.status(400).json({ error: 'destination required' });

    if (site === 'airbnb') {
      const url = `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}&adults=${adults}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const text = await r.text();
      const $ = cheerio.load(text);

      // Try to extract some listing cards - Airbnb markup changes often; attempt several selectors
      const results = [];
      // Common card wrapper queries
      const cardSelectors = ['div[data-testid="property-card"]', 'div._8ssblpx', 'div[itemprop="itemListElement"]'];
      for (const sel of cardSelectors) {
        $(sel).each((i, el) => {
          if (results.length >= 12) return;
          const title = $(el).find('div[role="group"] h3, h3, div._bzh5lkq, .t1jojoys').first().text().trim();
          const price = $(el).find('span._tyxjp1').first().text().trim() || $(el).find('.a8jt5op ._1p7iugi').first().text().trim();
          const urlRel = $(el).find('a').attr('href') || '';
          const listingUrl = urlRel ? (urlRel.startsWith('http') ? urlRel : `https://www.airbnb.com${urlRel}`) : '';
          if (title || price) {
            results.push({ title, price, listingUrl });
          }
        });
        if (results.length) break;
      }

      // Fallback to meta or page title if nothing
      if (!results.length) {
        const pageTitle = $('title').text();
        results.push({ title: pageTitle || `Результаты поиска ${destination}`, price: '', listingUrl: url });
      }

      return res.json({ site: 'airbnb', results });
    }

    if (site === 'booking') {
      const params = new URLSearchParams();
      params.set('ss', destination);
      if (checkin) {
        const [y, m, d] = checkin.split('-');
        if (y && m && d) {
          params.set('checkin_year', y);
          params.set('checkin_month', String(Number(m)));
          params.set('checkin_monthday', String(Number(d)));
        }
      }
      if (checkout) {
        const [y2, m2, d2] = checkout.split('-');
        if (y2 && m2 && d2) {
          params.set('checkout_year', y2);
          params.set('checkout_month', String(Number(m2)));
          params.set('checkout_monthday', String(Number(d2)));
        }
      }
      params.set('group_adults', String(adults));
      const url = `https://www.booking.com/searchresults.html?${params.toString()}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const text = await r.text();
      const $ = cheerio.load(text);

      const results = [];
      // Booking common selectors
      const bookSelectors = ['.sr_property_block', '.sr_item', '.bui-card', 'div[data-testid="property-card"]'];
      for (const sel of bookSelectors) {
        $(sel).each((i, el) => {
          if (results.length >= 12) return;
          const title = $(el).find('.sr-hotel__name, .sr_item_name, .bui-card__title').text().trim() || $(el).find('h3').text().trim();
          const price = $(el).find('.bui-price-display__value, .price, .sr_price').first().text().trim();
          const link = $(el).find('a').attr('href') || '';
          const listingUrl = link ? (link.startsWith('http') ? link : `https://www.booking.com${link}`) : '';
          if (title) results.push({ title, price, listingUrl });
        });
        if (results.length) break;
      }

      if (!results.length) {
        const pageTitle = $('title').text();
        results.push({ title: pageTitle || `Результаты поиска ${destination}`, price: '', listingUrl: url });
      }

      return res.json({ site: 'booking', results });
    }

    res.status(400).json({ error: 'unknown site' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'scrape failed', details: String(err) });
  }
});

app.get('/api/users/:userId/search-history', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const users = await readUsersDb();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'user not found' });
    }

    return res.json({ history: user.searchHistory || [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to load search history' });
  }
});

app.post('/api/users/:userId/search-history', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    const destination = clip(req.body?.destination || '', 120);
    const origin = clip(req.body?.origin || '', 120);

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (!destination) {
      return res.status(400).json({ error: 'destination is required' });
    }

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'user not found' });
    }

    const user = users[userIndex];
    const sameRoute = (item) =>
      String(item.origin || '').toLowerCase() === origin.toLowerCase() &&
      String(item.destination || '').toLowerCase() === destination.toLowerCase();

    const nextEntry = {
      id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      origin,
      destination,
      createdAt: new Date().toISOString(),
    };

    const previous = Array.isArray(user.searchHistory) ? user.searchHistory : [];
    const nextHistory = [nextEntry, ...previous.filter((item) => !sameRoute(item))].slice(
      0,
      MAX_HISTORY_ITEMS
    );

    users[userIndex] = {
      ...user,
      searchHistory: nextHistory,
    };
    await writeUsersDb(users);

    return res.status(201).json({ entry: nextEntry, history: nextHistory });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to save search history' });
  }
});

app.delete('/api/users/:userId/search-history', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'user not found' });
    }

    users[userIndex] = {
      ...users[userIndex],
      searchHistory: [],
    };
    await writeUsersDb(users);
    return res.json({ history: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to clear search history' });
  }
});

app.delete('/api/users/:userId/search-history/:entryId', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    const entryId = clip(req.params.entryId || '', 120);
    const destination = clip(req.body?.destination || '', 120);
    const origin = clip(req.body?.origin || '', 120);
    const createdAt = clip(req.body?.createdAt || '', 80);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'user not found' });
    }

    const currentHistory = Array.isArray(users[userIndex].searchHistory)
      ? users[userIndex].searchHistory
      : [];
    const nextHistory = currentHistory.filter((item) => {
      const byId = entryId && String(item.id || '') === entryId;
      const byPayload =
        destination &&
        String(item.destination || '') === destination &&
        String(item.origin || '') === origin &&
        String(item.createdAt || '') === createdAt;
      return !(byId || byPayload);
    });

    users[userIndex] = {
      ...users[userIndex],
      searchHistory: nextHistory,
    };
    await writeUsersDb(users);
    return res.json({ history: nextHistory });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to delete search history entry' });
  }
});

app.get('/api/users/:userId/notification-prefs', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const users = await readUsersDb();
    const user = users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    return res.json({ prefs: sanitizeNotificationPrefs(user.notificationPrefs) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to load notification prefs' });
  }
});

app.put('/api/users/:userId/notification-prefs', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });
    const prefs = sanitizeNotificationPrefs(req.body || {});
    users[userIndex] = {
      ...users[userIndex],
      notificationPrefs: prefs,
    };
    await writeUsersDb(users);
    return res.json({ prefs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to update notification prefs' });
  }
});

app.get('/api/users/:userId/push-subscriptions', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const users = await readUsersDb();
    const user = users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    return res.json({ items: user.pushSubscriptions || [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to load push subscriptions' });
  }
});

app.post('/api/users/:userId/push-subscriptions', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const subscription = sanitizePushSubscription(req.body || {});
    if (!subscription) return res.status(400).json({ error: 'valid subscription is required' });
    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });
    const current = Array.isArray(users[userIndex].pushSubscriptions)
      ? users[userIndex].pushSubscriptions
      : [];
    const deduped = [
      subscription,
      ...current.filter((item) => String(item.endpoint || '') !== subscription.endpoint),
    ].slice(0, 20);
    users[userIndex] = {
      ...users[userIndex],
      pushSubscriptions: deduped,
    };
    await writeUsersDb(users);
    return res.status(201).json({ items: deduped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to save push subscription' });
  }
});

app.delete('/api/users/:userId/push-subscriptions', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    const endpoint = clip(req.body?.endpoint || req.query?.endpoint || '', 2000);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });
    const current = Array.isArray(users[userIndex].pushSubscriptions)
      ? users[userIndex].pushSubscriptions
      : [];
    const next = current.filter((item) => String(item.endpoint || '') !== endpoint);
    users[userIndex] = {
      ...users[userIndex],
      pushSubscriptions: next,
    };
    await writeUsersDb(users);
    return res.json({ items: next });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to delete push subscription' });
  }
});

app.get('/api/users/:userId/notifications', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const users = await readUsersDb();
    const user = users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    return res.json({ items: user.notificationQueue || [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to load notifications' });
  }
});

app.post('/api/users/:userId/notifications', requireUserAuth, async (req, res) => {
  try {
    const userId = clip(req.params.userId || '', 80);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const type = clip(req.body?.type || 'info', 40);
    const title = clip(req.body?.title || '', 160);
    const body = clip(req.body?.body || '', 400);
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

    const users = await readUsersDb();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'user not found' });

    const nextItem = {
      id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      type,
      title,
      body,
      createdAt: new Date().toISOString(),
      readAt: '',
    };
    const queue = Array.isArray(users[userIndex].notificationQueue)
      ? users[userIndex].notificationQueue
      : [];
    const nextQueue = [nextItem, ...queue].slice(0, 200);
    users[userIndex] = {
      ...users[userIndex],
      notificationQueue: nextQueue,
    };
    await writeUsersDb(users);
    return res.status(201).json({ item: nextItem, items: nextQueue });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to enqueue notification' });
  }
});

app.get('/api/admin/audit-log', requireUserAuth, requireRole('admin'), async (req, res) => {
  try {
    const limitRaw = parseInt(String(req.query.limit || '200'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, limitRaw)) : 200;
    await ensureUsersDb();
    let content = '';
    try {
      content = await fs.readFile(AUDIT_LOG_FILE, 'utf8');
    } catch {
      content = '';
    }
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit);
    const items = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
    return res.json({ items, total: items.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to read audit log' });
  }
});

app.get('/api/rates', async (req, res) => {
  try {
    const base = String(req.query.base || 'USD').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(base)) {
      return res.status(400).json({ error: 'base must be 3-letter currency code' });
    }

    const primaryUrl = `https://rate-api.com/api/${RATE_API_KEY}/latest?base=${encodeURIComponent(base)}`;
    const primaryResponse = await fetch(primaryUrl);
    if (primaryResponse.ok) {
      const data = await primaryResponse.json();
      const rates = data?.rates && typeof data.rates === 'object' ? data.rates : null;
      if (rates) {
        return res.json({ base, rates, source: 'rate-api' });
      }
    }

    const fallbackUrl = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
    const fallbackResponse = await fetch(fallbackUrl);
    if (!fallbackResponse.ok) {
      return res.status(502).json({ error: `failed to load rates (${fallbackResponse.status})` });
    }
    const fallbackData = await fallbackResponse.json();
    const fallbackRates =
      fallbackData?.rates && typeof fallbackData.rates === 'object' ? fallbackData.rates : null;
    if (!fallbackRates) {
      return res.status(502).json({ error: 'rates are empty from provider' });
    }

    return res.json({ base, rates: fallbackRates, source: 'open.er-api' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'failed to fetch currency rates' });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper proxy listening on http://localhost:${PORT}`);
});
