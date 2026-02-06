# RAG Chat with Fallback Department Search

## Overview
Workflow dengan **2-tier fallback search**:
1. **Priority 1**: Search dalam user's department + "all departments" files
2. **Priority 2** (Fallback): Kalau takde results, search org-wide

## How It Works

### Search Logic

```
User Query → Generate Embedding
              ↓
         Has Department?
         ↙           ↘
       YES            NO
        ↓              ↓
   Dept Search    Org Search
   (dept + null)   (org only)
        ↓              ↓
   Got Results?       Return
        ↙    ↘
      YES    NO
       ↓      ↓
    Return  Fallback
           Org Search
              ↓
           Return
```

### Example Scenarios

**Scenario 1: User dalam Dept A, ada files untuk Dept A**
- Search: `{org: X, $or: [{dept: A}, {dept: null}]}`
- Found: 3 files (2 for Dept A, 1 for all depts)
- Result: ✅ Return 3 files (no fallback needed)

**Scenario 2: User dalam Dept B, takde files untuk Dept B**
- Search 1: `{org: X, $or: [{dept: B}, {dept: null}]}`
- Found: 0 files
- Search 2 (Fallback): `{org: X}` (all org files)
- Found: 5 files
- Result: ✅ Return 5 files (fallback triggered)

**Scenario 3: Admin (no dept)**
- Search: `{org: X}` (skip dept filter)
- Found: 10 files
- Result: ✅ Return 10 files

## Key Changes from Original

### 1. Removed AI Agent Tool Mode
**Before**: Vector Store as AI Agent tool
**After**: Direct vector search → LLM Chain

**Why**: AI Agent tool mode doesn't allow custom search logic with fallback.

### 2. Custom Fallback Search Node
**Node**: "Fallback Vector Search"
**Type**: Code node with MongoDB aggregation

**Logic**:
```javascript
// Step 1: Try dept-specific
if (departmentId) {
  results = search with dept filter
}

// Step 2: Fallback if empty
if (results.length === 0) {
  results = search org-wide
}

return results
```

### 3. LLM Chain Instead of AI Agent
**Before**: AI Agent with tools
**After**: Simple LLM Chain with context

**Why**: Simpler, more control over context injection.

## Nodes Breakdown

### 1. Parse Input
Extract message, userId, organizationId, departmentId, sessionId, fileId

### 2. Format History
Build vector filter (org-level only, no dept filter yet)

### 3. Fallback Vector Search
**Main logic node**:
- Generate embedding with Gemini
- Try dept-specific search first
- Fallback to org-wide if no results
- Return formatted documents

### 4. Format for AI
Convert results to `documents` array for LLM Chain

### 5. Merge Context
Combine:
- Input 1: Documents from vector search
- Input 2: Original query from Format History

### 6. LLM Chain
Process query with:
- Retrieved documents as context
- Chat memory for conversation history
- Gemini 2.0 Flash model

### 7. Format Response
Extract final response text

## Environment Variables Required

```bash
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=your_gemini_key
```

## Setup Instructions

### 1. Import Workflow
1. Copy `n8n-workflow-with-fallback-search.json`
2. Import into n8n
3. Update credentials:
   - MongoDB account 2
   - Google Gemini API

### 2. Install Dependencies
```bash
docker exec <n8n-container> npm install @google/generative-ai
```

### 3. Test
1. Click "Execute workflow"
2. Check console logs for:
   - "Dept-specific search found X results"
   - "Falling back to org-wide search" (if triggered)
   - "Org-wide search found X results"

### 4. Integrate with Production
Replace "Test Data" node with "Webhook" node:
```javascript
{
  "parameters": {
    "httpMethod": "POST",
    "path": "chat",
    "responseMode": "responseNode"
  },
  "type": "n8n-nodes-base.webhook"
}
```

Add "Respond to Webhook" at the end.

## Advantages

✅ **Smart Fallback** - Always return results if available in org
✅ **Dept Priority** - Prioritize dept-specific files
✅ **Secure** - Org-level boundary maintained
✅ **Transparent** - Console logs show which search tier used
✅ **Simple** - No complex AI Agent tool configuration

## Performance

- **Dept Search**: ~1-2s (50 candidates, 5 results)
- **Fallback Search**: +1-2s (only if needed)
- **Total**: 2-4s average

## Monitoring

Check logs for:
```
Dept-specific search found 3 results  ← Success, no fallback
Falling back to org-wide search       ← Fallback triggered
Org-wide search found 5 results       ← Fallback results
```

## Troubleshooting

### No Results Even with Fallback
- Check organizationId is correct
- Verify vector index exists: `rag_vector_search_1`
- Check embedding model: `text-embedding-004`

### Error: Cannot find module '@google/generative-ai'
```bash
docker exec <n8n-container> npm install @google/generative-ai
```

### Fallback Always Triggers
- Check if files have correct departmentId
- Verify dept filter logic in code node
- Check MongoDB aggregation pipeline

## Next Steps

1. ✅ Test with different dept scenarios
2. ✅ Monitor fallback frequency
3. ⚪ Add caching for frequent queries
4. ⚪ Add analytics for search performance
5. ⚪ Optimize numCandidates based on data size

## Migration from Old Workflow

**Old**: AI Agent with Vector Store tool
**New**: LLM Chain with custom vector search

**Steps**:
1. Export old workflow (backup)
2. Import new workflow
3. Update webhook URL in chatbot
4. Test thoroughly
5. Switch production traffic
6. Monitor for issues

## Comparison

| Feature | Old (AI Agent) | New (Fallback) |
|---------|---------------|----------------|
| Dept Filter | ❌ Broken | ✅ Works |
| Fallback | ❌ No | ✅ Yes |
| Flexibility | ⚪ Limited | ✅ Full control |
| Complexity | ✅ Simple | ⚪ Medium |
| Performance | ✅ Fast | ⚪ Slightly slower |

## Conclusion

Workflow ni solve masalah dept filtering dengan fallback mechanism yang smart. User dapat results yang relevant untuk dept dia, tapi kalau takde, still dapat results dari org-wide search.
