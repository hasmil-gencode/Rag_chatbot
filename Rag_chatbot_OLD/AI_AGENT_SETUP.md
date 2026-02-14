# n8n AI Agent Setup for Motor Service Booking

## Overview
This setup creates an AI Agent that can book motor services through natural conversation. The agent collects information across multiple messages and only calls the booking API when all required data is gathered.

## Files Created
1. `n8n-chat-workflow-with-agent.json` - Main workflow with AI Agent
2. `n8n-book-service-tool.json` - Booking tool sub-workflow

## Setup Steps

### 1. Import Tool Workflow First
1. Open n8n interface
2. Go to **Workflows** → **Import from File**
3. Import `n8n-book-service-tool.json`
4. Name it: **"Book Motor Service - Tool Workflow"**
5. **Save** the workflow
6. Copy the **Workflow ID** from the URL (you'll need this)

### 2. Configure Booking API Credentials
1. Go to **Credentials** → **New**
2. Select **HTTP Header Auth**
3. Name: `Booking API Auth`
4. Add headers:
   - `Authorization: Bearer YOUR_API_TOKEN`
   - `Content-Type: application/json`
5. **Save**

### 3. Configure Environment Variable
Add to your n8n environment:
```bash
BOOKING_API_URL=https://your-booking-api.com
```

### 4. Update Tool Workflow
1. Open **"Book Motor Service - Tool Workflow"**
2. Click **"Call Booking API"** node
3. Select your **Booking API Auth** credential
4. Test with sample data:
```json
{
  "start_time": "2026-02-03 14:30:00",
  "model": "NVX",
  "plate": "ABC1234",
  "mileage": "5000",
  "customer": {
    "ic_passport": "123456789012",
    "name": "Test User",
    "phone": "0123456789"
  }
}
```
5. **Activate** the workflow

### 5. Import Main Agent Workflow
1. Import `n8n-chat-workflow-with-agent.json`
2. Name it: **"n8n Chat Workflow with Agent"**

### 6. Configure Main Workflow
1. **Gemini Credential**:
   - Click **"Gemini 2.0 Flash"** node
   - Add your Google Gemini API credential
   - Or switch to OpenAI/Anthropic if preferred

2. **Link Tool Workflow**:
   - Click **"Book Service Tool"** node
   - In `workflowId` field, paste the Workflow ID from Step 1
   - Or use the dropdown to select the workflow

3. **Test the Agent**:
   - Click **"Webhook Chat"** node
   - Copy the **Test URL**
   - Use Postman/curl to test

### 7. Test with Postman

**Endpoint**: `http://your-n8n-url/webhook/chat-agent`

**Method**: POST

**Body**:
```json
{
  "message": "I want to book a service",
  "userId": "test-user-123",
  "sessionId": "session-456"
}
```

**Expected Flow**:
```
Request 1: "I want to book a service"
Response: "Sure! What's your motorcycle model?"

Request 2: "NVX"
Response: "Great! What's your plate number?"

Request 3: "VBA9824"
Response: "Perfect! When would you like to book?"

Request 4: "Tomorrow at 2pm"
Response: "Got it! What's your current mileage?"

... continues until all info collected ...

Final Response: "✅ Service booked successfully! Booking ID: 12345"
```

### 8. Integrate with Your Chatbot

Update `server.js` webhook URL in settings:
```javascript
// In your admin settings, set:
chatWebhook: "http://your-n8n-url/webhook/chat-agent"
```

The chatbot will automatically use this webhook for all chat requests.

## How It Works

### AI Agent Behavior
- **Conversational**: Asks for missing info one at a time
- **Context Aware**: Remembers previous messages in session
- **Smart**: Only calls booking tool when ALL required data is collected
- **Multi-lingual**: Responds in user's language

### Required Information
The agent collects:
- ✅ Appointment date/time
- ✅ Motorcycle model
- ✅ License plate
- ✅ Current mileage
- ✅ Customer IC/Passport
- ✅ Customer name
- ✅ Customer phone
- ⚪ Service type (optional, defaults to "Regular Service")
- ⚪ Comments (optional)

### Tool Schema
The `book_motor_service` tool accepts:
```typescript
{
  start_time: string;        // "2026-02-03 14:30:00"
  finish_time?: string;      // Auto-set to end of day
  model: string;             // "NVX", "PCX", etc.
  plate: string;             // "VBA9824"
  mileage: string;           // "7521"
  service_types?: string[];  // ["1st Free Service"]
  customer: {
    ic_passport: string;     // "790612071922"
    name: string;            // "Ahmad bin Ali"
    phone: string;           // "0123456789"
  };
  comments?: string;         // Optional notes
}
```

## Troubleshooting

### Agent doesn't call tool
- Check if all required fields are collected
- Review agent's system message
- Check tool schema matches expected format

### Booking API fails
- Verify API credentials
- Check BOOKING_API_URL environment variable
- Test API directly with Postman
- Review API response format

### Memory not working
- Ensure sessionId is consistent across requests
- Check Window Buffer Memory node is connected
- Verify sessionId is passed in webhook body

### Wrong language response
- Agent automatically detects user language
- If issues, add language hint in system message
- Check Gemini model supports the language

## Advanced Customization

### Add More Tools
You can add additional tools to the agent:
- `check_availability` - Check available time slots
- `cancel_booking` - Cancel existing booking
- `get_service_price` - Get pricing info

### Change LLM Model
Replace Gemini with:
- **OpenAI GPT-4**: Better reasoning, higher cost
- **Anthropic Claude**: Good balance
- **Local LLM**: Privacy, requires setup

### Adjust Memory Window
In **Window Buffer Memory** node:
- Increase `contextWindowLength` for longer memory
- Decrease for faster responses

### Custom System Prompt
Edit the `systemMessage` in **AI Agent** node to:
- Change personality
- Add business rules
- Include pricing info
- Add disclaimers

## Production Checklist
- [ ] Test all conversation paths
- [ ] Verify booking API integration
- [ ] Set up error handling
- [ ] Configure rate limiting
- [ ] Add logging/monitoring
- [ ] Test multi-language support
- [ ] Activate both workflows
- [ ] Update chatbot webhook URL
- [ ] Test end-to-end from chatbot UI

## Next Steps
1. Test the basic flow
2. Add more tools (availability check, cancellation)
3. Integrate with calendar system
4. Add confirmation messages via SMS/email
5. Create admin dashboard for bookings
