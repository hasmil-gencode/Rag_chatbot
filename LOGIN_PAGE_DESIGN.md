# Login Page Design Specification

Standard login page design for all GenCode systems.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐  │
│  │                          │  │                              │  │
│  │     LEFT PANEL (60%)     │  │    RIGHT PANEL (40%)         │  │
│  │     Marketing/Branding   │  │    Login Form                │  │
│  │                          │  │                              │  │
│  │  ┌─ Logo (top-left)      │  │    "Welcome back"            │  │
│  │  │                       │  │    "Please sign in..."       │  │
│  │  │                       │  │                              │  │
│  │  │                       │  │    [Email field]             │  │
│  │  ├─ Marketing Text       │  │    [Password field]          │  │
│  │  │  - Tagline            │  │    [Sign In button]          │  │
│  │  │  - Headline           │  │                              │  │
│  │  │  - Description        │  │    🛡️ Protected by GenCode   │  │
│  │  │                       │  │    [Powered by GenCode img]  │  │
│  │  ├─ Footer               │  │                              │  │
│  │  │  © 2026 Gencode...    │  │                              │  │
│  │  └───────────────────────│  │                              │  │
│  └──────────────────────────┘  └──────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

- **Desktop:** 60/40 split
- **Mobile:** Left panel hidden, full-width login form

---

## Left Panel — Marketing/Branding

### Background
- Full-bleed background image with dark overlay (`bg-black/50`)
- Image: Space/tech themed (currently Unsplash `photo-1451187580459-43490279c0fa`)
- Can be customized per system

### Content (z-10, above overlay)

**Logo (top)**
- White logo SVG: `/logos/g14_white_long_2.svg`
- Height: `h-8`

**Marketing Text (middle)**
- Tagline: `text-sm font-medium tracking-wider uppercase text-white`
  - Example: "AI OPERATIONS SUITE"
- Headline: `text-4xl lg:text-5xl font-bold text-white leading-tight`
  - Example: "Streamline your\nknowledge workflows."
- Description: `text-lg text-white leading-relaxed`
  - Example: "Intelligent AI-powered conversations for your business..."

**Footer (bottom)**
- `text-slate-500 text-sm`
- "© 2026 Gencode Sdn Bhd. All rights reserved."

---

## Right Panel — Login Form

### Container
- Background: `bg-slate-50`
- Padding: `p-8`
- Content max-width: `max-w-md`
- Vertically centered: `flex items-center justify-center`

### Header
- Title: `text-3xl font-bold text-slate-900` — "Welcome back"
- Subtitle: `text-slate-600` — "Please sign in to your dashboard"
- Margin bottom: `mb-8`

### Form Fields

**Email Field**
- Label: `text-sm font-medium text-slate-700 mb-2`
- Input: `h-12 bg-white border-slate-300 text-slate-900 pl-10`
- Icon: Mail icon (left, `text-slate-400`)
- Placeholder: "e.g. admin@example.com"

**Password Field**
- Label: `text-sm font-medium text-slate-700 mb-2`
- Input: `h-12 bg-white border-slate-300 text-slate-900 pl-10 pr-10`
- Icon: Lock icon (left, `text-slate-400`)
- Toggle: Eye icon (right, show/hide password)
- Placeholder: "••••••••"

### Submit Button
- Full width: `w-full h-12`
- Style: `bg-slate-900 hover:bg-slate-800 text-white text-base font-medium`
- Text: "Sign In" with arrow icon →
- Loading state: "Signing in..."

### Footer
- Security badge: 🛡️ "Protected by GenCode Secure Access"
  - `text-xs text-slate-500` with shield icon
- Powered by image: `/powerbygencode.png`
  - `h-12 object-contain`, centered

---

## Assets Required

| Asset | Path | Description |
|-------|------|-------------|
| White logo (long) | `/logos/g14_white_long_2.svg` | Left panel top logo |
| Background image | External URL or local | Left panel background |
| Powered by GenCode | `/powerbygencode.png` | Right panel footer badge |

---

## Colors

| Element | Color | Tailwind |
|---------|-------|----------|
| Left panel overlay | Black 50% | `bg-black/50` |
| Left text | White | `text-white` |
| Left footer | Slate 500 | `text-slate-500` |
| Right background | Slate 50 | `bg-slate-50` |
| Form title | Slate 900 | `text-slate-900` |
| Form subtitle | Slate 600 | `text-slate-600` |
| Labels | Slate 700 | `text-slate-700` |
| Input border | Slate 300 | `border-slate-300` |
| Input text | Slate 900 | `text-slate-900` |
| Placeholder | Slate 400 | `text-slate-400` |
| Button | Slate 900 / 800 hover | `bg-slate-900` |
| Security text | Slate 500 | `text-slate-500` |

---

## Change Password Modal

Shown when `mustChangePassword: true` on first login.

- Overlay: `bg-black/50`
- Modal: `bg-white rounded-lg shadow-xl p-8 max-w-md`
- Title: `text-2xl font-bold text-slate-900` — "Set Your New Password"
- Description: `text-slate-600` — "For security reasons..."
- Fields: New Password + Confirm Password (same style as login)
- Button: Same style as login button

---

## Responsive

- `lg:` breakpoint (1024px+): Show left panel
- Below `lg`: Left panel hidden (`hidden lg:flex`), right panel full width

---

## Customization Per System

To adapt for different systems, change:
1. Left panel tagline text
2. Left panel headline text
3. Left panel description text
4. Background image URL
5. Logo SVG path (if different branding)

All other elements (form, colors, layout) stay consistent across systems.
