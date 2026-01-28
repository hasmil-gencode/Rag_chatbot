# Genie RAG Chatbot - Complete User Guide & Technical Documentation

## 🎯 Overview

Genie is an intelligent RAG (Retrieval-Augmented Generation) chatbot system with **multi-tenant RBAC (Role-Based Access Control)**. The system ensures users can only access and query documents relevant to their organization and department.

---

## 👥 User Roles & Permissions

### 1. **Developer** (Super Admin)
**Full System Access - Can Do Everything**

#### Organization & Department Management
- ✅ Create, edit, delete organizations
- ✅ Create, edit, delete departments in ANY organization
- ✅ View all organizations and departments

#### User Management
- ✅ Create users with ANY role (Developer, Admin, Manager, User)
- ✅ Assign users to ANY organization and department
- ✅ Edit and delete any user (except protected developer account)
- ✅ View all users in the system

#### File Management
- ✅ Upload files for ANY organization or department
- ✅ Upload files for ALL organizations (global files)
- ✅ Upload files for ALL departments in an organization
- ✅ View and delete any file in the system

#### Chat Access
- ✅ Query ALL files across all organizations and departments
- ✅ No filtering applied - sees everything
- ✅ Access voice input and continuous conversation mode

#### Settings & Roles
- ✅ Manage system settings (webhooks, logo, etc.)
- ✅ Create, edit, delete roles and permissions
- ✅ View and modify all permissions

---

### 2. **Admin** (Organization Administrator)
**Manages Own Organization Only**

#### Organization & Department Management
- ❌ Cannot create or manage organizations
- ✅ Create departments in OWN organization only
- ✅ Edit and delete departments in own organization
- ✅ View only own organization's departments

#### User Management
- ❌ Cannot create Developer or Admin users
- ✅ Create Manager and User roles ONLY
- ✅ Assign users to own organization only
- ✅ Select department when creating Manager/User
- ✅ Edit and delete users in own organization
- ✅ View users in own organization (Developer user hidden)

#### File Management
- ✅ Upload files for own organization
- ✅ Select specific department or all departments in org
- ❌ Cannot upload for other organizations
- ✅ View and delete files in own organization

#### Chat Access
- ✅ Query files from OWN ORGANIZATION only
- ✅ Can access files from all departments in own org
- 🔒 **Filter Applied:** `{organizationId: "xxx"}`
- ✅ Access voice input and continuous conversation mode

#### Settings & Roles
- ❌ Cannot access system settings
- ❌ Cannot manage roles or permissions

---

### 3. **Manager** (Department Manager)
**Manages Own Department Only**

#### Organization & Department Management
- ❌ Cannot create or manage organizations
- ❌ Cannot create or manage departments

#### User Management
- ❌ Cannot create Developer, Admin, or Manager users
- ✅ Create User role ONLY
- ✅ Users automatically assigned to manager's department
- ❌ Cannot select organization or department (auto-filled)
- ✅ Edit and delete users in own department
- ✅ View users in own department

#### File Management
- ✅ Upload files for OWN DEPARTMENT only
- ❌ No organization or department selection (auto-filled)
- ❌ Cannot upload for other departments
- ✅ View and delete files in own department

#### Chat Access
- ✅ Query files from OWN DEPARTMENT only
- 🔒 **Filter Applied:** `{organizationId: "xxx", departmentId: "yyy"}`
- ✅ Access voice input and continuous conversation mode

#### Settings & Roles
- ❌ Cannot access system settings
- ❌ Cannot manage roles or permissions

---

### 4. **User** (End User)
**Chat Only - No Management Access**

#### Organization & Department Management
- ❌ No access to organizations
- ❌ No access to departments

#### User Management
- ❌ Cannot create, edit, or delete users
- ❌ Cannot view users page

#### File Management
- ❌ Cannot upload files
- ❌ Cannot view files page
- ❌ Cannot delete files

#### Chat Access
- ✅ Query files from OWN DEPARTMENT only
- 🔒 **Filter Applied:** `{organizationId: "xxx", departmentId: "yyy"}`
- ✅ Access voice input and continuous conversation mode
- ✅ View own chat history only

#### Settings & Roles
- ❌ Cannot access system settings
- ❌ Cannot manage roles or permissions

---

## 💬 Chat Features

### 1. **Text Chat**
**Available to:** All roles

**How It Works:**
1. User types question in chat input
2. System sends query with user's `organizationId` and `departmentId`
3. n8n workflow filters vectors based on user's access level
4. AI Agent retrieves relevant context from filtered documents
5. Response generated using only accessible documents
6. Chat history saved with session tracking

**Features:**
- ✅ Multi-language support (English, Malay, Chinese, Tamil)
- ✅ Markdown formatting in responses
- ✅ Page number citations when available
- ✅ Session-based conversation history
- ✅ New chat creation
- ✅ Previous chat loading

---

### 2. **Voice Input (Speech-to-Text)**
**Available to:** All roles

**How It Works:**
1. Click microphone button to start recording
2. Speak your question
3. Click microphone again to stop
4. Audio sent to Groq Whisper API for transcription
5. Transcribed text appears in input box
6. User can edit before sending

**Features:**
- ✅ Real-time audio recording
- ✅ Accurate transcription via Groq Whisper
- ✅ Editable transcription before sending
- ✅ Works with any language

---

### 3. **Continuous Conversation Mode (Live Stream)**
**Available to:** All roles

**How It Works:**
1. Click radio/broadcast button to start continuous mode
2. System listens continuously for voice input
3. Auto-detects 5 seconds of silence
4. Automatically transcribes and sends question
5. AI responds with text
6. Text-to-Speech (TTS) plays response audio
7. User can interrupt TTS by speaking (auto-stops playback)
8. Loop continues until user clicks button again to stop

**Features:**
- ✅ Hands-free operation
- ✅ Auto-silence detection (5 seconds)
- ✅ Auto-send to chatbot
- ✅ TTS audio response playback
- ✅ Interrupt TTS by speaking
- ✅ Seamless conversation flow

**Use Cases:**
- Hands-free document querying
- Accessibility for users with mobility issues
- Multi-tasking while getting information
- Natural conversation experience

---

## 📁 File Upload & Management

### Upload Process

#### 1. **File Selection**
**Supported Formats:** PDF, DOCX, TXT, JSON

**Upload Flow:**
1. User selects file from device
2. Frontend validates file type and size
3. File uploaded to backend with metadata
4. Backend saves file to local storage
5. File metadata saved to MongoDB
6. Backend triggers n8n upload webhook
7. n8n processes and embeds document

---

#### 2. **Organization & Department Assignment**

**Developer Upload:**
```
┌─────────────────────────────────┐
│ Upload For Organization         │
│ ┌─────────────────────────────┐ │
│ │ [Select Organization ▼]     │ │ ← Can select any org or "All Organizations"
│ └─────────────────────────────┘ │
│                                 │
│ Upload For Department           │
│ ┌─────────────────────────────┐ │
│ │ [Select Department ▼]       │ │ ← Can select any dept or "All Departments"
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Admin Upload:**
```
┌─────────────────────────────────┐
│ Upload For Department           │
│ ┌─────────────────────────────┐ │
│ │ [Select Department ▼]       │ │ ← Can select dept in own org or "All Departments"
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
(Organization auto-filled with admin's org)
```

**Manager Upload:**
```
┌─────────────────────────────────┐
│ File will be uploaded to your   │
│ department only                 │
└─────────────────────────────────┘
(No dropdowns - org and dept auto-filled)
```

---

#### 3. **File Metadata Storage**

**MongoDB Document:**
```json
{
  "_id": "67...",
  "userId": "67...",
  "organizationId": "67...",
  "departmentId": "67...",
  "isAllOrganizations": false,
  "isAllDepartments": false,
  "uploadedBy": "John Doe",
  "uploadedByEmail": "john@company.com",
  "name": "Product_Manual.pdf",
  "url": "http://localhost:3000/uploads/1234567890-Product_Manual.pdf",
  "uploadedAt": "2026-01-27T10:30:00.000Z"
}
```

---

### Document Processing (n8n Upload Workflow)

#### Step 1: Parse Webhook Data
```javascript
const body = $input.item.json.body;
const fileId = body.fileId;
const userId = body.userId;
const organizationId = body.organizationId || null;
const departmentId = body.departmentId || null;
const fileName = body.fileName || 'unknown';
const fileUrl = body.fileUrl;
```

#### Step 2: Download File from URL
- Fetches file from local server
- Validates file exists and is readable

#### Step 3: Extract Text Content
- **PDF:** Extracts text from all pages
- **DOCX:** Extracts text from document body
- **TXT/JSON:** Reads raw text content

#### Step 4: Chunk Document
- Splits document into smaller chunks (e.g., 1000 characters)
- Maintains context overlap between chunks
- Preserves semantic meaning

#### Step 5: Generate Embeddings
- Each chunk converted to vector embedding
- Uses OpenAI embedding model
- Creates high-dimensional vector representation

#### Step 6: Store in Pinecone with Metadata
```json
{
  "id": "chunk_67..._0",
  "values": [0.123, -0.456, 0.789, ...],  // 1536-dimensional vector
  "metadata": {
    "fileId": "67...",
    "userId": "67...",
    "organizationId": "67...",
    "departmentId": "67...",
    "fileName": "Product_Manual.pdf",
    "uploadedAt": "2026-01-27T10:30:00.000Z",
    "chunkIndex": 0,
    "text": "This is the actual text content of the chunk..."
  }
}
```

**Key Point:** Every vector chunk has `organizationId` and `departmentId` metadata!

---

## 🔍 Chat Query & Vector Filtering

### Query Flow

#### Step 1: User Asks Question
```
User (Manager): "What is the warranty period for ioLogik E1210?"
```

#### Step 2: Backend Identifies User Context
```javascript
// From JWT token
const user = {
  id: "67...",
  email: "manager@company.com",
  organizationId: "67abc...",  // Company A
  departmentId: "67def...",    // IT Department
  role: "Manager"
}
```

#### Step 3: Send to n8n Chat Webhook
```json
{
  "message": "What is the warranty period for ioLogik E1210?",
  "userId": "67...",
  "organizationId": "67abc...",
  "departmentId": "67def...",
  "sessionId": "session_123",
  "fileId": null
}
```

#### Step 4: n8n Builds Vector Filter
```javascript
let vectorFilter = {};

// Organization filter (skip if Developer with null organizationId)
if (parseData.organizationId !== null) {
  vectorFilter['organizationId'] = parseData.organizationId;
}

// Department filter (skip if Admin with null departmentId)
if (parseData.departmentId !== null) {
  vectorFilter['departmentId'] = parseData.departmentId;
}

// Result for Manager:
vectorFilter = {
  organizationId: "67abc...",
  departmentId: "67def..."
}
```

#### Step 5: Pinecone Vector Search with Filter
```javascript
// Pinecone query
{
  vector: [0.123, -0.456, ...],  // Question embedding
  topK: 5,                        // Return top 5 matches
  includeMetadata: true,
  filter: {
    organizationId: "67abc...",
    departmentId: "67def..."
  }
}
```

**What Happens:**
- Pinecone searches ONLY vectors with matching `organizationId` AND `departmentId`
- Vectors from other organizations/departments are EXCLUDED
- Manager only sees documents uploaded to their department

#### Step 6: AI Agent Generates Response
```
AI Agent receives:
- User question: "What is the warranty period for ioLogik E1210?"
- Filtered context: [Only chunks from IT Department documents]
- System prompt: Instructions to cite page numbers

AI Response:
"Based on page 15 of the ioLogik E1210 manual, the warranty period is 
**5 years** from the date of purchase. This covers manufacturing defects 
and hardware failures under normal operating conditions."
```

---

## 🔒 Access Control Matrix

### File Upload Permissions

| Role      | Can Upload? | Org Selection | Dept Selection | Files Stored With |
|-----------|-------------|---------------|----------------|-------------------|
| Developer | ✅ Yes      | Any org       | Any dept       | Selected org/dept |
| Admin     | ✅ Yes      | Own org only  | Any dept in org| Own org + selected dept |
| Manager   | ✅ Yes      | Auto (own)    | Auto (own)     | Own org + own dept |
| User      | ❌ No       | N/A           | N/A            | N/A |

---

### File Query Permissions (Chat)

| Role      | Can Query? | Vector Filter Applied | Sees Files From |
|-----------|------------|-----------------------|-----------------|
| Developer | ✅ Yes     | `{}` (no filter)      | ALL organizations & departments |
| Admin     | ✅ Yes     | `{organizationId}`    | Own organization (all departments) |
| Manager   | ✅ Yes     | `{organizationId, departmentId}` | Own department only |
| User      | ✅ Yes     | `{organizationId, departmentId}` | Own department only |

---

### User Management Permissions

| Logged In As | Can Create Roles | Org Selection | Dept Selection |
|--------------|------------------|---------------|----------------|
| Developer    | All roles        | Any org       | Any dept       |
| Admin        | Manager, User    | Own org (auto)| Select dept    |
| Manager      | User only        | Own org (auto)| Own dept (auto)|
| User         | None             | N/A           | N/A            |

---

## 🛡️ Security Features

### 1. **JWT Authentication**
- All API requests require valid JWT token
- Token contains user ID, role, org, dept
- Token expires after session timeout
- Logout clears token from localStorage

### 2. **Permission-Based Middleware**
```javascript
// Backend checks permissions before allowing access
app.get('/api/files', auth, hasPermission('file:view'), async (req, res) => {
  // Only users with 'file:view' permission can access
});
```

### 3. **Role-Based UI Rendering**
```javascript
// Frontend hides menu items based on permissions
{userPermissions.includes('file:manage_access') && (
  <SidebarItem icon={FileText} label="Files" />
)}
```

### 4. **Vector-Level Access Control**
- Pinecone filters vectors at query time
- No way to bypass org/dept filtering
- Even if user guesses API endpoint, backend enforces filters

### 5. **Developer Account Protection**
- Developer user hidden from non-developers
- Cannot edit or delete developer account
- Ensures system always has super admin access

---

## 📊 Data Flow Diagrams

### File Upload Flow
```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│ User    │────▶│ Frontend│────▶│ Backend │────▶│   n8n   │────▶│ Pinecone │
│ Uploads │     │ Validates│     │ Saves   │     │ Embeds  │     │ Stores   │
│ File    │     │ File    │     │ Metadata│     │ Chunks  │     │ Vectors  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └──────────┘
                                      │
                                      ▼
                                ┌─────────┐
                                │ MongoDB │
                                │ Stores  │
                                │ File    │
                                │ Metadata│
                                └─────────┘
```

### Chat Query Flow
```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│ User    │────▶│ Frontend│────▶│ Backend │────▶│   n8n   │────▶│ Pinecone │
│ Asks    │     │ Sends   │     │ Adds    │     │ Builds  │     │ Searches │
│ Question│     │ Message │     │ Org/Dept│     │ Filter  │     │ Filtered │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └──────────┘
                                                       │               │
                                                       ▼               ▼
                                                 ┌─────────┐     ┌──────────┐
                                                 │ AI Agent│◀────│ Returns  │
                                                 │ Generates│     │ Context  │
                                                 │ Response│     │ Chunks   │
                                                 └─────────┘     └──────────┘
                                                       │
                                                       ▼
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ User    │◀────│ Frontend│◀────│ Backend │◀────│   n8n   │
│ Sees    │     │ Displays│     │ Saves   │     │ Returns │
│ Response│     │ Response│     │ History │     │ Response│
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

---

## 🎤 Voice & Continuous Conversation Technical Details

### Voice Input (STT)
**Technology:** Groq Whisper API

**Flow:**
1. Browser captures audio via MediaRecorder API
2. Audio saved as WAV/WebM blob
3. Blob sent to backend `/api/transcribe`
4. Backend forwards to Groq Whisper API
5. Whisper returns transcribed text
6. Text displayed in chat input

**Supported Languages:** 
- English, Malay, Chinese, Tamil, and 90+ languages

---

### Continuous Conversation Mode
**Technology:** MediaRecorder + Silence Detection + TTS

**Flow:**
1. **Start Listening:** User clicks radio button
2. **Audio Capture:** Browser continuously records audio
3. **Silence Detection:** JavaScript monitors audio levels
4. **Auto-Transcribe:** After 5 seconds of silence, send audio to Whisper
5. **Auto-Send:** Transcribed text automatically sent to chatbot
6. **TTS Playback:** AI response converted to speech and played
7. **Interrupt Detection:** If user speaks during TTS, stop playback
8. **Loop:** Return to step 2 until user stops mode

**Key Features:**
- Real-time audio level monitoring
- Configurable silence threshold (5 seconds)
- Automatic TTS interruption
- Seamless conversation loop

---

## 📈 System Architecture

### Technology Stack

**Frontend:**
- React + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- Sonner (toast notifications)

**Backend:**
- Node.js + Express
- MongoDB (user data, file metadata, chat history)
- JWT authentication
- Multer (file uploads)

**AI & Embeddings:**
- n8n (workflow automation)
- OpenAI (embeddings + chat)
- Pinecone (vector database)
- Groq Whisper (speech-to-text)

**Deployment:**
- Docker + Docker Compose
- Local file storage
- Environment-based configuration

---

## 🔧 Configuration

### Environment Variables
```env
MONGODB_URI=mongodb://...
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...
GROQ_API_KEY=...
```

### Webhook Configuration
- **Chat Webhook:** `http://n8n:5678/webhook/chat`
- **Upload Webhook:** `http://n8n:5678/webhook/upload`

---

## 📝 Summary

### Key Strengths
1. **Multi-Tenant Security:** Org/dept-level isolation at vector level
2. **Role-Based Access:** Granular permissions for each role
3. **Intelligent Filtering:** Pinecone metadata filtering ensures data privacy
4. **Voice Capabilities:** STT + continuous conversation mode
5. **Scalable Architecture:** n8n workflows + vector database

### Use Cases
- **Enterprise Knowledge Base:** Each department has isolated document access
- **Customer Support:** Different teams access different product manuals
- **Educational Institutions:** Departments access their own course materials
- **Healthcare:** Patient data isolated by department/clinic
- **Legal Firms:** Case files accessible only to assigned teams

---

## 🎯 Best Practices

### For Administrators
1. Create organizations first, then departments
2. Assign users to correct org/dept during creation
3. Upload files to appropriate org/dept for proper access control
4. Regularly review user permissions

### For Users
1. Always verify you're querying the right documents
2. Use voice input for hands-free operation
3. Check page number citations for accuracy
4. Create new chat sessions for different topics

### For Developers
1. Never bypass permission checks
2. Always include org/dept in vector metadata
3. Test filtering with different roles
4. Monitor Pinecone query performance

---

**End of Documentation**

*Generated for Genie RAG Chatbot System*  
*Version: 1.0*  
*Date: January 27, 2026*
