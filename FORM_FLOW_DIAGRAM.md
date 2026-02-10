# Form Web View - Flow Diagram

## Complete Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                             │
└─────────────────────────────────────────────────────────────────────┘

User: "I want to service my motor"
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      KNOWLEDGE BASE (Uploaded)                       │
│  "To book service, [click here](/form/booking-service)"             │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BOT RESPONSE                                 │
│  "To book service, [click here](/form/booking-service)"             │
│                                                                       │
│  [Link is clickable in chat]                                        │
└─────────────────────────────────────────────────────────────────────┘
  │
  │ User clicks link
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (ChatMessage.tsx)                        │
│  Detects: /form/booking-service                                     │
│  Triggers: setActiveForm('booking-service')                         │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (FormOverlay.tsx)                        │
│  GET /api/form/booking-service                                      │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (server.js)                             │
│  Reads: form-web-view/booking-service.json                          │
│  Returns: Form config                                               │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FORM OVERLAY DISPLAYED                            │
│  ┌───────────────────────────────────────────────────┐             │
│  │  Motor Service Booking                      [X]   │             │
│  ├───────────────────────────────────────────────────┤             │
│  │  Appointment Date & Time: [____________]          │             │
│  │  Expected Finish Time:    [____________]          │             │
│  │  Motor Model:             [____________]          │             │
│  │  Plate Number:            [____________]          │             │
│  │  Mileage (km):            [____________]          │             │
│  │  Service Type:            [▼ Select...  ]         │             │
│  │  IC/Passport:             [____________]          │             │
│  │  Full Name:               [____________]          │             │
│  │  Phone Number:            [____________]          │             │
│  │  Comments/Notes:          [____________]          │             │
│  │                           [____________]          │             │
│  │                                                    │             │
│  │  [Submit]  [Cancel]                               │             │
│  └───────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
  │
  │ User fills and clicks Submit
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND (FormOverlay.tsx)                        │
│  POST /api/form-submission                                          │
│  {                                                                   │
│    formType: "booking-service",                                     │
│    data: { ... user input ... }                                     │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (server.js)                             │
│  Adds metadata:                                                      │
│  - submittedBy: "user@example.com"                                  │
│  - submittedAt: "2026-02-10T12:30:00.000Z"                          │
│                                                                       │
│  Forwards to n8n webhook                                            │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    N8N WEBHOOK NODE                                  │
│  Webhook: form-submission-handler                                   │
│  Receives:                                                           │
│  {                                                                   │
│    formType: "booking-service",                                     │
│    data: { start_time, model, plate, ... },                         │
│    submittedBy: "user@example.com",                                 │
│    submittedAt: "2026-02-10T12:30:00.000Z"                          │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      N8N SWITCH NODE                                 │
│  Switch on: {{ $json.formType }}                                    │
│                                                                       │
│  ├─ Case: "booking-service"                                         │
│  ├─ Case: "contact-us"                                              │
│  └─ Default: Error                                                  │
└─────────────────────────────────────────────────────────────────────┘
  │
  │ Case: booking-service
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    N8N FUNCTION NODE                                 │
│  Add fixed fields:                                                   │
│  {                                                                   │
│    ...formData,                                                      │
│    category: "2",                                                    │
│    agent_id: "1",                                                    │
│    transfer_company_id: "378",                                       │
│    platform_source: "CHATBOT",                                       │
│    platform_company: "1",                                            │
│    company_id: "1"                                                   │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  N8N HTTP REQUEST NODE                               │
│  POST {{base-url}}company/services/book                             │
│  Headers:                                                            │
│    - app-key: Bqolc5jcVySyqnNZnXb0zlM0mN5epfaYFupThOOIq4           │
│    - app-token: 111                                                  │
│  Body: Complete booking data                                        │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRIEND'S API                                      │
│  Receives booking request                                           │
│  Processes and stores in their system                               │
│  Returns success response                                           │
└─────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    RESPONSE BACK TO USER                             │
│  Success toast: "Thank you, your submission has been received"      │
│  Form overlay closes                                                │
│  User back to chat                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Adding New Forms - Simple Flow

```
1. CREATE JSON
   form-web-view/new-form.json
   │
   ▼
2. UPDATE KNOWLEDGE BASE
   "Click [here](/form/new-form)"
   │
   ▼
3. ADD N8N CASE
   Switch → Case: "new-form" → Your logic
   │
   ▼
4. DONE! ✅
```

## File Structure

```
Rag_chatbot/
├── form-web-view/                    # ← Form configs folder
│   ├── booking-service.json          # ← Motor booking form
│   └── [future-forms].json           # ← Add more here
│
├── frontend/src/components/chat/
│   ├── FormOverlay.tsx               # ← Dynamic form renderer
│   ├── ChatMessage.tsx               # ← Link detection (modified)
│   └── ChatArea.tsx                  # ← Form state (modified)
│
├── server.js                         # ← API endpoints (modified)
│
├── knowledge-base-example-booking.md # ← Sample KB with form link
├── FORM_WEB_VIEW_FEATURE.md         # ← Full documentation
├── FORM_SETUP_GUIDE.md               # ← Quick setup
└── FORM_IMPLEMENTATION_SUMMARY.md    # ← What's been built
```

## Key Points

✅ **One webhook for all forms** - `form-submission-handler`  
✅ **Switch routes by formType** - Easy to add new forms  
✅ **No code changes needed** - Just add JSON + n8n case  
✅ **Overlay stays on chat page** - No navigation away  
✅ **Auto-closes on success** - Smooth UX  

## Platform Source

All submissions from chatbot will have:
```json
{
  "platform_source": "CHATBOT"
}
```

This helps your friend's system identify bookings from the chatbot vs their e-booking system.
