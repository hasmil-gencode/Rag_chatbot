# GenCode Design System

**Version:** 1.0  
**Based on:** Genia AI Assistant (Tenant Frontend)  
**Stack:** React + TypeScript + Tailwind CSS + shadcn/ui  
**Theme:** Dark-first, monochromatic grayscale

---

## 1. Foundation

### Tech Stack
- **Framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS v3 with `@tailwindcss/typography` plugin
- **Components:** shadcn/ui pattern (forwardRef + `cn()` utility)
- **Icons:** lucide-react
- **Toasts:** sonner
- **Utilities:** clsx + tailwind-merge

### cn() Utility
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 2. Color System

All colors use HSL via CSS custom properties. **Monochromatic palette** — all grayscale except destructive (red).

### Dark Theme (Default `:root`)

| Token | HSL | Hex Approx | Usage |
|---|---|---|---|
| `--background` | `0 0% 13%` | #212121 | Page background |
| `--foreground` | `0 0% 95%` | #f2f2f2 | Primary text |
| `--card` | `0 0% 15%` | #262626 | Card/panel background |
| `--popover` | `0 0% 12%` | #1f1f1f | Dropdown/popover bg |
| `--primary` | `0 0% 100%` | #ffffff | Primary buttons |
| `--primary-foreground` | `0 0% 0%` | #000000 | Text on primary |
| `--secondary` | `0 0% 18%` | #2e2e2e | Secondary surfaces |
| `--muted` | `0 0% 18%` | #2e2e2e | Muted backgrounds |
| `--muted-foreground` | `0 0% 65%` | #a6a6a6 | Secondary text |
| `--accent` | `0 0% 18%` | #2e2e2e | Hover states |
| `--destructive` | `0 84% 60%` | #ef4444 | Error/delete |
| `--border` | `0 0% 20%` | #333333 | Borders |
| `--input` | `0 0% 20%` | #333333 | Input borders |
| `--ring` | `0 0% 40%` | #666666 | Focus rings |
| `--sidebar-background` | `0 0% 9%` | #171717 | Sidebar bg |
| `--sidebar-foreground` | `0 0% 100%` | #ffffff | Sidebar text |
| `--sidebar-accent` | `0 0% 15%` | #262626 | Sidebar active item |
| `--sidebar-border` | `0 0% 20%` | #333333 | Sidebar borders |
| `--sidebar-muted` | `0 0% 65%` | #a6a6a6 | Sidebar secondary text |

### Light Theme (`.light` class)

| Token | HSL | Hex Approx |
|---|---|---|
| `--background` | `0 0% 100%` | #ffffff |
| `--foreground` | `0 0% 10%` | #1a1a1a |
| `--card` | `0 0% 100%` | #ffffff |
| `--secondary` | `0 0% 96%` | #f5f5f5 |
| `--muted` | `0 0% 96%` | #f5f5f5 |
| `--muted-foreground` | `0 0% 45%` | #737373 |
| `--border` | `0 0% 90%` | #e6e6e6 |
| `--sidebar-background` | `0 0% 98%` | #fafafa |

### Theme Toggle
```ts
document.documentElement.classList.toggle('light', theme === 'light');
localStorage.setItem('theme', theme);
```

---

## 3. Typography

### Scale

| Usage | Class | Size |
|---|---|---|
| Page category | `text-[11px] uppercase tracking-widest text-muted-foreground` | 11px |
| Page title | `text-xl font-semibold` | 20px |
| Page description | `text-xs text-muted-foreground` | 12px |
| Section header | `text-xs font-medium` | 12px |
| Body text | `text-sm` | 14px |
| Nav item | `text-sm font-normal` | 14px |
| Sub-nav item | `text-xs font-normal` | 12px |
| Form label | `text-[11px] text-muted-foreground` | 11px |
| Form input | `text-[13px]` | 13px |
| Button text | `text-xs` | 12px |
| Stat value (large) | `text-2xl font-semibold` | 24px |
| Stat value (medium) | `text-lg font-semibold` | 18px |
| Stat label | `text-[11px] text-muted-foreground` | 11px |
| Detail/meta text | `text-[10px] text-muted-foreground` | 10px |
| Chat greeting | `text-3xl font-normal` | 30px |
| Chat session title | `text-[13px] font-medium` | 13px |
| Chat session meta | `text-[11px] text-muted-foreground/60` | 11px |

---

## 4. Spacing

| Context | Value | Tailwind |
|---|---|---|
| Page padding | 24px / 20px | `px-6 py-5` |
| Section gap | 20px | `mb-5` or `space-y-5` |
| Card grid gap | 12px | `gap-3` |
| Card internal padding | 16px / 12px | `px-4 py-3` |
| Section card header | 16px / 10px | `px-4 py-2.5` |
| Section card body | 16px | `p-4 space-y-4` |
| List item padding | 16px / 12px | `px-4 py-3` |
| Nav item spacing | 2px | `space-y-0.5` |
| Sidebar padding | 8px | `px-2` |
| Input padding | 12px / 8px | `px-3 py-2` |
| Button padding (sm) | 12px | `px-3` |

### Border Radius
| Token | Value |
|---|---|
| `--radius` | `0.5rem` (8px) |
| `rounded-lg` | 8px |
| `rounded-xl` | 12px (cards, modals) |
| `rounded-md` | 6px |
| `rounded-full` | pill (avatars, dots) |

---

## 5. Icon Conventions

All icons from `lucide-react`.

| Context | Size | Class |
|---|---|---|
| Nav icons | 16px | `w-4 h-4` |
| Sub-nav icons | 14px | `w-3.5 h-3.5` |
| Button inline icons | 14px | `w-3.5 h-3.5 mr-1.5` |
| Search icons | 14px | `w-3.5 h-3.5` |
| Stat card icons | 14-16px | `w-3.5 h-3.5` or `w-4 h-4` |
| Action icons | 14px | `w-3.5 h-3.5` |
| Close button | 16px | `w-4 h-4` |

---

## 6. Components

### Button Variants

```tsx
// Primary (default)
<Button size="sm" className="text-xs h-8 rounded-lg">
  <Icon className="w-3.5 h-3.5 mr-1.5" /> Label
</Button>

// Outline
<Button size="sm" variant="outline" className="text-xs h-8">
  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
</Button>

// Ghost (nav items, icon buttons)
<Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-accent" />

// Destructive
<Button variant="destructive">Delete</Button>
```

**Sizes:**
| Size | Height | Padding |
|---|---|---|
| `default` | h-10 | px-4 py-2 |
| `sm` | h-9 | px-3 |
| `lg` | h-11 | px-8 |
| `icon` | h-10 w-10 | — |

**Base classes:** `inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50`

### Input

```tsx
// Standard form input
<input className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />

// Search input with icon
<div className="relative">
  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
  <input className="w-full h-9 pl-9 pr-3 text-xs rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
</div>

// Sidebar search (compact)
<input className="w-full bg-muted/30 border-0 rounded-md pl-7 pr-7 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30" />
```

### Card

```tsx
<div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
  <div className="flex flex-col space-y-1.5 p-6">{/* Header */}</div>
  <div className="p-6 pt-0">{/* Content */}</div>
</div>
```

### Status Indicator

```tsx
<span className={`inline-block w-2 h-2 rounded-full ${
  status === 'online' ? 'bg-green-500' : 'bg-red-500'
}`} />
<span className={`text-xs font-medium ${
  status === 'online' ? 'text-green-500' : 'text-red-500'
}`}>
  {status === 'online' ? 'Online' : 'Offline'}
</span>
```

### User Avatar

```tsx
<div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
  <span className="text-white font-semibold text-sm">{initial}</span>
</div>
```

---

## 7. Layout Patterns

### Page Shell (ALL admin pages)

```tsx
<div className="h-full overflow-y-auto">
  <div className="px-6 py-5">
    {/* Header */}
    <div className="flex items-start justify-between mb-5">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
          {category}
        </p>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Button size="sm" className="text-xs h-8 rounded-lg">
        <Icon className="w-3.5 h-3.5 mr-1.5" /> {action}
      </Button>
    </div>
    {/* Content */}
  </div>
</div>
```

### Sidebar Layout

```tsx
// Desktop: collapsible
<aside className={cn(
  "h-screen flex-col bg-sidebar border-r border-border transition-all duration-300",
  "hidden md:flex",
  isCollapsed ? "w-16" : "w-64"
)}>

// Mobile: full-width overlay
<aside className="h-screen flex flex-col bg-sidebar w-full md:hidden">
```

### Tab Navigation

```tsx
<div className="flex gap-1 mb-5 border-b">
  {tabs.map(tab => (
    <button className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
      active === tab.id
        ? 'border-foreground text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`}>
      {tab.label}
    </button>
  ))}
</div>
```

---

## 8. Section Patterns

### Section Card with List

```tsx
<div className="border rounded-lg overflow-hidden">
  <div className="px-4 py-2.5 border-b">
    <p className="text-xs font-medium">{title}</p>
  </div>
  <div className="divide-y">
    {items.map(item => (
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-[10px] text-muted-foreground">{detail}</p>
          </div>
        </div>
        <div>{/* Right side content */}</div>
      </div>
    ))}
  </div>
</div>
```

### Section Card with Form

```tsx
<div className="border rounded-lg overflow-hidden">
  <div className="px-4 py-2.5 border-b">
    <p className="text-xs font-medium">{title}</p>
  </div>
  <div className="p-4 space-y-4">
    <div>
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <input className="w-full h-9 px-3 mt-1 text-[13px] rounded-lg border bg-transparent focus:outline-none focus:ring-1 focus:ring-ring" />
    </div>
  </div>
</div>
```

### Stat Cards Grid

```tsx
// 3-column stats
<div className="grid grid-cols-3 gap-3">
  <div className="border rounded-lg px-4 py-3">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="text-2xl font-semibold mt-0.5">{value}</p>
  </div>
</div>

// 4-column stats with icons (horizontal)
<div className="grid grid-cols-4 divide-x">
  <div className="px-4 py-3 text-center">
    <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
    <p className="text-lg font-semibold">{value}</p>
    <p className="text-[10px] text-muted-foreground">{label}</p>
  </div>
</div>
```

---

## 9. Modal Pattern

```tsx
<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
  onClick={onClose}>
  <div className="bg-background border rounded-xl p-5 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto"
    onClick={e => e.stopPropagation()}>
    {/* Header */}
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-semibold">{title}</p>
      <button onClick={onClose}><X className="w-4 h-4" /></button>
    </div>
    {/* Content */}
    <div className="space-y-3">
      {/* Form fields or content */}
    </div>
    {/* Actions */}
    <div className="flex gap-2 pt-4">
      <Button className="flex-1 text-xs h-9">Confirm</Button>
      <button className="h-9 px-4 bg-secondary hover:bg-muted text-xs rounded-lg">Cancel</button>
    </div>
  </div>
</div>
```

**Modal widths:**
- Small form: `max-w-md`
- Detail view: `max-w-2xl`
- Large content: `max-w-3xl`

---

## 10. Chat Patterns

### Empty State (Greeting)

```tsx
<div className="flex-1 flex items-center justify-center px-4">
  <div className="w-full max-w-3xl">
    <div className="text-center mb-8">
      <h2 className="text-3xl font-normal text-foreground mb-2">
        Hello, <span className="font-medium">{name}</span>
      </h2>
      <p className="text-muted-foreground">How can I help you today?</p>
    </div>
    {/* Input component */}
  </div>
</div>
```

### Chat Session Item (Sidebar)

```tsx
<div className={cn(
  "w-full text-left rounded-lg transition-all duration-200 group relative",
  isActive ? "bg-sidebar-accent" : "hover:bg-accent/50"
)}>
  <button className="w-full text-left px-3 py-1.5 pr-9">
    <div className="text-[13px] font-medium truncate text-sidebar-foreground leading-tight">
      {title}
    </div>
    <div className="text-[11px] text-muted-foreground/60 mt-0.5">{date}</div>
  </button>
  {/* Delete button — hidden, shows on hover */}
  <Button className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100" />
</div>
```

---

## 11. Navigation Patterns

### Nav Item (Flat)

```tsx
<Button variant="ghost" className={cn(
  "w-full h-10 transition-all duration-200 rounded-md",
  isCollapsed ? "justify-center px-0" : "justify-start gap-2 px-2",
  isActive
    ? "bg-sidebar-accent text-sidebar-foreground"
    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
)}>
  <Icon className="w-4 h-4 flex-shrink-0" />
  {!isCollapsed && <span className="text-sm font-normal">{label}</span>}
</Button>
```

### Nav Group (Collapsible)

- Parent: `h-10`, ChevronDown rotates `rotate-180` on expand
- Children: `h-9`, `pl-6` (desktop) / `pl-8` (mobile), icon `w-3.5`, `text-xs`

### Collapsed Tooltip

```tsx
{isCollapsed && (
  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded
    opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible
    transition-all whitespace-nowrap z-50 pointer-events-none">
    {label}
  </div>
)}
```

---

## 12. Animations

| Animation | Duration | Usage |
|---|---|---|
| `transition-all duration-200` | 200ms | Buttons, inputs, nav items |
| `transition-all duration-300` | 300ms | Sidebar collapse |
| `messageSlideIn` | 300ms ease-out | Chat messages appear |
| `typingBounce` | 1.4s infinite | Typing indicator dots |
| `mic-pulse` | 1.5s infinite | Mic recording state |
| `gradientShift` | 8s ease infinite | Gradient border effect |
| `animate-spin` | — | Loading spinners |

### Message Slide In
```css
@keyframes messageSlideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

## 13. Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `< 640px` | Smaller headings (text-xl → 1.125rem) |
| `< 768px` | Sidebar → fixed overlay (280px), full-width chat, 14px base font, 16px inputs (iOS), 85% max message width |
| `≥ 769px` | Sidebar relative, collapsible (w-16 / w-64) |

### Mobile Sidebar
```css
@media (max-width: 768px) {
  aside { position: fixed; width: 280px; z-index: 50; }
}
```

---

## 14. Custom Scrollbar

```css
.chat-scrollbar::-webkit-scrollbar { width: 6px; }
.chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
.chat-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted));
  border-radius: 3px;
}
```

---

## 15. CSS Variables Template

Copy this to `index.css` for any new project:

```css
@layer base {
  :root {
    --background: 0 0% 13%;
    --foreground: 0 0% 95%;
    --card: 0 0% 15%;
    --card-foreground: 0 0% 95%;
    --popover: 0 0% 12%;
    --popover-foreground: 0 0% 95%;
    --primary: 0 0% 100%;
    --primary-foreground: 0 0% 0%;
    --secondary: 0 0% 18%;
    --secondary-foreground: 0 0% 95%;
    --muted: 0 0% 18%;
    --muted-foreground: 0 0% 65%;
    --accent: 0 0% 18%;
    --accent-foreground: 0 0% 95%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 20%;
    --input: 0 0% 20%;
    --ring: 0 0% 40%;
    --radius: 0.5rem;
    --sidebar-background: 0 0% 9%;
    --sidebar-foreground: 0 0% 100%;
    --sidebar-primary: 0 0% 100%;
    --sidebar-accent: 0 0% 15%;
    --sidebar-border: 0 0% 20%;
    --sidebar-muted: 0 0% 65%;
  }

  .light {
    --background: 0 0% 100%;
    --foreground: 0 0% 10%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 10%;
    --primary: 0 0% 10%;
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 96%;
    --secondary-foreground: 0 0% 10%;
    --muted: 0 0% 96%;
    --muted-foreground: 0 0% 45%;
    --accent: 0 0% 93%;
    --accent-foreground: 0 0% 10%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 90%;
    --input: 0 0% 100%;
    --ring: 0 0% 60%;
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 0 0% 10%;
    --sidebar-accent: 0 0% 93%;
    --sidebar-border: 0 0% 90%;
    --sidebar-muted: 0 0% 45%;
  }

  * { @apply border-border; }
  body { @apply bg-background text-foreground antialiased; }
}
```

---

## 16. Dependencies

```json
{
  "clsx": "^2.x",
  "tailwind-merge": "^2.x",
  "lucide-react": "^0.4x",
  "sonner": "^1.x",
  "react-markdown": "^9.x",
  "remark-gfm": "^4.x",
  "@tailwindcss/typography": "^0.5.x"
}
```

---

*This design system is monochromatic by design — all UI elements use grayscale. The only color is red for destructive actions. This creates a clean, professional look that works well for both dark and light themes.*
