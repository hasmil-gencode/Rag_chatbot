# MySQL Integration Plan

> Status: **PLANNED** — Not yet implemented. Pickup when ready.

## Why

Some clients store their data in MySQL (products, pricing, inventory, etc.). Currently the chatbot only answers from uploaded files. This feature lets the AI also answer from MySQL data.

## How It Works (Simple Version)

```
MySQL Database (client's server)
    ↓ sync every X hours
Convert each row to text
    ↓
Embed & store in vector DB (same as files)
    ↓
User asks question → AI searches both files AND MySQL data → answers
```

No change to how chat works. MySQL data just becomes another source alongside files.

## What Needs to Be Built

### 1. MySQL Config UI (per organization)

In Settings page, new "Data Sources" tab. Developer fills in:
- Host (remote server IP/domain)
- Port (default 3306)
- Username (READ-ONLY user recommended)
- Password
- Database name
- SSL on/off

Stored in `organizations` collection or separate `data_sources` collection, per org.

### 2. Table Selection

After connecting, system reads available tables. Developer picks which tables to sync. For each table, optionally pick which columns to include (or all).

### 3. Sync Pipeline (`mysqlPipeline.js`)

New file. Does this:
1. Connect to MySQL
2. SELECT rows from chosen tables
3. Convert each row to readable text, e.g.:
   ```
   Table: products
   Name: Yamaha R15
   Price: RM 12,500
   Category: Motorcycle
   Status: In Stock
   ```
4. Chunk the text (same as file pipeline)
5. Embed chunks (same providers — Gemini/OpenAI/Ollama)
6. Store in Qdrant/Pinecone with metadata:
   - `source_type: 'mysql'`
   - `table_name: 'products'`
   - `shared_with: [orgId]`
7. Show progress via SSE (same pattern as file upload)

### 4. Sync Schedule

- Manual "Sync Now" button
- Optional auto-sync: every 6/12/24 hours
- Re-sync deletes old vectors for that table first, then inserts fresh

### 5. Chat — No Change Needed

`chatPipeline.js` already searches all vectors in Qdrant/Pinecone filtered by org. MySQL-sourced vectors will automatically appear in search results. Only change: show source as "products table" instead of "file.pdf, page 3" in the UI.

## Files to Create/Modify

| File | What |
|------|------|
| **NEW** `mysqlPipeline.js` | Connect, read, convert, chunk, embed, store |
| `server.js` | Config endpoints, sync trigger, schedule |
| `package.json` | Add `mysql2` package |
| `SettingsPage.tsx` | New "Data Sources" tab with MySQL config form |
| `ChatMessage.tsx` | Show MySQL source badge differently |

## Security Notes

- Use READ-ONLY MySQL user (no INSERT/UPDATE/DELETE)
- Credentials stored encrypted or via environment variables
- Connection timeout + query timeout to prevent hanging
- Per-org isolation — each org only sees their own MySQL data
- Client's MySQL must allow remote connections from our server IP

## Future Enhancement (Phase 2)

Live SQL query — instead of syncing, AI converts user question to SQL query in real-time and runs it against MySQL. More complex, more risk, but always up-to-date. Build this only if sync approach is too slow/stale for client needs.

## Dependencies

- `mysql2` npm package (MySQL client for Node.js)
- Client provides: MySQL host, credentials, and whitelists our server IP

## Notes

- Remote MySQL server (confirmed by client)
- This is an add-on feature — not all clients need it
- Only organizations with MySQL configured will have this option
- Existing file-based RAG continues to work unchanged
