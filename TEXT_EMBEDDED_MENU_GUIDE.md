# Text Embedded Menu - User Guide

## Overview
New menu for **Developers only** to add knowledge directly to the vector store without uploading files.

## Access
- **Who:** Developer role only
- **Location:** Sidebar menu → "Text Embedded"

## Features

### 1. Add Knowledge
- **Display Name:** Name for the knowledge entry (e.g., "Service Booking Knowledge")
- **Knowledge Text:** Your Q&A content with markdown links
- **Embed Button:** Generates embedding and stores in MongoDB

### 2. View Existing Embeddings
- List of all text embeddings
- Shows: Name, preview text, date added
- Delete button for each entry

### 3. Auto-Embedding
- Automatically generates 768-dimensional vector
- Uses Gemini text-embedding-004 model
- Stores in `embedding_files` collection

## How to Use

### Step 1: Login as Developer
Only developer role can access this menu.

### Step 2: Navigate to Text Embedded
Click "Text Embedded" in sidebar.

### Step 3: Write Your Knowledge
Example:
```
Q: How do I book a motor service?
A: To book a motor service, please [click here](/form/booking-service).

Q: What services are available?
A: We offer:
- 1st Free Service
- Regular Service
- Repair
- Inspection

Q: What are your service hours?
A: Monday-Friday: 9AM-6PM, Saturday: 9AM-2PM, Sunday: Closed
```

### Step 4: Add Display Name
e.g., "Service Booking Knowledge"

### Step 5: Click "Embed Text"
- System generates embedding
- Stores in MongoDB
- Available immediately for chat

### Step 6: Test
- Start new chat
- Ask: "I want to book service"
- Bot should respond with your knowledge

## Tips

### Use Markdown Links
```markdown
[click here](/form/booking-service)
[Book now](/form/booking-service)
[Fill form](/form/booking-service)
```

### Include Variations
```
Q: book service
Q: booking motor service
Q: I want to service my bike
Q: schedule maintenance
Q: service appointment
```

### Keep It Clear
- One topic per entry
- Clear Q&A format
- Include all common phrasings

## MongoDB Structure

**Collection:** `embedding_files`

**Document:**
```javascript
{
  _id: ObjectId,
  text: "Your Q&A content",
  embedding: [0.123, 0.456, ...], // 768 numbers
  fileName: "Service Booking Knowledge",
  fileId: null,           // null = direct text
  organizationId: null,   // null = all orgs
  departmentId: null,     // null = all depts
  uploadedAt: ISODate
}
```

## Difference from Files Menu

| Feature | Files Menu | Text Embedded Menu |
|---------|-----------|-------------------|
| Access | All users (with permission) | Developer only |
| Input | Upload file | Type text |
| Processing | n8n workflow | Direct embedding |
| Use case | Documents, PDFs | Quick knowledge, Q&A |
| Organization filter | Yes | No (available to all) |
| Department filter | Yes | No (available to all) |

## API Endpoints

### GET `/api/text-embeddings`
List all text embeddings (developer only)

### POST `/api/text-embeddings`
Add new text embedding (developer only)

**Body:**
```json
{
  "text": "Your knowledge text",
  "fileName": "Display name"
}
```

### DELETE `/api/text-embeddings/:id`
Delete text embedding (developer only)

## Security

- ✅ Developer role required
- ✅ Authentication required
- ✅ Only deletes text embeddings (fileId: null)
- ✅ Cannot delete file-based embeddings

## Troubleshooting

**"Gemini API key not configured"**
- Go to Settings
- Add Gemini API key
- Try again

**"Developer access only"**
- Only developer role can access
- Contact admin to change your role

**Embedding not working in chat**
- Check if text was saved (refresh page)
- Try asking with different phrasing
- Check MongoDB `embedding_files` collection

## Example Use Cases

### 1. Service Booking
```
Q: I want to book a service
A: Please [click here](/form/booking-service) to book.
```

### 2. Contact Information
```
Q: What's your phone number?
A: You can reach us at 03-1234-5678.
```

### 3. Operating Hours
```
Q: When are you open?
A: Monday-Friday: 9AM-6PM, Saturday: 9AM-2PM, Sunday: Closed
```

### 4. Multiple Forms
```
Q: How do I contact you?
A: Please [fill this form](/form/contact-us).

Q: I want to book service
A: Please [click here](/form/booking-service).
```

## Best Practices

1. **Test immediately** after adding
2. **Use clear language** that users would actually say
3. **Include variations** of the same question
4. **Keep entries focused** on one topic
5. **Update regularly** as services change

## Summary

✅ **Quick knowledge addition** without file upload  
✅ **Developer only** for controlled content  
✅ **Instant availability** in chat  
✅ **Easy management** with list and delete  
✅ **Markdown support** for form links  

Perfect for kiosk scenarios where you need to quickly add or update knowledge!
