# Login Page Assets

Assets required for the standard GenCode login page.

---

## File List

```
/public/
├── logos/
│   ├── g14_white_long_2.svg      ← Left panel logo (white, horizontal)
│   ├── g14_black_long_2.svg      ← Alternative (dark backgrounds)
│   ├── g14_black1.svg            ← Icon only (black)
│   ├── g14_thick.svg             ← Icon only (thick)
│   └── logo-1769059794293.png    ← Favicon / app icon
├── powerbygencode.png            ← "Powered by GenCode" badge
└── login-bg.jpg                  ← (Optional) Local background image
```

---

## Asset Specifications

### 1. Logo — White Horizontal (`g14_white_long_2.svg`)
- **Usage:** Left panel top-left corner
- **Format:** SVG (scalable)
- **Color:** White (#FFFFFF)
- **Display size:** `h-8` (32px height)
- **Aspect:** Horizontal/landscape

### 2. Powered by GenCode (`powerbygencode.png`)
- **Usage:** Right panel footer, below login form
- **Format:** PNG with transparency
- **Display size:** `h-12` (48px height)
- **Content:** "Powered by GenCode" text + logo mark
- **Background:** Transparent

### 3. Background Image
- **Usage:** Left panel full-bleed background
- **Current source:** `https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80`
- **Theme:** Space/technology/abstract
- **Requirements:**
  - Minimum 1200px wide
  - Dark-ish tones (overlay adds 50% black)
  - No text in image (marketing text overlaid)
- **For local hosting:** Save as `/public/login-bg.jpg`

### 4. Favicon (`logo-1769059794293.png`)
- **Usage:** Browser tab icon
- **Format:** PNG
- **Size:** 32x32 or 64x64 recommended
- **Referenced in:** `frontend/index.html` → `<link rel="icon">`

---

## How to Replace Assets

### Change logo:
1. Place new SVG in `/public/logos/`
2. Update `Index.tsx` line: `<img src="/logos/YOUR_NEW_LOGO.svg" ...>`

### Change background:
1. Save image to `/public/login-bg.jpg`
2. Update `Index.tsx` backgroundImage URL:
   ```
   backgroundImage: 'url("/login-bg.jpg")'
   ```

### Change "Powered by" badge:
1. Replace `/public/powerbygencode.png`
2. Keep same filename or update `Index.tsx` reference

---

## Creating for New Systems

Copy these files to new project's `/public/` folder:
1. `logos/g14_white_long_2.svg`
2. `powerbygencode.png`
3. `logos/logo-1769059794293.png` (favicon)

Then customize marketing text in the login component.
