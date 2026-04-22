import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use((req, res, next) => {
  if ((req.headers['content-type'] || '').includes('multipart')) return next();
  express.json()(req, res, next);
});
app.use(cookieParser());
// Serve gateway static files only if NOT a tenant session
app.use((req, res, next) => {
  if (req.cookies?.__gw_server) return next();
  express.static(join(__dirname, 'frontend/dist'))(req, res, next);
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/gateway';
const JWT_SECRET = process.env.JWT_SECRET || 'gateway-secret';
const PORT = process.env.PORT || 4000;

let db;

// ─── Auth Middleware ────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ─── Developer Login ───────────────────────────────────────────
app.post('/api/gateway/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const dev = await db.collection('developers').findOne({ email });
    if (!dev || !await bcrypt.compare(password, dev.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: dev._id, email: dev.email, name: dev.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { email: dev.email, name: dev.name } });
  } catch (error) { res.status(500).json({ error: 'Login failed' }); }
});

app.get('/api/gateway/me', auth, async (req, res) => {
  res.json({ email: req.user.email, name: req.user.name });
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
    // Health check
    try {
      const health = await axios.get(`${url}/api/health`, { timeout: 10000 });
      if (health.data.status !== 'ok') throw new Error('Bad status');
    } catch { return res.status(400).json({ error: 'Cannot connect to server. Check URL and ensure server is running.' }); }
    const result = await db.collection('servers').insertOne({
      name, url, internalKey, maxTenants: maxTenants || 5, status: 'active', createdAt: new Date()
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
    res.cookie('__gw_server', server.url, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
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
    const { orgName, adminEmail, adminPassword, adminName, packageId, publicEnabled } = req.body;
    if (!orgName || !adminEmail || !adminPassword || !adminName) return res.status(400).json({ error: 'All fields required' });

    // Find server with available slot
    const servers = await db.collection('servers').find({ status: 'active' }).toArray();
    let targetServer = null;
    for (const s of servers) {
      const count = await db.collection('tenants').countDocuments({ serverId: s._id.toString() });
      if (count < (s.maxTenants || 5)) { targetServer = s; break; }
    }
    if (!targetServer) return res.status(400).json({ error: 'All servers are full. Add a new server first.' });

    // Get package data
    let packageData = null;
    if (packageId) {
      const pkg = await db.collection('packages').findOne({ _id: new ObjectId(packageId) });
      if (pkg) packageData = { name: pkg.name, storageLimitGB: pkg.storageLimitGB, chatQuota: pkg.chatQuota, quotaType: pkg.quotaType, renewDay: pkg.renewDay, departmentLimit: pkg.departmentLimit };
    }

    // Call tenant server to create client
    const resp = await axios.post(`${targetServer.url}/api/internal/create-client`, {
      orgName, adminEmail, adminPassword, adminName, packageData, publicEnabled
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
    res.cookie('__gw_server', server.url, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ token: resp.data.token, serverUrl: server.url, user: resp.data.user });
  } catch (error) { res.status(500).json({ error: 'Failed to get access: ' + error.message }); }
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
app.post('/api/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Find tenant by admin email or try all servers
    const tenant = await db.collection('tenants').findOne({ adminEmail: email });
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
            res.cookie('__gw_server', s.url, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
            return res.json(resp.data);
          }
        } catch { continue; }
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!serverUrl) return res.status(401).json({ error: 'Server not found for this account' });

    // Proxy login to tenant server
    const resp = await axios.post(`${serverUrl}/api/login`, req.body, { timeout: 10000, validateStatus: () => true });
    if (resp.status === 200) {
      res.cookie('__gw_server', serverUrl, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    }
    res.status(resp.status).json(resp.data);
  } catch (error) { res.status(500).json({ error: 'Login failed' }); }
});

// Clear tenant cookie on logout
app.post('/api/gateway/tenant-logout', (req, res) => {
  res.clearCookie('__gw_server');
  res.json({ success: true });
});

// ─── Proxy all /api/* to tenant server (for logged-in users) ──
app.all('/api/*', async (req, res) => {
  // Don't proxy gateway routes
  if (req.path.startsWith('/api/gateway/')) return res.status(404).json({ error: 'Not found' });

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

  if (!serverUrl) return res.status(401).json({ error: 'Not authenticated' });

  // For file uploads (multipart), pipe raw request; for JSON, send parsed body
  const isMultipart = (req.headers['content-type'] || '').includes('multipart');
  const proxyConfig = {
    method: req.method, url: `${serverUrl}${req.path}`,
    headers: { ...req.headers, host: undefined, cookie: undefined },
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
    }).catch(() => res.sendFile(join(__dirname, 'frontend/dist/index.html')));
    return;
  }
  res.sendFile(join(__dirname, 'frontend/dist/index.html'));
});

// ─── Start ─────────────────────────────────────────────────────
async function start() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  console.log('Connected to MongoDB');

  // Seed developer if none exists
  const devCount = await db.collection('developers').countDocuments();
  if (devCount === 0) {
    const hash = await bcrypt.hash('Developer@123', 10);
    await db.collection('developers').insertOne({ email: 'developer@gencode.com.my', password: hash, name: 'Developer', createdAt: new Date() });
    console.log('Seeded developer: developer@gencode.com.my / Developer@123');
  }

  app.listen(PORT, () => console.log(`Gateway running on port ${PORT}`));
}

start().catch(console.error);
