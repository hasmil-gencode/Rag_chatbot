# Phase 4: n8n Vector Search Update for Multi-Org Hierarchy

## Changes Required

### 1. **Parse Input Node** (Chat Webhook)
Change from:
```javascript
const organizationId = body.organizationId || null;
const departmentId = body.departmentId || null;
```

To:
```javascript
const currentOrganizationId = body.currentOrganizationId || null;
```

### 2. **Build Vector Filter Node** (NEW - Add MongoDB Query)
Before vector search, add a new Code node to get hierarchy:

```javascript
// Get current organization and its hierarchy
const currentOrgId = $json.currentOrganizationId;

if (!currentOrgId) {
  // No org context = no files accessible
  return {
    chatInput: $json.message,
    userId: $json.userId,
    sessionId: $json.sessionId,
    fileId: $json.fileId,
    hierarchyOrgIds: []
  };
}

// MongoDB query to get org hierarchy
const { MongoClient, ObjectId } = require('mongodb');
const client = new MongoClient(process.env.MONGODB_URI);

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
      hierarchyOrgIds: []
    };
  }
  
  // Find all orgs in hierarchy (parent + current + children)
  const hierarchyOrgs = await db.collection('organizations').find({
    $or: [
      { _id: new ObjectId(currentOrgId) }, // Current org
      { path: { $regex: `^${currentOrg.path.join('/')}` } }, // Children
      // Parents would need path to store IDs, or query by name in path
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
```

### 3. **Vector Search Filter Node**
Change from:
```javascript
if (parseData.organizationId !== null) {
  vectorFilter['$or'] = [
    { organizationId: parseData.organizationId },
    { organizationId: null }  // Include general knowledge
  ];
}
if (parseData.departmentId !== null) {
  vectorFilter['departmentId'] = parseData.departmentId;
}
```

To:
```javascript
// Filter by sharedWith array (hierarchy-aware)
if ($json.hierarchyOrgIds && $json.hierarchyOrgIds.length > 0) {
  const orgObjectIds = $json.hierarchyOrgIds.map(id => ({ $oid: id }));
  
  vectorFilter['$or'] = [
    { sharedWith: { $in: orgObjectIds } }, // Files shared with any org in hierarchy
    { sharedWith: { $size: 0 } }, // Files with no sharing restrictions (general knowledge)
    { fileId: null } // Text embedded knowledge (no fileId)
  ];
} else {
  // No org context = only general knowledge
  vectorFilter['$or'] = [
    { sharedWith: { $size: 0 } },
    { fileId: null }
  ];
}

// File-specific filter (if user selected a file)
if ($json.fileId) {
  vectorFilter['fileId'] = $json.fileId;
}
```

### 4. **File Upload Webhook - Parse Input**
Change from:
```javascript
const organizationId = body.organizationId || null;
const departmentId = body.departmentId || null;
```

To:
```javascript
const sharedWith = body.sharedWith || []; // Array of org IDs
```

### 5. **File Upload - Document Splitter Metadata**
Change from:
```javascript
{
  "name": "organizationId",
  "value": "={{ $('Parse S3 URL').item.json.organizationId }}"
},
{
  "name": "departmentId",
  "value": "={{ $('Parse S3 URL').item.json.departmentId }}"
}
```

To:
```javascript
{
  "name": "sharedWith",
  "value": "={{ $('Parse S3 URL').item.json.sharedWith }}"
}
```

### 6. **Pinecone/Vector Store Insert**
Metadata should now include:
- `fileId` - File reference
- `userId` - Uploader
- `sharedWith` - Array of ObjectIds (as strings)

---

## Testing Steps

1. **Create Organizations**:
   ```bash
   POST /api/organizations
   {
     "name": "Acme Corp",
     "type": "organization",
     "parentId": null
   }
   # Returns: { organizationId: "org1" }
   
   POST /api/organizations
   {
     "name": "Engineering",
     "type": "entity",
     "parentId": "org1"
   }
   # Returns: { organizationId: "entity1" }
   ```

2. **Assign User to Org**:
   ```bash
   POST /api/user-assignments
   {
     "userId": "user123",
     "organizationIds": ["org1", "entity1"]
   }
   ```

3. **Upload File with Sharing**:
   ```bash
   POST /api/upload
   FormData:
   - file: document.pdf
   - sharedWith: ["org1", "entity1"]
   - type: "document"
   ```

4. **Chat with Org Context**:
   ```bash
   POST /api/chat
   {
     "message": "What is in the document?",
     "currentOrganizationId": "entity1",
     "sessionId": "session123"
   }
   ```

5. **Verify Vector Search**:
   - User in "entity1" should see files shared with "org1" (parent) and "entity1"
   - User in "org1" should see files shared with "org1" and all children
   - Developer should see all files

---

## MongoDB Embedding Schema

```javascript
{
  _id: ObjectId("..."),
  text: "Document chunk content...",
  embedding: [0.123, 0.456, ...], // 768 dimensions
  fileId: "file123", // Reference to files collection
  userId: "user123",
  sharedWith: [
    ObjectId("org1"),
    ObjectId("entity1")
  ],
  uploadedAt: ISODate("2026-02-11T03:30:00Z")
}
```

---

## Key Points

1. **Hierarchy Inheritance**: If file shared with "Org", all "Entities" and "Depts" under it can access
2. **General Knowledge**: Files with empty `sharedWith[]` are accessible to all
3. **Text Embedded**: Knowledge added via "Text Embedded" menu has `fileId: null`
4. **Developer Access**: Developer role bypasses all filters (sees everything)
5. **No Org Context**: If user hasn't selected an org, they see only general knowledge

---

## Next: Phase 5 - Frontend Updates
