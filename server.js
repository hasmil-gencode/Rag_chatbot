import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
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
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAuth } from 'google-auth-library';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve React app static files
app.use(express.static(join(__dirname, 'frontend/dist')));

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

let db;
const client = new MongoClient(MONGODB_URI);

await client.connect();
db = client.db('ragchatbot_stag');
console.log('Connected to MongoDB (ragchatbot_stag)');

// Initialize default settings
const settingsExists = await db.collection('settings').findOne({ _id: 'config' });
if (!settingsExists) {
  await db.collection('settings').insertOne({
    _id: 'config',
    companyName: 'GenBotChat',
    voiceMode: 'browser',
    voiceLanguage: 'auto',
    googleSttApiKey: '',
    googleTtsApiKey: '',
    geminiSttApiKey: '',
    geminiTtsApiKey: '',
    elevenlabsApiKey: '',
    elevenlabsVoice: 'onwK4e9ZLuTAKqWW03F9',
    gclasServiceAccount: '',
    gclasLanguage: 'auto',
    gclasVoice: 'en-US-Neural2-C',
    geminiVoice: 'Aoede',
    geminiTtsLanguage: 'auto',
    ttsMode: 'browser',
    ttsLanguage: 'en-US',
    chatWebhook: '',
    uploadWebhook: '',
    transcribeWebhook: '',
    formSubmissionWebhook: '',
    s3Bucket: '',
    s3Region: '',
    s3AccessKey: '',
    s3SecretKey: ''
  });
  console.log('Default settings initialized');
}

// Helper to get S3 client
async function getS3Client() {
  const settings = await db.collection('settings').findOne({ _id: 'config' });
  if (!settings?.s3AccessKey || !settings?.s3SecretKey || !settings?.s3Region) {
    return null;
  }
  return new S3Client({
    region: settings.s3Region,
    credentials: {
      accessKeyId: settings.s3AccessKey,
      secretAccessKey: settings.s3SecretKey
    }
  });
}

// Helper to get webhook URLs from DB
async function getWebhookUrls() {
  const settings = await db.collection('settings').findOne({ _id: 'config' });
  return {
    chat: settings?.chatWebhook || 'http://localhost:5678/webhook/chat',
    upload: settings?.uploadWebhook || 'http://localhost:5678/webhook/upload',
    transcribe: settings?.transcribeWebhook || 'http://localhost:5678/webhook/transcribe'
  };
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

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
    
    // Get user
    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    req.user = {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    };
    
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Permission check middleware (simplified for developer-only)
const hasPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    // Only developer has all permissions
    if (req.user.role === 'developer') {
      return next();
    }
    
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

// Auth
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.collection('users').findOne({ email, status: 'active' });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ 
    id: user._id, 
    email: user.email,
    role: user.role
  }, JWT_SECRET);
  
  res.json({ 
    success: true, 
    token, 
    user: { 
      id: user._id.toString(), 
      email: user.email,
      fullName: user.fullName,
      role: user.role
    } 
  });
});

// Get current user info
app.get('/api/user/me', auth, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      canUploadFiles: user.canUploadFiles !== false
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ===== PHASE 2: Multi-Org Hierarchy APIs =====

// Create user (Developer only)
// REMOVED DUPLICATE - Using the one at line 1855 with organization assignments


// Create organization/entity/department
app.post('/api/organizations', auth, hasPermission(), async (req, res) => {
  try {
    const { name, type, parentId } = req.body; // type: 'organization' | 'entity' | 'department'
    
    let path = [name];
    if (parentId) {
      const parent = await db.collection('organizations').findOne({ _id: new ObjectId(parentId) });
      if (!parent) return res.status(404).json({ error: 'Parent not found' });
      path = [...parent.path, name];
    }
    
    const result = await db.collection('organizations').insertOne({
      name,
      type,
      parentId: parentId ? new ObjectId(parentId) : null,
      path,
      createdBy: req.user.id,
      createdAt: new Date()
    });
    
    res.json({ success: true, organizationId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Assign user to organizations (Developer only)
app.post('/api/user-assignments', auth, hasPermission(), async (req, res) => {
  try {
    const { userId, organizationIds } = req.body; // organizationIds is array
    
    console.log('=== ASSIGN USER TO ORGS ===');
    console.log('userId:', userId, typeof userId);
    console.log('organizationIds:', organizationIds);
    
    // Remove existing assignments
    const deleteResult = await db.collection('user_organization_assignments').deleteMany({ 
      userId: new ObjectId(userId) 
    });
    console.log('Deleted', deleteResult.deletedCount, 'existing assignments');
    
    // Add new assignments
    const assignments = organizationIds.map(orgId => ({
      userId: new ObjectId(userId),
      userIdStr: userId, // String version for n8n
      organizationId: new ObjectId(orgId),
      assignedBy: req.user.id,
      assignedAt: new Date()
    }));
    
    console.log('Creating', assignments.length, 'new assignments');
    
    if (assignments.length > 0) {
      const insertResult = await db.collection('user_organization_assignments').insertMany(assignments);
      console.log('Inserted', insertResult.insertedCount, 'assignments');
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Assign user error:', error);
    res.status(500).json({ error: 'Failed to assign user' });
  }
});

// Get user's assigned organizations
app.get('/api/my-organizations', auth, async (req, res) => {
  try {
    const assignments = await db.collection('user_organization_assignments')
      .find({ userId: new ObjectId(req.user.id) })
      .toArray();
    
    const orgIds = assignments.map(a => a.organizationId);
    const organizations = await db.collection('organizations')
      .find({ _id: { $in: orgIds } })
      .toArray();
    
    res.json({ organizations });
  } catch (error) {
    console.error('Get my organizations error:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

// Get user's organizations with hierarchy (assigned + all children)
app.get('/api/my-organizations-hierarchy', auth, async (req, res) => {
  try {
    console.log('=== my-organizations-hierarchy called ===');
    const userId = new ObjectId(req.user.id);
    console.log('User ID:', userId);
    
    // Get directly assigned orgs
    const assignments = await db.collection('user_organization_assignments')
      .find({ userId: userId })
      .toArray();
    console.log('Assignments found:', assignments.length);
    
    const assignedOrgIds = assignments.map(a => a.organizationId);
    console.log('Assigned org IDs:', assignedOrgIds);
    
    const assignedOrgs = await db.collection('organizations')
      .find({ _id: { $in: assignedOrgIds } })
      .toArray();
    console.log('Assigned orgs:', assignedOrgs.map(o => o.name));
    
    // For each assigned org, find all children
    const allOrgIds = new Set(assignedOrgIds.map(id => id.toString()));
    
    for (const org of assignedOrgs) {
      // Find all orgs where path contains this org's name
      const children = await db.collection('organizations')
        .find({ path: org.name })
        .toArray();
      console.log(`Children of ${org.name}:`, children.length);
      
      children.forEach(child => allOrgIds.add(child._id.toString()));
    }
    
    // Get all orgs (assigned + children)
    const allOrgs = await db.collection('organizations')
      .find({ _id: { $in: Array.from(allOrgIds).map(id => new ObjectId(id)) } })
      .toArray();
    
    console.log('Final orgs:', allOrgs.map(o => o.name));
    res.json({ organizations: allOrgs });
  } catch (error) {
    console.error('Error in my-organizations-hierarchy:', error);
    res.status(500).json({ error: 'Failed to get organizations hierarchy' });
  }
});

// Get all organizations (Developer only)
app.get('/api/organizations', auth, hasPermission(), async (req, res) => {
  try {
    const organizations = await db.collection('organizations').find({}).toArray();
    res.json({ organizations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

// Update organization (Developer only)
app.put('/api/organizations/:id', auth, hasPermission(), async (req, res) => {
  try {
    const { name, type, parentId } = req.body;
    
    let path = [name];
    if (parentId) {
      const parent = await db.collection('organizations').findOne({ _id: new ObjectId(parentId) });
      if (!parent) return res.status(404).json({ error: 'Parent not found' });
      path = [...parent.path, name];
    }
    
    await db.collection('organizations').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { name, path, updatedAt: new Date() } }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Delete organization (Developer only)
app.delete('/api/organizations/:id', auth, hasPermission(), async (req, res) => {
  try {
    await db.collection('organizations').deleteOne({ _id: new ObjectId(req.params.id) });
    // Also remove user assignments
    await db.collection('user_organization_assignments').deleteMany({ organizationId: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// Get all users (Developer only)
app.get('/api/users', auth, hasPermission(), async (req, res) => {
  try {
    const users = await db.collection('users').find({}).toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Update user (Developer only)
app.put('/api/users/:id', auth, hasPermission(), async (req, res) => {
  try {
    const { fullName, password, canUploadFiles } = req.body;
    const updateData = { fullName, updatedAt: new Date() };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    if (canUploadFiles !== undefined) {
      updateData.canUploadFiles = canUploadFiles;
    }
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Get user assignments
app.get('/api/user-assignments/:userId', auth, hasPermission(), async (req, res) => {
  try {
    const assignments = await db.collection('user_organization_assignments')
      .find({ userId: new ObjectId(req.params.userId) })
      .toArray();
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user assignments' });
  }
});

// Delete user (Developer only)
app.delete('/api/users/:id', auth, hasPermission(), async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.params.id) });
    if (user?.role === 'developer') {
      return res.status(403).json({ error: 'Cannot delete developer account' });
    }
    await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
    // Also remove user assignments
    await db.collection('user_organization_assignments').deleteMany({ userId: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Switch active organization context
app.post('/api/switch-organization', auth, async (req, res) => {
  try {
    const { organizationId } = req.body;
    
    // Verify user has access to this org
    const assignment = await db.collection('user_organization_assignments').findOne({
      userId: new ObjectId(req.user.id),
      organizationId: new ObjectId(organizationId)
    });
    
    if (!assignment && req.user.role !== 'developer') {
      return res.status(403).json({ error: 'No access to this organization' });
    }
    
    // Store in session or return to frontend to store
    res.json({ success: true, currentOrganizationId: organizationId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to switch organization' });
  }
});

// Chat
app.post('/api/chat', auth, async (req, res) => {
  try {
    const { message, sessionId, fileId, currentOrganizationId } = req.body;
    const chatSessionId = sessionId || new ObjectId().toString();
    
    // Get user info for startedBy
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    const startedByEmail = user?.email || 'Unknown';
    const startedByName = startedByEmail.split('@')[0];
    
    // Get user's groupId from their organization assignments
    let groupId = user.groupId;
    
    if (!groupId) {
      const assignments = await db.collection('user_organization_assignments').find({ 
        userId: user._id
      }).toArray();
      
      if (assignments.length > 0) {
        const org = await db.collection('organizations').findOne({ 
          _id: assignments[0].organizationId 
        });
        groupId = org?.groupId;
      }
    }
    
    // Check chat quota if user has groupId
    if (groupId) {
      const group = await db.collection('groups').findOne({ _id: groupId });
      
      if (group && group.chatQuota > 0) {
        const currentMonth = new Date().toISOString().substring(0, 7); // "2026-02"
        
        // Check if need to reset (today is renew day)
        const today = new Date().getDate();
        if (today === group.renewDay) {
          const lastReset = await db.collection('chat_resets').findOne({ 
            groupId: group._id, 
            month: currentMonth 
          });
          
          if (!lastReset) {
            // Reset counts AND bonus quota for this group
            await db.collection('chat_counts').deleteMany({ 
              groupId: group._id, 
              month: { $lt: currentMonth } 
            });
            
            await db.collection('chat_resets').insertOne({ 
              groupId: group._id, 
              month: currentMonth, 
              resetAt: new Date() 
            });
            
            // Reset bonus quota to 0
            await db.collection('groups').updateOne(
              { _id: group._id },
              { $set: { bonusQuota: 0 } }
            );
          }
        }
        
        // Calculate effective quota (base + bonus)
        const effectiveQuota = group.chatQuota + (group.bonusQuota || 0);
        
        // Check quota
        if (group.quotaType === 'individual') {
          const userCount = await db.collection('chat_counts').findOne({ 
            groupId: group._id, 
            userId: user._id, 
            month: currentMonth 
          });
          
          const currentCount = userCount?.count || 0;
          if (currentCount >= effectiveQuota) {
            return res.status(429).json({ 
              error: 'quota_exceeded',
              message: 'Your quota exceeded limit, please contact Admin',
              used: currentCount,
              limit: effectiveQuota
            });
          }
        } else {
          // Total quota for entire group
          const counts = await db.collection('chat_counts').find({ 
            groupId: group._id, 
            month: currentMonth 
          }).toArray();
          
          const totalCount = counts.reduce((sum, c) => sum + c.count, 0);
          if (totalCount >= effectiveQuota) {
            return res.status(429).json({ 
              error: 'quota_exceeded',
              message: 'Your quota exceeded limit, please contact Admin',
              used: totalCount,
              limit: effectiveQuota
            });
          }
        }
      }
    }
    
    // Save user message with current org context
    await db.collection('messages').insertOne({
      userId: req.user.id,
      sessionId: chatSessionId,
      currentOrganizationId: currentOrganizationId ? new ObjectId(currentOrganizationId) : null,
      startedBy: startedByName,
      startedByEmail: startedByEmail,
      role: 'user',
      content: message,
      chatType: 'browser',
      chatName: 'normal',
      createdAt: new Date()
    });

    // Get webhook URL from settings
    const webhooks = await getWebhookUrls();

    // Send to n8n with sessionId, fileId, currentOrganizationId and timeout
    const { data } = await axios.post(webhooks.chat, { 
      message, 
      userId: req.user.id,
      currentOrganizationId: currentOrganizationId || null,
      sessionId: chatSessionId,
      fileId: fileId || null
    }, {
      timeout: 60000 // 1 minute timeout
    });

    // Save bot response
    await db.collection('messages').insertOne({
      userId: req.user.id,
      sessionId: chatSessionId,
      currentOrganizationId: currentOrganizationId ? new ObjectId(currentOrganizationId) : null,
      startedBy: startedByName,
      startedByEmail: startedByEmail,
      role: 'bot',
      content: data.response,
      chatType: 'browser',
      chatName: 'normal',
      createdAt: new Date()
    });

    // Increment chat count if user has groupId
    if (groupId) {
      const currentMonth = new Date().toISOString().substring(0, 7);
      await db.collection('chat_counts').updateOne(
        { groupId: groupId, userId: user._id, month: currentMonth },
        { 
          $inc: { count: 1 },
          $setOnInsert: { createdAt: new Date() },
          $set: { updatedAt: new Date() }
        },
        { upsert: true }
      );
    }

    res.json({ response: data.response, sessionId: chatSessionId });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to get response. Please check n8n webhook configuration.',
      details: error.message 
    });
  }
});

// API Key authentication middleware
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const keyDoc = await db.collection('api_keys').findOne({ key: apiKey });
    
    if (!keyDoc) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!keyDoc.isActive) {
      return res.status(403).json({ error: 'API key is disabled' });
    }

    // Update last used
    await db.collection('api_keys').updateOne(
      { _id: keyDoc._id },
      { $set: { lastUsedAt: new Date() } }
    );

    // Set user context from API key
    req.user = {
      id: keyDoc.userId,
      role: 'user' // API keys are always user role
    };
    req.apiKey = keyDoc;
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Public chat API endpoint (uses API key)
app.post('/api/v1/chat', authenticateApiKey, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Log API usage
    await db.collection('api_usage').insertOne({
      apiKeyId: req.apiKey._id,
      endpoint: '/api/v1/chat',
      method: 'POST',
      timestamp: new Date(),
      responseStatus: 200,
      ipAddress: req.ip
    });

    const chatSessionId = sessionId || new ObjectId().toString();
    
    // Get user info
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    const startedByEmail = user?.email || 'API User';
    const startedByName = startedByEmail.split('@')[0];
    
    // Get user's organizations for context
    const userAssignments = await db.collection('user_organization_assignments').find({ 
      userId: req.user.id.toString() 
    }).toArray();
    
    let currentOrganizationId = null;
    if (userAssignments.length > 0) {
      currentOrganizationId = userAssignments[0].organizationId;
    }

    // Save user message
    await db.collection('messages').insertOne({
      userId: req.user.id,
      sessionId: chatSessionId,
      currentOrganizationId: currentOrganizationId ? new ObjectId(currentOrganizationId) : null,
      startedBy: startedByName,
      startedByEmail: startedByEmail,
      role: 'user',
      content: message,
      chatType: 'API',
      chatName: req.apiKey.name,
      source: 'api',
      apiKeyId: req.apiKey._id,
      createdAt: new Date()
    });

    // Get webhook URL
    const webhooks = await getWebhookUrls();

    // Send to n8n
    const { data } = await axios.post(webhooks.chat, { 
      message, 
      userId: req.user.id.toString(),
      currentOrganizationId: currentOrganizationId,
      sessionId: chatSessionId,
      fileId: null
    }, {
      timeout: 60000
    });

    // Save bot response
    await db.collection('messages').insertOne({
      userId: req.user.id,
      sessionId: chatSessionId,
      currentOrganizationId: currentOrganizationId ? new ObjectId(currentOrganizationId) : null,
      startedBy: startedByName,
      startedByEmail: startedByEmail,
      role: 'bot',
      content: data.response,
      chatType: 'API',
      chatName: req.apiKey.name,
      source: 'api',
      apiKeyId: req.apiKey._id,
      createdAt: new Date()
    });

    res.json({ 
      response: data.response,
      sessionId: chatSessionId 
    });

  } catch (error) {
    console.error('API chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Streaming chat endpoint
// Get chat history
app.get('/api/messages', auth, async (req, res) => {
  const sessionId = req.query.sessionId;
  let query = {};
  
  if (req.user.role === 'developer') {
    // Developer sees all chats in their org
    query = {
      organizationId: req.user.organizationId
    };
  } else {
    // Admin/Manager/User see only own chats
    query = {
      userId: req.user.id
    };
  }
  
  if (sessionId) query.sessionId = sessionId;
  
  const messages = await db.collection('messages')
    .find(query)
    .sort({ createdAt: 1 })
    .toArray();
  res.json(messages.map(m => ({ 
    role: m.role, 
    content: m.content,
    createdAt: m.createdAt 
  })));
});

// Get chat sessions
app.get('/api/sessions', auth, async (req, res) => {
  try {
    const { currentOrganizationId } = req.query;
    
    // Build match query
    let matchQuery = {};
    
    if (req.user.role === 'developer') {
      // Developer sees all sessions
      if (currentOrganizationId) {
        matchQuery.currentOrganizationId = new ObjectId(currentOrganizationId);
      }
    } else {
      // Users see only their own sessions in current org
      matchQuery.userId = req.user.id;
      if (currentOrganizationId) {
        matchQuery.currentOrganizationId = new ObjectId(currentOrganizationId);
      }
    }
    
    const sessions = await db.collection('messages')
      .aggregate([
        { $match: matchQuery },
        { $sort: { createdAt: 1 } },
        { $group: {
          _id: '$sessionId',
          firstMessage: { $first: '$content' },
          lastMessageAt: { $last: '$createdAt' },
          messageCount: { $sum: 1 },
          startedBy: { $first: '$startedBy' },
          startedByEmail: { $first: '$startedByEmail' }
        }},
        { $sort: { lastMessageAt: -1 } },
        { $limit: 50 }
      ]).toArray();
    
    res.json(sessions.map(s => ({
      id: s._id,
      title: (s.firstMessage || 'New chat').substring(0, 50),
      lastMessageAt: s.lastMessageAt,
      messageCount: s.messageCount,
      startedBy: s.startedBy || s.startedByEmail,
      startedByEmail: s.startedByEmail
    })));
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete chat session
app.delete('/api/sessions/:id', auth, async (req, res) => {
  try {
    // Developer can delete any session, others can only delete their own
    const matchQuery = req.user.role === 'developer'
      ? { sessionId: req.params.id }
      : { sessionId: req.params.id, userId: req.user.id };
      
    const sessionExists = await db.collection('messages').findOne(matchQuery);
    
    if (!sessionExists) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get all messages in this session before deleting
    const messagesToDelete = await db.collection('messages').find({
      sessionId: req.params.id
    }).toArray();
    
    // Save to deleted_messages collection for audit trail
    if (messagesToDelete.length > 0) {
      const deletedRecords = messagesToDelete.map(m => ({
        ...m,
        deletedBy: req.user.id,
        deletedByEmail: req.user.email,
        deletedAt: new Date(),
        originalId: m._id
      }));
      
      await db.collection('deleted_messages').insertMany(deletedRecords);
    }
    
    // Delete all messages in this session
    await db.collection('messages').deleteMany({
      sessionId: req.params.id,
      userId: req.user.id
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get deleted chats (developer only)
app.get('/api/deleted-sessions', auth, async (req, res) => {
  try {
    // Only developer can view deleted chats
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }
    
    const sessions = await db.collection('deleted_messages')
      .aggregate([
        { $match: { organizationId: req.user.organizationId } },
        { $sort: { deletedAt: -1 } },
        { $group: {
          _id: '$sessionId',
          firstMessage: { $first: '$content' },
          deletedAt: { $first: '$deletedAt' },
          deletedBy: { $first: '$deletedByEmail' },
          messageCount: { $sum: 1 },
          startedBy: { $first: '$startedBy' },
          startedByEmail: { $first: '$startedByEmail' }
        }},
        { $sort: { deletedAt: -1 } },
        { $limit: 100 }
      ]).toArray();
    
    res.json(sessions.map(s => ({
      id: s._id,
      title: (s.firstMessage || 'Deleted chat').substring(0, 50),
      deletedAt: s.deletedAt,
      deletedBy: s.deletedBy,
      messageCount: s.messageCount,
      startedBy: s.startedBy || s.startedByEmail,
      startedByEmail: s.startedByEmail
    })));
  } catch (error) {
    console.error('Get deleted sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get deleted chat messages (developer only)
app.get('/api/deleted-messages', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }
    
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    
    const messages = await db.collection('deleted_messages')
      .find({ 
        sessionId,
        organizationId: req.user.organizationId 
      })
      .sort({ createdAt: 1 })
      .toArray();
    
    res.json(messages.map(m => ({ 
      role: m.role, 
      content: m.content,
      createdAt: m.createdAt,
      deletedAt: m.deletedAt,
      deletedBy: m.deletedByEmail
    })));
  } catch (error) {
    console.error('Get deleted messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload file
app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const settings = await db.collection('settings').findOne({ _id: 'config' });
    const s3Client = await getS3Client();
    
    // Get uploader info
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    const uploaderEmail = user?.email || 'Unknown';
    const uploaderName = uploaderEmail.split('@')[0];
    
    // Get sharedWith from request (array of org IDs)
    const sharedWith = req.body.sharedWith ? JSON.parse(req.body.sharedWith) : [];
    const fileType = req.body.type || 'document'; // 'document' or 'form'
    
    // Check storage limit for user's group and get groupId
    let userGroupId = null;
    const userId = req.user.id.toString(); // Convert to string
    const userAssignments = await db.collection('user_organization_assignments').find({ 
      userId: userId 
    }).toArray();
    
    if (userAssignments.length > 0) {
      const userOrgIds = userAssignments.map(a => a.organizationId);
      const userOrgs = await db.collection('organizations').find({
        _id: { $in: userOrgIds.map(id => new ObjectId(id)) }
      }).toArray();
      
      // Find group from any of user's orgs
      const groupId = userOrgs.find(o => o.groupId)?.groupId;
      
      if (groupId) {
        userGroupId = groupId; // Save for file metadata
        const group = await db.collection('groups').findOne({ _id: groupId });
        
        if (group) {
          // Calculate current usage from files with this groupId
          const files = await db.collection('files').find({ groupId: groupId }).toArray();
          const currentUsage = files.reduce((sum, f) => sum + (f.size || 0), 0);
          const limitBytes = group.storageLimitGB * 1024 * 1024 * 1024;
          
          if (currentUsage + req.file.size > limitBytes) {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
              error: `Storage limit exceeded. Limit: ${group.storageLimitGB}GB, Used: ${(currentUsage / 1024 / 1024 / 1024).toFixed(2)}GB` 
            });
          }
        }
      }
    }
    
    let fileUrl;
    
    if (s3Client && settings.s3Bucket) {
      try {
        // Upload to S3
        const fileContent = fs.readFileSync(req.file.path);
        const s3Key = `uploads/${req.user.id}/${Date.now()}-${req.file.originalname}`;
        
        await s3Client.send(new PutObjectCommand({
          Bucket: settings.s3Bucket,
          Key: s3Key,
          Body: fileContent,
          ContentType: req.file.mimetype
        }));
        
        fileUrl = `https://${settings.s3Bucket}.s3.${settings.s3Region}.amazonaws.com/${s3Key}`;
        
        // Delete local file after S3 upload
        fs.unlinkSync(req.file.path);
      } catch (s3Error) {
        console.error('S3 upload failed, using local storage:', s3Error.message);
        // Fallback to local storage if S3 fails
        fileUrl = `file://${req.file.path}`;
      }
    } else {
      // Keep local if S3 not configured
      fileUrl = `file://${req.file.path}`;
    }
    
    // Save file metadata with sharedWith array
    const file = {
      userId: req.user.id,
      groupId: userGroupId, // Group ID for storage tracking
      sharedWith: sharedWith.map(id => new ObjectId(id)), // Array of org IDs
      type: fileType,
      isDownloadable: fileType === 'form',
      isVectorized: fileType === 'document',
      uploadedBy: uploaderName,
      uploadedByEmail: uploaderEmail,
      name: req.file.originalname,
      size: req.file.size, // File size in bytes
      url: fileUrl,
      uploadedAt: new Date()
    };
    
    const result = await db.collection('files').insertOne(file);
    
    // Only send to n8n if type is 'document'
    if (fileType === 'document') {
      // Send to n8n and WAIT for response (max 5 minutes)
      const webhooks = await getWebhookUrls();
      
      try {
        const response = await axios.post(webhooks.upload, {
          fileId: result.insertedId.toString(),
          userId: req.user.id,
          sharedWith: sharedWith,
          fileName: req.file.originalname,
          fileSize: req.file.size, // Send file size to n8n
          fileUrl: fileUrl
        }, {
          timeout: 300000 // 5 minutes
        });
        
        res.json({ 
          success: true, 
          fileId: result.insertedId,
          message: response.data.message || 'File uploaded and embedded successfully',
          chunks: response.data.chunks || 0
        });
      } catch (webhookError) {
        console.error('n8n webhook error:', webhookError.message);
        res.status(500).json({ 
          success: false, 
          error: 'File uploaded but embedding failed. Please try again.' 
        });
      }
    } else {
      // For forms, just return success without n8n processing
      res.json({ 
        success: true, 
        fileId: result.insertedId,
        message: 'Form uploaded successfully'
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fuzzy match helper function
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Simple substring match
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Calculate Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  const distance = matrix[s2.length][s1.length];
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - (distance / maxLen);
}

// Check downloadable files with fuzzy match
app.post('/api/files/check-downloadable', auth, async (req, res) => {
  try {
    const { fileNames } = req.body;
    
    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return res.json([]);
    }
    
    // Get all downloadable forms
    const allForms = await db.collection('files').find({
      type: 'form',
      isDownloadable: true
    }).toArray();
    
    // Fuzzy match each filename
    const matches = [];
    for (const searchName of fileNames) {
      const scored = allForms.map(form => ({
        id: form._id,
        name: form.name,
        uploadedBy: form.uploadedBy,
        uploadedAt: form.uploadedAt,
        similarity: calculateSimilarity(searchName, form.name)
      }))
      .filter(f => f.similarity > 0.7) // Threshold 70% to reduce false positives
      .sort((a, b) => b.similarity - a.similarity);
      
      if (scored.length > 0) {
        matches.push({
          searchTerm: searchName,
          files: scored
        });
      }
    }
    
    res.json(matches);
  } catch (error) {
    console.error('Check downloadable error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get storage info for user's group
app.get('/api/storage-info', auth, async (req, res) => {
  try {
    console.log('=== STORAGE INFO ===');
    console.log('User ID:', req.user.id, typeof req.user.id);
    
    // Convert to ObjectId for query
    const userId = new ObjectId(req.user.id);
    
    const userAssignments = await db.collection('user_organization_assignments').find({ 
      userId: userId 
    }).toArray();
    
    console.log('User assignments:', userAssignments.length);
    
    if (userAssignments.length === 0) {
      console.log('No assignments, returning 0/0');
      return res.json({ used: 0, limit: 0 });
    }
    
    const userOrgIds = userAssignments.map(a => a.organizationId);
    console.log('User org IDs:', userOrgIds);
    
    const userOrgs = await db.collection('organizations').find({
      _id: { $in: userOrgIds.map(id => typeof id === 'string' ? new ObjectId(id) : id) }
    }).toArray();
    
    console.log('User orgs:', userOrgs.map(o => ({ name: o.name, groupId: o.groupId })));
    
    const groupId = userOrgs.find(o => o.groupId)?.groupId;
    
    console.log('Found groupId:', groupId);
    
    if (!groupId) {
      console.log('No groupId, returning 0/0');
      return res.json({ used: 0, limit: 0 });
    }
    
    // Convert groupId to ObjectId if it's a string
    const groupObjectId = typeof groupId === 'string' ? new ObjectId(groupId) : groupId;
    
    console.log('Group ObjectId:', groupObjectId);
    
    const group = await db.collection('groups').findOne({ _id: groupObjectId });
    console.log('Group found:', group ? group.name : 'NOT FOUND');
    
    if (!group) {
      console.log('Group not found, returning 0/0');
      return res.json({ used: 0, limit: 0 });
    }
    
    const files = await db.collection('files').find({ 
      groupId: { $in: [groupObjectId, groupId.toString()] } // Match both formats
    }).toArray();
    
    console.log('Files found:', files.length);
    
    const usedBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    
    console.log('Used bytes:', usedBytes, 'Limit GB:', group.storageLimitGB);
    
    res.json({ 
      used: usedBytes,
      limit: group.storageLimitGB 
    });
  } catch (error) {
    console.error('Storage info error:', error);
    res.status(500).json({ error: 'Failed to get storage info' });
  }
});

// List files
app.get('/api/files', auth, async (req, res) => {
  try {
    console.log('=== GET /api/files ===');
    console.log('User:', req.user.email, 'Role:', req.user.role);
    console.log('Query organizationId:', req.query.organizationId);
    
    let query = {
      type: 'document' // Only show documents, not forms
    };
    
    // Developer sees all files
    if (req.user.role !== 'developer') {
      const userId = new ObjectId(req.user.id);
      
      // Get all user's assigned orgs
      const assignments = await db.collection('user_organization_assignments')
        .find({ userId: userId })
        .toArray();
      
      console.log('Assignments found:', assignments.length);
      
      if (assignments.length === 0) {
        console.log('User has no org assignments');
        return res.json([]);
      }
      
      const assignedOrgIds = assignments.map(a => a.organizationId.toString());
      console.log('User assigned to orgs:', assignedOrgIds);
      
      // Get all assigned orgs
      const assignedOrgs = await db.collection('organizations')
        .find({ _id: { $in: assignments.map(a => a.organizationId) } })
        .toArray();
      
      console.log('Assigned orgs:', assignedOrgs.map(o => o.name));
      
      // For each assigned org, get all parents (NOT children)
      // User can see files shared with their org or any parent org
      const allOrgIds = new Set(assignedOrgIds);
      
      for (const org of assignedOrgs) {
        // Add all orgs in the path (parents)
        if (org.path && Array.isArray(org.path)) {
          const parents = await db.collection('organizations')
            .find({ name: { $in: org.path } })
            .toArray();
          console.log(`Parents of ${org.name}:`, parents.map(p => p.name));
          parents.forEach(p => allOrgIds.add(p._id.toString()));
        }
      }
      
      const hierarchyOrgIds = Array.from(allOrgIds);
      console.log('Total accessible org IDs:', hierarchyOrgIds.length);
      
      // Files shared with any accessible org
      query.sharedWith = { $in: hierarchyOrgIds.map(id => new ObjectId(id)) };
    }
    
    console.log('Query:', JSON.stringify(query));
    
    const files = await db.collection('files')
      .find(query)
      .sort({ uploadedAt: -1 })
      .toArray();
    
    console.log('Files found:', files.length);
    
    // Include uploader info and shared org names
    const filesWithInfo = await Promise.all(files.map(async (f) => {
      let sharedOrgNames = [];
      if (f.sharedWith && f.sharedWith.length > 0) {
        const orgs = await db.collection('organizations').find({ 
          _id: { $in: f.sharedWith.map(id => new ObjectId(id)) } 
        }).toArray();
        sharedOrgNames = orgs.map(o => o.name);
      }
      
      return {
        id: f._id,
        name: f.name,
        uploadedAt: f.uploadedAt,
        uploadedBy: f.uploadedBy || 'Unknown',
        userId: f.userId?.toString(),
        sharedWith: sharedOrgNames
      };
    }));
    
    res.json(filesWithInfo);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get forms (type='form')
app.get('/api/forms', auth, async (req, res) => {
  try {
    let query = { type: 'form' };
    
    // Developer sees all forms
    if (req.user.role !== 'developer') {
      const userId = req.user.id.toString();
      const userAssignments = await db.collection('user_organization_assignments').find({ userId }).toArray();
      
      if (userAssignments.length === 0) {
        return res.json([]);
      }
      
      const userOrgIds = userAssignments.map(a => a.organizationId);
      const allAccessibleOrgs = await getAllChildrenOrgs(userOrgIds);
      
      query.$or = [
        { sharedWith: { $size: 0 } },
        { sharedWith: { $in: allAccessibleOrgs.map(id => id.toString()) } }
      ];
    }
    
    const forms = await db.collection('files').find(query).sort({ uploadedAt: -1 }).toArray();
    
    // Include shared org names
    const formsWithInfo = await Promise.all(forms.map(async (f) => {
      let sharedOrgNames = [];
      if (f.sharedWith && f.sharedWith.length > 0) {
        const orgs = await db.collection('organizations').find({ 
          _id: { $in: f.sharedWith.map(id => new ObjectId(id)) } 
        }).toArray();
        sharedOrgNames = orgs.map(o => o.name);
      }
      
      return {
        _id: f._id,
        name: f.name,
        uploadedAt: f.uploadedAt,
        uploadedBy: f.uploadedBy || 'Unknown',
        userId: f.userId,
        sharedWith: sharedOrgNames
      };
    }));
    
    res.json(formsWithInfo);
  } catch (error) {
    console.error('Get forms error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download file endpoint with tracking
app.get('/api/files/:id/download', auth, async (req, res) => {
  try {
    const file = await db.collection('files').findOne({ 
      _id: new ObjectId(req.params.id),
      type: 'form',
      isDownloadable: true
    });
    
    if (!file) {
      return res.status(404).json({ error: 'File not found or not downloadable' });
    }
    
    // Track download
    await db.collection('download_tracking').insertOne({
      fileId: file._id,
      fileName: file.name,
      userId: new ObjectId(req.user.id),
      userEmail: req.user.email,
      organizationId: req.user.organizationId,
      downloadedAt: new Date(),
      ipAddress: req.ip
    });
    
    // Generate S3 signed URL if using S3
    if (file.url.startsWith('https://') && file.url.includes('.s3.')) {
      const s3Client = await getS3Client();
      if (s3Client) {
        try {
          const urlParts = file.url.replace('https://', '').split('/');
          const bucket = urlParts[0].split('.')[0];
          const key = urlParts.slice(1).join('/');
          
          const { GetObjectCommand } = require('@aws-sdk/client-s3');
          const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
          
          const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${file.name}"`
          });
          
          const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          return res.json({ downloadUrl: signedUrl, fileName: file.name });
        } catch (s3Error) {
          console.error('S3 signed URL error:', s3Error);
        }
      }
    }
    
    // Fallback: direct URL
    res.json({ downloadUrl: file.url, fileName: file.name });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get download tracking (developer only)
app.get('/api/download-tracking', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }
    
    const { startDate, endDate, fileId } = req.query;
    
    const matchQuery = {
      organizationId: req.user.organizationId
    };
    
    if (startDate && endDate) {
      matchQuery.downloadedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (fileId) {
      matchQuery.fileId = new ObjectId(fileId);
    }
    
    const downloads = await db.collection('download_tracking')
      .find(matchQuery)
      .sort({ downloadedAt: -1 })
      .limit(1000)
      .toArray();
    
    res.json(downloads);
  } catch (error) {
    console.error('Get download tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get download stats (developer only)
app.get('/api/download-tracking/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }
    
    const stats = await db.collection('download_tracking')
      .aggregate([
        { $match: { organizationId: req.user.organizationId } },
        {
          $group: {
            _id: '$fileName',
            fileId: { $first: '$fileId' },
            downloadCount: { $sum: 1 },
            lastDownloaded: { $max: '$downloadedAt' },
            uniqueUsers: { $addToSet: '$userEmail' }
          }
        },
        { $sort: { downloadCount: -1 } }
      ]).toArray();
    
    res.json(stats.map(s => ({
      fileName: s._id,
      fileId: s.fileId,
      downloadCount: s.downloadCount,
      uniqueUsers: s.uniqueUsers.length,
      lastDownloaded: s.lastDownloaded
    })));
  } catch (error) {
    console.error('Get download stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List forms (everyone can access)
app.get('/api/forms', auth, async (req, res) => {
  try {
    const forms = await db.collection('files')
      .find({ 
        type: 'form',
        isDownloadable: true 
      })
      .sort({ uploadedAt: -1 })
      .toArray();
    
    const formsWithInfo = await Promise.all(forms.map(async (f) => {
      let orgName = null;
      if (f.organizationId) {
        const org = await db.collection('organizations').findOne({ _id: new ObjectId(f.organizationId) });
        orgName = org?.name || 'Unknown';
      }
      
      return {
        id: f._id,
        name: f.name,
        uploadedAt: f.uploadedAt,
        uploadedBy: f.uploadedBy,
        userId: f.userId,
        organizationName: f.isAllOrganizations ? 'All Organizations' : orgName
      };
    }));
    
    res.json(formsWithInfo);
  } catch (error) {
    console.error('List forms error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete file
app.delete('/api/files/:id', auth, async (req, res) => {
  try {
    const file = await db.collection('files').findOne({ _id: new ObjectId(req.params.id) });
    if (!file) return res.status(404).json({ error: 'File not found' });
    
    // Only file uploader or developer can delete
    // Convert both to string for comparison
    const fileUserId = file.userId.toString();
    const requestUserId = req.user.id.toString();
    
    if (fileUserId !== requestUserId && req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Not authorized to delete this file' });
    }
    
    // Delete from S3 if URL is S3
    if (file.url.startsWith('https://') && file.url.includes('.s3.')) {
      const s3Client = await getS3Client();
      if (s3Client) {
        const urlParts = file.url.replace('https://', '').split('/');
        const bucket = urlParts[0].split('.')[0];
        const key = urlParts.slice(1).join('/');
        
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: key
        }));
      }
    }
    
    // Delete from MongoDB files collection
    await db.collection('files').deleteOne({ _id: new ObjectId(req.params.id) });
    
    // Delete from embedding_files collection
    console.log(`Deleting embeddings for fileId: ${req.params.id}`);
    
    const deleteResult = await db.collection('embedding_files').deleteMany({ 
      fileId: req.params.id
    });
    
    console.log(`Deleted ${deleteResult.deletedCount} embeddings`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List users (admin)
// ============= PERMISSIONS =============
app.get('/api/permissions', auth, hasPermission('role:manage'), async (req, res) => {
  const permissions = await db.collection('permissions').find().toArray();
  res.json(permissions);
});

// ============= ROLES =============
// List roles (for user creation - no permission needed, just auth)
app.get('/api/roles/list', auth, async (req, res) => {
  const roles = await db.collection('roles').find({ status: 'active' }).toArray();
  res.json(roles);
});

// Manage roles (full CRUD - requires role:manage)
app.get('/api/roles', auth, hasPermission('role:manage'), async (req, res) => {
  const roles = await db.collection('roles').find().toArray();
  res.json(roles);
});

app.post('/api/roles', auth, hasPermission('role:manage'), async (req, res) => {
  const { name, description, permissions, status } = req.body;
  
  const result = await db.collection('roles').insertOne({
    name,
    description,
    permissions,
    isSystem: false,
    status: status || 'active',
    createdAt: new Date()
  });
  
  res.json({ success: true, id: result.insertedId });
});

app.put('/api/roles/:id', auth, hasPermission('role:manage'), async (req, res) => {
  const { name, description, permissions, status } = req.body;
  const role = await db.collection('roles').findOne({ _id: new ObjectId(req.params.id) });
  
  if (role?.isSystem) {
    return res.status(403).json({ error: 'Cannot edit system roles' });
  }
  
  await db.collection('roles').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { name, description, permissions, status, updatedAt: new Date() } }
  );
  
  res.json({ success: true });
});

app.delete('/api/roles/:id', auth, hasPermission('role:manage', 'system:delete'), async (req, res) => {
  const role = await db.collection('roles').findOne({ _id: new ObjectId(req.params.id) });
  
  if (role?.isSystem) {
    return res.status(403).json({ error: 'Cannot delete system roles' });
  }
  
  const usersWithRole = await db.collection('users').countDocuments({
    roles: new ObjectId(req.params.id)
  });
  
  if (usersWithRole > 0) {
    return res.status(400).json({ error: 'Cannot delete role assigned to users' });
  }
  
  await db.collection('roles').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

// Add these endpoints to server.js after RBAC endpoints

// ============= ORGANIZATIONS =============
app.get('/api/organizations', auth, hasPermission('org:view'), async (req, res) => {
  const orgs = await db.collection('organizations').find().toArray();
  res.json(orgs);
});

app.post('/api/organizations', auth, hasPermission('org:manage'), async (req, res) => {
  const { name, description, status } = req.body;
  
  const result = await db.collection('organizations').insertOne({
    name,
    description,
    status: status || 'active',
    createdAt: new Date()
  });
  
  res.json({ success: true, id: result.insertedId });
});

app.put('/api/organizations/:id', auth, hasPermission('org:manage'), async (req, res) => {
  const { name, description, status } = req.body;
  
  await db.collection('organizations').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { name, description, status, updatedAt: new Date() } }
  );
  
  res.json({ success: true });
});

app.delete('/api/organizations/:id', auth, hasPermission('org:manage', 'system:delete'), async (req, res) => {
  // Check if any users belong to this org
  const usersCount = await db.collection('users').countDocuments({
    organizationId: new ObjectId(req.params.id)
  });
  
  if (usersCount > 0) {
    return res.status(400).json({ error: 'Cannot delete organization with users' });
  }
  
  // Delete all departments in this org
  await db.collection('departments').deleteMany({
    organizationId: new ObjectId(req.params.id)
  });
  
  await db.collection('organizations').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

// ============= DEPARTMENTS =============
app.get('/api/departments', auth, hasPermission('dept:view'), async (req, res) => {
  const { organizationId } = req.query;
  
  const query = organizationId ? { organizationId: new ObjectId(organizationId) } : {};
  const depts = await db.collection('departments').find(query).toArray();
  
  // Get org names
  const deptsWithOrg = await Promise.all(depts.map(async (dept) => {
    const org = await db.collection('organizations').findOne({ _id: new ObjectId(dept.organizationId) });
    return {
      ...dept,
      organizationName: org?.name || 'Unknown'
    };
  }));
  
  res.json(deptsWithOrg);
});

app.post('/api/departments', auth, hasPermission('dept:manage'), async (req, res) => {
  const { name, description, organizationId, status } = req.body;
  
  const result = await db.collection('departments').insertOne({
    name,
    description,
    organizationId: new ObjectId(organizationId),
    status: status || 'active',
    createdAt: new Date()
  });
  
  res.json({ success: true, id: result.insertedId });
});

app.put('/api/departments/:id', auth, hasPermission('dept:manage'), async (req, res) => {
  const { name, description, organizationId, status } = req.body;
  
  await db.collection('departments').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { 
      name, 
      description, 
      organizationId: new ObjectId(organizationId),
      status, 
      updatedAt: new Date() 
    } }
  );
  
  res.json({ success: true });
});

app.delete('/api/departments/:id', auth, hasPermission('dept:manage', 'system:delete'), async (req, res) => {
  // Check if any users belong to this dept
  const usersCount = await db.collection('users').countDocuments({
    departmentId: new ObjectId(req.params.id)
  });
  
  if (usersCount > 0) {
    return res.status(400).json({ error: 'Cannot delete department with users' });
  }
  
  await db.collection('departments').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});


// ============= USERS =============
app.get('/api/users', auth, hasPermission('user:view'), async (req, res) => {
  // Get current user info
  const currentUser = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
  const currentUserRoles = await db.collection('roles').find({
    _id: { $in: currentUser.roles.map(r => new ObjectId(r)) }
  }).toArray();
  const currentUserRole = currentUserRoles[0]?.name.toLowerCase();
  
  // Build filter based on role
  let userFilter = {};
  
  if (currentUserRole === 'developer') {
    // Developer sees all users
    userFilter = {};
  } else if (currentUserRole === 'admin') {
    // Admin sees only users in own organization
    userFilter = { organizationId: currentUser.organizationId };
  } else if (currentUserRole === 'manager') {
    // Manager sees only users in own department
    userFilter = { 
      organizationId: currentUser.organizationId,
      departmentId: currentUser.departmentId 
    };
  } else {
    // User role cannot view users list (but has permission check above)
    userFilter = { _id: new ObjectId(req.user.id) }; // Only see self
  }
  
  const users = await db.collection('users').find(userFilter).toArray();
  
  const usersWithRoles = await Promise.all(users.map(async (user) => {
    const roles = await db.collection('roles').find({
      _id: { $in: user.roles.map(r => new ObjectId(r)) }
    }).toArray();
    
    let organization = null;
    let department = null;
    
    if (user.organizationId) {
      organization = await db.collection('organizations').findOne({ _id: new ObjectId(user.organizationId) });
    }
    
    if (user.departmentId) {
      department = await db.collection('departments').findOne({ _id: new ObjectId(user.departmentId) });
    }
    
    return {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roles: roles.map(r => ({ id: r._id, name: r.name })),
      organizationId: user.organizationId,
      organizationName: organization?.name || null,
      departmentId: user.departmentId,
      departmentName: department?.name || null,
      createdAt: user.createdAt
    };
  }));
  
  res.json(usersWithRoles);
});

app.post('/api/users', auth, hasPermission('user:manage'), async (req, res) => {
  try {
    const { email, password, fullName, canUploadFiles } = req.body;
    
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await db.collection('users').insertOne({
      email,
      password: hashedPassword,
      fullName,
      role: 'user',
      status: 'active',
      canUploadFiles: canUploadFiles !== false,
      createdBy: req.user.id,
      createdAt: new Date()
    });
    
    res.json({ success: true, userId: result.insertedId });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', auth, hasPermission('user:manage'), async (req, res) => {
  const { email, fullName, roles, status, password, organizationId, departmentId } = req.body;
  
  const updateData = {
    email,
    fullName,
    roles: roles.map(r => new ObjectId(r)),
    organizationId: organizationId ? new ObjectId(organizationId) : null,
    departmentId: departmentId ? new ObjectId(departmentId) : null,
    status,
    updatedAt: new Date()
  };
  
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }
  
  await db.collection('users').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: updateData }
  );
  
  res.json({ success: true });
});

app.delete('/api/users/:id', auth, hasPermission('user:manage', 'system:delete'), async (req, res) => {
  if (req.params.id === req.user.id.toString()) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

app.get('/api/public-settings', async (req, res) => {
  try {
    const settings = await db.collection('settings').findOne({ _id: 'config' }) || {};
    res.json({
      logo: settings.logo || null,
      voiceMode: settings.voiceMode || 'browser',
      voiceLanguage: settings.voiceLanguage || 'auto',
      ttsMode: settings.ttsMode || 'browser',
      ttsLanguage: settings.ttsLanguage || 'en-US'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Settings
app.get('/api/settings', auth, hasPermission(), async (req, res) => {
  const settings = await db.collection('settings').findOne({ _id: 'config' }) || {};
  res.json({
    companyName: settings.companyName || 'GenBotChat',
    logo: settings.logo || null,
    voiceMode: settings.voiceMode || 'browser',
    voiceLanguage: settings.voiceLanguage || 'auto',
    googleSttApiKey: settings.googleSttApiKey || '',
    googleTtsApiKey: settings.googleTtsApiKey || '',
    geminiSttApiKey: settings.geminiSttApiKey || '',
    geminiTtsApiKey: settings.geminiTtsApiKey || '',
    elevenlabsApiKey: settings.elevenlabsApiKey || '',
    elevenlabsVoice: settings.elevenlabsVoice || 'onwK4e9ZLuTAKqWW03F9',
    gclasServiceAccount: settings.gclasServiceAccount || '',
    gclasLanguage: settings.gclasLanguage || 'auto',
    gclasVoice: settings.gclasVoice || 'en-US-Neural2-C',
    geminiVoice: settings.geminiVoice || 'Aoede',
    geminiTtsLanguage: settings.geminiTtsLanguage || 'auto',
    ttsMode: settings.ttsMode || 'browser',
    ttsLanguage: settings.ttsLanguage || 'en-US',
    chatWebhook: settings.chatWebhook || '',
    uploadWebhook: settings.uploadWebhook || '',
    transcribeWebhook: settings.transcribeWebhook || '',
    formSubmissionWebhook: settings.formSubmissionWebhook || '',
    s3Bucket: settings.s3Bucket || '',
    s3Region: settings.s3Region || '',
    s3AccessKey: settings.s3AccessKey || '',
    s3SecretKey: settings.s3SecretKey || ''
  });
});

app.post('/api/settings', auth, hasPermission(), async (req, res) => {
  await db.collection('settings').updateOne(
    { _id: 'config' },
    { $set: req.body },
    { upsert: true }
  );
  res.json({ success: true });
});

app.put('/api/settings', auth, hasPermission(), async (req, res) => {
  await db.collection('settings').updateOne(
    { _id: 'config' },
    { $set: req.body },
    { upsert: true }
  );
  res.json({ success: true });
});

// API Key Management (Developer only)
app.get('/api/keys', auth, hasPermission(), async (req, res) => {
  try {
    const keys = await db.collection('api_keys').find().sort({ createdAt: -1 }).toArray();
    
    // Include user email for each key
    const keysWithUser = await Promise.all(keys.map(async (key) => {
      const user = await db.collection('users').findOne({ _id: key.userId });
      return {
        ...key,
        userEmail: user?.email || 'Unknown'
      };
    }));
    
    res.json(keysWithUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

app.post('/api/keys', auth, hasPermission(), async (req, res) => {
  try {
    const { name, userId } = req.body;
    
    // Generate API key
    const key = 'gk_' + crypto.randomBytes(32).toString('hex');
    
    const apiKey = {
      key,
      name,
      userId: new ObjectId(userId),
      isActive: true,
      createdAt: new Date(),
      lastUsedAt: null
    };
    
    await db.collection('api_keys').insertOne(apiKey);
    res.json({ success: true, key });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

app.patch('/api/keys/:id', auth, hasPermission(), async (req, res) => {
  try {
    const { isActive } = req.body;
    await db.collection('api_keys').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isActive } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle API key' });
  }
});

app.delete('/api/keys/:id', auth, hasPermission(), async (req, res) => {
  try {
    await db.collection('api_keys').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

app.get('/api/usage', auth, hasPermission(), async (req, res) => {
  try {
    const usage = await db.collection('api_usage').find().sort({ timestamp: -1 }).limit(100).toArray();
    res.json(usage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get API usage' });
  }
});

// Group Management (Developer only)
app.get('/api/groups', auth, hasPermission(), async (req, res) => {
  try {
    const groups = await db.collection('groups').find().toArray();
    
    // Add org names and calculate used storage
    const groupsWithDetails = await Promise.all(groups.map(async (group) => {
      // Get org names
      const orgs = await db.collection('organizations').find({ 
        groupId: group._id 
      }).toArray();
      
      // Calculate total file size for this group (simple query by groupId)
      const files = await db.collection('files').find({ groupId: group._id }).toArray();
      const usedStorage = files.reduce((sum, f) => sum + (f.size || 0), 0);
      
      return {
        ...group,
        orgNames: orgs.map(o => o.name),
        organizationIds: orgs.map(o => o._id.toString()),
        usedStorage
      };
    }));
    
    res.json(groupsWithDetails);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

app.post('/api/groups', auth, hasPermission(), async (req, res) => {
  try {
    const { name, storageLimitGB, organizationIds, chatQuota, quotaType, renewDay } = req.body;
    
    const group = {
      name,
      storageLimitGB,
      chatQuota: chatQuota || 0,           // 0 = unlimited
      quotaType: quotaType || 'individual', // 'individual' or 'total'
      renewDay: renewDay || 1,              // 1-31
      createdAt: new Date()
    };
    
    const result = await db.collection('groups').insertOne(group);
    
    // Update organizations with groupId
    if (organizationIds && organizationIds.length > 0) {
      await db.collection('organizations').updateMany(
        { _id: { $in: organizationIds.map(id => new ObjectId(id)) } },
        { $set: { groupId: result.insertedId } }
      );
    }
    
    res.json({ success: true, groupId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.put('/api/groups/:id', auth, hasPermission(), async (req, res) => {
  try {
    const { name, storageLimitGB, organizationIds, chatQuota, quotaType, renewDay } = req.body;
    
    await db.collection('groups').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { 
        name, 
        storageLimitGB,
        chatQuota: chatQuota || 0,
        quotaType: quotaType || 'individual',
        renewDay: renewDay || 1
      } }
    );
    
    // Remove groupId from all orgs first
    await db.collection('organizations').updateMany(
      { groupId: new ObjectId(req.params.id) },
      { $set: { groupId: null } }
    );
    
    // Set new groupId for selected orgs
    if (organizationIds && organizationIds.length > 0) {
      await db.collection('organizations').updateMany(
        { _id: { $in: organizationIds.map(id => new ObjectId(id)) } },
        { $set: { groupId: new ObjectId(req.params.id) } }
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update group' });
  }
});

app.delete('/api/groups/:id', auth, hasPermission(), async (req, res) => {
  try {
    // Remove groupId from all orgs in this group
    await db.collection('organizations').updateMany(
      { groupId: new ObjectId(req.params.id) },
      { $set: { groupId: null } }
    );
    
    await db.collection('groups').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Reset chat quota for a group (developer only)
app.post('/api/groups/:id/reset-quota', auth, hasPermission(), async (req, res) => {
  try {
    const groupId = new ObjectId(req.params.id);
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-02"
    
    // Delete all chat counts for this group in current month (try both formats)
    await db.collection('chat_counts').deleteMany({ 
      groupId: groupId, // ObjectId format
      month: currentMonth 
    });
    
    await db.collection('chat_counts').deleteMany({ 
      groupId: groupId.toString(), // String format
      month: currentMonth 
    });
    
    // Mark as reset
    await db.collection('chat_resets').updateOne(
      { groupId: groupId.toString(), month: currentMonth },
      { $set: { resetAt: new Date() } },
      { upsert: true }
    );
    
    res.json({ success: true, message: 'Chat quota reset successfully' });
  } catch (error) {
    console.error('Reset quota error:', error);
    res.status(500).json({ error: 'Failed to reset quota' });
  }
});

// Add bonus quota to a group (developer only)
app.post('/api/groups/:id/add-bonus', auth, hasPermission(), async (req, res) => {
  try {
    const { bonusQuota } = req.body;
    if (!bonusQuota || bonusQuota <= 0) {
      return res.status(400).json({ error: 'Invalid bonus quota' });
    }
    
    const groupId = new ObjectId(req.params.id);
    
    // Add bonus quota field (temporary, resets on renewDay)
    await db.collection('groups').updateOne(
      { _id: groupId },
      { $inc: { bonusQuota: bonusQuota } }
    );
    
    res.json({ success: true, message: `Added ${bonusQuota} bonus chats` });
  } catch (error) {
    console.error('Add bonus error:', error);
    res.status(500).json({ error: 'Failed to add bonus quota' });
  }
});

// Override renew day for a group (developer only)
app.put('/api/groups/:id/renew-day', auth, hasPermission(), async (req, res) => {
  try {
    const { renewDay } = req.body;
    if (!renewDay || renewDay < 1 || renewDay > 31) {
      return res.status(400).json({ error: 'Invalid renew day (1-31)' });
    }
    
    const groupId = new ObjectId(req.params.id);
    
    await db.collection('groups').updateOne(
      { _id: groupId },
      { $set: { renewDay: renewDay } }
    );
    
    res.json({ success: true, message: `Renew day updated to ${renewDay}` });
  } catch (error) {
    console.error('Update renew day error:', error);
    res.status(500).json({ error: 'Failed to update renew day' });
  }
});

// Get chat usage for current user
app.get('/api/chat-usage', auth, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    
    // Get user's groupId from their organization assignments
    let groupId = user.groupId;
    
    if (!groupId) {
      // Get from user's organizations
      const assignments = await db.collection('user_organization_assignments').find({ 
        userId: user._id
      }).toArray();
      
      if (assignments.length > 0) {
        const org = await db.collection('organizations').findOne({ 
          _id: assignments[0].organizationId 
        });
        groupId = org?.groupId;
      }
    }
    
    if (!groupId) {
      return res.json({ 
        hasQuota: false,
        unlimited: true
      });
    }
    
    const group = await db.collection('groups').findOne({ _id: groupId });
    
    if (!group || group.chatQuota === 0) {
      return res.json({ 
        hasQuota: false,
        unlimited: true
      });
    }
    
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    let used = 0;
    if (group.quotaType === 'individual') {
      const userCount = await db.collection('chat_counts').findOne({ 
        groupId: group._id, 
        userId: user._id, 
        month: currentMonth 
      });
      used = userCount?.count || 0;
    } else {
      const counts = await db.collection('chat_counts').find({ 
        groupId: group._id, 
        month: currentMonth 
      }).toArray();
      used = counts.reduce((sum, c) => sum + c.count, 0);
    }
    
    const effectiveQuota = group.chatQuota + (group.bonusQuota || 0);
    const percentage = (used / effectiveQuota * 100).toFixed(6);
    
    // Calculate next reset date
    const now = new Date();
    let resetDate = new Date(now.getFullYear(), now.getMonth(), group.renewDay);
    if (resetDate <= now) {
      resetDate = new Date(now.getFullYear(), now.getMonth() + 1, group.renewDay);
    }
    
    res.json({
      hasQuota: true,
      used,
      limit: effectiveQuota,
      baseLimit: group.chatQuota,
      bonusQuota: group.bonusQuota || 0,
      percentage: parseFloat(percentage),
      quotaType: group.quotaType,
      resetDate: resetDate.toISOString(),
      renewDay: group.renewDay
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chat usage' });
  }
});

// Update user name
app.put('/api/user/name', auth, async (req, res) => {
  try {
    const { fullName } = req.body;
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user.id) },
      { $set: { fullName } }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update name' });
  }
});

// Upload logo
app.post('/api/upload-logo', auth, hasPermission(), upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // For logo, we'll store it locally in public/logos folder
    const logoDir = join(__dirname, 'public', 'logos');
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }

    // Copy file to public/logos (use copyFileSync instead of renameSync for cross-device)
    const logoFileName = `logo-${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const logoPath = join(logoDir, logoFileName);
    fs.copyFileSync(req.file.path, logoPath);
    fs.unlinkSync(req.file.path); // Delete original upload

    // Store relative URL in database
    const logoUrl = `/logos/${logoFileName}`;

    await db.collection('settings').updateOne(
      { _id: 'config' },
      { $set: { logo: logoUrl } },
      { upsert: true }
    );

    res.json({ success: true, logo: logoUrl });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/api/test-webhook', auth, hasPermission('system:manage_settings'), async (req, res) => {
  try {
    const response = await axios.post(req.body.url, { test: true }, { timeout: 5000 });
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/test-s3', auth, hasPermission('system:manage_settings'), async (req, res) => {
  try {
    const { s3Bucket, s3Region, s3AccessKey, s3SecretKey } = req.body;
    
    if (!s3Bucket || !s3Region || !s3AccessKey || !s3SecretKey) {
      return res.json({ success: false, error: 'Missing S3 configuration' });
    }

    const testClient = new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey
      }
    });

    // Test by checking bucket access
    await testClient.send(new HeadBucketCommand({ Bucket: s3Bucket }));
    
    res.json({ success: true });
  } catch (error) {
    console.error('S3 test error:', error);
    
    // Extract meaningful error message
    let errorMsg = 'S3 connection failed';
    
    if (error.name === 'NoSuchBucket') {
      errorMsg = 'Bucket does not exist';
    } else if (error.name === 'InvalidAccessKeyId') {
      errorMsg = 'Invalid Access Key ID';
    } else if (error.name === 'SignatureDoesNotMatch') {
      errorMsg = 'Invalid Secret Access Key';
    } else if (error.name === 'AccessDenied') {
      errorMsg = 'Access denied - check bucket permissions';
    } else if (error.$metadata?.httpStatusCode === 400) {
      errorMsg = 'Bad request - check bucket name and region';
    } else if (error.$metadata?.httpStatusCode === 403) {
      errorMsg = 'Access forbidden - check credentials and permissions';
    } else if (error.$metadata?.httpStatusCode === 404) {
      errorMsg = 'Bucket not found in this region';
    } else if (error.message) {
      errorMsg = error.message;
    }
    
    res.json({ success: false, error: errorMsg });
  }
});

// Transcribe audio
app.post('/api/transcribe', auth, upload.single('audio'), async (req, res) => {
  try {
    const settings = await db.collection('settings').findOne({ _id: 'config' });
    const voiceMode = settings?.voiceMode || 'browser';
    const voiceLanguage = settings?.voiceLanguage || 'auto';
    
    if (voiceMode === 'local') {
      // Use local Whisper service
      const formData = new FormData();
      formData.append('audio_file', fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      
      let whisperUrl = process.env.WHISPER_API_URL + '/asr?task=transcribe&output=json';
      if (voiceLanguage !== 'auto') {
        whisperUrl += `&language=${voiceLanguage}`;
      }
      
      const { data } = await axios.post(whisperUrl, formData, {
        headers: formData.getHeaders()
      });
      
      fs.unlinkSync(req.file.path);
      res.json({ text: data.text || '', language: voiceLanguage });
      
    } else if (voiceMode === 'gemini') {
      // Use Gemini AI for transcription
      const geminiSttApiKey = settings?.geminiSttApiKey;
      
      if (!geminiSttApiKey) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Gemini STT API Key not configured. Please set it in Settings.' });
      }

      try {
        const genAI = new GoogleGenerativeAI(geminiSttApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Read audio file
        const audioData = fs.readFileSync(req.file.path);
        const base64Audio = audioData.toString('base64');

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: 'audio/webm',
              data: base64Audio
            }
          },
          'Transcribe this audio to text. Only return the transcribed text, nothing else.'
        ]);

        fs.unlinkSync(req.file.path);

        const transcript = result.response.text().trim();
        res.json({ text: transcript, language: voiceLanguage });
      } catch (geminiError) {
        fs.unlinkSync(req.file.path);
        console.error('Gemini API Error:', geminiError.message);
        return res.status(500).json({ 
          error: `Gemini error: ${geminiError.message}. Please check your API key.` 
        });
      }
      
    } else if (voiceMode === 'elevenlabs') {
      // Use ElevenLabs for transcription
      const elevenlabsApiKey = settings?.elevenlabsApiKey;
      
      if (!elevenlabsApiKey) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'ElevenLabs API Key not configured. Please set it in Settings.' });
      }

      try {
        const formData = new FormData();
        formData.append('audio', fs.createReadStream(req.file.path), {
          filename: 'audio.webm',
          contentType: 'audio/webm'
        });

        const { data } = await axios.post('https://api.elevenlabs.io/v1/audio-to-text', formData, {
          headers: {
            ...formData.getHeaders(),
            'xi-api-key': elevenlabsApiKey
          },
          timeout: 30000
        });

        fs.unlinkSync(req.file.path);
        res.json({ text: data.text || '', language: voiceLanguage });
      } catch (elevenlabsError) {
        fs.unlinkSync(req.file.path);
        console.error('ElevenLabs API Error:', elevenlabsError.message);
        return res.status(500).json({ 
          error: `ElevenLabs error: ${elevenlabsError.response?.data?.detail || elevenlabsError.message}` 
        });
      }
      
    } else if (voiceMode === 'api') {
      // Use external webhook
      const webhooks = await getWebhookUrls();
      
      if (!webhooks.transcribe || webhooks.transcribe === 'http://localhost:5678/webhook/transcribe') {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Transcribe webhook not configured. Please set it in Settings.' });
      }
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      
      const { data } = await axios.post(webhooks.transcribe, formData, {
        headers: formData.getHeaders()
      });
      
      fs.unlinkSync(req.file.path);
      res.json({ text: data.text || '', language: data.language });
      
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Voice mode not supported for backend transcription' });
    }
  } catch (error) {
    console.error('Transcription error:', error.message);
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Transcription failed: ' + error.message });
  }
});

// Text-to-Speech
app.post('/api/tts', auth, async (req, res) => {
  try {
    const { text, language, mode } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const settings = await db.collection('settings').findOne({ _id: 'config' });
    const ttsMode = mode || settings?.ttsMode || 'browser';
    
    if (ttsMode === 'gemini') {
      // Use Gemini 2.5 Flash TTS with full chunking for speed
      const geminiTtsApiKey = settings?.geminiTtsApiKey;
      if (!geminiTtsApiKey) {
        return res.status(400).json({ error: 'Gemini TTS API Key not configured. Please set it in Settings.' });
      }

      try {
        const voiceName = settings?.geminiVoice || 'Aoede';

        // Split text into sentences for parallel processing
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        
        // Group sentences into chunks (max 2 sentences per chunk for speed)
        const chunks = [];
        for (let i = 0; i < sentences.length; i += 2) {
          chunks.push(sentences.slice(i, i + 2).join(' ').trim());
        }

        // Generate audio for all chunks in parallel
        const audioPromises = chunks.map(async (chunk, index) => {
          const requestBody = {
            contents: [{
              parts: [{ text: chunk }]
            }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName
                  }
                }
              }
            }
          };

          // Retry logic with exponential backoff
          let retries = 3;
          let delay = 1000;
          
          for (let attempt = 0; attempt < retries; attempt++) {
            try {
              const { data } = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiTtsApiKey}`,
                requestBody,
                {
                  timeout: 30000,
                  headers: { 'Content-Type': 'application/json' }
                }
              );

              return Buffer.from(data.candidates[0].content.parts[0].inlineData.data, 'base64');
            } catch (error) {
              if (attempt === retries - 1) throw error;
              console.log(`Retry ${attempt + 1} for chunk ${index + 1} after ${delay}ms`);
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2; // Exponential backoff
            }
          }
        });

        // Wait for all chunks to complete
        const pcmChunks = await Promise.all(audioPromises);
        
        // Combine all PCM data
        const pcmData = Buffer.concat(pcmChunks);
        
        // Convert PCM to WAV (add WAV header)
        // PCM format: 16-bit, 24000 Hz, mono
        const sampleRate = 24000;
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = pcmData.length;
        
        const wavHeader = Buffer.alloc(44);
        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36 + dataSize, 4);
        wavHeader.write('WAVE', 8);
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16);
        wavHeader.writeUInt16LE(1, 20);
        wavHeader.writeUInt16LE(numChannels, 22);
        wavHeader.writeUInt32LE(sampleRate, 24);
        wavHeader.writeUInt32LE(byteRate, 28);
        wavHeader.writeUInt16LE(blockAlign, 32);
        wavHeader.writeUInt16LE(bitsPerSample, 34);
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(dataSize, 40);
        
        const wavBuffer = Buffer.concat([wavHeader, pcmData]);
        
        res.set('Content-Type', 'audio/wav');
        res.send(wavBuffer);
      } catch (geminiError) {
        console.error('Gemini TTS error:', geminiError.response?.data || geminiError.message);
        return res.status(500).json({ error: 'Gemini TTS failed: ' + (geminiError.response?.data?.error?.message || geminiError.message) });
      }
    } else if (ttsMode === 'elevenlabs') {
      // Use ElevenLabs TTS (fast, high quality)
      const elevenlabsApiKey = settings?.elevenlabsApiKey;
      if (!elevenlabsApiKey) {
        return res.status(400).json({ error: 'ElevenLabs API Key not configured. Please set it in Settings.' });
      }

      try {
        const voiceId = settings?.elevenlabsVoice || 'onwK4e9ZLuTAKqWW03F9';

        const requestBody = {
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        };

        const { data } = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          requestBody,
          {
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': elevenlabsApiKey
            },
            responseType: 'arraybuffer'
          }
        );

        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(data));
      } catch (elevenlabsError) {
        console.error('ElevenLabs TTS error:', elevenlabsError.response?.data || elevenlabsError.message);
        return res.status(500).json({ error: 'ElevenLabs TTS failed: ' + (elevenlabsError.response?.data?.detail || elevenlabsError.message) });
      }
    } else if (ttsMode === 'gclas') {
      // Google Cloud Long Audio Synthesis with service account
      const gclasServiceAccount = settings?.gclasServiceAccount;
      if (!gclasServiceAccount) {
        return res.status(400).json({ error: 'Google Cloud Service Account not configured. Please set it in Settings.' });
      }

      try {
        // Parse service account JSON
        const serviceAccount = JSON.parse(gclasServiceAccount);
        
        // Get OAuth2 access token
        const auth = new GoogleAuth({
          credentials: serviceAccount,
          scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        // Auto-detect language if set to auto
        let languageCode = settings?.gclasLanguage || 'auto';
        let voiceName = settings?.gclasVoice || 'en-US-Neural2-C';

        if (languageCode === 'auto') {
          // Simple language detection
          const hasChinese = /[\u4e00-\u9fff]/.test(text);
          const hasTamil = /[\u0B80-\u0BFF]/.test(text);
          const hasMalay = /\b(saya|aku|kau|awak|anda|kita|kami|mereka|dia|dengan|untuk|ini|itu|yang|adalah|tidak|tak|tiada|ada|boleh|akan|sudah|dah|belum|lagi|dari|daripada|ke|di|pada|atau|juga|kalau|bila|macam|mana|nak|hendak|mahu|perlu|mesti|harus|buat|bikin|bagi|ambil|dapat|jadi|jangan|siapa|apa|mana|bila|kenapa|mengapa|bagaimana|berapa|pun|sahaja|je|jer|la|lah|kah|tah|kan|pula|jugak|gak|gitu|gini|nanti|sekarang|tadi|esok|semalam|hari|masa|waktu|tempat|orang|benda|perkara|hal|soal|cerita|kata|cakap|bercakap|beritahu|tanya|jawab|dengar|tengok|lihat|nampak|rasa|fikir|ingat|tahu|kenal|faham|mengerti|belajar|ajar|kerja|rehat|tidur|bangun|makan|minum|masak|basuh|cuci|sapu|gosok|lap|buang|simpan|letak|taruh|angkat|bawa|hantar|terima|buka|tutup|masuk|keluar|naik|turun|datang|pergi|balik|sampai|tiba|mulai|mula|habis|tamat|selesai|siap|terus|berhenti|tunggu|cari|jumpa|temu|beli|jual|bayar|hutang|pinjam|sewa|guna|pakai|kena|cuba|tolong|bantu|ajak|jemput|panggil|telefon|whatsapp|mesej|sembang|borak|lepak|jalan|lari|duduk|berdiri|berbaring|baca|tulis|lukis|gambar|foto|video|rakam|lagu|muzik|nyanyi|menari|tarian|permainan|menang|kalah|seri|gol|mata|markah|tinggi|rendah|besar|kecil|panjang|pendek|lebar|sempit|tebal|nipis|berat|ringan|kuat|lemah|keras|lembut|kasar|halus|licin|tajam|tumpul|panas|sejuk|suam|dingin|hangat|basah|kering|lembap|kotor|bersih|cantik|hodoh|buruk|elok|bagus|baik|jahat|betul|salah|benar|palsu|tepat|silap|lurus|bengkok|senget|condong|tegak|rata|bulat|segi|empat|tiga|lima|enam|tujuh|lapan|sembilan|sepuluh|ratus|ribu|juta|bilion|satu|dua|sebelas|belas|puluh|pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kelapan|kesembilan|kesepuluh|merah|biru|hijau|kuning|hitam|putih|kelabu|perang|oren|ungu|pink|jambu|coklat|emas|perak|warna|suka|benci|sayang|cinta|rindu|kangen|marah|geram|bengang|gembira|senang|seronok|sedih|dukacita|takut|gerun|cuak|risau|bimbang|harap|berharap|angan|impian|mimpi|ingin|pengen|lapar|kenyang|haus|dahaga|penat|letih|lesu|sakit|demam|batuk|selsema|selesema|pening|kepala|perut|mual|loya|muntah|cirit|birit|sembelit|gatal|pedih|seram|ngeri|menakutkan|bahaya|selamat|aman|tenteram|damai)\b/i.test(text);
          
          if (hasChinese) {
            languageCode = 'cmn-CN';
            voiceName = 'cmn-CN-Standard-A';
          } else if (hasTamil) {
            languageCode = 'ta-IN';
            voiceName = 'ta-IN-Standard-A';
          } else if (hasMalay) {
            languageCode = 'ms-MY';
            voiceName = 'ms-MY-Standard-A';
          } else {
            languageCode = 'en-US';
            voiceName = 'en-US-Neural2-C';
          }
        }

        const requestBody = {
          input: { text },
          voice: {
            languageCode,
            name: voiceName
          },
          audioConfig: {
            audioEncoding: 'MP3'
          }
        };

        const { data } = await axios.post(
          'https://texttospeech.googleapis.com/v1/text:synthesize',
          requestBody,
          {
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken.token}`
            }
          }
        );

        const audioBuffer = Buffer.from(data.audioContent, 'base64');
        res.set('Content-Type', 'audio/mpeg');
        res.send(audioBuffer);
      } catch (gclasError) {
        console.error('GCLAS error:', gclasError.response?.data || gclasError.message);
        return res.status(500).json({ error: 'Google Cloud TTS failed: ' + (gclasError.response?.data?.error?.message || gclasError.message) });
      }
    } else {
      return res.status(400).json({ error: 'Invalid TTS mode' });
    }
  } catch (error) {
    console.error('TTS error:', error.response?.data || error.message);
    res.status(500).json({ error: 'TTS failed: ' + (error.response?.data?.error?.message || error.message) });
  }
});

// ============= API KEY MANAGEMENT =============

// Generate API key
function generateApiKey() {
  return 'gbc_' + Array.from({ length: 32 }, () => 
    'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  ).join('');
}

// Get all API keys (developer only)
app.get('/api/keys', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }

    const keys = await db.collection('apiKeys').find({ createdBy: req.user.userId }).toArray();
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new API key (developer only)
app.post('/api/keys', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }

    const { name, userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const apiKey = generateApiKey();

    const newKey = {
      key: apiKey,
      userId: userId, // User yang akan guna API key ni
      createdBy: req.user.userId, // Developer yang create
      name: name || 'Unnamed Key',
      isActive: true,
      createdAt: new Date(),
      lastUsedAt: null
    };

    await db.collection('apiKeys').insertOne(newKey);
    res.json(newKey);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle API key status (developer only)
app.patch('/api/keys/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }

    const { isActive } = req.body;
    await db.collection('apiKeys').updateOne(
      { _id: new ObjectId(req.params.id), createdBy: req.user.userId },
      { $set: { isActive } }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete API key (developer only)
app.delete('/api/keys/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }

    await db.collection('apiKeys').deleteOne({
      _id: new ObjectId(req.params.id),
      userId: req.user.userId
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get API usage logs (developer only)
// Get API usage logs (developer only)
app.get('/api/usage', auth, async (req, res) => {
  try {
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access required' });
    }

    // Get API keys created by this developer
    const apiKeys = await db.collection('apiKeys')
      .find({ createdBy: req.user.userId })
      .toArray();
    
    if (apiKeys.length === 0) {
      return res.json([]);
    }

    const apiKeyIds = apiKeys.map(k => k._id);

    // Get usage for those keys
    const usage = await db.collection('apiUsage')
      .find({ apiKeyId: { $in: apiKeyIds } })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    res.json(usage);
  } catch (error) {
    console.error('API usage error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= PUBLIC API ENDPOINTS =============

// API Key authentication middleware
// Text embedding endpoints (Developer only)
app.get('/api/text-embeddings', auth, async (req, res) => {
  try {
    // Check if developer
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }
    
    const embeddings = await db.collection('embedding_files')
      .find({ fileId: null })
      .sort({ uploadedAt: -1 })
      .toArray();
    
    res.json(embeddings);
  } catch (error) {
    console.error('Load embeddings error:', error);
    res.status(500).json({ error: 'Failed to load embeddings' });
  }
});

app.post('/api/text-embeddings', auth, async (req, res) => {
  try {
    // Check if developer
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }
    
    const { text, fileName } = req.body;
    
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Get Gemini API key
    const settings = await db.collection('settings').findOne({ _id: 'config' });
    const apiKey = settings?.geminiSttApiKey || settings?.geminiTtsApiKey;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }
    
    console.log('Generating embedding for text length:', text.trim().length);
    
    // Generate embedding using gemini-embedding-001 (same as n8n)
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        model: 'models/gemini-embedding-001',
        content: {
          parts: [{ text: text.trim() }]
        }
      }
    );
    
    const embedding = response.data.embedding.values;
    console.log('Embedding generated, dimension:', embedding.length);
    
    // Insert into MongoDB
    await db.collection('embedding_files').insertOne({
      text: text.trim(),
      embedding: embedding,
      fileName: fileName?.trim() || 'Custom Knowledge',
      fileId: null,
      sharedWith: ["PUBLIC"], // Accessible to all
      organizationId: null,
      departmentId: null,
      uploadedAt: new Date()
    });
    
    console.log('Text embedded successfully');
    res.json({ success: true, message: 'Text embedded successfully' });
  } catch (error) {
    console.error('Text embedding error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to embed text' });
  }
});

app.delete('/api/text-embeddings/:id', auth, async (req, res) => {
  try {
    // Check if developer
    if (req.user.role !== 'developer') {
      return res.status(403).json({ error: 'Developer access only' });
    }
    
    await db.collection('embedding_files').deleteOne({ 
      _id: new ObjectId(req.params.id),
      fileId: null // Only allow deleting direct text embeddings
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Form submission endpoints
app.get('/api/form/:formType', auth, async (req, res) => {
  try {
    const formPath = join(__dirname, 'form-web-view', `${req.params.formType}.json`);
    if (!fs.existsSync(formPath)) {
      return res.status(404).json({ error: 'Form not found' });
    }
    const formConfig = JSON.parse(fs.readFileSync(formPath, 'utf8'));
    res.json(formConfig);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load form' });
  }
});

app.post('/api/form-submission', auth, async (req, res) => {
  try {
    const { formType, data } = req.body;
    
    console.log('Form submission received:', { formType, data, user: req.user.email });
    
    // Fixed n8n webhook URL
    const n8nWebhook = 'https://agent.gencode.com.my/webhook/form-submission-handler';
    
    // Send to n8n
    const response = await axios.post(n8nWebhook, {
      formType,
      data,
      submittedBy: req.user.email,
      submittedAt: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Thank you, your submission has been received and is being processed.',
      data: response.data 
    });
  } catch (error) {
    console.error('Form submission error:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'frontend/dist/index.html'));
});

// Cleanup old deleted messages based on retention setting
async function cleanupOldDeletedMessages() {
  try {
    const settings = await db.collection('settings').findOne({ _id: 'config' });
    const retentionDays = settings?.deletedChatRetentionDays || 360;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await db.collection('deleted_messages').deleteMany({
      deletedAt: { $lt: cutoffDate }
    });
    
    if (result.deletedCount > 0) {
      console.log(`Cleaned up ${result.deletedCount} old deleted messages (older than ${retentionDays} days)`);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Run cleanup daily
setInterval(cleanupOldDeletedMessages, 24 * 60 * 60 * 1000);
cleanupOldDeletedMessages(); // Run on startup

app.listen(3000, () => console.log('Server running on port 3000'));
