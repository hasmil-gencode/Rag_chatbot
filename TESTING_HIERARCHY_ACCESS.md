# Testing Hierarchy-Based File Access

This guide tests that users can access files shared with their parent organizations.

## Test Scenario

**Organization Structure:**
```
Orga A (organization)
├── Ent A (entity)
    ├── Dept A (department)
    └── Dept B (department)

Orga B (organization)
├── Ent B (entity)
└── Ent B2 (entity)
```

**Expected Behavior:**
- File shared with **Orga A** → Accessible by users in Orga A, Ent A, Dept A, Dept B
- File shared with **Ent A** → Accessible by users in Ent A, Dept A, Dept B (NOT Orga A)
- File shared with **Dept A** → Accessible by users in Dept A only

---

## Step 0: Create Organizations

Login as **developer@gencode.com.my** and go to **Organizations** page.

### Create Orga A
1. Click **Create Organization**
2. **Name:** `Orga A`
3. **Type:** `organization`
4. **Parent Organization:** (leave empty)
5. Click **Create**

### Create Ent A (under Orga A)
1. Click **Create Organization**
2. **Name:** `Ent A`
3. **Type:** `entity`
4. **Parent Organization:** Select **Orga A**
5. Click **Create**

### Create Dept A (under Ent A)
1. Click **Create Organization**
2. **Name:** `Dept A`
3. **Type:** `department`
4. **Parent Organization:** Select **Ent A**
5. Click **Create**

### Create Dept B (under Ent A)
1. Click **Create Organization**
2. **Name:** `Dept B`
3. **Type:** `department`
4. **Parent Organization:** Select **Ent A**
5. Click **Create**

### Create Orga B
1. Click **Create Organization**
2. **Name:** `Orga B`
3. **Type:** `organization`
4. **Parent Organization:** (leave empty)
5. Click **Create**

### Create Ent B (under Orga B)
1. Click **Create Organization**
2. **Name:** `Ent B`
3. **Type:** `entity`
4. **Parent Organization:** Select **Orga B**
5. Click **Create**

### Create Ent B2 (under Orga B)
1. Click **Create Organization**
2. **Name:** `Ent B2`
3. **Type:** `entity`
4. **Parent Organization:** Select **Orga B**
5. Click **Create**

**Verify:** You should now have 7 organizations in the list.

---

## Step 1: Create Test Users

Go to **Users** page.

### User 1: Organization Level
- **Email:** `orga-a-user@test.com`
- **Full Name:** `Orga A User`
- **Password:** `Test1234`
- **Assign to Organizations:** ✅ Orga A (organization)
- **Can upload files:** ✅ Checked
- Click **Create**

### User 2: Entity Level
- **Email:** `ent-a-user@test.com`
- **Full Name:** `Ent A User`
- **Password:** `Test1234`
- **Assign to Organizations:** ✅ Ent A (entity)
- **Can upload files:** ✅ Checked
- Click **Create**

### User 3: Department Level
- **Email:** `dept-a-user@test.com`
- **Full Name:** `Dept A User`
- **Password:** `Test1234`
- **Assign to Organizations:** ✅ Dept A (department)
- **Can upload files:** ✅ Checked
- Click **Create**

### User 4: Different Organization (Negative Test)
- **Email:** `orga-b-user@test.com`
- **Full Name:** `Orga B User`
- **Password:** `Test1234`
- **Assign to Organizations:** ✅ Orga B (organization)
- **Can upload files:** ✅ Checked
- Click **Create**

---

## Step 2: Upload Test File

Stay logged in as **developer@gencode.com.my** and go to **Files** page.

1. Click **Choose File** and select a PDF document (e.g., company policy, product manual)
2. **Share with Organizations:**
   - ✅ Check **Orga A (organization)** ONLY
   - ⬜ Leave all others unchecked
3. Click **Choose File** button to upload
4. Wait for upload to complete
5. Verify file appears in "Uploaded Files" table

---

## Step 3: Test Positive Cases

### Test 3.1: User at Organization Level
1. **Logout** from developer account
2. **Login** as `orga-a-user@test.com` / `Test1234`
3. Go to **Chat** page
4. Ask a question about the uploaded file content
   - Example: "What is the main topic of the document?"
5. **Expected Result:** ✅ Bot should answer based on file content
6. **Reason:** User assigned to Orga A, file shared with Orga A

### Test 3.2: User at Entity Level (Child of Orga A)
1. **Logout** from orga-a-user account
2. **Login** as `ent-a-user@test.com` / `Test1234`
3. Go to **Chat** page
4. Ask the same question about the file
5. **Expected Result:** ✅ Bot should answer based on file content
6. **Reason:** User assigned to Ent A, parent is Orga A (file shared with Orga A)

### Test 3.3: User at Department Level (Grandchild of Orga A)
1. **Logout** from ent-a-user account
2. **Login** as `dept-a-user@test.com` / `Test1234`
3. Go to **Chat** page
4. Ask the same question about the file
5. **Expected Result:** ✅ Bot should answer based on file content
6. **Reason:** User assigned to Dept A, parents are Ent A → Orga A (file shared with Orga A)

---

## Step 4: Test Negative Case

### Test 4.1: User in Different Organization
1. **Logout** from dept-a-user account
2. **Login** as `orga-b-user@test.com` / `Test1234`
3. Go to **Chat** page
4. Ask the same question about the file
5. **Expected Result:** ❌ Bot should say "I don't have information about that in the uploaded documents"
6. **Reason:** User assigned to Orga B, file shared with Orga A (different hierarchy)

---

## Step 5: Verify in Backend Logs (Optional)

Check Docker logs to see hierarchy resolution:

```bash
docker logs rag_chatbot-rag-chatbot-ui-1 --tail 50 | grep -A 5 "accessible org"
```

You should see:
- **orga-a-user:** 1 accessible org (Orga A)
- **ent-a-user:** 2 accessible orgs (Ent A, Orga A)
- **dept-a-user:** 3 accessible orgs (Dept A, Ent A, Orga A)
- **orga-b-user:** 1 accessible org (Orga B)

---

## Expected Results Summary

| User | Assigned To | Can Access File? | Reason |
|------|-------------|------------------|--------|
| orga-a-user | Orga A | ✅ YES | Direct match |
| ent-a-user | Ent A | ✅ YES | Parent is Orga A |
| dept-a-user | Dept A | ✅ YES | Grandparent is Orga A |
| orga-b-user | Orga B | ❌ NO | Different hierarchy |

---

## Troubleshooting

### Bot says "no information" for all users
- Check if file was uploaded successfully (Files page)
- Check if file has been processed by n8n (wait 1-2 minutes)
- Check n8n workflow is running
- Check backend logs for errors

### User can't login
- Verify user was created (Users page as developer)
- Check password is correct (`Test1234`)
- Check user status is "active"

### File not appearing in Files page
- Check storage limit not exceeded (top of Files page)
- Check file size is under limit
- Check backend logs for upload errors

---

## Cleanup After Testing

Login as **developer@gencode.com.my**:

1. Go to **Users** page → Delete all test users
2. Go to **Files** page → Delete test file
3. Go to **Deleted Chats** page → Clear chat history

---

## Technical Details

### How Hierarchy Access Works

When a user requests files, the backend:

1. Gets user's assigned organizations from `user_organization_assignments`
2. For each assigned org, finds ALL parent orgs using the `path` field
3. For each assigned org, finds ALL child orgs using the `path` field
4. Combines into a set of accessible org IDs
5. Returns files where `sharedWith` array contains any accessible org ID

**Example for dept-a-user:**
```javascript
// User assigned to: Dept A (698bfdd49edfc042a95e0829)
// Dept A path: ['Orga A', 'Ent A', 'Dept A']

// Step 1: Find parents by path
Parents: Orga A, Ent A, Dept A

// Step 2: Find children by path
Children: Dept A (no children)

// Step 3: Accessible org IDs
[698bfd979edfc042a95e0827, 698bfdae9edfc042a95e0828, 698bfdd49edfc042a95e0829]
// (Orga A, Ent A, Dept A)

// Step 4: File query
{ sharedWith: { $in: [accessible org IDs] } }
```

### Code Location

- **Backend logic:** `/server.js` lines 1165-1195
- **Frontend user creation:** `/frontend/src/components/chat/UsersPage.tsx`
- **Frontend file upload:** `/frontend/src/components/chat/FilesPage.tsx`
