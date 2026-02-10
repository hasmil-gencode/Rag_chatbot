# Manual: Add Knowledge Directly to MongoDB Vector Store

## Overview
Instead of uploading files, you can directly insert knowledge into `embedding_files` collection.

## Method 1: Using Node.js Script (EASIEST)

### Run the script:
```bash
node add-knowledge.js
```

### To add your own knowledge:
Edit `add-knowledge.js` and change the text:

```javascript
const myKnowledge = `
Q: Your question here?
A: Your answer with [link](/form/booking-service)

Q: Another question?
A: Another answer
`;

addKnowledge(myKnowledge, "My Custom Knowledge");
```

## Method 2: Using MongoDB Compass (MANUAL)

### Step 1: Generate Embedding First

You need to convert text to embedding (768 numbers). Use this online tool or API:

**Using Gemini API:**
```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": {
      "parts": [{
        "text": "Your knowledge text here"
      }]
    }
  }'
```

Response will give you array of numbers (embedding).

### Step 2: Insert into MongoDB

Open MongoDB Compass → Connect to:
```
mongodb+srv://hasmil:Popoi890@cluster0.ivrn2lj.mongodb.net/ragchatbot
```

Go to collection: `embedding_files`

Click "Insert Document" and paste:

```json
{
  "text": "Q: How to book service?\nA: Click [here](/form/booking-service)",
  "embedding": [0.123, 0.456, 0.789, ...], // 768 numbers from Step 1
  "fileName": "Service Booking Knowledge",
  "fileId": null,
  "organizationId": null,
  "departmentId": null,
  "uploadedAt": {"$date": "2026-02-10T12:00:00.000Z"}
}
```

## Method 3: Using n8n Workflow (AUTOMATED)

Create workflow:

1. **Manual Trigger** or **Webhook**
2. **Function Node** - Prepare text
3. **HTTP Request** - Generate embedding via Gemini API
4. **MongoDB Node** - Insert into `embedding_files`

### Function Node:
```javascript
return {
  json: {
    text: `
Q: How to book service?
A: Click [here](/form/booking-service)
    `.trim()
  }
};
```

### HTTP Request Node:
- Method: POST
- URL: `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={{ $env.GEMINI_API_KEY }}`
- Body:
```json
{
  "content": {
    "parts": [{
      "text": "={{ $json.text }}"
    }]
  }
}
```

### MongoDB Node:
- Operation: Insert
- Collection: `embedding_files`
- Fields:
```javascript
{
  text: "={{ $('Function').item.json.text }}",
  embedding: "={{ $json.embedding.values }}",
  fileName: "Service Booking Knowledge",
  fileId: null,
  organizationId: null,
  departmentId: null,
  uploadedAt: "={{ $now }}"
}
```

## Document Structure

```javascript
{
  text: "Your Q&A content with [links](/form/booking-service)",
  embedding: [0.123, 0.456, ...], // 768 numbers
  fileName: "Display name",
  fileId: null,              // null for direct knowledge
  organizationId: null,      // null = available to all
  departmentId: null,        // null = available to all
  uploadedAt: ISODate("2026-02-10T12:00:00Z")
}
```

## Tips for Writing Knowledge

### Good Format:
```
Q: I want to book a service
A: Sure! Please [click here](/form/booking-service) to book your appointment.

Q: How do I service my motor?
A: You can book a service by [clicking here](/form/booking-service).

Q: What services do you offer?
A: We offer Regular Service, Repair, and Inspection. To book, [click here](/form/booking-service).
```

### Include Variations:
```
Q: book service
Q: booking motor service
Q: I want to service my bike
Q: schedule maintenance
```

All should point to: `[click here](/form/booking-service)`

## Testing

After adding knowledge:

1. Start new chat
2. Ask: "I want to book a service"
3. Bot should respond with the link
4. Click link → Form appears

## Updating Knowledge

### To update existing knowledge:

**Option A: Delete and re-add**
```javascript
// Delete old
await db.collection('embedding_files').deleteOne({ 
  fileName: "Service Booking Knowledge" 
});

// Add new
// Run add-knowledge.js again
```

**Option B: Add new version**
Just run script again with updated text. Both versions will exist (more coverage).

## Quick Start

**Fastest way:**
```bash
# 1. Edit the text in add-knowledge.js
# 2. Run it
node add-knowledge.js

# Done! Test in chat immediately.
```

## Form Submission - No Storage Needed

Since you said form submission tak payah store, the current code already just forwards to n8n → friend's API.

No changes needed for form submission flow.

## Summary

✅ **Add knowledge:** Use `add-knowledge.js` script  
✅ **Form submission:** Already forwards to friend's API (no storage)  
✅ **Future:** Friend will add API to check available dates  

**Nak try sekarang?** Run:
```bash
node add-knowledge.js
```
