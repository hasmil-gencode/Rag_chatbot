# How to Store Form Submission Data in MongoDB Vector Store

## Current Vector Store Structure

**Collection:** `embedding_files`

**Document structure:**
```javascript
{
  _id: ObjectId,
  text: "chunk of text content",
  embedding: [0.123, 0.456, ...], // 768-dimensional vector
  fileName: "document.pdf",
  fileId: "file_id_from_files_collection",
  organizationId: "org_id",
  departmentId: "dept_id" or null,
  uploadedAt: ISODate
}
```

## Option 1: Store Form Submissions as Searchable Knowledge (RECOMMENDED)

When user submits booking form, create text chunks and embed them so bot can answer questions like:
- "What bookings do we have?"
- "Show me recent service appointments"
- "Any bookings for NVX model?"

### Implementation

**Update server.js form submission endpoint:**

```javascript
app.post('/api/form-submission', auth, async (req, res) => {
  try {
    const { formType, data } = req.body;
    
    // 1. Store raw submission in new collection
    const submission = {
      formType,
      data,
      submittedBy: req.user.email,
      submittedByUserId: req.user.id,
      organizationId: req.user.organizationId,
      departmentId: req.user.departmentId || null,
      submittedAt: new Date(),
      status: 'pending'
    };
    
    const result = await db.collection('form_submissions').insertOne(submission);
    
    // 2. Create searchable text for embedding
    let searchableText = '';
    if (formType === 'booking-service') {
      searchableText = `
Service Booking Submission
Submitted by: ${req.user.email}
Date: ${new Date().toLocaleString()}
Motor Model: ${data.model}
Plate Number: ${data.plate}
Mileage: ${data.mileage} km
Service Type: ${data.service_types?.join(', ')}
Customer Name: ${data.customer?.name}
Customer IC: ${data.customer?.ic_passport}
Customer Phone: ${data.customer?.phone}
Appointment: ${data.start_time}
Expected Finish: ${data.finish_time}
Comments: ${data.comments || 'None'}
Status: Pending confirmation
      `.trim();
    }
    
    // 3. Send to n8n for embedding + external API
    const settings = await db.collection('settings').findOne({ _id: 'config' });
    const n8nWebhook = settings?.formSubmissionWebhook || 'http://localhost:5678/webhook/form-submission-handler';
    
    const response = await axios.post(n8nWebhook, {
      submissionId: result.insertedId.toString(),
      formType,
      data,
      searchableText,
      submittedBy: req.user.email,
      organizationId: req.user.organizationId,
      departmentId: req.user.departmentId || null,
      submittedAt: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Thank you, your submission has been received and is being processed.',
      submissionId: result.insertedId
    });
  } catch (error) {
    console.error('Form submission error:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});
```

### n8n Workflow Update

**Webhook Node** receives:
```json
{
  "submissionId": "...",
  "formType": "booking-service",
  "data": { ... },
  "searchableText": "Service Booking Submission...",
  "submittedBy": "user@example.com",
  "organizationId": "org_id",
  "departmentId": "dept_id",
  "submittedAt": "2026-02-10T12:30:00.000Z"
}
```

**Add nodes after Switch:**

1. **Function Node: Generate Embedding**
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

const input = $input.item.json;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

const result = await model.embedContent(input.searchableText);

return {
  json: {
    ...input,
    embedding: result.embedding.values
  }
};
```

2. **MongoDB Node: Insert Embedding**
- Operation: Insert Documents
- Collection: `embedding_files`
- Fields:
```javascript
{
  text: "={{ $json.searchableText }}",
  embedding: "={{ $json.embedding }}",
  fileName: "Form Submission - {{ $json.formType }}",
  fileId: "={{ $json.submissionId }}",
  organizationId: "={{ $json.organizationId }}",
  departmentId: "={{ $json.departmentId }}",
  formType: "={{ $json.formType }}",
  submittedBy: "={{ $json.submittedBy }}",
  uploadedAt: "={{ $now }}"
}
```

3. **HTTP Request: Send to Friend's API**
(Your existing logic with fixed fields)

4. **MongoDB Node: Update Submission Status**
- Operation: Update
- Collection: `form_submissions`
- Filter: `{ _id: ObjectId("={{ $json.submissionId }}") }`
- Update: `{ $set: { status: "sent", sentAt: new Date() } }`

## Option 2: Store Only Raw Submissions (Simple)

If you don't need bot to search submissions, just store raw data:

```javascript
app.post('/api/form-submission', auth, async (req, res) => {
  try {
    const { formType, data } = req.body;
    
    // Store in dedicated collection
    await db.collection('form_submissions').insertOne({
      formType,
      data,
      submittedBy: req.user.email,
      submittedByUserId: req.user.id,
      organizationId: req.user.organizationId,
      departmentId: req.user.departmentId || null,
      submittedAt: new Date(),
      status: 'pending'
    });
    
    // Send to n8n (no embedding)
    const settings = await db.collection('settings').findOne({ _id: 'config' });
    const n8nWebhook = settings?.formSubmissionWebhook || 'http://localhost:5678/webhook/form-submission-handler';
    
    await axios.post(n8nWebhook, {
      formType,
      data,
      submittedBy: req.user.email,
      submittedAt: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Submission received' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit' });
  }
});
```

## Comparison

| Feature | Option 1 (Embedded) | Option 2 (Raw Only) |
|---------|-------------------|-------------------|
| Bot can search submissions | ✅ Yes | ❌ No |
| Storage size | Larger (vectors) | Smaller |
| Setup complexity | Medium | Simple |
| Query examples | "Show bookings for NVX" | Manual DB queries only |
| Best for | Customer service bot | Simple form collection |

## Recommended: Option 1

**Why?**
- Users can ask: "Do I have any pending bookings?"
- Bot can answer: "Yes, you have a booking for NVX VBA9824 on Feb 15"
- Searchable by model, plate, customer name, date
- Consistent with existing RAG architecture

## MongoDB Collections After Implementation

```
ragchatbot/
├── users                    # User accounts
├── sessions                 # Chat sessions
├── messages                 # Chat messages
├── files                    # File metadata
├── embedding_files          # Vector embeddings (documents + form submissions)
├── form_submissions         # Raw form data (audit trail)
├── settings                 # System settings
└── ...
```

## Testing

After setup, test with:

**User:** "I want to book a service"  
**Bot:** [Shows link]  
**User:** [Fills form and submits]  
**System:** Stores in both `form_submissions` and `embedding_files`

Later:

**User:** "Show my recent bookings"  
**Bot:** "You have a booking for NVX VBA9824 on February 15, 2026 at 11:30 AM"

## Next Steps

1. Choose Option 1 or 2
2. I'll update the code accordingly
3. Update n8n workflow
4. Test submission flow

**Which option you prefer?** Option 1 (searchable) or Option 2 (simple)?
