# Split Screen Web View Feature - Future Enhancement

## 📋 Current System

### How It Works Now:
1. Bot replies with link: `[Click here](/form/booking-service)`
2. User clicks → Form overlay (popup) appears
3. Form config loaded from JSON file: `form-web-view/booking-service.json`
4. User fills form → Submit to n8n webhook
5. Form closes after submission

### Limitations:
- ❌ Need to create JSON config for each client's form
- ❌ Limited to predefined form fields
- ❌ Client can't use their own website
- ❌ Popup blocks chat view

---

## 🎯 New Requirement: Split Screen Web View

### User's Request:
Instead of creating forms for each client, detect ANY link in bot reply and automatically split the screen:
- **Left side:** Chat continues (50%)
- **Right side:** iframe showing client's website (50%)

### Benefits:
- ✅ No need to create forms for each client
- ✅ Client maintains their own website/booking system
- ✅ User can chat while viewing website
- ✅ User stays in the app (no leaving)
- ✅ Works with ANY external website
- ✅ More flexible and scalable

---

## 🏗️ Implementation Plan

### 1. Link Detection Strategy

**Two types of links:**

**Type A: Internal Forms** (Keep existing system)
```
Format: /form/{formType}
Example: [Book now](/form/booking-service)
Behavior: Open form overlay (current system)
```

**Type B: External Websites** (NEW)
```
Format: https://... or http://...
Example: [Book service](https://client-website.com/booking)
Behavior: Split screen with iframe
```

### 2. UI/UX Design

#### Desktop Layout:
```
┌─────────────────────────────────────────────────────────┐
│  Header / Navigation                                     │
├──────────────────────┬──────────────────────────────────┤
│                      │                                   │
│   Chat Area          │   Web View Panel                  │
│   (Left 50%)         │   (Right 50%)                     │
│                      │                                   │
│   - Messages         │   ┌─────────────────────────┐    │
│   - Input box        │   │ [X] Close                │    │
│   - Voice buttons    │   │ https://client.com       │    │
│                      │   ├─────────────────────────┤    │
│                      │   │                          │    │
│                      │   │   <iframe>               │    │
│                      │   │   Client Website         │    │
│                      │   │   </iframe>              │    │
│                      │   │                          │    │
│                      │   └─────────────────────────┘    │
│                      │                                   │
└──────────────────────┴──────────────────────────────────┘
         ↕ Resize Handle (Optional)
```

#### Mobile Layout:
```
Option 1: Stack Vertically
┌─────────────────┐
│  Chat (Top 40%) │
├─────────────────┤
│  Web (Bottom    │
│      60%)       │
└─────────────────┘

Option 2: Open in New Tab
- Click link → Open in new browser tab
- Keep chat in current tab
```

### 3. Features

#### Core Features:
- ✅ Auto-detect external links in bot messages
- ✅ Click link → Split screen appears
- ✅ Close button (X) → Back to full-width chat
- ✅ URL bar showing current website
- ✅ iframe loads client's website
- ✅ Chat continues to work on left side

#### Optional Features (Future):
- 🔄 Resize handle to adjust split ratio (30/70, 50/50, 70/30)
- 🔄 Maximize/minimize web view
- 🔄 Open in new tab button
- 🔄 Refresh iframe button
- 🔄 Back/forward navigation buttons
- 🔄 Remember last split ratio (localStorage)

#### Security Features:
- 🔒 iframe sandbox attributes
- 🔒 CSP (Content Security Policy) headers
- 🔒 Only allow HTTPS links (optional)
- 🔒 Whitelist/blacklist domains (optional)

### 4. Technical Implementation

#### Frontend Changes:

**File 1: `ChatMessage.tsx`**
```typescript
// Detect external links
const LinkRenderer = ({ href, children }: any) => {
  // Internal form links
  if (href?.startsWith('/form/')) {
    return <a onClick={() => onFormLinkClick(formType)}>...</a>;
  }
  
  // External website links (NEW)
  if (href?.startsWith('http://') || href?.startsWith('https://')) {
    return (
      <a onClick={(e) => {
        e.preventDefault();
        onWebViewOpen?.(href); // NEW callback
      }}>
        {children}
      </a>
    );
  }
  
  return <a href={href} target="_blank">...</a>;
};
```

**File 2: `Index.tsx`**
```typescript
// Add state for web view
const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
const [showWebView, setShowWebView] = useState(false);

// Layout
<div className="flex">
  {/* Chat Area */}
  <div className={showWebView ? "w-1/2" : "w-full"}>
    <ChatArea onWebViewOpen={(url) => {
      setWebViewUrl(url);
      setShowWebView(true);
    }} />
  </div>
  
  {/* Web View Panel */}
  {showWebView && (
    <div className="w-1/2">
      <WebViewPanel 
        url={webViewUrl} 
        onClose={() => setShowWebView(false)} 
      />
    </div>
  )}
</div>
```

**File 3: `WebViewPanel.tsx` (NEW)**
```typescript
interface WebViewPanelProps {
  url: string;
  onClose: () => void;
}

export const WebViewPanel = ({ url, onClose }: WebViewPanelProps) => {
  return (
    <div className="h-full flex flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm truncate">{url}</span>
        <button onClick={onClose}>✕</button>
      </div>
      
      {/* iframe */}
      <iframe
        src={url}
        className="flex-1 w-full"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        title="Web View"
      />
    </div>
  );
};
```

#### Backend Changes:
- ❌ No backend changes needed!
- ✅ All handled in frontend

### 5. Mobile Responsiveness

```typescript
// Detect mobile
const isMobile = window.innerWidth < 768;

if (isMobile) {
  // Option 1: Open in new tab
  window.open(url, '_blank');
  
  // Option 2: Stack vertically
  <div className="flex flex-col">
    <div className="h-2/5">Chat</div>
    <div className="h-3/5">Web View</div>
  </div>
}
```

### 6. Security Considerations

```typescript
// iframe sandbox attributes
sandbox="
  allow-same-origin    // Allow cookies/localStorage
  allow-scripts        // Allow JavaScript
  allow-forms          // Allow form submission
  allow-popups         // Allow popups (payment gateways)
  allow-popups-to-escape-sandbox
"

// Optional: Domain whitelist
const allowedDomains = [
  'client-website.com',
  'booking-system.com',
  'payment-gateway.com'
];

const isAllowed = allowedDomains.some(domain => url.includes(domain));
```

---

## 📝 Example Use Cases

### Use Case 1: Service Booking
**Bot Reply:**
```
"To book a service appointment, please visit our booking page: 
https://yamaha-service.com/booking"
```

**User Experience:**
1. User clicks link
2. Screen splits 50/50
3. Left: Chat continues
4. Right: Yamaha booking website loads
5. User fills booking form on website
6. User can ask questions in chat while booking
7. Click X to close web view

### Use Case 2: Product Catalog
**Bot Reply:**
```
"Check out our latest motor models: https://yamaha.com/models"
```

**User Experience:**
1. Split screen opens
2. User browses models on right
3. User asks "What's the price of NVX?" in chat
4. Bot answers while user still viewing catalog

### Use Case 3: Payment
**Bot Reply:**
```
"Complete your payment here: https://payment.com/checkout/12345"
```

**User Experience:**
1. Split screen with payment page
2. User completes payment
3. User can ask for help in chat if needed
4. After payment, close web view

---

## 🚀 Migration Strategy

### Phase 1: Add New Feature (Keep Old)
- Implement split screen for external links
- Keep existing form overlay for `/form/` links
- Both systems work side-by-side

### Phase 2: Test & Feedback
- Test with real clients
- Gather user feedback
- Fix bugs and improve UX

### Phase 3: Deprecate Old System (Optional)
- Migrate existing forms to external websites
- Remove form overlay system
- Keep only split screen

---

## ⚠️ Potential Issues & Solutions

### Issue 1: iframe Blocked by X-Frame-Options
**Problem:** Some websites block iframe embedding
**Solution:** 
- Show error message
- Offer "Open in New Tab" button
- Fallback to new tab automatically

### Issue 2: Mobile Screen Too Small
**Problem:** Split screen cramped on mobile
**Solution:**
- Auto-detect mobile → Open in new tab
- Or stack vertically with scrolling

### Issue 3: Chat Input Hidden
**Problem:** Keyboard on mobile hides chat input
**Solution:**
- Adjust layout when keyboard appears
- Sticky input at bottom

### Issue 4: Performance
**Problem:** iframe loads slowly
**Solution:**
- Show loading spinner
- Lazy load iframe
- Cache iframe content

---

## 📊 Comparison: Old vs New

| Feature | Current (Form Overlay) | New (Split Screen) |
|---------|----------------------|-------------------|
| Setup | Need JSON config | No setup needed |
| Flexibility | Fixed form fields | Any website |
| User Experience | Popup blocks chat | Chat + Web side-by-side |
| Client Control | We control form | Client controls website |
| Maintenance | We maintain forms | Client maintains website |
| Scalability | One config per client | Unlimited clients |
| Mobile | Works well | Need optimization |

---

## ✅ Next Steps (When Ready to Implement)

1. Create `WebViewPanel.tsx` component
2. Update `ChatMessage.tsx` link detection
3. Update `Index.tsx` layout for split screen
4. Add close/resize functionality
5. Test with sample websites
6. Add mobile responsiveness
7. Add security features (sandbox, whitelist)
8. Test with real client websites
9. Deploy and monitor

---

## 📅 Status: PENDING IMPLEMENTATION

**Priority:** Future Enhancement  
**Estimated Effort:** 2-3 days  
**Dependencies:** None  
**Blocked By:** None  

**Created:** 2026-02-20  
**Last Updated:** 2026-02-20
