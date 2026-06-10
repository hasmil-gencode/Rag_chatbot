import { ObjectId } from 'mongodb';
import crypto from 'crypto';

export function registerApiKeyRoutes(app, { auth, hasPermission, db, logAudit, validateRequestBody }) {
  app.get('/api/keys', auth, hasPermission(), async (req, res) => {
    try {
      const keys = await db.collection('api_keys').find().sort({ createdAt: -1 }).toArray();
      const keysWithUser = await Promise.all(keys.map(async (key) => {
        const user = await db.collection('users').findOne({ _id: key.userId });
        return { ...key, userEmail: user?.email || 'Unknown' };
      }));
      res.json(keysWithUser);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get API keys' });
    }
  });

  app.post('/api/keys', auth, hasPermission(), validateRequestBody({
    name: { required: true, type: 'string', minLength: 1, maxLength: 120 },
    userId: { required: true, objectId: true },
    generateShortKey: { type: 'boolean' },
    scopes: { type: 'array', arrayOf: 'string' },
    allowedCollectionIds: { type: 'array', objectIdArray: true },
    streamChunkSize: { type: 'number' },
    streamDelayMs: { type: 'number' },
  }), async (req, res) => {
    try {
      const { name, userId, generateShortKey, description, webhookUrl, chatMode, systemPrompt, scopes, allowedCollectionIds, streamChunkSize, streamDelayMs } = req.body;
      const cleanScopes = cleanApiScopes(scopes);
      const cleanCollectionIds = cleanAllowedCollectionIds(allowedCollectionIds);
      const streamSettings = cleanStreamSettings(streamChunkSize, streamDelayMs);
      const key = 'gk_' + crypto.randomBytes(32).toString('hex');
      const shortKey = generateShortKey ? await generateUniqueShortKey(db) : null;
      const apiKey = {
        key,
        shortKey,
        hasShortKey: !!generateShortKey,
        name,
        description: description || '',
        chatMode: chatMode || 'native',
        webhookUrl: webhookUrl || '',
        systemPrompt: systemPrompt || '',
        scopes: cleanScopes,
        allowedCollectionIds: cleanCollectionIds,
        ...streamSettings,
        userId: new ObjectId(userId),
        isActive: true,
        createdAt: new Date(),
        lastUsedAt: null
      };
      await db.collection('api_keys').insertOne(apiKey);
      await logAudit(req.user.id, 'apikey.create', `Created API key: ${name}`);
      res.json({ success: true, key, shortKey });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  app.patch('/api/keys/:id', auth, hasPermission(), validateRequestBody({
    isActive: { required: true, type: 'boolean' },
  }), async (req, res) => {
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

  app.put('/api/keys/:id/details', auth, hasPermission(), validateRequestBody({
    name: { required: true, type: 'string', minLength: 1, maxLength: 120 },
    scopes: { type: 'array', arrayOf: 'string' },
    allowedCollectionIds: { type: 'array', objectIdArray: true },
    streamChunkSize: { type: 'number' },
    streamDelayMs: { type: 'number' },
  }), async (req, res) => {
    try {
      const { name, description, chatMode, webhookUrl, systemPrompt, scopes, allowedCollectionIds, streamChunkSize, streamDelayMs } = req.body;
      const streamSettings = cleanStreamSettings(streamChunkSize, streamDelayMs);
      await db.collection('api_keys').updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            name,
            description,
            chatMode,
            webhookUrl,
            systemPrompt,
            scopes: cleanApiScopes(scopes),
            allowedCollectionIds: cleanAllowedCollectionIds(allowedCollectionIds),
            ...streamSettings,
            updatedAt: new Date()
          }
        }
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update API key' });
    }
  });

  app.delete('/api/keys/:id', auth, hasPermission(), async (req, res) => {
    try {
      const delKey = await db.collection('api_keys').findOne({ _id: new ObjectId(req.params.id) });
      await db.collection('api_keys').deleteOne({ _id: new ObjectId(req.params.id) });
      await logAudit(req.user.id, 'apikey.delete', `Deleted API key: ${delKey?.name || req.params.id}`);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  });

  app.get('/api/usage', auth, hasPermission(), async (req, res) => {
    try {
      const usageCollection = db.collection('api_usage');
      const recent = await usageCollection.find().sort({ timestamp: -1 }).limit(200).toArray();
      const apiKeyIds = [...new Set(recent.map(log => log.apiKeyId?.toString()).filter(Boolean))]
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));
      const keyDocs = apiKeyIds.length > 0
        ? await db.collection('api_keys').find({ _id: { $in: apiKeyIds } }).project({ name: 1, userEmail: 1 }).toArray()
        : [];
      const keyMap = new Map(keyDocs.map(key => [key._id.toString(), key]));

      const [totalRequests, totalErrors, streamingRequests, avgLatencyResult, byEndpoint, byKey, lastRequest, lastError] = await Promise.all([
        usageCollection.countDocuments(),
        usageCollection.countDocuments({ responseStatus: { $gte: 400 } }),
        usageCollection.countDocuments({ streaming: true }),
        usageCollection.aggregate([
          { $match: { latencyMs: { $type: 'number' } } },
          { $group: { _id: null, avgLatencyMs: { $avg: '$latencyMs' } } },
        ]).toArray(),
        usageCollection.aggregate([
          { $group: { _id: '$endpoint', total: { $sum: 1 }, errors: { $sum: { $cond: [{ $gte: ['$responseStatus', 400] }, 1, 0] } }, avgLatencyMs: { $avg: '$latencyMs' }, lastRequestAt: { $max: '$timestamp' } } },
          { $sort: { total: -1 } },
        ]).toArray(),
        usageCollection.aggregate([
          { $group: { _id: '$apiKeyId', keyName: { $last: '$apiKeyName' }, total: { $sum: 1 }, errors: { $sum: { $cond: [{ $gte: ['$responseStatus', 400] }, 1, 0] } }, avgLatencyMs: { $avg: '$latencyMs' }, lastRequestAt: { $max: '$timestamp' } } },
          { $sort: { total: -1 } },
          { $limit: 20 },
        ]).toArray(),
        usageCollection.find().sort({ timestamp: -1 }).limit(1).toArray(),
        usageCollection.find({ responseStatus: { $gte: 400 } }).sort({ timestamp: -1 }).limit(1).toArray(),
      ]);

      res.json({
        summary: {
          totalRequests,
          totalErrors,
          streamingRequests,
          normalRequests: Math.max(totalRequests - streamingRequests, 0),
          avgLatencyMs: Math.round(avgLatencyResult[0]?.avgLatencyMs || 0),
          lastRequestAt: lastRequest[0]?.timestamp || null,
          lastError: lastError[0] ? {
            timestamp: lastError[0].timestamp,
            endpoint: lastError[0].endpoint,
            apiKeyName: lastError[0].apiKeyName || 'Unknown key',
            status: lastError[0].responseStatus,
            code: lastError[0].errorCode || null,
            message: lastError[0].errorMessage || null,
          } : null,
          byEndpoint: byEndpoint.map(row => ({
            endpoint: row._id || 'unknown',
            total: row.total,
            errors: row.errors,
            avgLatencyMs: Math.round(row.avgLatencyMs || 0),
            lastRequestAt: row.lastRequestAt || null,
          })),
          byKey: byKey.map(row => {
            const key = row._id ? keyMap.get(row._id.toString()) : null;
            return {
              apiKeyId: row._id,
              keyName: row.keyName || key?.name || 'Unknown key',
              userEmail: key?.userEmail || null,
              total: row.total,
              errors: row.errors,
              avgLatencyMs: Math.round(row.avgLatencyMs || 0),
              lastRequestAt: row.lastRequestAt || null,
            };
          }),
        },
        recent: recent.map(log => {
          const key = log.apiKeyId ? keyMap.get(log.apiKeyId.toString()) : null;
          return { ...log, apiKeyName: log.apiKeyName || key?.name || 'Unknown key', userEmail: key?.userEmail || null };
        }),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get API usage' });
    }
  });
}

function cleanApiScopes(scopes) {
  const allowedScopes = ['chat', 'ingest', 'ingest:write'];
  return Array.isArray(scopes) && scopes.length > 0
    ? scopes.filter(scope => allowedScopes.includes(scope))
    : ['chat'];
}

function cleanAllowedCollectionIds(allowedCollectionIds) {
  return Array.isArray(allowedCollectionIds)
    ? allowedCollectionIds.map(id => id?.toString?.() || id).filter(id => ObjectId.isValid(id))
    : [];
}

function cleanStreamSettings(streamChunkSize, streamDelayMs) {
  const clamp = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };

  return {
    streamChunkSize: clamp(streamChunkSize, 10, 2, 40),
    streamDelayMs: clamp(streamDelayMs, 22, 0, 250),
  };
}

async function generateUniqueShortKey(db) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempts = 0; attempts < 10; attempts++) {
    let shortKey = '';
    for (let i = 0; i < 6; i++) shortKey += chars.charAt(Math.floor(Math.random() * chars.length));
    const existing = await db.collection('api_keys').findOne({ shortKey });
    if (!existing) return shortKey;
  }
  throw new Error('Failed to generate unique short key');
}
