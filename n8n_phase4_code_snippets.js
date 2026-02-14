// ===== PHASE 4: n8n Code Snippets =====

// 1. PARSE INPUT NODE (Chat Webhook) - Replace existing code
const body = $input.item.json.body;
const message = body.message || '';
const userId = body.userId || '';
const currentOrganizationId = body.currentOrganizationId || null;
const sessionId = body.sessionId || userId;
const fileId = body.fileId || null;

if (!message || !userId) {
  throw new Error('message and userId are required');
}

return {
  message: message,
  userId: userId,
  currentOrganizationId: currentOrganizationId,
  sessionId: sessionId,
  fileId: fileId
};

// ===================================

// 2. GET HIERARCHY NODE (NEW - Add after Parse Input)
// This node queries MongoDB to get organization hierarchy
const currentOrgId = $json.currentOrganizationId;

if (!currentOrgId) {
  // No org context = only general knowledge
  return {
    chatInput: $json.message,
    userId: $json.userId,
    sessionId: $json.sessionId,
    fileId: $json.fileId,
    currentOrganizationId: null,
    hierarchyOrgIds: []
  };
}

// MongoDB query to get org hierarchy
const { MongoClient, ObjectId } = require('mongodb');
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot_stag';
const client = new MongoClient(mongoUri);

try {
  await client.connect();
  const db = client.db('ragchatbot_stag');
  
  // Get current org
  const currentOrg = await db.collection('organizations').findOne({ 
    _id: new ObjectId(currentOrgId) 
  });
  
  if (!currentOrg) {
    return {
      chatInput: $json.message,
      userId: $json.userId,
      sessionId: $json.sessionId,
      fileId: $json.fileId,
      currentOrganizationId: currentOrgId,
      hierarchyOrgIds: []
    };
  }
  
  // Find all orgs in hierarchy
  // Current org + all children (path starts with current path)
  const pathRegex = new RegExp(`^${currentOrg.path.join('/')}`);
  
  const hierarchyOrgs = await db.collection('organizations').find({
    $or: [
      { _id: new ObjectId(currentOrgId) }, // Current org
      { path: pathRegex } // All children
    ]
  }).toArray();
  
  const hierarchyOrgIds = hierarchyOrgs.map(o => o._id.toString());
  
  return {
    chatInput: $json.message,
    userId: $json.userId,
    sessionId: $json.sessionId,
    fileId: $json.fileId,
    currentOrganizationId: currentOrgId,
    hierarchyOrgIds: hierarchyOrgIds
  };
  
} finally {
  await client.close();
}

// ===================================

// 3. BUILD VECTOR FILTER NODE - Replace existing code
const parseData = $json;

// Build vector search filter for MongoDB
let vectorFilter = {};

// Hierarchy-aware filter
if (parseData.hierarchyOrgIds && parseData.hierarchyOrgIds.length > 0) {
  // Convert string IDs to ObjectId format for MongoDB query
  const orgObjectIds = parseData.hierarchyOrgIds.map(id => new ObjectId(id));
  
  vectorFilter['$or'] = [
    { sharedWith: { $in: orgObjectIds } }, // Files shared with any org in hierarchy
    { sharedWith: { $size: 0 } }, // General knowledge (no sharing restrictions)
    { fileId: null } // Text embedded knowledge
  ];
} else {
  // No org context = only general knowledge
  vectorFilter['$or'] = [
    { sharedWith: { $size: 0 } },
    { fileId: null }
  ];
}

// File-specific filter (if user selected a file)
if (parseData.fileId) {
  vectorFilter['fileId'] = parseData.fileId;
}

return {
  chatInput: parseData.chatInput,
  userId: parseData.userId,
  sessionId: parseData.sessionId,
  currentOrganizationId: parseData.currentOrganizationId,
  vectorFilter: JSON.stringify(vectorFilter)
};

// ===================================

// 4. FILE UPLOAD - PARSE INPUT NODE - Replace existing code
const body = $input.item.json.body;
const fileId = body.fileId;
const userId = body.userId;
const sharedWith = body.sharedWith || []; // Array of org IDs
const fileName = body.fileName || 'unknown';
const fileUrl = body.fileUrl;

if (!fileId || !fileUrl || !userId) {
  throw new Error('fileId, fileUrl, and userId are required');
}

let bucket, key;
if (fileUrl.startsWith('https://')) {
  const urlParts = fileUrl.replace('https://', '').split('/');
  const domain = urlParts[0];
  if (domain.includes('.s3.')) {
    bucket = domain.split('.')[0];
    key = urlParts.slice(1).join('/');
  }
}

if (!bucket || !key) {
  throw new Error('Invalid S3 URL format');
}

return {
  fileId,
  userId,
  sharedWith, // Array of org IDs
  fileName,
  s3Bucket: bucket,
  s3Key: key
};

// ===================================

// 5. DOCUMENT SPLITTER - Update metadata configuration
// In the n8n UI, update the metadata section to:
// 
// Metadata Values:
// [
//   {
//     "name": "fileId",
//     "value": "={{ $('Parse S3 URL').item.json.fileId }}"
//   },
//   {
//     "name": "userId",
//     "value": "={{ $('Parse S3 URL').item.json.userId }}"
//   },
//   {
//     "name": "sharedWith",
//     "value": "={{ $('Parse S3 URL').item.json.sharedWith }}"
//   }
// ]

// ===================================

// 6. VECTOR STORE INSERT - Ensure metadata includes sharedWith
// The metadata from Document Splitter will automatically flow to Vector Store
// Just ensure the Vector Store node is configured to accept custom metadata

// ===================================

// NOTES:
// - Replace "Parse Input" node code with snippet #1
// - Add NEW "Get Hierarchy" Code node after Parse Input (snippet #2)
// - Replace "Build Vector Filter" node code with snippet #3
// - Replace file upload "Parse Input" with snippet #4
// - Update Document Splitter metadata in UI (snippet #5)
// - Verify Vector Store accepts custom metadata (snippet #6)
