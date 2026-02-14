# Phase 4: Update n8n Workflow - Using MongoDB Nodes

## Overview
Update n8n chat workflow to support multi-organization hierarchy with `sharedWith[]` array filtering using native MongoDB nodes.

## Workflow Structure

```
Webhook (Chat) 
  → Parse Input
  → Get User Orgs (MongoDB)
  → Get Hierarchy (MongoDB) 
  → Vector Store Retriever (MongoDB Atlas)
  → AI Agent
  → Response
```

## Step-by-Step Configuration

### 1. Parse Input Node (Code)
**Purpose:** Extract request data

```javascript
const body = $input.item.json.body;

return {
  message: body.message || '',
  userId: body.userId || '',
  currentOrganizationId: body.currentOrganizationId || null,
  sessionId: body.sessionId || body.userId,
  fileId: body.fileId || null
};
```

---

### 2. Get User Assignments (MongoDB Node)
**Node:** MongoDB  
**Operation:** Find  
**Collection:** `user_assignments`

**Query:**
```json
{
  "userId": "={{ $json.userId }}"
}
```

**Options:**
- Projection: `{ "organizationId": 1 }`

**Output:** User's directly assigned organization IDs

---

### 3. Get Organization Hierarchy (MongoDB Node)
**Node:** MongoDB  
**Operation:** Find  
**Collection:** `organizations`

**Query (if currentOrganizationId exists):**
```json
{
  "_id": "={{ $json.currentOrganizationId }}"
}
```

**Options:**
- Projection: `{ "path": 1, "name": 1 }`

**Output:** Current organization with path array

---

### 4. Get All Child Organizations (MongoDB Node)
**Node:** MongoDB  
**Operation:** Find  
**Collection:** `organizations`

**Query:**
```json
{
  "$or": [
    { "_id": "={{ $json.currentOrganizationId }}" },
    { "path": { "$regex": "^={{ $('Get Organization Hierarchy').item.json.path.join('/') }}" } }
  ]
}
```

**Options:**
- Projection: `{ "_id": 1 }`

**Output:** All organizations in hierarchy (current + children)

---

### 5. Build Hierarchy Array (Code Node)
**Purpose:** Combine org IDs for vector filter

```javascript
const currentOrgId = $('Parse Input').item.json.currentOrganizationId;

if (!currentOrgId) {
  // No org context - return empty array (general knowledge only)
  return {
    hierarchyOrgIds: [],
    hasOrgContext: false
  };
}

// Get all child orgs from previous node
const childOrgs = $('Get All Child Organizations').all();
const hierarchyOrgIds = childOrgs.map(item => item.json._id);

return {
  hierarchyOrgIds: hierarchyOrgIds,
  hasOrgContext: true,
  currentOrganizationId: currentOrgId
};
```

---

### 6. Vector Store Retriever (MongoDB Atlas Vector Store)
**Node:** MongoDB Atlas Vector Store Retriever  
**Connection:** Your MongoDB Atlas credentials

**Configuration:**
- **Database:** `ragchatbot_stag`
- **Collection:** `embedding_files`
- **Index Name:** `vector_index` (create if not exists)
- **Embedding Field:** `embedding`
- **Text Field:** `text`

**Pre-Filter (MongoDB Query):**
```json
{
  "$or": [
    { "sharedWith": { "$size": 0 } },
    { "sharedWith": { "$in": {{ $json.hierarchyOrgIds }} } }
  ]
}
```

**Explanation:**
- `sharedWith: []` = General knowledge (no org restriction)
- `sharedWith: [orgId1, orgId2]` = Org-specific files
- Filter matches if file has no restrictions OR user's hierarchy includes any shared org

**Top K:** 5 (adjust as needed)

---

### 7. AI Agent (Conversational Agent)
**Node:** AI Agent  
**Type:** Conversational Agent

**Configuration:**
- **System Message:** Your chatbot instructions
- **Memory:** Use Window Buffer Memory with sessionId
- **Tools:** Vector Store Retriever (from step 6)

**Input:** `={{ $('Parse Input').item.json.message }}`

---

### 8. Save Message (MongoDB Node)
**Node:** MongoDB  
**Operation:** Insert  
**Collection:** `messages`

**Document:**
```json
{
  "userId": "={{ $('Parse Input').item.json.userId }}",
  "sessionId": "={{ $('Parse Input').item.json.sessionId }}",
  "currentOrganizationId": "={{ $('Parse Input').item.json.currentOrganizationId }}",
  "role": "user",
  "content": "={{ $('Parse Input').item.json.message }}",
  "createdAt": "={{ new Date().toISOString() }}"
}
```

---

### 9. Save AI Response (MongoDB Node)
**Node:** MongoDB  
**Operation:** Insert  
**Collection:** `messages`

**Document:**
```json
{
  "userId": "={{ $('Parse Input').item.json.userId }}",
  "sessionId": "={{ $('Parse Input').item.json.sessionId }}",
  "currentOrganizationId": "={{ $('Parse Input').item.json.currentOrganizationId }}",
  "role": "assistant",
  "content": "={{ $('AI Agent').item.json.output }}",
  "createdAt": "={{ new Date().toISOString() }}"
}
```

---

### 10. Return Response (Respond to Webhook)
**Node:** Respond to Webhook

**Response:**
```json
{
  "response": "={{ $('AI Agent').item.json.output }}",
  "sessionId": "={{ $('Parse Input').item.json.sessionId }}"
}
```

---

## MongoDB Atlas Vector Index Setup

### Create Vector Search Index

In MongoDB Atlas UI:
1. Go to your cluster → Search → Create Search Index
2. Choose "JSON Editor"
3. Database: `ragchatbot_stag`
4. Collection: `embedding_files`
5. Index Name: `vector_index`

**Index Definition:**
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "sharedWith"
    },
    {
      "type": "filter",
      "path": "fileId"
    }
  ]
}
```

**Note:** Adjust `numDimensions` based on your embedding model:
- OpenAI text-embedding-ada-002: 1536
- OpenAI text-embedding-3-small: 1536
- OpenAI text-embedding-3-large: 3072

---

## Testing

### Test Case 1: General Knowledge (No Org Context)
```bash
curl -X POST https://your-n8n.com/webhook/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is AI?",
    "userId": "user123",
    "currentOrganizationId": null
  }'
```

**Expected:** Only files with `sharedWith: []` are searched

---

### Test Case 2: Organization Context
```bash
curl -X POST https://your-n8n.com/webhook/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are our policies?",
    "userId": "user123",
    "currentOrganizationId": "org_id_here"
  }'
```

**Expected:** Files with `sharedWith: []` OR `sharedWith` containing org + children

---

### Test Case 3: Hierarchy Inheritance
Given hierarchy:
- Org A (ID: `aaa`)
  - Entity B (ID: `bbb`, path: `['aaa']`)
    - Dept C (ID: `ccc`, path: `['aaa', 'bbb']`)

User in Org A should see:
- Files shared with `aaa`, `bbb`, `ccc`
- Files with `sharedWith: []`

User in Dept C should see:
- Files shared with `ccc` only
- Files with `sharedWith: []`

---

## Advantages of Using MongoDB Nodes

✅ **No custom code** - Use native n8n nodes  
✅ **Better error handling** - Built-in retry logic  
✅ **Easier maintenance** - Visual workflow  
✅ **Connection pooling** - Managed by n8n  
✅ **Credentials management** - Secure storage  
✅ **Native vector search** - MongoDB Atlas integration  

---

## Migration from Phase 4 Code Snippets

If you already have custom code implementation:

1. **Backup current workflow**
2. **Replace custom MongoDB code nodes** with MongoDB nodes
3. **Configure MongoDB credentials** in n8n
4. **Update vector search** to use MongoDB Atlas Vector Store node
5. **Test thoroughly** with all hierarchy levels
6. **Monitor performance** - Native nodes may be faster

---

## Troubleshooting

### Vector Search Returns No Results
- Check vector index exists in MongoDB Atlas
- Verify `numDimensions` matches your embedding model
- Ensure `sharedWith` field is indexed as filter
- Test query directly in MongoDB Compass

### Hierarchy Not Working
- Verify `path` array is correctly stored in organizations
- Check regex pattern in "Get All Child Organizations"
- Test with MongoDB Compass aggregation

### Performance Issues
- Add index on `organizations.path`
- Add index on `user_assignments.userId`
- Limit vector search Top K to 3-5 results
- Consider caching user hierarchy

---

## Important: Response Node

Your current workflow is missing the response! Add after AI Agent:

**Node:** Respond to Webhook  
**Response Body:**
```json
{
  "response": "={{ $json.output }}",
  "sessionId": "={{ $('Parse Input').item.json.sessionId }}"
}
```

**Connection:** AI Agent → Respond to Webhook

---

## Note: Message Saving

Your workflow already uses **MongoDB Chat Memory** node which automatically:
- ✅ Saves user messages
- ✅ Saves AI responses
- ✅ Loads chat history
- ✅ Manages context window (50 messages)

**No need for manual save nodes!** The memory node handles everything.

---

## Current Workflow Status

✅ Parse Input  
✅ Get User Assignments (MongoDB)  
✅ Get Organization Hierarchy (MongoDB)  
✅ Get All Child Organizations (MongoDB)  
✅ Build Hierarchy Array  
✅ Vector Store Retrieval with `sharedWith[]` filter  
✅ AI Agent with Gemini 2.0 Flash  
✅ MongoDB Chat Memory (auto-saves messages)  
❌ **Missing: Respond to Webhook node**

---

## Next Steps

After Phase 4 completion:
1. **Add Respond to Webhook node** to return AI response
2. Test all organization levels
3. Verify file sharing inheritance
4. Update file upload workflow (if needed)
5. Train users on multi-org system
6. Monitor query performance
