# Quick Setup Guide - Form Web View

## What's Been Created

✅ **Backend:**
- `/api/form/:formType` - Load form config
- `/api/form-submission` - Submit form to n8n
- `formSubmissionWebhook` setting added

✅ **Frontend:**
- `FormOverlay.tsx` - Dynamic form renderer
- Link detection in `ChatMessage.tsx`
- Form state management in `ChatArea.tsx`

✅ **Form Config:**
- `form-web-view/booking-service.json` - Motor service booking form

✅ **Documentation:**
- `FORM_WEB_VIEW_FEATURE.md` - Complete feature guide
- `knowledge-base-example-booking.md` - Sample knowledge base

## Setup Steps

### 1. Configure n8n Webhook

Create a new workflow in n8n:

**Webhook Node:**
- Name: `form-submission-handler`
- Path: `form-submission-handler`
- Method: POST

**Switch Node:**
- Mode: Expression
- Value: `{{ $json.formType }}`

**Case 1: booking-service**

Add Function Node:
```javascript
// Add fixed fields for booking API
const formData = $input.item.json.data;

return {
  json: {
    ...formData,
    category: "2",
    agent_id: "1",
    transfer_company_id: "378",
    platform_source: "CHATBOT",
    platform_company: "1",
    company_id: "1"
  }
};
```

Add HTTP Request Node:
- Method: POST
- URL: `{{base-url}}company/services/book` (your friend's API)
- Headers:
  - `app-key`: `Bqolc5jcVySyqnNZnXb0zlM0mN5epfaYFupThOOIq4`
  - `app-token`: `111`
  - `Content-Type`: `application/json`

### 2. Update Settings in Admin Panel

1. Login as admin
2. Go to Settings
3. Add webhook URL:
   - **Form Submission Webhook:** `http://n8n:5678/webhook/form-submission-handler`
   - (Use `http://localhost:5678` if not using Docker)
4. Save

### 3. Upload Knowledge Base

1. Go to Files page
2. Upload `knowledge-base-example-booking.md`
3. Or create your own with form links: `[click here](/form/booking-service)`

### 4. Test

1. Start a new chat
2. Ask: "I want to service my motor"
3. Bot should respond with link
4. Click link → Form overlay appears
5. Fill form → Submit
6. Check n8n execution log
7. Verify data reached friend's API

## Adding More Forms

### Example: Contact Form

**1. Create JSON:**
```bash
# form-web-view/contact-us.json
{
  "title": "Contact Us",
  "formType": "contact-us",
  "fields": [
    {"name": "name", "label": "Name", "type": "text", "required": true},
    {"name": "email", "label": "Email", "type": "email", "required": true},
    {"name": "message", "label": "Message", "type": "textarea", "required": true}
  ]
}
```

**2. Update Knowledge Base:**
```markdown
To contact us, [click here](/form/contact-us).
```

**3. Add n8n Case:**
```
Case: "contact-us"
  ↓
  Send Email Node
  or
  HTTP Request to your contact API
```

## Webhook URL Format

**Development:** `http://localhost:5678/webhook/form-submission-handler`  
**Docker:** `http://n8n:5678/webhook/form-submission-handler`  
**Production:** `https://your-n8n-domain.com/webhook/form-submission-handler`

## Troubleshooting

**"Form not found" error:**
- Check JSON file exists in `form-web-view/`
- Filename must match: `/form/booking-service` → `booking-service.json`

**Submission fails:**
- Check n8n webhook URL in Settings
- Verify n8n workflow is active
- Check browser console for errors

**Link not clickable:**
- Must be exact format: `/form/{formType}`
- Check markdown rendering in bot response

## Next Steps

1. ✅ Setup n8n webhook (5 minutes)
2. ✅ Configure webhook URL in Settings (1 minute)
3. ✅ Upload knowledge base (1 minute)
4. ✅ Test the flow (2 minutes)
5. 🎉 Add more forms as needed!

---

**Need help?** Check `FORM_WEB_VIEW_FEATURE.md` for detailed documentation.
