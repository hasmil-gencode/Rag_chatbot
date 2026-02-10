# Form Web View Feature

## Overview
This feature allows the chatbot to display interactive forms in an overlay when users click on special form links in bot responses. Forms are submitted to n8n for processing and forwarding to external APIs.

## Architecture

### 1. Form Configuration (JSON-based)
Forms are defined as JSON files in the `form-web-view/` folder:

```json
{
  "title": "Motor Service Booking",
  "formType": "booking-service",
  "fields": [
    {
      "name": "start_time",
      "label": "Appointment Date & Time",
      "type": "datetime-local",
      "required": true
    },
    {
      "name": "customer.name",
      "label": "Full Name",
      "type": "text",
      "required": true
    }
  ]
}
```

**Supported field types:**
- `text`, `tel`, `number`, `datetime-local`
- `textarea`
- `select` (with `options` array)

**Nested fields:** Use dot notation (e.g., `customer.name`) for nested objects.

### 2. Knowledge Base Integration
In your knowledge base file, include form links using this format:

```markdown
To book a motor service, please [click here](/form/booking-service).
```

**Link pattern:** `/form/{formType}` where `{formType}` matches the JSON filename (without `.json`).

### 3. Flow

1. **User asks:** "I want to service my motor"
2. **Bot responds:** With text including `/form/booking-service` link
3. **User clicks link:** Form overlay appears on top of chat
4. **User fills & submits:** Data sent to Express backend
5. **Backend forwards to n8n:** Via webhook `form-submission-handler`
6. **n8n processes:** Routes to appropriate workflow based on `formType`
7. **n8n forwards to external API:** (e.g., friend's booking system)
8. **Success message:** "Thank you, your submission has been received"

## Setup

### 1. Configure n8n Webhook

**Webhook name:** `form-submission-handler`  
**URL:** `http://localhost:5678/webhook/form-submission-handler`

**Payload structure:**
```json
{
  "formType": "booking-service",
  "data": {
    "start_time": "2026-02-03 11:30:00",
    "finish_time": "2026-02-03 23:59:59",
    "model": "NVX",
    "plate": "VBA9824",
    "mileage": "7521",
    "service_types": ["1st Free Service"],
    "customer": {
      "ic_passport": "790612071922",
      "name": "JANNAH BINTI DERAMAN",
      "phone": "0103748233"
    },
    "comments": "TEST"
  },
  "submittedBy": "user@example.com",
  "submittedAt": "2026-02-10T12:30:00.000Z"
}
```

### 2. n8n Workflow Structure

```
Webhook (form-submission-handler)
  ↓
Switch Node (based on {{ $json.formType }})
  ↓
├─ Case: "booking-service"
│    ↓
│    Function Node (Add fixed fields)
│    {
│      category: "2",
│      agent_id: "1",
│      transfer_company_id: "378",
│      platform_source: "CHATBOT",
│      platform_company: "1",
│      company_id: "1"
│    }
│    ↓
│    HTTP Request (POST to friend's API)
│    Headers:
│      - app-key: Bqolc5jcVySyqnNZnXb0zlM0mN5epfaYFupThOOIq4
│      - app-token: 111
│
├─ Case: "another-form"
│    ↓
│    [Your processing logic]
│
└─ Default
     ↓
     Return error
```

### 3. Update Settings

In the admin Settings page, add the webhook URL:

**Form Submission Webhook:** `http://n8n:5678/webhook/form-submission-handler`

(Use `http://n8n:5678` if running in Docker, or `http://localhost:5678` for local development)

## Adding New Forms

### Step 1: Create Form JSON
Create a new file in `form-web-view/`:

```bash
form-web-view/
├── booking-service.json
└── new-form.json  # Your new form
```

### Step 2: Update Knowledge Base
Add the form link to your knowledge base document:

```markdown
For new service, [click here](/form/new-form).
```

### Step 3: Update n8n Workflow
Add a new case in the Switch node for your `formType`:

```
Case: "new-form"
  ↓
  [Your processing logic]
  ↓
  HTTP Request to target API
```

## API Endpoints

### GET `/api/form/:formType`
Load form configuration.

**Auth:** Required  
**Response:**
```json
{
  "title": "Motor Service Booking",
  "formType": "booking-service",
  "fields": [...]
}
```

### POST `/api/form-submission`
Submit form data.

**Auth:** Required  
**Body:**
```json
{
  "formType": "booking-service",
  "data": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Thank you, your submission has been received and is being processed."
}
```

## Frontend Components

### FormOverlay.tsx
Dynamic form renderer that:
- Fetches form config from `/api/form/:formType`
- Renders fields based on JSON config
- Handles nested field transformation
- Submits to `/api/form-submission`

### ChatMessage.tsx
Custom link renderer that:
- Detects `/form/*` links in markdown
- Triggers form overlay on click
- Prevents navigation

### ChatArea.tsx
Manages form overlay state and display.

## Example: Booking Service Form

**Knowledge base entry:**
```markdown
# Motor Service Booking

To book a service for your motor, please [click here](/form/booking-service).

Our team will contact you within 24 hours to confirm your appointment.
```

**Bot response includes the link** → User clicks → Form appears → User submits → n8n processes → External API receives booking.

## Troubleshooting

**Form not loading:**
- Check if JSON file exists in `form-web-view/`
- Verify filename matches the link (e.g., `/form/booking-service` → `booking-service.json`)

**Submission fails:**
- Check n8n webhook URL in Settings
- Verify n8n workflow is active
- Check n8n execution logs

**Link not clickable:**
- Ensure link format is exactly `/form/{formType}`
- Check ReactMarkdown is rendering links correctly

## Security Notes

- All endpoints require authentication
- Form submissions include `submittedBy` (user email) for audit trail
- API keys for external services should be stored in n8n credentials, not in form configs
