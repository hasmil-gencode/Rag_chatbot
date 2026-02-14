# Custom Vector Search Tool Setup

## Problem
MongoDB Atlas vector search preFilter doesn't support `$or` with null checks properly, causing department filtering to fail.

## Solution
Use custom vector search with **post-filtering** after vector search.

## How It Works

1. **Vector Search First** - Get top candidates without department filter
2. **Post-Filter with $match** - Apply `$or` logic AFTER vector search
3. **Return Filtered Results** - Only return documents that match department criteria

### Filter Logic:
```javascript
{
  organizationId: "xxx",
  $or: [
    { departmentId: "user_dept_id" },  // Files for user's dept
    { departmentId: null }              // Files for all depts
  ]
}
```

## Setup Steps

### 1. Import Custom Tool Workflow

1. Open n8n
2. Import `n8n-custom-vector-search-tool.json`
3. Name: "Custom Vector Search Tool"
4. **Activate** the workflow
5. Copy the **Workflow ID**

### 2. Update Main Chat Workflow

1. Open "RAG Chat - Final Production"
2. **Delete** the "Vector Store Retrieval" node
3. **Add** new node: "Call Workflow" (under Actions)
4. Configure:
   - **Workflow**: Select "Custom Vector Search Tool"
   - **Source**: "Database"
   - **Fields to Send**: "All"

5. **Connect**:
   - Input: From "Format History1"
   - Output: To "AI Agent" (as tool input)

### 3. Update Format History1

Replace code with:

```javascript
const parseData = $input.item.json;

return {
  query: parseData.message,
  chatInput: parseData.message,
  userId: parseData.userId,
  organizationId: parseData.organizationId,
  departmentId: parseData.departmentId,
  sessionId: parseData.sessionId,
  fileId: parseData.fileId
};
```

### 4. Test

**Test Case 1: User with Department**
- User: Has `departmentId: "D1"`
- Should see:
  - ✅ Files with `departmentId: "D1"`
  - ✅ Files with `departmentId: null` (all depts)
  - ❌ Files with `departmentId: "D2"` (other dept)

**Test Case 2: Admin (No Department)**
- User: Has `departmentId: null`
- Should see:
  - ✅ All files in organization

**Test Case 3: Specific File**
- User selects specific file
- Should see:
  - ✅ Only that file's content

## Why This Works

### Vector Search Limitation
MongoDB Atlas vector search `filter` parameter runs BEFORE vector search and has limited operator support.

### Post-Filter Solution
Using `$match` stage AFTER `$vectorSearch` allows full MongoDB query operators including `$or`.

### Performance
- Still efficient because vector search narrows down candidates first
- Post-filter only processes top N candidates (default: 100)
- Final limit: 5 results

## Advantages

✅ **Proper Department Filtering** - Users only see authorized files
✅ **Supports "All Departments"** - Files with null departmentId accessible to all
✅ **Secure** - Strict organization + department boundaries
✅ **Flexible** - Easy to add more filter conditions
✅ **Maintainable** - All logic in one place

## Alternative (If Custom Tool Doesn't Work)

If you can't use custom workflow tool, modify upload workflow to **duplicate entries**:

When admin uploads "for all departments":
1. Get all departments in organization
2. Create vector entry for EACH department
3. Set specific departmentId for each entry

**Pros**: Simple query
**Cons**: Storage overhead, need to sync when departments change

## Environment Variables Required

Make sure these are set in n8n:
- `MONGODB_URI` - MongoDB connection string
- `GEMINI_API_KEY` - Google Gemini API key

## Troubleshooting

### Error: "Cannot find module '@google/generative-ai'"
Install in n8n container:
```bash
docker exec rag_chatbot-n8n-1 npm install @google/generative-ai
```

### Error: "GEMINI_API_KEY not found"
Add to docker-compose.yml under n8n service:
```yaml
environment:
  - GEMINI_API_KEY=your_key_here
```

### No Results Returned
Check:
1. Vector index name is correct: `rag_vector_search_1`
2. Embedding model matches: `text-embedding-004`
3. Collection name is correct: `embedding_files`
4. organizationId and departmentId are valid ObjectIds

## Next Steps

Once working:
1. Monitor performance
2. Adjust `numCandidates` if needed (higher = more accurate, slower)
3. Adjust `limit` for more/fewer results
4. Add caching if needed for frequently asked questions
