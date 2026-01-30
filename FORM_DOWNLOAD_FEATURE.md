# Form Download Feature - Implementation Plan

## Overview
Add downloadable forms feature to chat responses. When bot mentions a file name, show download button with matching files from database.

## Architecture Decision: Option 1 - Single Collection with Type Flag

### Why Single Collection?
- Simpler architecture
- Reuse existing upload/delete logic
- Single S3 bucket, single permission system
- Easier maintenance
- Flexible for future types (template, policy, etc.)

---

## Requirements

### 1. Vectorization
- **Forms**: NO vectorization needed
- **Documents**: YES vectorization (existing behavior)

### 2. Access Control
- **Upload**: Developer, Admin, Manager only
- **Download**: Everyone (all users in any org)
- **View in Forms page**: Everyone

### 3. File Matching
- **Fuzzy match** using similarity algorithm
- **Multiple matches**: Show list for user to select
- Example:
  - Bot says: "Team building request"
  - DB has: "Team Building Request v1.pdf", "Team Building Request v2.pdf"
  - Show both in dropdown/list for user selection

### 4. Download Tracking
- Track who downloaded what file
- New menu: "Download Tracking" (Developer only)
- Store: userId, fileId, fileName, downloadedAt, userEmail

### 5. UI Placement
- Download button/icon below bot message bubble
- Position: Right side (like play/stop button)
- Show only when matches found

---

## Database Schema

### 1. Update `files` Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  organizationId: ObjectId,
  departmentId: ObjectId,
  name: "Team Building Request v1.pdf",
  type: "document" | "form",  // NEW FIELD
  url: "s3://...",
  uploadedBy: "admin",
  uploadedByEmail: "admin@gencode.com.my",
  uploadedAt: Date,
  isVectorized: Boolean,  // true for documents, false for forms
  isDownloadable: Boolean, // true for forms, false for documents
  isAllOrganizations: Boolean,
  isAllDepartments: Boolean
}
```

### 2. New Collection: `download_tracking`
```javascript
{
  _id: ObjectId,
  fileId: ObjectId,
  fileName: String,
  userId: ObjectId,
  userEmail: String,
  organizationId: ObjectId,
  downloadedAt: Date,
  ipAddress: String (optional)
}
```

---

## Implementation Phases

### Phase 1: Backend - Database & API

#### 1.1 Migrate Existing Files
```javascript
// Add type field to existing files
db.files.updateMany(
  { type: { $exists: false } },
  { 
    $set: { 
      type: "document", 
      isDownloadable: false,
      isVectorized: true 
    } 
  }
);
```

#### 1.2 Update Upload Endpoint
**File**: `server.js`

```javascript
app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
  // ... existing code ...
  
  const fileType = req.body.type || 'document'; // 'document' or 'form'
  const isDownloadable = fileType === 'form';
  const isVectorized = fileType === 'document';
  
  const file = {
    userId: req.user.id,
    organizationId: fileOrganizationId,
    departmentId: fileDepartmentId,
    type: fileType,
    isDownloadable,
    isVectorized,
    name: req.file.originalname,
    url: fileUrl,
    uploadedBy: uploaderName,
    uploadedByEmail: uploaderEmail,
    uploadedAt: new Date(),
    isAllOrganizations,
    isAllDepartments
  };
  
  const result = await db.collection('files').insertOne(file);
  
  // Only send to n8n if type is 'document'
  if (fileType === 'document') {
    // ... existing n8n webhook call ...
  } else {
    // For forms, just return success
    res.json({ 
      success: true, 
      fileId: result.insertedId,
      message: 'Form uploaded successfully'
    });
  }
});
```

#### 1.3 Fuzzy Match Endpoint
**File**: `server.js`

```javascript
// Fuzzy match helper function
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Simple substring match + Levenshtein distance
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
    const { fileNames } = req.body; // Array of file names from bot response
    
    // Get all downloadable forms
    const allForms = await db.collection('files').find({
      type: 'form',
      isDownloadable: true
    }).toArray();
    
    // Fuzzy match each filename
    const matches = [];
    for (const searchName of fileNames) {
      const scored = allForms.map(form => ({
        ...form,
        similarity: calculateSimilarity(searchName, form.name)
      }))
      .filter(f => f.similarity > 0.5) // Threshold 50%
      .sort((a, b) => b.similarity - a.similarity);
      
      if (scored.length > 0) {
        matches.push({
          searchTerm: searchName,
          files: scored.map(f => ({
            id: f._id,
            name: f.name,
            uploadedBy: f.uploadedBy,
            uploadedAt: f.uploadedAt,
            similarity: f.similarity
          }))
        });
      }
    }
    
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### 1.4 Download Endpoint with Tracking
**File**: `server.js`

```javascript
app.get('/api/files/:id/download', auth, async (req, res) => {
  try {
    const file = await db.collection('files').findOne({ 
      _id: new ObjectId(req.params.id),
      type: 'form',
      isDownloadable: true
    });
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
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
    
    // Generate S3 signed URL or redirect
    if (file.url.startsWith('https://')) {
      // S3 URL - generate signed URL for security
      const s3Client = await getS3Client();
      if (s3Client) {
        const urlParts = file.url.replace('https://', '').split('/');
        const bucket = urlParts[0].split('.')[0];
        const key = urlParts.slice(1).join('/');
        
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key
        });
        
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return res.json({ downloadUrl: signedUrl, fileName: file.name });
      }
    }
    
    // Fallback: direct URL
    res.json({ downloadUrl: file.url, fileName: file.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### 1.5 Download Tracking Endpoint (Developer Only)
**File**: `server.js`

```javascript
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
    res.status(500).json({ error: error.message });
  }
});

// Get download stats
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
    res.status(500).json({ error: error.message });
  }
});
```

#### 1.6 List Forms Endpoint
**File**: `server.js`

```javascript
app.get('/api/forms', auth, async (req, res) => {
  try {
    // Everyone can see forms
    const forms = await db.collection('files')
      .find({ 
        type: 'form',
        isDownloadable: true 
      })
      .sort({ uploadedAt: -1 })
      .toArray();
    
    const formsWithInfo = forms.map(f => ({
      id: f._id,
      name: f.name,
      uploadedAt: f.uploadedAt,
      uploadedBy: f.uploadedBy,
      organizationName: f.isAllOrganizations ? 'All Organizations' : null
    }));
    
    res.json(formsWithInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

### Phase 2: Frontend - UI Components

#### 2.1 Create FormsPage Component
**File**: `frontend/src/components/chat/FormsPage.tsx`

Copy from `FilesPage.tsx` and modify:
- Change title to "Forms"
- Filter by `type: 'form'`
- Remove vectorization status
- Add download count (optional)
- Upload form: Add type selector (hidden, default to 'form')

#### 2.2 Create DownloadTrackingPage Component
**File**: `frontend/src/components/chat/DownloadTrackingPage.tsx`

Features:
- List all downloads with filters (date range, file name, user)
- Show stats: most downloaded files, unique users
- Export to CSV option
- Search functionality

#### 2.3 Update ChatMessage Component
**File**: `frontend/src/components/chat/ChatMessage.tsx`

Add download button logic:
```typescript
// Parse bot message for file names
const fileNames = parseFileNamesFromMessage(message.content);

// Check if files exist
const [downloadableFiles, setDownloadableFiles] = useState([]);

useEffect(() => {
  if (fileNames.length > 0 && message.role === 'bot') {
    checkDownloadableFiles(fileNames);
  }
}, [message]);

// Show download button if matches found
{downloadableFiles.length > 0 && (
  <div className="flex gap-2 mt-2 justify-end">
    <DownloadButton files={downloadableFiles} />
  </div>
)}
```

#### 2.4 Create DownloadButton Component
**File**: `frontend/src/components/chat/DownloadButton.tsx`

Features:
- Icon button (Download icon)
- If single match: Direct download
- If multiple matches: Show dropdown/modal to select
- Show file name, uploaded by, upload date
- Loading state during download
- Success toast after download

#### 2.5 Update Sidebar Navigation
**File**: `frontend/src/components/chat/ChatSidebar.tsx`

Add menu items:
- "Forms" (all users)
- "Download Tracking" (developer only)

---

### Phase 3: Helper Functions

#### 3.1 File Name Parser
**File**: `frontend/src/lib/fileParser.ts`

```typescript
export function parseFileNamesFromMessage(message: string): string[] {
  // Match patterns:
  // 1. *filename.pdf* or **filename.pdf**
  // 2. "filename.pdf"
  // 3. filename.pdf (with common extensions)
  
  const patterns = [
    /\*{1,2}([^*]+\.(pdf|docx|xlsx|txt|doc|xls|ppt|pptx))\*{1,2}/gi,
    /"([^"]+\.(pdf|docx|xlsx|txt|doc|xls|ppt|pptx))"/gi,
    /\b([A-Z][a-zA-Z0-9\s\-_]+\.(pdf|docx|xlsx|txt|doc|xls|ppt|pptx))\b/g
  ];
  
  const matches = new Set<string>();
  
  for (const pattern of patterns) {
    const found = [...message.matchAll(pattern)];
    found.forEach(m => matches.add(m[1]));
  }
  
  return Array.from(matches);
}
```

#### 3.2 Download Helper
**File**: `frontend/src/lib/downloadHelper.ts`

```typescript
export async function downloadFile(fileId: string) {
  const response = await fetch(`/api/files/${fileId}/download`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });
  
  if (!response.ok) throw new Error('Download failed');
  
  const { downloadUrl, fileName } = await response.json();
  
  // Trigger download
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

---

## Testing Checklist

### Backend
- [ ] Upload form (type: 'form')
- [ ] Upload document (type: 'document')
- [ ] Fuzzy match with exact name
- [ ] Fuzzy match with partial name
- [ ] Fuzzy match with multiple results
- [ ] Download tracking recorded
- [ ] Download tracking stats accurate
- [ ] Access control: everyone can download forms
- [ ] Access control: only dev/admin/manager can upload forms

### Frontend
- [ ] Forms page shows only forms
- [ ] Files page shows only documents
- [ ] Upload form with type selector
- [ ] Download button appears in chat
- [ ] Download button shows multiple matches
- [ ] Download triggers correctly
- [ ] Download tracking page (developer only)
- [ ] Search and filter in download tracking

### Integration
- [ ] Bot mentions file → download button appears
- [ ] Multiple matches → user can select
- [ ] Download tracked in database
- [ ] Forms accessible across organizations
- [ ] No vectorization for forms

---

## Migration Steps

1. **Backup database**
2. **Run migration script** to add type field
3. **Deploy backend** with new endpoints
4. **Build and deploy frontend**
5. **Test with sample forms**
6. **Monitor download tracking**

---

## Future Enhancements

1. **File versioning**: Track v1, v2, v3 of same form
2. **Expiry dates**: Forms can have expiration
3. **Categories**: HR forms, Finance forms, etc.
4. **Approval workflow**: Forms need approval before available
5. **Analytics**: Most downloaded forms, peak download times
6. **Notifications**: Alert when new form uploaded

---

## Security Considerations

1. **S3 Signed URLs**: Use signed URLs with expiration (1 hour)
2. **Rate limiting**: Prevent download abuse
3. **Virus scanning**: Scan uploaded forms
4. **Access logs**: Keep audit trail
5. **File size limits**: Max 10MB per form

---

## Performance Optimization

1. **Cache fuzzy match results**: 5 minutes TTL
2. **Index on type field**: `db.files.createIndex({ type: 1 })`
3. **Index on download tracking**: `db.download_tracking.createIndex({ downloadedAt: -1 })`
4. **Lazy load forms list**: Pagination
5. **CDN for frequently downloaded forms**: CloudFront

---

## Notes

- Forms are **NOT vectorized** (no n8n processing)
- Forms are **accessible to everyone** (no org restriction on download)
- Upload restricted to **developer, admin, manager**
- Fuzzy match threshold: **50% similarity**
- Download tracking: **Developer only access**
- S3 signed URL expiry: **1 hour**
