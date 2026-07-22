import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
// Configurable trust proxy (TRUST_PROXY: true|false|<hop count>|<subnet list>).
// Default true so req.secure / x-forwarded-proto work behind Cloudflare+nginx.
// Security decisions use getClientIp() → CF-Connecting-IP, not req.ip.
function parseTrustProxy(value) {
  if (value === undefined || value === '') return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const asNumber = Number(value);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;
  return value;
}
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
const jsonBodyParser = express.json({ limit: process.env.JSON_BODY_LIMIT || '2mb' });
app.use((req, res, next) => {
  if ((req.headers['content-type'] || '').includes('multipart')) return next();
  jsonBodyParser(req, res, next);
});
app.use(cookieParser());

// HTTPS enforcement (production)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Security headers
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Responsible-disclosure contact (security assessment F-007).
app.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain').send(
    'Contact: mailto:security@gencode.com.my\n' +
    'Expires: 2027-01-01T00:00:00.000Z\n' +
    'Preferred-Languages: en, ms\n' +
    'Canonical: https://genia.gencode.com.my/.well-known/security.txt\n'
  );
});

// Explicitly 404 sensitive/probe paths before the SPA catch-all so scanners
// don't see a blanket HTTP 200 for /.env, /.git, *.php, etc (assessment F-003).
const SENSITIVE_PATH_RE = /(^|\/)\.(env|git|htaccess|htpasswd|svn|hg|aws|ssh)(\/|$)|\.(php|asp|aspx|jsp|cgi)$|(^|\/)(web\.config|phpinfo\.php|wp-login\.php|wp-admin)(\/|$)/i;
app.use((req, res, next) => {
  if (SENSITIVE_PATH_RE.test(req.path)) return res.status(404).type('text/plain').send('Not found');
  next();
});

// Input sanitization
function sanitizeInput(obj) {
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object' || obj === null) return obj;
  const clean = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    clean[k] = sanitizeInput(v);
  }
  return clean;
}
app.use((req, res, next) => { if (req.body && typeof req.body === 'object') req.body = sanitizeInput(req.body); next(); });

// Persistent login rate limit (5 failed attempts in 5 min = 5 min lock).
const LOGIN_RATE_LIMIT_PREFIX = 'gateway_login';
const LOGIN_MAX_FAILS = 5;
const LOGIN_FAIL_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const LOGIN_DOC_TTL_MS = 30 * 60 * 1000;

function getLoginRateKey(ip) {
  return `${LOGIN_RATE_LIMIT_PREFIX}:${ip || 'unknown'}`;
}

async function loginRateLimit(req, res, next) {
  try {
    const ip = getClientIp(req);
    const key = getLoginRateKey(ip);
    req._loginIp = ip;
    req._loginRateKey = key;

    const entry = await db.collection('rate_limits').findOne({ key });
    const lockedUntil = entry?.lockedUntil ? new Date(entry.lockedUntil).getTime() : 0;
    if (lockedUntil > Date.now()) {
      const sec = Math.ceil((lockedUntil - Date.now()) / 1000);
      return res.status(429).json({ error: `Too many login attempts. Try again in ${sec} seconds.` });
    }

    next();
  } catch (error) {
    console.error('Gateway login rate limit error:', error.message);
    res.status(503).json({ error: 'Login temporarily unavailable. Please try again shortly.' });
  }
}

async function recordLoginFail(ip) {
  const key = getLoginRateKey(ip);
  const now = Date.now();
  const nowDate = new Date(now);
  const entry = await db.collection('rate_limits').findOne({ key });
  const firstFailedAt = entry?.firstFailedAt ? new Date(entry.firstFailedAt).getTime() : 0;
  const currentCount = firstFailedAt && now - firstFailedAt <= LOGIN_FAIL_WINDOW_MS ? (entry.count || 0) : 0;
  const count = currentCount + 1;
  const shouldLock = count >= LOGIN_MAX_FAILS;
  const lockedUntil = shouldLock ? new Date(now + LOGIN_LOCK_MS) : null;

  await db.collection('rate_limits').updateOne(
    { key },
    {
      $set: {
        key,
        scope: LOGIN_RATE_LIMIT_PREFIX,
        count: shouldLock ? 0 : count,
        firstFailedAt: shouldLock || !currentCount ? nowDate : entry.firstFailedAt,
        lockedUntil,
        expireAt: new Date(now + LOGIN_DOC_TTL_MS),
        updatedAt: nowDate,
      },
      $setOnInsert: { createdAt: nowDate },
    },
    { upsert: true }
  );
}

async function recordLoginSuccess(ip) {
  await db.collection('rate_limits').deleteOne({ key: getLoginRateKey(ip) });
}

const TENANT_SERVER_COOKIE = '__gw_server';
const TENANT_AUTH_COOKIE = 'tenant_auth';
const GATEWAY_AUTH_COOKIE = 'gw_auth';
const TENANT_SERVER_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TENANT_AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GATEWAY_AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getRequestHost(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host || '';
  return String(host).split(',')[0].trim().split(':')[0].toLowerCase();
}

// Real client IP for security decisions (login rate limiting). Production
// traffic comes through Cloudflare, which sets an unspoofable CF-Connecting-IP
// header (forwarded intact by nginx). X-Forwarded-For / req.ip contain
// client-supplied values under `trust proxy` and must not be trusted here.
function getClientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  const cfIp = (Array.isArray(cf) ? cf[0] : cf || '').trim();
  if (cfIp) return cfIp;
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function isLocalhostRequest(req) {
  const host = getRequestHost(req);
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function shouldUseSecureCookies(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (isLocalhostRequest(req)) return false;
  return process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function gatewayCookieOptions(req, options = {}) {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(req),
    sameSite: 'lax',
    path: '/',
    ...options,
  };
}

function setTenantServerCookie(req, res, serverUrl) {
  res.cookie(
    TENANT_SERVER_COOKIE,
    serverUrl,
    gatewayCookieOptions(req, { maxAge: TENANT_SERVER_COOKIE_MAX_AGE_MS })
  );
}

function clearTenantServerCookie(req, res) {
  res.clearCookie(TENANT_SERVER_COOKIE, gatewayCookieOptions(req));
}

function setTenantAuthCookie(req, res, token) {
  res.cookie(
    TENANT_AUTH_COOKIE,
    token,
    gatewayCookieOptions(req, { maxAge: TENANT_AUTH_COOKIE_MAX_AGE_MS })
  );
}

function clearTenantAuthCookie(req, res) {
  res.clearCookie(TENANT_AUTH_COOKIE, gatewayCookieOptions(req));
}

function getTenantProxyCookieHeader(req) {
  const token = req.cookies?.[TENANT_AUTH_COOKIE];
  return token ? `${TENANT_AUTH_COOKIE}=${encodeURIComponent(token)}` : undefined;
}

function setGatewayAuthCookie(req, res, token) {
  res.cookie(
    GATEWAY_AUTH_COOKIE,
    token,
    gatewayCookieOptions(req, { maxAge: GATEWAY_AUTH_COOKIE_MAX_AGE_MS })
  );
}

function clearGatewayAuthCookie(req, res) {
  res.clearCookie(GATEWAY_AUTH_COOKIE, gatewayCookieOptions(req));
}

const MIN_INTERNAL_KEY_LENGTH = 24;

function validateInternalKeyValue(key) {
  const value = String(key || '').trim();
  if (!value) return 'Internal key required';
  if (value.length < MIN_INTERNAL_KEY_LENGTH) return `Internal key must be at least ${MIN_INTERNAL_KEY_LENGTH} characters`;
  if (
    value === 'change-this-to-a-long-random-internal-key' ||
    value === 'change-this-internal-key'
  ) {
    return 'Internal key must be changed from the default value';
  }
  return null;
}

async function verifyTenantDeveloperLogin(email, password) {
  const servers = await db.collection('servers').find({ status: 'active' }).toArray();
  for (const server of servers) {
    try {
      const resp = await axios.post(
        `${server.url}/api/internal/verify-developer-login`,
        { email, password },
        {
          headers: { 'x-internal-key': server.internalKey },
          timeout: 10000,
          validateStatus: () => true,
        }
      );
      if (resp.status === 200 && resp.data?.success) {
        return { user: resp.data.user, server };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function signGatewayDeveloperToken(user) {
  return jwt.sign(
    {
      id: user.id || user._id,
      email: user.email,
      name: user.fullName || user.name || user.email,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function isDeveloperLoginData(data) {
  return data?.user?.role === 'developer';
}

function isValidShareId(value) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(String(value || ''));
}

async function getPublicShareServer(req, shareId) {
  if (!isValidShareId(shareId)) return null;

  const candidates = [];
  const cookieServerUrl = req.cookies?.[TENANT_SERVER_COOKIE];
  if (cookieServerUrl) candidates.push({ url: cookieServerUrl });

  const activeServers = await db.collection('servers').find({ status: 'active' }).toArray();
  for (const server of activeServers) {
    if (!candidates.some(candidate => candidate.url === server.url)) {
      candidates.push(server);
    }
  }

  for (const server of candidates) {
    try {
      const resp = await axios.get(
        `${server.url}/api/share/${encodeURIComponent(shareId)}`,
        { timeout: 8000, validateStatus: () => true }
      );
      if (resp.status === 200) return server;
    } catch {
      continue;
    }
  }

  return null;
}

function sendGatewayDeveloperLogin(req, res, user) {
  const normalizedUser = {
    id: user.id || user._id,
    email: user.email,
    fullName: user.fullName || user.name || user.email,
  };
  const token = signGatewayDeveloperToken(normalizedUser);
  clearTenantServerCookie(req, res);
  clearTenantAuthCookie(req, res);
  setGatewayAuthCookie(req, res, token);
  return res.json({
    token,
    user: { email: normalizedUser.email, name: normalizedUser.fullName },
    isGatewayDev: true,
  });
}

const gatewayFrontendDist = join(__dirname, 'frontend/dist');
const noStoreHtmlCache = 'no-cache, no-store, must-revalidate';
const immutableAssetCache = 'public, max-age=31536000, immutable';

function setFrontendCacheHeaders(res, filePath) {
  const normalizedPath = filePath.replaceAll('\\', '/');
  if (normalizedPath.includes('/assets/')) {
    res.setHeader('Cache-Control', immutableAssetCache);
  } else if (normalizedPath.endsWith('/index.html') || normalizedPath.endsWith('.html')) {
    res.setHeader('Cache-Control', noStoreHtmlCache);
  }
}

function sendNoCacheIndex(res) {
  res.setHeader('Cache-Control', noStoreHtmlCache);
  return res.sendFile(join(gatewayFrontendDist, 'index.html'));
}

// Serve gateway static files only if NOT a tenant session
app.use((req, res, next) => {
  if (req.cookies?.__gw_server) return next();
  express.static(gatewayFrontendDist, { setHeaders: setFrontendCacheHeaders })(req, res, next);
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/gateway';
const JWT_SECRET = process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable is required'); })();
const PORT = process.env.PORT || 4000;

let db;
let mongoClient;

app.get('/api/health', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ ok: false, service: 'gateway', database: 'disconnected' });
    }
    await db.command({ ping: 1 });
    res.json({ ok: true, service: 'gateway', database: 'connected' });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: 'gateway',
      database: 'unavailable',
      error: error.message,
    });
  }
});

async function ensureMongoIndexes() {
  const indexes = [
    ['rate_limits', { key: 1 }, { unique: true }],
    ['rate_limits', { expireAt: 1 }, { expireAfterSeconds: 0 }],
  ];

  for (const [collection, spec, options] of indexes) {
    try {
      await db.collection(collection).createIndex(spec, options);
    } catch (error) {
      console.warn(`Failed to ensure index ${collection} ${JSON.stringify(spec)}: ${error.message}`);
    }
  }
}

// ─── Auth Middleware ────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.[GATEWAY_AUTH_COOKIE];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ─── Developer Login ───────────────────────────────────────────
app.post('/api/gateway/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const normalizedEmail = String(email).trim().toLowerCase();

    const tenantDev = await verifyTenantDeveloperLogin(normalizedEmail, password);
    if (tenantDev) {
      await recordLoginSuccess(req._loginIp);
      const response = sendGatewayDeveloperLogin(req, res, tenantDev.user);
      return response;
    }

    await recordLoginFail(req._loginIp);
    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (error) { res.status(500).json({ error: 'Login failed' }); }
});

app.get('/api/gateway/me', auth, async (req, res) => {
  res.json({ email: req.user.email, name: req.user.name });
});

app.post('/api/gateway/logout', (req, res) => {
  clearGatewayAuthCookie(req, res);
  clearTenantServerCookie(req, res);
  clearTenantAuthCookie(req, res);
  res.json({ success: true });
});

// ─── Servers ───────────────────────────────────────────────────
app.get('/api/gateway/servers', auth, async (req, res) => {
  try {
    const servers = await db.collection('servers').find().sort({ createdAt: -1 }).toArray();
    // Get tenant count per server
    for (const s of servers) {
      s.tenantCount = await db.collection('tenants').countDocuments({ serverId: s._id.toString() });
    }
    res.json(servers);
  } catch (error) { res.status(500).json({ error: 'Failed to get servers' }); }
});

app.post('/api/gateway/servers', auth, async (req, res) => {
  try {
    const { name, url, internalKey, maxTenants } = req.body;
    if (!name || !url || !internalKey) return res.status(400).json({ error: 'Name, URL, and internal key required' });
    const internalKeyError = validateInternalKeyValue(internalKey);
    if (internalKeyError) return res.status(400).json({ error: internalKeyError });
    // Health check
    try {
      const health = await axios.get(`${url}/api/health`, { timeout: 10000 });
      if (health.data.status !== 'ok') throw new Error('Bad status');
    } catch { return res.status(400).json({ error: 'Cannot connect to server. Check URL and ensure server is running.' }); }
    const result = await db.collection('servers').insertOne({
      name, url, internalKey: String(internalKey).trim(), maxTenants: maxTenants || 5, status: 'active', createdAt: new Date()
    });
    res.json({ success: true, serverId: result.insertedId });
  } catch (error) { res.status(500).json({ error: 'Failed to add server' }); }
});

app.delete('/api/gateway/servers/:id', auth, async (req, res) => {
  try {
    const tenantCount = await db.collection('tenants').countDocuments({ serverId: req.params.id });
    if (tenantCount > 0) return res.status(400).json({ error: `Cannot delete server with ${tenantCount} tenants` });
    await db.collection('servers').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete server' }); }
});

// Health check a server
app.post('/api/gateway/servers/:id/health', auth, async (req, res) => {
  try {
    const server = await db.collection('servers').findOne({ _id: new ObjectId(req.params.id) });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const health = await axios.get(`${server.url}/api/health`, { timeout: 10000 });
    await db.collection('servers').updateOne({ _id: server._id }, { $set: { status: 'active', lastHealthCheck: new Date() } });
    res.json({ status: 'ok', data: health.data });
  } catch {
    await db.collection('servers').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: 'offline', lastHealthCheck: new Date() } });
    res.json({ status: 'offline' });
  }
});

// Manage server (get dev token for Cara 3)
app.post('/api/gateway/servers/:id/manage', auth, async (req, res) => {
  try {
    const server = await db.collection('servers').findOne({ _id: new ObjectId(req.params.id) });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const resp = await axios.post(`${server.url}/api/internal/dev-token`, {}, {
      headers: { 'x-internal-key': server.internalKey }, timeout: 10000
    });
    setTenantAuthCookie(req, res, resp.data.token);
    setTenantServerCookie(req, res, server.url);
    res.json({ token: resp.data.token, serverUrl: server.url });
  } catch (error) { res.status(500).json({ error: 'Failed to get access' }); }
});

// Sync tenants from a server
app.post('/api/gateway/servers/:id/sync', auth, async (req, res) => {
  try {
    const server = await db.collection('servers').findOne({ _id: new ObjectId(req.params.id) });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const resp = await axios.get(`${server.url}/api/internal/list-tenants`, {
      headers: { 'x-internal-key': server.internalKey }, timeout: 15000
    });
    let synced = 0;
    const remoteTenants = resp.data.tenants || [];
    const remoteOrgIds = new Set(remoteTenants.map(t => t.orgId));

    // Add new tenants
    for (const t of remoteTenants) {
      const exists = await db.collection('tenants').findOne({ orgId: t.orgId, serverId: server._id.toString() });
      if (!exists) {
        await db.collection('tenants').insertOne({
          orgName: t.orgName, adminEmail: t.adminEmail, orgId: t.orgId,
          serverId: server._id.toString(), serverName: server.name, createdAt: new Date()
        });
        synced++;
      }
    }

    // Remove tenants that no longer exist on the server
    const removed = await db.collection('tenants').deleteMany({
      serverId: server._id.toString(),
      orgId: { $nin: [...remoteOrgIds] }
    });

    res.json({ success: true, synced, removed: removed.deletedCount || 0, total: remoteTenants.length });
  } catch (error) { res.status(500).json({ error: 'Sync failed: ' + error.message }); }
});

// ─── Tenants ───────────────────────────────────────────────────
app.get('/api/gateway/tenants', auth, async (req, res) => {
  try {
    const tenants = await db.collection('tenants').find().sort({ createdAt: -1 }).toArray();
    res.json(tenants);
  } catch (error) { res.status(500).json({ error: 'Failed to get tenants' }); }
});

app.post('/api/gateway/tenants', auth, async (req, res) => {
  try {
    const { orgName, adminEmail, adminPassword, adminName, packageId, publicEnabled, serverId, systemPrompt } = req.body;
    if (!orgName || !adminEmail || !adminPassword || !adminName) return res.status(400).json({ error: 'All fields required' });

    // Pick target server: explicit selection wins, else auto-find first with a free slot.
    let targetServer = null;
    if (serverId) {
      if (!ObjectId.isValid(serverId)) return res.status(400).json({ error: 'Invalid server selected' });
      const server = await db.collection('servers').findOne({ _id: new ObjectId(serverId) });
      if (!server) return res.status(404).json({ error: 'Selected server not found' });
      if (server.status !== 'active') return res.status(400).json({ error: 'Selected server is not active' });
      const count = await db.collection('tenants').countDocuments({ serverId: server._id.toString() });
      if (count >= (server.maxTenants || 5)) return res.status(400).json({ error: `Selected server is full (${count}/${server.maxTenants || 5}). Choose another server or increase its capacity.` });
      targetServer = server;
    } else {
      const servers = await db.collection('servers').find({ status: 'active' }).toArray();
      for (const s of servers) {
        const count = await db.collection('tenants').countDocuments({ serverId: s._id.toString() });
        if (count < (s.maxTenants || 5)) { targetServer = s; break; }
      }
      if (!targetServer) return res.status(400).json({ error: 'All servers are full. Add a new server first.' });
    }

    // Get package data
    let packageData = null;
    if (packageId) {
      const pkg = await db.collection('packages').findOne({ _id: new ObjectId(packageId) });
      if (pkg) packageData = { name: pkg.name, storageLimitGB: pkg.storageLimitGB, chatQuota: pkg.chatQuota, quotaType: pkg.quotaType, renewDay: pkg.renewDay, departmentLimit: pkg.departmentLimit };
    }

    // Call tenant server to create client
    const resp = await axios.post(`${targetServer.url}/api/internal/create-client`, {
      orgName, adminEmail, adminPassword, adminName, packageData, publicEnabled, systemPrompt
    }, { headers: { 'x-internal-key': targetServer.internalKey }, timeout: 15000 });

    if (!resp.data.success) throw new Error(resp.data.error || 'Failed');

    // Save to registry
    await db.collection('tenants').insertOne({
      orgName, adminEmail, orgId: resp.data.organizationId,
      serverId: targetServer._id.toString(), serverName: targetServer.name,
      packageId: packageId || null, publicEnabled: publicEnabled || false, createdAt: new Date()
    });

    res.json({ success: true, serverId: targetServer._id, serverName: targetServer.name });
  } catch (error) { res.status(500).json({ error: 'Failed to create tenant: ' + error.message }); }
});

// Get dev token for managing a tenant's server (Cara 3)
app.post('/api/gateway/tenants/:id/manage', auth, async (req, res) => {
  try {
    const tenant = await db.collection('tenants').findOne({ _id: new ObjectId(req.params.id) });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const server = await db.collection('servers').findOne({ _id: new ObjectId(tenant.serverId) });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const resp = await axios.post(`${server.url}/api/internal/dev-token`, {}, {
      headers: { 'x-internal-key': server.internalKey }, timeout: 10000
    });
    setTenantAuthCookie(req, res, resp.data.token);
    setTenantServerCookie(req, res, server.url);
    res.json({ token: resp.data.token, serverUrl: server.url, user: resp.data.user });
  } catch (error) { res.status(500).json({ error: 'Failed to get access: ' + error.message }); }
});

async function getTenantDeveloperContext(req, res) {
  const serverUrl = req.cookies?.[TENANT_SERVER_COOKIE];
  const cookieHeader = getTenantProxyCookieHeader(req);
  if (!serverUrl || !cookieHeader) {
    res.status(401).json({ error: 'Tenant developer session required' });
    return null;
  }

  const server = await db.collection('servers').findOne({ url: serverUrl, status: 'active' });
  if (!server) {
    res.status(404).json({ error: 'Tenant server not registered in gateway' });
    return null;
  }

  const me = await axios.get(`${serverUrl}/api/user/me`, {
    headers: { cookie: cookieHeader },
    timeout: 10000,
    validateStatus: () => true,
  });

  if (me.status !== 200 || me.data?.role !== 'developer') {
    res.status(403).json({ error: 'Developer only' });
    return null;
  }

  return { server, user: me.data };
}

function toPackageTemplate(pkg) {
  return {
    gatewayPackageId: pkg._id.toString(),
    name: pkg.name,
    storageLimitGB: pkg.storageLimitGB || 5,
    chatQuota: pkg.chatQuota || 0,
    quotaType: pkg.quotaType || 'individual',
    renewDay: pkg.renewDay || 1,
    departmentLimit: pkg.departmentLimit || 0,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };
}

// Tenant developer view: list gateway package templates that can be imported into the active tenant.
app.get('/api/gateway/package-templates', async (req, res) => {
  try {
    const context = await getTenantDeveloperContext(req, res);
    if (!context) return;
    const packages = await db.collection('packages').find().sort({ createdAt: -1 }).toArray();
    res.json(packages.map(toPackageTemplate));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get gateway package templates' });
  }
});

// Assign a gateway package template to an organization in the active tenant.
// The tenant stores a local copy as its real quota group, linked back to gatewayPackageId.
app.post('/api/gateway/package-templates/:id/assign', async (req, res) => {
  try {
    const context = await getTenantDeveloperContext(req, res);
    if (!context) return;
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid package id' });

    const pkg = await db.collection('packages').findOne({ _id: new ObjectId(req.params.id) });
    if (!pkg) return res.status(404).json({ error: 'Gateway package not found' });

    const resp = await axios.post(
      `${context.server.url}/api/internal/gateway-packages/${pkg._id.toString()}/assign`,
      {
        orgId: req.body?.orgId,
        packageData: toPackageTemplate(pkg),
      },
      {
        headers: { 'x-internal-key': context.server.internalKey },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    res.status(resp.status).json(resp.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign gateway package: ' + error.message });
  }
});

// ─── Packages ──────────────────────────────────────────────────
app.get('/api/gateway/packages', auth, async (req, res) => {
  try {
    const packages = await db.collection('packages').find().sort({ createdAt: -1 }).toArray();
    res.json(packages);
  } catch (error) { res.status(500).json({ error: 'Failed to get packages' }); }
});

app.post('/api/gateway/packages', auth, async (req, res) => {
  try {
    const { name, storageLimitGB, chatQuota, quotaType, renewDay, departmentLimit } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await db.collection('packages').insertOne({
      name, storageLimitGB: storageLimitGB || 5, chatQuota: chatQuota || 0,
      quotaType: quotaType || 'individual', renewDay: renewDay || 1,
      departmentLimit: departmentLimit || 0, createdAt: new Date()
    });
    res.json({ success: true, packageId: result.insertedId });
  } catch (error) { res.status(500).json({ error: 'Failed to create package' }); }
});

app.put('/api/gateway/packages/:id', auth, async (req, res) => {
  try {
    const { name, storageLimitGB, chatQuota, quotaType, renewDay, departmentLimit } = req.body;
    await db.collection('packages').updateOne({ _id: new ObjectId(req.params.id) }, { $set: {
      name, storageLimitGB, chatQuota: chatQuota || 0, quotaType: quotaType || 'individual',
      renewDay: renewDay || 1, departmentLimit: departmentLimit || 0, updatedAt: new Date()
    }});
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update package' }); }
});

app.delete('/api/gateway/packages/:id', auth, async (req, res) => {
  try {
    const inUse = await db.collection('tenants').countDocuments({ packageId: req.params.id });
    if (inUse > 0) return res.status(400).json({ error: `Package in use by ${inUse} tenants` });
    await db.collection('packages').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete package' }); }
});

// ─── User Login Routing (proxy to tenant server) ──────────────
app.post('/api/login', loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const normalizedEmail = String(email).trim().toLowerCase();

    // Developer credentials always belong to the gateway. When someone submits
    // them from a tenant page, clear the tenant cookie and let the frontend
    // switch back to the gateway shell using gw_token, not the tenant token.
    const tenantDev = await verifyTenantDeveloperLogin(normalizedEmail, password);
    if (tenantDev) {
      await recordLoginSuccess(req._loginIp);
      return sendGatewayDeveloperLogin(req, res, tenantDev.user);
    }

    const tenant = await db.collection('tenants').findOne({ adminEmail: normalizedEmail });
    let serverUrl = null;

    if (tenant) {
      const server = await db.collection('servers').findOne({ _id: new ObjectId(tenant.serverId) });
      serverUrl = server?.url;
    } else {
      // Email not in registry — try each active server
      const servers = await db.collection('servers').find({ status: 'active' }).toArray();
      for (const s of servers) {
        try {
          const resp = await axios.post(`${s.url}/api/login`, req.body, { timeout: 10000, validateStatus: () => true });
          if (resp.status === 200) {
            if (isDeveloperLoginData(resp.data)) {
              await recordLoginSuccess(req._loginIp);
              return sendGatewayDeveloperLogin(req, res, resp.data.user);
            }
            await recordLoginSuccess(req._loginIp);
            if (resp.data?.token) setTenantAuthCookie(req, res, resp.data.token);
            setTenantServerCookie(req, res, s.url);
            return res.json(resp.data);
          }
        } catch { continue; }
      }
      await recordLoginFail(req._loginIp);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!serverUrl) {
      await recordLoginFail(req._loginIp);
      return res.status(401).json({ error: 'Server not found for this account' });
    }

    // Proxy login to tenant server
    const resp = await axios.post(`${serverUrl}/api/login`, req.body, { timeout: 10000, validateStatus: () => true });
    if (resp.status === 200 && isDeveloperLoginData(resp.data)) {
      await recordLoginSuccess(req._loginIp);
      return sendGatewayDeveloperLogin(req, res, resp.data.user);
    }
    if (resp.status === 200) {
      await recordLoginSuccess(req._loginIp);
      if (resp.data?.token) setTenantAuthCookie(req, res, resp.data.token);
      setTenantServerCookie(req, res, serverUrl);
    } else if (resp.status === 401 || resp.status === 403) {
      await recordLoginFail(req._loginIp);
    }
    res.status(resp.status).json(resp.data);
  } catch (error) { res.status(500).json({ error: 'Login failed' }); }
});

// Clear tenant cookie on logout
app.post('/api/gateway/tenant-logout', (req, res) => {
  clearTenantServerCookie(req, res);
  clearTenantAuthCookie(req, res);
  res.json({ success: true });
});

// Public shared chats must work without a tenant login cookie.
app.get('/api/share/:shareId', async (req, res) => {
  try {
    const server = await getPublicShareServer(req, req.params.shareId);
    if (!server) return res.status(404).json({ error: 'Shared chat not found' });

    const resp = await axios.get(
      `${server.url}/api/share/${encodeURIComponent(req.params.shareId)}`,
      { timeout: 10000, validateStatus: () => true }
    );
    res.status(resp.status).json(resp.data);
  } catch (error) {
    console.error('Gateway public share API error:', error.message);
    res.status(502).json({ error: 'Unable to load shared chat' });
  }
});

app.get('/share/:shareId', async (req, res) => {
  try {
    const server = await getPublicShareServer(req, req.params.shareId);
    if (!server) return res.status(404).send('<h1>Shared chat not found</h1>');

    const resp = await axios({
      method: 'GET',
      url: `${server.url}/share/${encodeURIComponent(req.params.shareId)}`,
      timeout: 10000,
      responseType: 'stream',
      validateStatus: () => true,
    });

    res.status(resp.status);
    Object.entries(resp.headers).forEach(([key, value]) => {
      if (key !== 'transfer-encoding') res.setHeader(key, value);
    });
    resp.data.pipe(res);
  } catch (error) {
    console.error('Gateway public share page error:', error.message);
    res.status(502).send('<h1>Unable to load shared chat</h1>');
  }
});

// ─── Embed widget → tenant resolution ─────────────────────────
// Embed traffic is anonymous (no gateway cookie / api-key) but every embed
// request carries a widgetId (an ObjectId) in the path, body, or query. We map
// that widgetId to the owning tenant so all tenants can share ONE public domain.
const WIDGET_OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const WIDGET_SERVER_CACHE_TTL_MS = 10 * 60 * 1000;
const widgetServerCache = new Map(); // widgetId -> { url, expiresAt }

function extractEmbedWidgetId(req) {
  for (const seg of req.path.split('/')) {
    if (WIDGET_OBJECT_ID_RE.test(seg)) return seg;
  }
  const fromBody = req.body && typeof req.body === 'object' ? req.body.widgetId : null;
  if (fromBody && WIDGET_OBJECT_ID_RE.test(String(fromBody))) return String(fromBody);
  const fromQuery = req.query?.widgetId;
  if (fromQuery && WIDGET_OBJECT_ID_RE.test(String(fromQuery))) return String(fromQuery);
  return null;
}

async function resolveServerByWidgetId(widgetId) {
  const cached = widgetServerCache.get(widgetId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const servers = await db.collection('servers').find({ status: 'active' }).toArray();
  for (const s of servers) {
    try {
      const resp = await axios.get(
        `${s.url}/api/internal/resolve-widget/${encodeURIComponent(widgetId)}`,
        { headers: { 'x-internal-key': s.internalKey }, timeout: 5000, validateStatus: () => true }
      );
      if (resp.status === 200 && resp.data?.exists) {
        widgetServerCache.set(widgetId, { url: s.url, expiresAt: Date.now() + WIDGET_SERVER_CACHE_TTL_MS });
        return s.url;
      }
    } catch { continue; }
  }
  return null;
}

// ─── Proxy all /api/* to tenant server (for logged-in users) ──
app.all('/api/*', async (req, res) => {
  // Don't proxy gateway routes
  if (req.path.startsWith('/api/gateway/')) return res.status(404).json({ error: 'Not found' });
  if (req.path.startsWith('/api/internal/')) return res.status(404).json({ error: 'Not found' });

  let serverUrl = req.cookies?.__gw_server;

  // If no cookie, try resolve server from x-api-key
  if (!serverUrl && req.headers['x-api-key']) {
    const servers = await db.collection('servers').find({ status: 'active' }).toArray();
    for (const s of servers) {
      try {
        const resp = await axios.get(`${s.url}/api/internal/verify-api-key`, {
          headers: { 'x-internal-key': s.internalKey, 'x-api-key': req.headers['x-api-key'] },
          timeout: 5000, validateStatus: () => true
        });
        if (resp.status === 200 && resp.data.valid) { serverUrl = s.url; break; }
      } catch { continue; }
    }
  }

  // Public embed routes: anonymous, but carry a widgetId identifying the tenant.
  if (!serverUrl && req.path.startsWith('/api/embed/')) {
    const widgetId = extractEmbedWidgetId(req);
    if (widgetId) serverUrl = await resolveServerByWidgetId(widgetId);
  }

  if (!serverUrl) return res.status(401).json({ error: 'Not authenticated' });

  // For file uploads (multipart), pipe raw request; for JSON, send parsed body
  const isMultipart = (req.headers['content-type'] || '').includes('multipart');
  const proxyConfig = {
    method: req.method, url: `${serverUrl}${req.path}`,
    headers: { ...req.headers, host: undefined, cookie: getTenantProxyCookieHeader(req), 'x-internal-key': undefined },
    params: req.query, timeout: 300000, responseType: 'stream', validateStatus: () => true,
    maxContentLength: Infinity, maxBodyLength: Infinity,
  };

  if (isMultipart) {
    proxyConfig.data = req;
  } else {
    proxyConfig.data = req.body;
  }

  axios(proxyConfig).then(proxyRes => {
    res.status(proxyRes.status);
    Object.entries(proxyRes.headers).forEach(([k, v]) => { if (k !== 'transfer-encoding') res.setHeader(k, v); });
    proxyRes.data.pipe(res);
  }).catch(() => res.status(502).json({ error: 'Server unavailable' }));
});

// Serve frontend
app.get('*', (req, res) => {
  const serverUrl = req.cookies?.__gw_server;
  // Tenant user — proxy tenant frontend
  if (serverUrl) {
    axios({
      method: 'GET', url: `${serverUrl}${req.path}`,
      params: req.query, timeout: 10000, responseType: 'stream', validateStatus: () => true
    }).then(proxyRes => {
      // If tenant returns 404 for static assets, serve tenant index.html (SPA fallback)
      if (proxyRes.status === 404 || (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html'))) {
        proxyRes.data.destroy();
        return axios({ method: 'GET', url: `${serverUrl}/`, timeout: 10000, responseType: 'stream', validateStatus: () => true })
          .then(r => { res.status(r.status); Object.entries(r.headers).forEach(([k, v]) => { if (k !== 'transfer-encoding') res.setHeader(k, v); }); r.data.pipe(res); });
      }
      res.status(proxyRes.status);
      Object.entries(proxyRes.headers).forEach(([k, v]) => { if (k !== 'transfer-encoding') res.setHeader(k, v); });
      proxyRes.data.pipe(res);
    }).catch(() => sendNoCacheIndex(res));
    return;
  }
  sendNoCacheIndex(res);
});

// ─── Start ─────────────────────────────────────────────────────
async function start() {
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  db = mongoClient.db();
  console.log('Connected to MongoDB');
  await ensureMongoIndexes();

  app.listen(PORT, () => console.log(`Gateway running on port ${PORT}`));
}

start().catch(console.error);
