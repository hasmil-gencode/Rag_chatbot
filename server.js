import express from 'express';
import { query as db } from './db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(express.static(join(__dirname, 'frontend/dist')));

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Test DB connection
const connTest = await db('SELECT 1');
console.log('Connected to PostgreSQL');

// Helper: get settings
async function getSettings() {
  const res = await db('SELECT data FROM settings WHERE id = $1', ['config']);
  return res.rows[0]?.data || {};
}

// Helper: update settings
async function updateSettings(updates) {
  await db(
    'UPDATE settings SET data = data || $1::jsonb, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(updates), 'config']
  );
}

// Helper to get S3 client
async function getS3Client() {
  const settings = await getSettings();
  if (!settings.s3AccessKey || !settings.s3SecretKey || !settings.s3Region) return null;
  return new S3Client({
    region: settings.s3Region,
    credentials: { accessKeyId: settings.s3AccessKey, secretAccessKey: settings.s3SecretKey }
  });
}

// Helper to get webhook URLs from DB
async function getWebhookUrls() {
  const settings = await getSettings();
  return {
    chat: settings.chatWebhook || 'http://localhost:5678/webhook/chat',
    upload: settings.uploadWebhook || 'http://localhost:5678/webhook/upload',
    transcribe: settings.transcribeWebhook || 'http://localhost:5678/webhook/transcribe'
  };
}

// Helper: get all children org IDs from parent org IDs
async function getAllChildrenOrgs(parentOrgIds) {
  if (!parentOrgIds || parentOrgIds.length === 0) return [];
  const res = await db('SELECT id FROM organizations WHERE parent_id = ANY($1::uuid[])', [parentOrgIds]);
  const childIds = res.rows.map(r => r.id);
  if (childIds.length === 0) return parentOrgIds;
  const deeper = await getAllChildrenOrgs(childIds);
  return [...new Set([...parentOrgIds.map(String), ...childIds.map(String), ...deeper.map(String)])];
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Security Headers Middleware
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; media-src 'self' blob:; frame-ancestors 'none';"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(self), camera=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Auth middleware
const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'User not found or inactive' });

    if (user.active_session_token && user.active_session_token !== token) {
      return res.status(401).json({
        error: 'Session expired', reason: 'logged_in_elsewhere',
        message: 'You have been logged out because you logged in from another device or browser.'
      });
    }

    req.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Permission check middleware
const hasPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (req.user.role === 'developer') return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

// ============= AUTH =============
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await db('SELECT * FROM users WHERE email = $1 AND status = $2', [email, 'active']);
  const user = result.rows[0];
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.must_change_password === true) {
    const tempToken = jwt.sign({ id: user.id, email: user.email, type: 'password-change' }, JWT_SECRET, { expiresIn: '10m' });
    return res.json({ mustChangePassword: true, tempToken, email: user.email });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
  console.log(`[LOGIN] User ${email} logged in.`);

  await db('UPDATE users SET active_session_token = $1, last_login = NOW() WHERE id = $2', [token, user.id]);

  res.json({
    success: true, token,
    user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role }
  });
});

app.post('/api/change-password-first-login', async (req, res) => {
  try {
    const { tempToken, newPassword } = req.body;
    if (!tempToken || !newPassword) return res.status(400).json({ error: 'Missing required fields' });

    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
      if (decoded.type !== 'password-change') return res.status(401).json({ error: 'Invalid token type' });
    } catch { return res.status(401).json({ error: 'Token expired or invalid' }); }

    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const result = await db('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ error: 'New password must be different from the default password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db('UPDATE users SET password = $1, must_change_password = false, updated_at = NOW() WHERE id = $2', [hashedPassword, decoded.id]);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
    res.json({ success: true, token, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

app.get('/api/user/me', auth, async (req, res) => {
  try {
    const result = await db('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, email: user.email, fullName: user.full_name, role: user.role, canUploadFiles: user.can_upload_files !== false });
  } catch (error) { res.status(500).json({ error: 'Failed to get user info' }); }
});

// ============= ORGANIZATIONS (Phase 2) =============
app.post('/api/organizations', auth, hasPermission(), async (req, res) => {
  try {
    const { name, type, parentId } = req.body;
    let path = [name];
    if (parentId) {
      const p = await db('SELECT path FROM organizations WHERE id = $1', [parentId]);
      if (!p.rows[0]) return res.status(404).json({ error: 'Parent not found' });
      path = [...(p.rows[0].path || []), name];
    }
    const result = await db(
      'INSERT INTO organizations (name, path, parent_id, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [name, JSON.stringify(path), parentId || null]
    );
    res.json({ success: true, organizationId: result.rows[0].id });
  } catch (error) { res.status(500).json({ error: 'Failed to create organization' }); }
});

app.post('/api/user-assignments', auth, hasPermission(), async (req, res) => {
  try {
    const { userId, organizationIds } = req.body;
    await db('DELETE FROM user_org_assignments WHERE user_id = $1', [userId]);
    for (const orgId of organizationIds) {
      await db('INSERT INTO user_org_assignments (user_id, organization_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, orgId]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Assign user error:', error);
    res.status(500).json({ error: 'Failed to assign user' });
  }
});

app.get('/api/my-organizations', auth, async (req, res) => {
  try {
    const result = await db(
      `SELECT o.* FROM organizations o
       JOIN user_org_assignments uoa ON o.id = uoa.organization_id
       WHERE uoa.user_id = $1`, [req.user.id]
    );
    res.json({ organizations: result.rows });
  } catch (error) { res.status(500).json({ error: 'Failed to get organizations' }); }
});

app.get('/api/my-organizations-hierarchy', auth, async (req, res) => {
  try {
    const assignments = await db('SELECT organization_id FROM user_org_assignments WHERE user_id = $1', [req.user.id]);
    const assignedOrgIds = assignments.rows.map(a => a.organization_id);
    if (assignedOrgIds.length === 0) return res.json({ organizations: [] });

    const assignedOrgs = await db('SELECT * FROM organizations WHERE id = ANY($1::uuid[])', [assignedOrgIds]);
    const allOrgIds = new Set(assignedOrgIds.map(String));

    for (const org of assignedOrgs.rows) {
      if (org.path) {
        const pathArr = typeof org.path === 'string' ? JSON.parse(org.path) : org.path;
        const children = await db('SELECT id FROM organizations WHERE path::text LIKE $1', [`%${org.name}%`]);
        children.rows.forEach(c => allOrgIds.add(c.id));
      }
    }

    const allOrgs = await db('SELECT * FROM organizations WHERE id = ANY($1::uuid[])', [Array.from(allOrgIds)]);
    res.json({ organizations: allOrgs.rows });
  } catch (error) {
    console.error('Error in my-organizations-hierarchy:', error);
    res.status(500).json({ error: 'Failed to get organizations hierarchy' });
  }
});

app.get('/api/organizations', auth, hasPermission(), async (req, res) => {
  try {
    const result = await db('SELECT * FROM organizations');
    res.json({ organizations: result.rows });
  } catch (error) { res.status(500).json({ error: 'Failed to get organizations' }); }
});

app.put('/api/organizations/:id', auth, hasPermission(), async (req, res) => {
  try {
    const { name, type, parentId } = req.body;
    let path = [name];
    if (parentId) {
      const p = await db('SELECT path FROM organizations WHERE id = $1', [parentId]);
      if (!p.rows[0]) return res.status(404).json({ error: 'Parent not found' });
      path = [...(p.rows[0].path || []), name];
    }
    await db('UPDATE organizations SET name = $1, path = $2, updated_at = NOW() WHERE id = $3', [name, JSON.stringify(path), req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update organization' }); }
});

app.delete('/api/organizations/:id', auth, hasPermission(), async (req, res) => {
  try {
    await db('DELETE FROM organizations WHERE id = $1', [req.params.id]);
    await db('DELETE FROM user_org_assignments WHERE organization_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete organization' }); }
});

// ============= USERS (basic) =============
app.get('/api/users', auth, hasPermission(), async (req, res) => {
  try {
    const result = await db('SELECT * FROM users');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to get users' }); }
});

app.put('/api/users/:id', auth, hasPermission(), async (req, res) => {
  try {
    const { fullName, password, canUploadFiles } = req.body;
    let q = 'UPDATE users SET full_name = $1, updated_at = NOW()';
    let params = [fullName];
    let idx = 2;
    if (password) { q += `, password = $${idx}`; params.push(await bcrypt.hash(password, 10)); idx++; }
    if (canUploadFiles !== undefined) { q += `, can_upload_files = $${idx}`; params.push(canUploadFiles); idx++; }
    q += ` WHERE id = $${idx}`;
    params.push(req.params.id);
    await db(q, params);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update user' }); }
});

app.get('/api/user-assignments/:userId', auth, hasPermission(), async (req, res) => {
  try {
    const result = await db('SELECT * FROM user_org_assignments WHERE user_id = $1', [req.params.userId]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to get user assignments' }); }
});

app.delete('/api/users/:id', auth, hasPermission(), async (req, res) => {
  try {
    const result = await db('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (result.rows[0]?.role === 'developer') return res.status(403).json({ error: 'Cannot delete developer account' });
    await db('DELETE FROM users WHERE id = $1', [req.params.id]);
    await db('DELETE FROM user_org_assignments WHERE user_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete user' }); }
});

app.post('/api/switch-organization', auth, async (req, res) => {
  try {
    const { organizationId } = req.body;
    if (req.user.role !== 'developer') {
      const check = await db('SELECT 1 FROM user_org_assignments WHERE user_id = $1 AND organization_id = $2', [req.user.id, organizationId]);
      if (check.rows.length === 0) return res.status(403).json({ error: 'No access to this organization' });
    }
    res.json({ success: true, currentOrganizationId: organizationId });
  } catch (error) { res.status(500).json({ error: 'Failed to switch organization' }); }
});

// ============= CHAT =============
app.post('/api/chat', auth, async (req, res) => {
  try {
    const { message, sessionId, fileId, currentOrganizationId } = req.body;
    const chatSessionId = sessionId || uuidv4();

    const userRes = await db('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const startedByEmail = user?.email || 'Unknown';
    const startedByName = startedByEmail.split('@')[0];

    // Get user's groupId
    let groupId = null;
    const assignRes = await db(
      `SELECT o.group_id FROM user_org_assignments uoa
       JOIN organizations o ON o.id = uoa.organization_id
       WHERE uoa.user_id = $1 AND o.group_id IS NOT NULL LIMIT 1`, [user.id]
    );
    if (assignRes.rows[0]) groupId = assignRes.rows[0].group_id;

    // Check chat quota
    if (groupId) {
      const groupRes = await db('SELECT * FROM groups WHERE id = $1', [groupId]);
      const group = groupRes.rows[0];

      if (group && group.chat_quota > 0) {
        const currentMonth = new Date().toISOString().substring(0, 7);
        const today = new Date().getDate();

        if (today === group.renew_day) {
          const resetCheck = await db('SELECT 1 FROM chat_resets WHERE group_id = $1 AND month = $2', [group.id, currentMonth]);
          if (resetCheck.rows.length === 0) {
            await db('DELETE FROM chat_counts WHERE group_id = $1 AND month < $2', [group.id, currentMonth]);
            await db('INSERT INTO chat_resets (group_id, month) VALUES ($1, $2) ON CONFLICT DO NOTHING', [group.id, currentMonth]);
            await db('UPDATE groups SET bonus_quota = 0 WHERE id = $1', [group.id]);
          }
        }

        const effectiveQuota = group.chat_quota + (group.bonus_quota || 0);

        if (group.quota_type === 'individual') {
          const countRes = await db('SELECT count FROM chat_counts WHERE group_id = $1 AND user_id = $2 AND month = $3', [group.id, user.id, currentMonth]);
          const currentCount = countRes.rows[0]?.count || 0;
          if (currentCount >= effectiveQuota) {
            return res.status(429).json({ error: 'quota_exceeded', message: 'Your quota exceeded limit, please contact Admin', used: currentCount, limit: effectiveQuota });
          }
        } else {
          const countRes = await db('SELECT COALESCE(SUM(count), 0) as total FROM chat_counts WHERE group_id = $1 AND month = $2', [group.id, currentMonth]);
          if (parseInt(countRes.rows[0].total) >= effectiveQuota) {
            return res.status(429).json({ error: 'quota_exceeded', message: 'Your quota exceeded limit, please contact Admin', used: parseInt(countRes.rows[0].total), limit: effectiveQuota });
          }
        }
      }
    }

    // Save user message
    await db(
      `INSERT INTO messages (user_id, session_id, current_organization_id, started_by, started_by_email, role, content, chat_type, chat_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [req.user.id, chatSessionId, currentOrganizationId || null, startedByName, startedByEmail, 'user', message, 'browser', 'normal']
    );

    const webhooks = await getWebhookUrls();
    const { data } = await axios.post(webhooks.chat, {
      message, userId: req.user.id, currentOrganizationId: currentOrganizationId || null,
      sessionId: chatSessionId, fileId: fileId || null, chatType: 'browser', chatName: 'normal'
    }, { timeout: 60000 });

    const botContent = typeof data.response === 'object' ? data.response.text : data.response;

    await db(
      `INSERT INTO messages (user_id, session_id, current_organization_id, started_by, started_by_email, role, content, chat_type, chat_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [req.user.id, chatSessionId, currentOrganizationId || null, startedByName, startedByEmail, 'bot', botContent || '', 'browser', 'normal']
    );

    // Increment chat count
    if (groupId) {
      const currentMonth = new Date().toISOString().substring(0, 7);
      await db(
        `INSERT INTO chat_counts (group_id, user_id, month, count) VALUES ($1, $2, $3, 1)
         ON CONFLICT (group_id, user_id, month) DO UPDATE SET count = chat_counts.count + 1`,
        [groupId, user.id, currentMonth]
      );
    }

    res.json({ response: botContent || '', sessionId: chatSessionId });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to get response. Please check n8n webhook configuration.', details: error.message });
  }
});

// API Key authentication middleware
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  try {
    const result = await db('SELECT * FROM api_keys WHERE key = $1 OR short_key = $1', [apiKey]);
    const keyDoc = result.rows[0];
    if (!keyDoc) return res.status(401).json({ error: 'Invalid API key' });
    if (!keyDoc.is_active) return res.status(403).json({ error: 'API key is disabled' });
    await db('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyDoc.id]);
    req.user = { id: keyDoc.user_id, role: 'user' };
    req.apiKey = keyDoc;
    next();
  } catch (error) { res.status(500).json({ error: error.message }); }
}

// Public chat API
app.post('/api/v1/chat', authenticateApiKey, async (req, res) => {
  try {
    const { message, sessionId, organizationId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    await db('INSERT INTO api_usage (api_key_id, endpoint, method, response_status, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.apiKey.id, '/api/v1/chat', 'POST', 200, req.ip]);

    const chatSessionId = sessionId || uuidv4();
    const userRes = await db('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const startedByEmail = user?.email || 'API User';
    const startedByName = startedByEmail.split('@')[0];

    let currentOrganizationId = organizationId || null;
    if (!currentOrganizationId) {
      const assignRes = await db('SELECT organization_id FROM user_org_assignments WHERE user_id = $1 LIMIT 1', [req.user.id]);
      if (assignRes.rows[0]) currentOrganizationId = assignRes.rows[0].organization_id;
    }

    await db(
      `INSERT INTO messages (user_id, session_id, current_organization_id, started_by, started_by_email, role, content, chat_type, chat_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [req.user.id, chatSessionId, currentOrganizationId, startedByName, startedByEmail, 'user', message, 'API', req.apiKey.name]
    );

    const webhooks = await getWebhookUrls();
    const { data } = await axios.post(webhooks.chat, {
      message, userId: req.user.id.toString(), currentOrganizationId, sessionId: chatSessionId,
      fileId: null, chatType: 'API', chatName: req.apiKey.name
    }, { timeout: 60000 });

    const botContent = typeof data.response === 'object' ? data.response.text : data.response;

    await db(
      `INSERT INTO messages (user_id, session_id, current_organization_id, started_by, started_by_email, role, content, chat_type, chat_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [req.user.id, chatSessionId, currentOrganizationId, startedByName, startedByEmail, 'bot', botContent || '', 'API', req.apiKey.name]
    );

    res.json({ response: data.response, sessionId: chatSessionId });
  } catch (error) {
    console.error('API chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get chat history
app.get('/api/messages', auth, async (req, res) => {
  const sessionId = req.query.sessionId;
  let q, params;
  if (sessionId) {
    if (req.user.role === 'developer') {
      q = 'SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC';
      params = [sessionId];
    } else {
      q = 'SELECT * FROM messages WHERE session_id = $1 AND user_id = $2 ORDER BY created_at ASC';
      params = [sessionId, req.user.id];
    }
  } else {
    if (req.user.role === 'developer') {
      q = 'SELECT * FROM messages ORDER BY created_at ASC';
      params = [];
    } else {
      q = 'SELECT * FROM messages WHERE user_id = $1 ORDER BY created_at ASC';
      params = [req.user.id];
    }
  }
  const result = await db(q, params);
  res.json(result.rows.map(m => ({ role: m.role, content: m.content, createdAt: m.created_at })));
});

// Get chat sessions (aggregation → SQL GROUP BY)
app.get('/api/sessions', auth, async (req, res) => {
  try {
    const { currentOrganizationId } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (req.user.role !== 'developer') {
      conditions.push(`user_id = $${idx}`); params.push(req.user.id); idx++;
    }
    if (currentOrganizationId) {
      conditions.push(`current_organization_id = $${idx}`); params.push(currentOrganizationId); idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await db(`
      SELECT session_id,
        (array_agg(content ORDER BY created_at ASC))[1] as first_message,
        MAX(created_at) as last_message_at,
        COUNT(*) as message_count,
        (array_agg(started_by ORDER BY created_at ASC))[1] as started_by,
        (array_agg(started_by_email ORDER BY created_at ASC))[1] as started_by_email
      FROM messages ${where}
      GROUP BY session_id
      ORDER BY last_message_at DESC
      LIMIT 50
    `, params);

    res.json(result.rows.map(s => ({
      id: s.session_id,
      title: (s.first_message || 'New chat').substring(0, 50),
      lastMessageAt: s.last_message_at,
      messageCount: parseInt(s.message_count),
      startedBy: s.started_by || s.started_by_email,
      startedByEmail: s.started_by_email
    })));
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete chat session
app.delete('/api/sessions/:id', auth, async (req, res) => {
  try {
    let checkQ, delQ;
    if (req.user.role === 'developer') {
      checkQ = await db('SELECT 1 FROM messages WHERE session_id = $1', [req.params.id]);
    } else {
      checkQ = await db('SELECT 1 FROM messages WHERE session_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    }
    if (checkQ.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    // Copy to deleted_messages
    await db(`
      INSERT INTO deleted_messages (original_id, session_id, user_id, content, role, started_by, started_by_email, deleted_by, deleted_by_email, current_organization_id, chat_type, chat_name, created_at)
      SELECT id, session_id, user_id, content, role, started_by, started_by_email, $1, $2, current_organization_id, chat_type, chat_name, created_at
      FROM messages WHERE session_id = $3
    `, [req.user.id, req.user.email, req.params.id]);

    await db('DELETE FROM messages WHERE session_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get deleted chats
app.get('/api/deleted-sessions', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') return res.status(403).json({ error: 'Developer access only' });

    const result = await db(`
      SELECT session_id,
        (array_agg(content ORDER BY deleted_at DESC))[1] as first_message,
        MAX(deleted_at) as deleted_at,
        (array_agg(deleted_by_email ORDER BY deleted_at DESC))[1] as deleted_by,
        COUNT(*) as message_count,
        (array_agg(started_by ORDER BY created_at ASC))[1] as started_by,
        (array_agg(started_by_email ORDER BY created_at ASC))[1] as started_by_email
      FROM deleted_messages
      GROUP BY session_id
      ORDER BY deleted_at DESC LIMIT 100
    `);

    res.json(result.rows.map(s => ({
      id: s.session_id,
      title: (s.first_message || 'Deleted chat').substring(0, 50),
      deletedAt: s.deleted_at, deletedBy: s.deleted_by,
      messageCount: parseInt(s.message_count),
      startedBy: s.started_by || s.started_by_email, startedByEmail: s.started_by_email
    })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/deleted-messages', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') return res.status(403).json({ error: 'Developer access only' });
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const result = await db('SELECT * FROM deleted_messages WHERE session_id = $1 ORDER BY created_at ASC', [sessionId]);
    res.json(result.rows.map(m => ({ role: m.role, content: m.content, createdAt: m.created_at, deletedAt: m.deleted_at, deletedBy: m.deleted_by_email })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============= FILE UPLOAD =============
app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const settings = await getSettings();
    const s3Client = await getS3Client();
    const userRes = await db('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const uploaderEmail = user?.email || 'Unknown';
    const uploaderName = uploaderEmail.split('@')[0];
    const sharedWith = req.body.sharedWith ? JSON.parse(req.body.sharedWith) : [];
    const fileType = req.body.type || 'document';

    // Check storage limit
    let userGroupId = null;
    const assignRes = await db(
      `SELECT o.group_id FROM user_org_assignments uoa
       JOIN organizations o ON o.id = uoa.organization_id
       WHERE uoa.user_id = $1 AND o.group_id IS NOT NULL LIMIT 1`, [req.user.id]
    );
    if (assignRes.rows[0]) {
      userGroupId = assignRes.rows[0].group_id;
      const groupRes = await db('SELECT * FROM groups WHERE id = $1', [userGroupId]);
      const group = groupRes.rows[0];
      if (group) {
        const filesRes = await db('SELECT COALESCE(SUM(size), 0) as total FROM files WHERE group_id = $1', [userGroupId]);
        const currentUsage = parseInt(filesRes.rows[0].total);
        const limitBytes = group.storage_limit_gb * 1024 * 1024 * 1024;
        if (currentUsage + req.file.size > limitBytes) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: `Storage limit exceeded. Limit: ${group.storage_limit_gb}GB, Used: ${(currentUsage / 1024 / 1024 / 1024).toFixed(2)}GB` });
        }
      }
    }

    let fileUrl;
    const storageMode = settings.storageMode || 'local';
    if (storageMode === 's3' && s3Client && settings.s3Bucket) {
      try {
        const fileContent = fs.readFileSync(req.file.path);
        const s3Key = `uploads/${req.user.id}/${Date.now()}-${req.file.originalname}`;
        await s3Client.send(new PutObjectCommand({ Bucket: settings.s3Bucket, Key: s3Key, Body: fileContent, ContentType: req.file.mimetype }));
        fileUrl = `https://${settings.s3Bucket}.s3.${settings.s3Region}.amazonaws.com/${s3Key}`;
        fs.unlinkSync(req.file.path);
      } catch (s3Error) {
        console.error('S3 upload failed:', s3Error.message);
        fileUrl = `file://${req.file.path}`;
      }
    } else {
      fileUrl = `file://${req.file.path}`;
    }

    const result = await db(
      `INSERT INTO files (user_id, group_id, shared_with, type, is_downloadable, is_vectorized, uploaded_by, uploaded_by_email, name, size, url)
       VALUES ($1, $2, $3::uuid[], $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [req.user.id, userGroupId, sharedWith, fileType, fileType === 'form', fileType === 'document', uploaderName, uploaderEmail, req.file.originalname, req.file.size, fileUrl]
    );

    if (fileType === 'document') {
      const webhooks = await getWebhookUrls();
      try {
        const response = await axios.post(webhooks.upload, {
          fileId: result.rows[0].id, userId: req.user.id, sharedWith, fileName: req.file.originalname, fileSize: req.file.size, fileUrl
        }, { timeout: 300000 });
        res.json({ success: true, fileId: result.rows[0].id, message: response.data.message || 'File uploaded and embedded successfully', chunks: response.data.chunks || 0 });
      } catch (webhookError) {
        console.error('n8n webhook error:', webhookError.message);
        res.status(500).json({ success: false, error: 'File uploaded but embedding failed. Please try again.' });
      }
    } else {
      res.json({ success: true, fileId: result.rows[0].id, message: 'Form uploaded successfully' });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fuzzy match helper
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  const matrix = [];
  for (let i = 0; i <= s2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s1.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      matrix[i][j] = s2.charAt(i-1) === s1.charAt(j-1) ? matrix[i-1][j-1] : Math.min(matrix[i-1][j-1]+1, matrix[i][j-1]+1, matrix[i-1][j]+1);
    }
  }
  return 1 - (matrix[s2.length][s1.length] / Math.max(s1.length, s2.length));
}

app.post('/api/files/check-downloadable', auth, async (req, res) => {
  try {
    const { fileNames } = req.body;
    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) return res.json([]);
    const allForms = await db("SELECT * FROM files WHERE type = 'form' AND is_downloadable = true");
    const matches = [];
    for (const searchName of fileNames) {
      const scored = allForms.rows.map(form => ({ id: form.id, name: form.name, uploadedBy: form.uploaded_by, uploadedAt: form.uploaded_at, similarity: calculateSimilarity(searchName, form.name) }))
        .filter(f => f.similarity > 0.7).sort((a, b) => b.similarity - a.similarity);
      if (scored.length > 0) matches.push({ searchTerm: searchName, files: scored });
    }
    res.json(matches);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Storage info
app.get('/api/storage-info', auth, async (req, res) => {
  try {
    const assignRes = await db(
      `SELECT o.group_id FROM user_org_assignments uoa
       JOIN organizations o ON o.id = uoa.organization_id
       WHERE uoa.user_id = $1 AND o.group_id IS NOT NULL LIMIT 1`, [req.user.id]
    );
    if (!assignRes.rows[0]) return res.json({ used: 0, limit: 0 });
    const groupId = assignRes.rows[0].group_id;
    const groupRes = await db('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (!groupRes.rows[0]) return res.json({ used: 0, limit: 0 });
    const filesRes = await db('SELECT COALESCE(SUM(size), 0) as total FROM files WHERE group_id = $1', [groupId]);
    res.json({ used: parseInt(filesRes.rows[0].total), limit: groupRes.rows[0].storage_limit_gb });
  } catch (error) { res.status(500).json({ error: 'Failed to get storage info' }); }
});

// List files
app.get('/api/files', auth, async (req, res) => {
  try {
    let files;
    if (req.user.role === 'developer') {
      files = await db("SELECT * FROM files WHERE type = 'document' ORDER BY uploaded_at DESC");
    } else {
      const assignRes = await db('SELECT organization_id FROM user_org_assignments WHERE user_id = $1', [req.user.id]);
      if (assignRes.rows.length === 0) return res.json([]);
      const orgIds = assignRes.rows.map(a => a.organization_id);
      files = await db("SELECT * FROM files WHERE type = 'document' AND shared_with && $1::uuid[] ORDER BY uploaded_at DESC", [orgIds]);
    }
    const filesWithInfo = await Promise.all(files.rows.map(async (f) => {
      let sharedOrgNames = [];
      if (f.shared_with && f.shared_with.length > 0) {
        const orgs = await db('SELECT name FROM organizations WHERE id = ANY($1::uuid[])', [f.shared_with]);
        sharedOrgNames = orgs.rows.map(o => o.name);
      }
      return { id: f.id, name: f.name, uploadedAt: f.uploaded_at, uploadedBy: f.uploaded_by || 'Unknown', userId: f.user_id, sharedWith: sharedOrgNames };
    }));
    res.json(filesWithInfo);
  } catch (error) { console.error('Get files error:', error); res.status(500).json({ error: error.message }); }
});

// Get forms
app.get('/api/forms', auth, async (req, res) => {
  try {
    let forms;
    if (req.user.role === 'developer') {
      forms = await db("SELECT * FROM files WHERE type = 'form' ORDER BY uploaded_at DESC");
    } else {
      const assignRes = await db('SELECT organization_id FROM user_org_assignments WHERE user_id = $1', [req.user.id]);
      if (assignRes.rows.length === 0) return res.json([]);
      const orgIds = assignRes.rows.map(a => a.organization_id);
      const allOrgs = await getAllChildrenOrgs(orgIds);
      forms = await db("SELECT * FROM files WHERE type = 'form' AND (shared_with = '{}' OR shared_with && $1::uuid[]) ORDER BY uploaded_at DESC", [allOrgs]);
    }
    const formsWithInfo = await Promise.all(forms.rows.map(async (f) => {
      let sharedOrgNames = [];
      if (f.shared_with && f.shared_with.length > 0) {
        const orgs = await db('SELECT name FROM organizations WHERE id = ANY($1::uuid[])', [f.shared_with]);
        sharedOrgNames = orgs.rows.map(o => o.name);
      }
      return { _id: f.id, name: f.name, uploadedAt: f.uploaded_at, uploadedBy: f.uploaded_by || 'Unknown', userId: f.user_id, sharedWith: sharedOrgNames };
    }));
    res.json(formsWithInfo);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Download file
app.get('/api/files/:id/download', auth, async (req, res) => {
  try {
    const fileRes = await db('SELECT * FROM files WHERE id = $1', [req.params.id]);
    const file = fileRes.rows[0];
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (file.type === 'form' && !file.is_downloadable) return res.status(404).json({ error: 'File not found or not downloadable' });

    // Track download
    await db('INSERT INTO download_tracking (file_id, file_name, user_id, user_email, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [file.id, file.name, req.user.id, req.user.email, req.ip]);

    if (file.url?.startsWith('https://') && file.url.includes('.s3.')) {
      const s3Client = await getS3Client();
      if (s3Client) {
        try {
          const urlParts = file.url.replace('https://', '').split('/');
          const bucket = urlParts[0].split('.')[0];
          const key = urlParts.slice(1).join('/');
          const { GetObjectCommand } = await import('@aws-sdk/client-s3');
          const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
          const command = new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `attachment; filename="${file.name}"` });
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          return res.json({ downloadUrl: signedUrl, fileName: file.name });
        } catch (s3Error) { console.error('S3 signed URL error:', s3Error); }
      }
    }
    res.json({ downloadUrl: file.url, fileName: file.name });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Download tracking
app.get('/api/download-tracking', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') return res.status(403).json({ error: 'Developer access only' });
    const result = await db('SELECT * FROM download_tracking ORDER BY downloaded_at DESC LIMIT 1000');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/download-tracking/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') return res.status(403).json({ error: 'Developer access only' });
    const result = await db(`
      SELECT file_name, file_id, COUNT(*) as download_count, MAX(downloaded_at) as last_downloaded, COUNT(DISTINCT user_email) as unique_users
      FROM download_tracking GROUP BY file_name, file_id ORDER BY download_count DESC
    `);
    res.json(result.rows.map(s => ({ fileName: s.file_name, fileId: s.file_id, downloadCount: parseInt(s.download_count), uniqueUsers: parseInt(s.unique_users), lastDownloaded: s.last_downloaded })));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete file
app.delete('/api/files/:id', auth, async (req, res) => {
  try {
    const fileRes = await db('SELECT * FROM files WHERE id = $1', [req.params.id]);
    const file = fileRes.rows[0];
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (file.user_id.toString() !== req.user.id.toString() && req.user.role !== 'developer') return res.status(403).json({ error: 'Not authorized' });

    if (file.url?.startsWith('https://') && file.url.includes('.s3.')) {
      const s3Client = await getS3Client();
      if (s3Client) {
        const urlParts = file.url.replace('https://', '').split('/');
        const bucket = urlParts[0].split('.')[0];
        const key = urlParts.slice(1).join('/');
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
    }

    await db('DELETE FROM files WHERE id = $1', [req.params.id]);
    const delResult = await db('DELETE FROM embeddings WHERE file_id = $1', [req.params.id]);
    console.log(`Deleted ${delResult.rowCount} embeddings`);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============= PERMISSIONS & ROLES =============
app.get('/api/permissions', auth, hasPermission('role:manage'), async (req, res) => {
  const result = await db('SELECT * FROM permissions');
  res.json(result.rows);
});

app.get('/api/roles/list', auth, async (req, res) => {
  const result = await db("SELECT * FROM roles WHERE status = 'active'");
  res.json(result.rows);
});

app.get('/api/roles', auth, hasPermission('role:manage'), async (req, res) => {
  const result = await db('SELECT * FROM roles');
  res.json(result.rows);
});

app.post('/api/roles', auth, hasPermission('role:manage'), async (req, res) => {
  const { name, description, permissions, status } = req.body;
  const result = await db('INSERT INTO roles (name, description, permissions, status) VALUES ($1, $2, $3, $4) RETURNING id', [name, description, permissions, status || 'active']);
  res.json({ success: true, id: result.rows[0].id });
});

app.put('/api/roles/:id', auth, hasPermission('role:manage'), async (req, res) => {
  const { name, description, permissions, status } = req.body;
  const roleRes = await db('SELECT is_system FROM roles WHERE id = $1', [req.params.id]);
  if (roleRes.rows[0]?.is_system) return res.status(403).json({ error: 'Cannot edit system roles' });
  await db('UPDATE roles SET name=$1, description=$2, permissions=$3, status=$4, updated_at=NOW() WHERE id=$5', [name, description, permissions, status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/roles/:id', auth, hasPermission('role:manage', 'system:delete'), async (req, res) => {
  const roleRes = await db('SELECT is_system FROM roles WHERE id = $1', [req.params.id]);
  if (roleRes.rows[0]?.is_system) return res.status(403).json({ error: 'Cannot delete system roles' });
  const usersCount = await db('SELECT COUNT(*) FROM users WHERE $1 = ANY(roles)', [req.params.id]);
  if (parseInt(usersCount.rows[0].count) > 0) return res.status(400).json({ error: 'Cannot delete role assigned to users' });
  await db('DELETE FROM roles WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ============= ORGANIZATIONS (RBAC) =============
app.get('/api/organizations', auth, hasPermission('org:view'), async (req, res) => {
  const result = await db('SELECT * FROM organizations');
  res.json(result.rows);
});

app.post('/api/organizations', auth, hasPermission('org:manage'), async (req, res) => {
  const { name, description, status } = req.body;
  const result = await db('INSERT INTO organizations (name, path, created_at) VALUES ($1, $2, NOW()) RETURNING id', [name, description]);
  res.json({ success: true, id: result.rows[0].id });
});

app.put('/api/organizations/:id', auth, hasPermission('org:manage'), async (req, res) => {
  const { name, description, status } = req.body;
  await db('UPDATE organizations SET name=$1, updated_at=NOW() WHERE id=$2', [name, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/organizations/:id', auth, hasPermission('org:manage', 'system:delete'), async (req, res) => {
  const usersCount = await db('SELECT COUNT(*) FROM users WHERE organization_id = $1', [req.params.id]);
  if (parseInt(usersCount.rows[0].count) > 0) return res.status(400).json({ error: 'Cannot delete organization with users' });
  await db('DELETE FROM departments WHERE organization_id = $1', [req.params.id]);
  await db('DELETE FROM organizations WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ============= DEPARTMENTS =============
app.get('/api/departments', auth, hasPermission('dept:view'), async (req, res) => {
  const { organizationId } = req.query;
  let result;
  if (organizationId) {
    result = await db('SELECT d.*, o.name as organization_name FROM departments d LEFT JOIN organizations o ON o.id = d.organization_id WHERE d.organization_id = $1', [organizationId]);
  } else {
    result = await db('SELECT d.*, o.name as organization_name FROM departments d LEFT JOIN organizations o ON o.id = d.organization_id');
  }
  res.json(result.rows.map(d => ({ ...d, organizationName: d.organization_name })));
});

app.post('/api/departments', auth, hasPermission('dept:manage'), async (req, res) => {
  const { name, description, organizationId, status } = req.body;
  const result = await db('INSERT INTO departments (name, description, organization_id, status) VALUES ($1, $2, $3, $4) RETURNING id', [name, description, organizationId, status || 'active']);
  res.json({ success: true, id: result.rows[0].id });
});

app.put('/api/departments/:id', auth, hasPermission('dept:manage'), async (req, res) => {
  const { name, description, organizationId, status } = req.body;
  await db('UPDATE departments SET name=$1, description=$2, organization_id=$3, status=$4, updated_at=NOW() WHERE id=$5', [name, description, organizationId, status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/departments/:id', auth, hasPermission('dept:manage', 'system:delete'), async (req, res) => {
  const usersCount = await db('SELECT COUNT(*) FROM users WHERE department_id = $1', [req.params.id]);
  if (parseInt(usersCount.rows[0].count) > 0) return res.status(400).json({ error: 'Cannot delete department with users' });
  await db('DELETE FROM departments WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ============= USERS (RBAC) =============
app.get('/api/users', auth, hasPermission('user:view'), async (req, res) => {
  const currentUser = (await db('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0];
  let users;
  if (currentUser.role === 'developer') {
    users = (await db('SELECT * FROM users')).rows;
  } else {
    users = (await db('SELECT * FROM users WHERE organization_id = $1', [currentUser.organization_id])).rows;
  }

  const usersWithRoles = await Promise.all(users.map(async (user) => {
    let roles = [];
    if (user.roles && user.roles.length > 0) {
      const rolesRes = await db('SELECT id, name FROM roles WHERE id = ANY($1::uuid[])', [user.roles]);
      roles = rolesRes.rows;
    }
    let orgName = null, deptName = null;
    if (user.organization_id) { const o = await db('SELECT name FROM organizations WHERE id = $1', [user.organization_id]); orgName = o.rows[0]?.name; }
    if (user.department_id) { const d = await db('SELECT name FROM departments WHERE id = $1', [user.department_id]); deptName = d.rows[0]?.name; }
    return { id: user.id, email: user.email, fullName: user.full_name, status: user.status, roles: roles.map(r => ({ id: r.id, name: r.name })), organizationId: user.organization_id, organizationName: orgName, departmentId: user.department_id, departmentName: deptName, createdAt: user.created_at };
  }));
  res.json(usersWithRoles);
});

app.post('/api/users', auth, hasPermission('user:manage'), async (req, res) => {
  try {
    const { email, password, fullName, canUploadFiles } = req.body;
    const existing = await db('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db(
      'INSERT INTO users (email, password, full_name, role, status, can_upload_files, must_change_password, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [email, hashedPassword, fullName, 'user', 'active', canUploadFiles !== false, true, req.user.id]
    );
    res.json({ success: true, userId: result.rows[0].id });
  } catch (error) { res.status(500).json({ error: 'Failed to create user' }); }
});

app.put('/api/users/:id', auth, hasPermission('user:manage'), async (req, res) => {
  const { email, fullName, roles, status, password, organizationId, departmentId } = req.body;
  let q = 'UPDATE users SET email=$1, full_name=$2, roles=$3::uuid[], organization_id=$4, department_id=$5, status=$6, updated_at=NOW()';
  let params = [email, fullName, roles || [], organizationId || null, departmentId || null, status];
  let idx = 7;
  if (password) { q += `, password=$${idx}`; params.push(await bcrypt.hash(password, 10)); idx++; }
  q += ` WHERE id=$${idx}`;
  params.push(req.params.id);
  await db(q, params);
  res.json({ success: true });
});

app.delete('/api/users/:id', auth, hasPermission('user:manage', 'system:delete'), async (req, res) => {
  if (req.params.id === req.user.id.toString()) return res.status(400).json({ error: 'Cannot delete your own account' });
  await db('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/users/:id/reset-password', auth, hasPermission(), async (req, res) => {
  try {
    const { defaultPassword } = req.body;
    if (!defaultPassword) return res.status(400).json({ error: 'Default password is required' });
    if (req.params.id === req.user.id.toString()) return res.status(400).json({ error: 'Cannot reset your own password' });
    const userRes = await db('SELECT 1 FROM users WHERE id = $1', [req.params.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    await db('UPDATE users SET password=$1, must_change_password=true, updated_at=NOW() WHERE id=$2', [hashedPassword, req.params.id]);
    res.json({ success: true, message: 'Password reset successfully. User must change password on next login.' });
  } catch (error) { res.status(500).json({ error: 'Failed to reset password' }); }
});

// ============= SETTINGS =============
app.get('/api/public-settings', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({ logo: settings.logo || null, voiceMode: settings.voiceMode || 'browser', voiceLanguage: settings.voiceLanguage || 'auto', ttsMode: settings.ttsMode || 'browser', ttsLanguage: settings.ttsLanguage || 'en-US' });
  } catch (error) { res.status(500).json({ error: 'Failed to load settings' }); }
});

app.get('/api/settings', auth, hasPermission(), async (req, res) => {
  const s = await getSettings();
  res.json({
    companyName: s.companyName || 'GenBotChat', logo: s.logo || null,
    storageMode: s.storageMode || 'local', localStoragePath: s.localStoragePath || '/app/uploads',
    voiceMode: s.voiceMode || 'browser', voiceLanguage: s.voiceLanguage || 'auto',
    googleSttApiKey: s.googleSttApiKey || '', googleTtsApiKey: s.googleTtsApiKey || '', geminiSttApiKey: s.geminiSttApiKey || '', geminiTtsApiKey: s.geminiTtsApiKey || '',
    elevenlabsApiKey: s.elevenlabsApiKey || '', elevenlabsVoice: s.elevenlabsVoice || 'onwK4e9ZLuTAKqWW03F9',
    gclasServiceAccount: s.gclasServiceAccount || '', gclasLanguage: s.gclasLanguage || 'auto', gclasVoice: s.gclasVoice || 'en-US-Neural2-C',
    geminiVoice: s.geminiVoice || 'Aoede', geminiTtsLanguage: s.geminiTtsLanguage || 'auto',
    ttsMode: s.ttsMode || 'browser', ttsLanguage: s.ttsLanguage || 'en-US',
    whisperUrl: s.whisperUrl || process.env.WHISPER_API_URL || '',
    chatterboxUrl: s.chatterboxUrl || process.env.CHATTERBOX_URL || '', chatterboxVoice: s.chatterboxVoice || 'default',
    ollamaUrl: s.ollamaUrl || process.env.OLLAMA_URL || 'http://ollama:11434',
    ollamaModel: s.ollamaModel || 'qwen3:8b',
    ollamaEmbeddingModel: s.ollamaEmbeddingModel || 'nomic-embed-text',
    chatWebhook: s.chatWebhook || '', uploadWebhook: s.uploadWebhook || '', transcribeWebhook: s.transcribeWebhook || '', formSubmissionWebhook: s.formSubmissionWebhook || '',
    s3Bucket: s.s3Bucket || '', s3Region: s.s3Region || '', s3AccessKey: s.s3AccessKey || '', s3SecretKey: s.s3SecretKey || ''
  });
});

app.post('/api/settings', auth, hasPermission(), async (req, res) => {
  await updateSettings(req.body);
  res.json({ success: true });
});

app.put('/api/settings', auth, hasPermission(), async (req, res) => {
  await updateSettings(req.body);
  res.json({ success: true });
});

// ============= API KEYS =============
app.get('/api/keys', auth, hasPermission(), async (req, res) => {
  try {
    const keys = await db('SELECT * FROM api_keys ORDER BY created_at DESC');
    const keysWithUser = await Promise.all(keys.rows.map(async (key) => {
      const userRes = await db('SELECT email FROM users WHERE id = $1', [key.user_id]);
      let robotName = null;
      if (key.robot_setting_id) { const r = await db('SELECT name FROM robot_settings WHERE id = $1', [key.robot_setting_id]); robotName = r.rows[0]?.name; }
      return { ...key, userEmail: userRes.rows[0]?.email || 'Unknown', robotName };
    }));
    res.json(keysWithUser);
  } catch (error) { res.status(500).json({ error: 'Failed to get API keys' }); }
});

app.post('/api/keys', auth, hasPermission(), async (req, res) => {
  try {
    const { name, userId, generateShortKey, robotSettingId } = req.body;
    const key = 'gk_' + crypto.randomBytes(32).toString('hex');
    let shortKey = null;
    if (generateShortKey) shortKey = await generateUniqueShortKey();
    await db('INSERT INTO api_keys (key, short_key, has_short_key, name, user_id, robot_setting_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [key, shortKey, !!generateShortKey, name, userId, robotSettingId || null]);
    res.json({ success: true, key, shortKey });
  } catch (error) { res.status(500).json({ error: 'Failed to create API key' }); }
});

async function generateUniqueShortKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempts = 0; attempts < 10; attempts++) {
    let shortKey = '';
    for (let i = 0; i < 6; i++) shortKey += chars.charAt(Math.floor(Math.random() * chars.length));
    const existing = await db('SELECT 1 FROM api_keys WHERE short_key = $1', [shortKey]);
    if (existing.rows.length === 0) return shortKey;
  }
  throw new Error('Failed to generate unique short key');
}

app.patch('/api/keys/:id', auth, hasPermission(), async (req, res) => {
  try {
    await db('UPDATE api_keys SET is_active = $1 WHERE id = $2', [req.body.isActive, req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to toggle API key' }); }
});

app.delete('/api/keys/:id', auth, hasPermission(), async (req, res) => {
  try {
    await db('DELETE FROM api_keys WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete API key' }); }
});

app.get('/api/usage', auth, hasPermission(), async (req, res) => {
  try {
    const result = await db('SELECT * FROM api_usage ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to get API usage' }); }
});

// ============= GROUPS =============
app.get('/api/groups', auth, hasPermission(), async (req, res) => {
  try {
    const groups = await db('SELECT * FROM groups');
    const groupsWithDetails = await Promise.all(groups.rows.map(async (group) => {
      const orgs = await db('SELECT id, name FROM organizations WHERE group_id = $1', [group.id]);
      const filesRes = await db('SELECT COALESCE(SUM(size), 0) as total FROM files WHERE group_id = $1', [group.id]);
      return { ...group, orgNames: orgs.rows.map(o => o.name), organizationIds: orgs.rows.map(o => o.id), usedStorage: parseInt(filesRes.rows[0].total) };
    }));
    res.json(groupsWithDetails);
  } catch (error) { res.status(500).json({ error: 'Failed to get groups' }); }
});

app.post('/api/groups', auth, hasPermission(), async (req, res) => {
  try {
    const { name, storageLimitGB, organizationIds, chatQuota, quotaType, renewDay } = req.body;
    const result = await db('INSERT INTO groups (name, storage_limit_gb, chat_quota, quota_type, renew_day) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, storageLimitGB, chatQuota || 0, quotaType || 'individual', renewDay || 1]);
    if (organizationIds?.length > 0) {
      await db('UPDATE organizations SET group_id = $1 WHERE id = ANY($2::uuid[])', [result.rows[0].id, organizationIds]);
    }
    res.json({ success: true, groupId: result.rows[0].id });
  } catch (error) { res.status(500).json({ error: 'Failed to create group' }); }
});

app.put('/api/groups/:id', auth, hasPermission(), async (req, res) => {
  try {
    const { name, storageLimitGB, organizationIds, chatQuota, quotaType, renewDay } = req.body;
    await db('UPDATE groups SET name=$1, storage_limit_gb=$2, chat_quota=$3, quota_type=$4, renew_day=$5 WHERE id=$6',
      [name, storageLimitGB, chatQuota || 0, quotaType || 'individual', renewDay || 1, req.params.id]);
    await db('UPDATE organizations SET group_id = NULL WHERE group_id = $1', [req.params.id]);
    if (organizationIds?.length > 0) {
      await db('UPDATE organizations SET group_id = $1 WHERE id = ANY($2::uuid[])', [req.params.id, organizationIds]);
    }
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update group' }); }
});

app.delete('/api/groups/:id', auth, hasPermission(), async (req, res) => {
  try {
    await db('UPDATE organizations SET group_id = NULL WHERE group_id = $1', [req.params.id]);
    await db('DELETE FROM chat_counts WHERE group_id = $1', [req.params.id]);
    await db('DELETE FROM chat_resets WHERE group_id = $1', [req.params.id]);
    await db('DELETE FROM groups WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete group' }); }
});

app.post('/api/groups/:id/reset-quota', auth, hasPermission(), async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await db('DELETE FROM chat_counts WHERE group_id = $1 AND month = $2', [req.params.id, currentMonth]);
    await db('INSERT INTO chat_resets (group_id, month) VALUES ($1, $2) ON CONFLICT (group_id, month) DO UPDATE SET reset_at = NOW()', [req.params.id, currentMonth]);
    res.json({ success: true, message: 'Chat quota reset successfully' });
  } catch (error) { res.status(500).json({ error: 'Failed to reset quota' }); }
});

app.post('/api/groups/:id/add-bonus', auth, hasPermission(), async (req, res) => {
  try {
    const { bonusQuota } = req.body;
    if (!bonusQuota || bonusQuota <= 0) return res.status(400).json({ error: 'Invalid bonus quota' });
    await db('UPDATE groups SET bonus_quota = bonus_quota + $1 WHERE id = $2', [bonusQuota, req.params.id]);
    res.json({ success: true, message: `Added ${bonusQuota} bonus chats` });
  } catch (error) { res.status(500).json({ error: 'Failed to add bonus quota' }); }
});

app.put('/api/groups/:id/renew-day', auth, hasPermission(), async (req, res) => {
  try {
    const { renewDay } = req.body;
    if (!renewDay || renewDay < 1 || renewDay > 31) return res.status(400).json({ error: 'Invalid renew day (1-31)' });
    await db('UPDATE groups SET renew_day = $1 WHERE id = $2', [renewDay, req.params.id]);
    res.json({ success: true, message: `Renew day updated to ${renewDay}` });
  } catch (error) { res.status(500).json({ error: 'Failed to update renew day' }); }
});

// Chat usage
app.get('/api/chat-usage', auth, async (req, res) => {
  try {
    const userRes = await db('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const assignRes = await db(
      `SELECT o.group_id FROM user_org_assignments uoa JOIN organizations o ON o.id = uoa.organization_id WHERE uoa.user_id = $1 AND o.group_id IS NOT NULL LIMIT 1`, [user.id]
    );
    const groupId = assignRes.rows[0]?.group_id;
    if (!groupId) return res.json({ hasQuota: false, unlimited: true });

    const groupRes = await db('SELECT * FROM groups WHERE id = $1', [groupId]);
    const group = groupRes.rows[0];
    if (!group || group.chat_quota === 0) return res.json({ hasQuota: false, unlimited: true });

    const currentMonth = new Date().toISOString().substring(0, 7);
    let used = 0;
    if (group.quota_type === 'individual') {
      const c = await db('SELECT count FROM chat_counts WHERE group_id = $1 AND user_id = $2 AND month = $3', [group.id, user.id, currentMonth]);
      used = c.rows[0]?.count || 0;
    } else {
      const c = await db('SELECT COALESCE(SUM(count), 0) as total FROM chat_counts WHERE group_id = $1 AND month = $2', [group.id, currentMonth]);
      used = parseInt(c.rows[0].total);
    }

    const effectiveQuota = group.chat_quota + (group.bonus_quota || 0);
    const now = new Date();
    let resetDate = new Date(now.getFullYear(), now.getMonth(), group.renew_day);
    if (resetDate <= now) resetDate = new Date(now.getFullYear(), now.getMonth() + 1, group.renew_day);

    res.json({ hasQuota: true, used, limit: effectiveQuota, baseLimit: group.chat_quota, bonusQuota: group.bonus_quota || 0, percentage: parseFloat((used / effectiveQuota * 100).toFixed(6)), quotaType: group.quota_type, resetDate: resetDate.toISOString(), renewDay: group.renew_day });
  } catch (error) { res.status(500).json({ error: 'Failed to get chat usage' }); }
});

// Update user name
app.put('/api/user/name', auth, async (req, res) => {
  try {
    await db('UPDATE users SET full_name = $1 WHERE id = $2', [req.body.fullName, req.user.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update name' }); }
});

// Upload logo
app.post('/api/upload-logo', auth, hasPermission(), upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const logoDir = join(__dirname, 'public', 'logos');
    if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });
    const logoFileName = `logo-${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const logoPath = join(logoDir, logoFileName);
    fs.copyFileSync(req.file.path, logoPath);
    fs.unlinkSync(req.file.path);
    const logoUrl = `/logos/${logoFileName}`;
    await updateSettings({ logo: logoUrl });
    res.json({ success: true, logo: logoUrl });
  } catch (error) { res.status(500).json({ error: 'Upload failed' }); }
});

app.post('/api/test-webhook', auth, hasPermission('system:manage_settings'), async (req, res) => {
  try { await axios.post(req.body.url, { test: true }, { timeout: 5000 }); res.json({ success: true }); }
  catch (error) { res.json({ success: false, error: error.message }); }
});

app.post('/api/test-s3', auth, hasPermission('system:manage_settings'), async (req, res) => {
  try {
    const { s3Bucket, s3Region, s3AccessKey, s3SecretKey } = req.body;
    if (!s3Bucket || !s3Region || !s3AccessKey || !s3SecretKey) return res.json({ success: false, error: 'Missing S3 configuration' });
    const testClient = new S3Client({ region: s3Region, credentials: { accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey } });
    await testClient.send(new HeadBucketCommand({ Bucket: s3Bucket }));
    res.json({ success: true });
  } catch (error) {
    let errorMsg = 'S3 connection failed';
    if (error.name === 'NoSuchBucket') errorMsg = 'Bucket does not exist';
    else if (error.name === 'InvalidAccessKeyId') errorMsg = 'Invalid Access Key ID';
    else if (error.name === 'SignatureDoesNotMatch') errorMsg = 'Invalid Secret Access Key';
    else if (error.name === 'AccessDenied') errorMsg = 'Access denied - check bucket permissions';
    else if (error.message) errorMsg = error.message;
    res.json({ success: false, error: errorMsg });
  }
});

// ============= TRANSCRIBE =============
app.post('/api/transcribe', auth, upload.single('audio'), async (req, res) => {
  try {
    const settings = await getSettings();
    const voiceMode = settings.voiceMode || 'browser';
    const voiceLanguage = settings.voiceLanguage || 'auto';

    if (voiceMode === 'local') {
      const whisperUrl = settings.whisperUrl || process.env.WHISPER_API_URL;
      if (!whisperUrl) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Whisper URL not configured.' }); }
      const formData = new FormData();
      formData.append('file', fs.createReadStream(req.file.path), { filename: req.file.originalname, contentType: req.file.mimetype });
      formData.append('model', 'Systran/faster-whisper-small');
      if (voiceLanguage !== 'auto') formData.append('language', voiceLanguage);
      const { data } = await axios.post(whisperUrl + '/v1/audio/transcriptions', formData, { headers: formData.getHeaders() });
      fs.unlinkSync(req.file.path);
      res.json({ text: data.text || '', language: voiceLanguage });
    } else if (voiceMode === 'gemini') {
      const geminiSttApiKey = settings.geminiSttApiKey;
      if (!geminiSttApiKey) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Gemini STT API Key not configured.' }); }
      try {
        const ai = new GoogleGenAI({ apiKey: geminiSttApiKey });
        const audioData = fs.readFileSync(req.file.path);
        const base64Audio = audioData.toString('base64');
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: req.file.mimetype || 'audio/webm', data: base64Audio } }, { text: 'Transcribe this audio to text. Keep mixed languages as spoken and do not translate unless asked. Return only the transcription.' }] }]
        });
        fs.unlinkSync(req.file.path);
        const responseText = typeof response.text === 'function' ? response.text() : response.text;
        const fallbackText = response?.candidates?.[0]?.content?.parts?.map(part => part.text)?.filter(Boolean)?.join('');
        res.json({ text: (responseText || fallbackText || '').trim(), language: voiceLanguage });
      } catch (geminiError) { fs.unlinkSync(req.file.path); return res.status(500).json({ error: `Gemini error: ${geminiError.message}` }); }
    } else if (voiceMode === 'elevenlabs') {
      const elevenlabsApiKey = settings.elevenlabsApiKey;
      if (!elevenlabsApiKey) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'ElevenLabs API Key not configured.' }); }
      try {
        const formData = new FormData();
        formData.append('audio', fs.createReadStream(req.file.path), { filename: 'audio.webm', contentType: 'audio/webm' });
        const { data } = await axios.post('https://api.elevenlabs.io/v1/audio-to-text', formData, { headers: { ...formData.getHeaders(), 'xi-api-key': elevenlabsApiKey }, timeout: 30000 });
        fs.unlinkSync(req.file.path);
        res.json({ text: data.text || '', language: voiceLanguage });
      } catch (e) { fs.unlinkSync(req.file.path); return res.status(500).json({ error: `ElevenLabs error: ${e.response?.data?.detail || e.message}` }); }
    } else if (voiceMode === 'api') {
      const webhooks = await getWebhookUrls();
      if (!webhooks.transcribe || webhooks.transcribe === 'http://localhost:5678/webhook/transcribe') { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Transcribe webhook not configured.' }); }
      const formData = new FormData();
      formData.append('file', fs.createReadStream(req.file.path), { filename: req.file.originalname, contentType: req.file.mimetype });
      const { data } = await axios.post(webhooks.transcribe, formData, { headers: formData.getHeaders() });
      fs.unlinkSync(req.file.path);
      res.json({ text: data.text || '', language: data.language });
    } else { fs.unlinkSync(req.file.path); return res.status(400).json({ error: 'Voice mode not supported' }); }
  } catch (error) {
    console.error('Transcription error:', error.message);
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Transcription failed: ' + error.message });
  }
});

// ============= TTS =============
app.post('/api/tts', auth, async (req, res) => {
  try {
    const { text, language, mode } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const settings = await getSettings();
    const ttsMode = mode || settings.ttsMode || 'browser';

    if (ttsMode === 'local') {
      const chatterboxUrl = settings.chatterboxUrl;
      if (!chatterboxUrl) return res.status(400).json({ error: 'Chatterbox URL not configured.' });
      try {
        const { data } = await axios.post(`${chatterboxUrl}/v1/audio/speech`, {
          input: text, voice: settings.chatterboxVoice || 'default', model: 'chatterbox'
        }, { responseType: 'arraybuffer', timeout: 30000 });
        res.set('Content-Type', 'audio/wav'); res.send(Buffer.from(data));
      } catch (e) { return res.status(500).json({ error: 'Chatterbox TTS failed: ' + (e.response?.data?.error || e.message) }); }
    } else if (ttsMode === 'gemini') {
      const geminiTtsApiKey = settings.geminiTtsApiKey;
      if (!geminiTtsApiKey) return res.status(400).json({ error: 'Gemini TTS API Key not configured.' });
      try {
        const voiceName = settings.geminiVoice || 'Aoede';
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const chunks = [];
        for (let i = 0; i < sentences.length; i += 2) chunks.push(sentences.slice(i, i + 2).join(' ').trim());
        const audioPromises = chunks.map(async (chunk) => {
          const requestBody = { contents: [{ parts: [{ text: chunk }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } };
          let retries = 3, delay = 1000;
          for (let attempt = 0; attempt < retries; attempt++) {
            try {
              const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiTtsApiKey}`, requestBody, { timeout: 30000, headers: { 'Content-Type': 'application/json' } });
              return Buffer.from(data.candidates[0].content.parts[0].inlineData.data, 'base64');
            } catch (error) { if (attempt === retries - 1) throw error; await new Promise(r => setTimeout(r, delay)); delay *= 2; }
          }
        });
        const pcmChunks = await Promise.all(audioPromises);
        const pcmData = Buffer.concat(pcmChunks);
        const sampleRate = 24000, numChannels = 1, bitsPerSample = 16;
        const wavHeader = Buffer.alloc(44);
        wavHeader.write('RIFF', 0); wavHeader.writeUInt32LE(36 + pcmData.length, 4); wavHeader.write('WAVE', 8); wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16); wavHeader.writeUInt16LE(1, 20); wavHeader.writeUInt16LE(numChannels, 22); wavHeader.writeUInt32LE(sampleRate, 24);
        wavHeader.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); wavHeader.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
        wavHeader.writeUInt16LE(bitsPerSample, 34); wavHeader.write('data', 36); wavHeader.writeUInt32LE(pcmData.length, 40);
        res.set('Content-Type', 'audio/wav'); res.send(Buffer.concat([wavHeader, pcmData]));
      } catch (e) { return res.status(500).json({ error: 'Gemini TTS failed: ' + (e.response?.data?.error?.message || e.message) }); }
    } else if (ttsMode === 'elevenlabs') {
      const elevenlabsApiKey = settings.elevenlabsApiKey;
      if (!elevenlabsApiKey) return res.status(400).json({ error: 'ElevenLabs API Key not configured.' });
      try {
        const voiceId = settings.elevenlabsVoice || 'onwK4e9ZLuTAKqWW03F9';
        const { data } = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }, { timeout: 15000, headers: { 'Content-Type': 'application/json', 'xi-api-key': elevenlabsApiKey }, responseType: 'arraybuffer' });
        res.set('Content-Type', 'audio/mpeg'); res.send(Buffer.from(data));
      } catch (e) { return res.status(500).json({ error: 'ElevenLabs TTS failed: ' + (e.response?.data?.detail || e.message) }); }
    } else if (ttsMode === 'gclas') {
      const gclasServiceAccount = settings.gclasServiceAccount;
      if (!gclasServiceAccount) return res.status(400).json({ error: 'Google Cloud Service Account not configured.' });
      try {
        const serviceAccount = JSON.parse(gclasServiceAccount);
        const authClient = new GoogleAuth({ credentials: serviceAccount, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        const client = await authClient.getClient();
        const accessToken = await client.getAccessToken();
        let languageCode = settings.gclasLanguage || 'auto';
        let voiceName = settings.gclasVoice || 'en-US-Neural2-C';
        if (languageCode === 'auto') {
          const hasMalay = /\b(saya|aku|kau|awak|anda|dengan|untuk|ini|itu|yang|adalah|tidak|ada|boleh|akan|sudah|dari|ke|di|pada|atau|kalau|nak|buat|jadi)\b/i.test(text);
          const hasChinese = /[\u4e00-\u9fff]/.test(text);
          const hasTamil = /[\u0B80-\u0BFF]/.test(text);
          if (hasChinese) { languageCode = 'cmn-CN'; voiceName = 'cmn-CN-Standard-A'; }
          else if (hasTamil) { languageCode = 'ta-IN'; voiceName = 'ta-IN-Standard-A'; }
          else if (hasMalay) { languageCode = 'ms-MY'; voiceName = 'ms-MY-Standard-A'; }
          else { languageCode = 'en-US'; voiceName = 'en-US-Neural2-C'; }
        }
        const { data } = await axios.post('https://texttospeech.googleapis.com/v1/text:synthesize', { input: { text }, voice: { languageCode, name: voiceName }, audioConfig: { audioEncoding: 'MP3' } }, { timeout: 15000, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken.token}` } });
        res.set('Content-Type', 'audio/mpeg'); res.send(Buffer.from(data.audioContent, 'base64'));
      } catch (e) { return res.status(500).json({ error: 'Google Cloud TTS failed: ' + (e.response?.data?.error?.message || e.message) }); }
    } else { return res.status(400).json({ error: 'Invalid TTS mode' }); }
  } catch (error) { res.status(500).json({ error: 'TTS failed: ' + (error.response?.data?.error?.message || error.message) }); }
});

// ============= OLLAMA TEST =============
app.post('/api/test-ollama', auth, hasPermission(), async (req, res) => {
  try {
    const s = await getSettings();
    const url = s.ollamaUrl || process.env.OLLAMA_URL || 'http://ollama:11434';
    const { data } = await axios.get(`${url}/api/tags`, { timeout: 5000 });
    res.json({ success: true, models: data.models?.map(m => m.name) || [] });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============= TEXT EMBEDDINGS =============
app.get('/api/text-embeddings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') return res.status(403).json({ error: 'Developer access only' });
    const result = await db('SELECT * FROM embeddings WHERE file_id IS NULL ORDER BY uploaded_at DESC');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to load embeddings' }); }
});

app.post('/api/text-embeddings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') return res.status(403).json({ error: 'Developer access only' });
    const { text, fileName } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text is required' });

    const settings = await getSettings();
    let embedding;

    const ollamaUrl = settings.ollamaUrl || process.env.OLLAMA_URL;
    const embeddingModel = settings.ollamaEmbeddingModel || 'nomic-embed-text';

    if (ollamaUrl) {
      const response = await axios.post(`${ollamaUrl}/api/embed`, { model: embeddingModel, input: text.trim() });
      embedding = response.data.embeddings[0];
    } else {
      const apiKey = settings.geminiSttApiKey || settings.geminiTtsApiKey;
      if (!apiKey) return res.status(500).json({ error: 'No embedding service configured. Set up Ollama or Gemini API key.' });
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
        { model: 'models/gemini-embedding-001', content: { parts: [{ text: text.trim() }] } }
      );
      embedding = response.data.embedding.values;
    }

    await db(
      `INSERT INTO embeddings (text, embedding, file_name, file_id, shared_with) VALUES ($1, $2::vector, $3, NULL, $4)`,
      [text.trim(), `[${embedding.join(',')}]`, fileName?.trim() || 'Custom Knowledge', ['PUBLIC']]
    );
    res.json({ success: true, message: 'Text embedded successfully' });
  } catch (error) {
    console.error('Text embedding error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to embed text' });
  }
});

app.delete('/api/text-embeddings/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') return res.status(403).json({ error: 'Developer access only' });
    await db('DELETE FROM embeddings WHERE id = $1 AND file_id IS NULL', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete' }); }
});

// ============= CLEANUP =============
async function cleanupOldData() {
  try {
    const settings = await getSettings();
    const retentionDays = settings.deletedChatRetentionDays || 360;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const del1 = await db('DELETE FROM deleted_messages WHERE deleted_at < $1', [cutoffDate]);
    if (del1.rowCount > 0) console.log(`Cleaned up ${del1.rowCount} old deleted messages`);
    const del2 = await db('DELETE FROM api_usage WHERE timestamp < $1', [cutoffDate]);
    if (del2.rowCount > 0) console.log(`Cleaned up ${del2.rowCount} old API usage logs`);
    const del3 = await db('DELETE FROM download_tracking WHERE downloaded_at < $1', [cutoffDate]);
    if (del3.rowCount > 0) console.log(`Cleaned up ${del3.rowCount} old download tracking`);
  } catch (error) { console.error('Cleanup error:', error); }
}
setInterval(cleanupOldData, 24 * 60 * 60 * 1000);
cleanupOldData();

// ============= ROBOT SETTINGS =============
app.get('/api/robot-settings', auth, hasPermission('developer'), async (req, res) => {
  try {
    const result = await db('SELECT * FROM robot_settings ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to get robot settings' }); }
});

app.get('/api/robot-settings/:id', auth, hasPermission('developer'), async (req, res) => {
  try {
    const result = await db('SELECT * FROM robot_settings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Robot not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to get robot setting' }); }
});

app.post('/api/robot-settings', auth, hasPermission('developer'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await db('INSERT INTO robot_settings (name, description) VALUES ($1, $2) RETURNING id', [name, description || '']);
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) { res.status(500).json({ error: 'Failed to create robot setting' }); }
});

app.put('/api/robot-settings/:id', auth, hasPermission('developer'), async (req, res) => {
  try {
    const { name, description, navigation, motion, emotion } = req.body;
    await db('UPDATE robot_settings SET name=$1, description=$2, navigation=$3, motion=$4, emotion=$5, updated_at=NOW() WHERE id=$6',
      [name, description, JSON.stringify(navigation), JSON.stringify(motion), JSON.stringify(emotion), req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update robot setting' }); }
});

app.delete('/api/robot-settings/:id', auth, hasPermission('developer'), async (req, res) => {
  try {
    const linked = await db('SELECT id, name, short_key, key FROM api_keys WHERE robot_setting_id = $1', [req.params.id]);
    if (linked.rows.length > 0) {
      const keyNames = linked.rows.map(k => `${k.name} (${k.short_key || k.key.substring(0, 10) + '...'})`);
      return res.status(400).json({ error: 'Cannot delete robot', message: `Linked to ${linked.rows.length} API key(s): ${keyNames.join(', ')}`, linkedKeys: keyNames });
    }
    await db('DELETE FROM robot_settings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete robot setting' }); }
});

app.get('/api/robot-data', authenticateApiKey, async (req, res) => {
  try {
    if (!req.apiKey.robot_setting_id) return res.status(404).json({ error: 'No robot setting linked to this API key' });
    const result = await db('SELECT * FROM robot_settings WHERE id = $1', [req.apiKey.robot_setting_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Robot setting not found' });
    const r = result.rows[0];
    res.json({ name: r.name, navigation: r.navigation, motion: r.motion, emotion: r.emotion });
  } catch (error) { res.status(500).json({ error: 'Failed to get robot data' }); }
});

app.post('/api/robot-navigation', authenticateApiKey, async (req, res) => {
  try {
    if (!req.apiKey.robot_setting_id) return res.status(404).json({ error: 'No robot setting linked to this API key' });
    const { navigation } = req.body;
    if (!Array.isArray(navigation)) return res.status(400).json({ error: 'navigation must be an array' });
    const result = await db('SELECT navigation FROM robot_settings WHERE id = $1', [req.apiKey.robot_setting_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Robot setting not found' });
    if (JSON.stringify(result.rows[0].navigation) === JSON.stringify(navigation)) return res.json({ updated: false, message: 'Navigation data unchanged' });
    await db('UPDATE robot_settings SET navigation = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(navigation), req.apiKey.robot_setting_id]);
    res.json({ updated: true, message: `Navigation updated with ${navigation.length} entries` });
  } catch (error) { res.status(500).json({ error: 'Failed to update navigation' }); }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'frontend/dist/index.html'));
});

app.listen(3000, () => console.log('Server running on port 3000'));
