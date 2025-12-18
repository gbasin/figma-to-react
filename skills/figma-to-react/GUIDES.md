# Figma to React - Detailed Guides

## Table of Contents

1. [Figma File Setup](#figma-file-setup)
2. [Extracting URLs from Figma](#extracting-urls-from-figma)
3. [Asset Best Practices](#asset-best-practices)
4. [Common Tailwind Mappings](#common-tailwind-mappings)
5. [iOS Animation Reference](#ios-animation-reference)
6. [Troubleshooting](#troubleshooting)
7. [Examples](#examples)

---

## Figma File Setup

### Organizing Screens for Extraction

For best results, organize your Figma file:

```
Frame: "Plaid Link Flow"
├── Screen 1: Welcome
├── Screen 2: Select Bank
├── Screen 3: Credentials
├── Screen 4: Connecting...
└── Screen 5: Success
```

**Tips:**
- Use a parent frame to group all screens in the flow
- Name screens descriptively (these become component names)
- Order screens left-to-right in the intended flow order
- Keep consistent dimensions across all screens (e.g., 390x844 for iPhone 14 Pro)

### Component Organization

- Group reusable elements as Figma components
- Use Auto Layout for proper spacing extraction
- Name layers descriptively (affects asset naming)

---

## Extracting URLs from Figma

### URL Structure

```
https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
```

**Example:**
```
https://www.figma.com/design/abc123xyz/Plaid-Link-Flow?node-id=1-234
                            ↑                              ↑
                        fileKey                         nodeId
```

### Getting Node IDs

1. Select a frame in Figma
2. Right-click → "Copy link"
3. The `node-id` parameter contains the node ID
4. Convert URL format: `1-234` in URL = `1:234` for API

### Using Multiple Node IDs

For batch operations, you can extract multiple node IDs:

```
Parent frame node-id: 0:1
├── Screen 1 node-id: 1:234
├── Screen 2 node-id: 1:567
├── Screen 3 node-id: 1:890
└── Screen 4 node-id: 1:1234
```

---

## Asset Best Practices

### SVG Extraction

**DO:**
```tsx
// Embed exact SVG from Figma
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 6L6 18M6 6l12 12" stroke="#111211" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
</svg>
```

**DON'T:**
```tsx
// Don't substitute with icon library
import { X } from 'lucide-react';
<X size={24} /> // Wrong! Use exact Figma SVG
```

### Image Downloads

```bash
# Download with exact filename
curl -L "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/..." \
  -o public/plaid-assets/flagstar-logo.png

# Verify download
file public/plaid-assets/flagstar-logo.png
# Should output: PNG image data, 200 x 80, 8-bit/color RGBA
```

### Asset Directory Structure

```
public/
└── {flow}-assets/
    ├── logo.svg           # Main logo
    ├── logo.png           # Raster version if needed
    ├── icon-close.svg     # UI icons
    ├── icon-back.svg
    ├── icon-search.svg
    ├── bank-flagstar.png  # Bank/partner logos
    ├── bank-chase.png
    ├── illustration-success.svg  # Illustrations
    └── illustration-error.svg
```

### Referencing Assets

```tsx
// In components
<img src="/plaid-assets/logo.svg" alt="Plaid" className="w-[120px]" />

// For inline SVGs (preferred for icons)
<svg className="w-6 h-6" viewBox="0 0 24 24">
  {/* Exact SVG content from Figma */}
</svg>
```

---

## Common Tailwind Mappings

### Figma to Tailwind Reference

| Figma Property | Tailwind Class |
|----------------|----------------|
| **Border Radius** | |
| 4px | `rounded` |
| 6px | `rounded-md` |
| 8px | `rounded-lg` |
| 12px | `rounded-xl` |
| 16px | `rounded-2xl` |
| 24px | `rounded-3xl` |
| Full/50% | `rounded-full` |
| **Font Size** | |
| 12px | `text-xs` |
| 14px | `text-sm` |
| 16px | `text-base` |
| 18px | `text-lg` |
| 20px | `text-xl` |
| 24px | `text-2xl` |
| **Font Weight** | |
| 400 | `font-normal` |
| 500 | `font-medium` |
| 600 | `font-semibold` |
| 700 | `font-bold` |
| **Spacing** | |
| 4px | `p-1` / `m-1` |
| 8px | `p-2` / `m-2` |
| 12px | `p-3` / `m-3` |
| 16px | `p-4` / `m-4` |
| 20px | `p-5` / `m-5` |
| 24px | `p-6` / `m-6` |

### Custom Values

When Figma uses non-standard values, use arbitrary values:

```tsx
// Exact pixel values
className="text-[17px]"
className="rounded-[14px]"
className="p-[18px]"

// Exact colors
className="text-[#111211]"
className="bg-[#6a6a6a]"
```

---

## iOS Animation Reference

### Navigation Transitions

Based on [Ionic Framework's iOS transitions](https://github.com/ionic-team/ionic-framework/blob/main/core/src/utils/transition/).

**Push (Forward Navigation):**
```css
/* Entering screen */
.screen-enter {
  transform: translateX(100%);
}
.screen-enter-active {
  transform: translateX(0);
  transition: transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1);
}

/* Exiting screen (goes to background) */
.screen-exit {
  transform: translateX(0);
}
.screen-exit-active {
  transform: translateX(-33%);
  transition: transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
```

**Pop (Back Navigation):**
```css
/* Entering screen (from background) */
.screen-enter {
  transform: translateX(-33%);
}
.screen-enter-active {
  transform: translateX(0);
  transition: transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1);
}

/* Exiting screen */
.screen-exit {
  transform: translateX(0);
}
.screen-exit-active {
  transform: translateX(100%);
  transition: transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
```

### Modal Transitions

**Present (Open Modal):**
```css
.modal-enter {
  transform: translateY(100%);
}
.modal-enter-active {
  transform: translateY(0);
  transition: transform 500ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

**Dismiss (Close Modal):**
```css
.modal-exit {
  transform: translateY(0);
}
.modal-exit-active {
  transform: translateY(100%);
  transition: transform 500ms cubic-bezier(0.32, 0.72, 0, 1);
}
```

### Button Interactions

```tsx
<button
  className="active:scale-[0.97] transition-transform duration-100 ease-out"
>
  Continue
</button>
```

---

## Troubleshooting

### Common Issues

#### "Asset URL returned 404"

**Cause:** Figma asset URLs are temporary and expire.

**Solution:**
1. Re-run `get_design_context` to get fresh URLs
2. Download assets immediately after extraction
3. Store assets locally, don't hotlink Figma URLs

#### "SVG looks different from Figma"

**Cause:** SVG was approximated instead of copied exactly.

**Solution:**
1. Use `get_design_context` to get exact SVG code
2. Copy the entire `<svg>` element including all attributes
3. Don't simplify paths or remove attributes

#### "Spacing doesn't match"

**Cause:** Tailwind's spacing scale doesn't have exact value.

**Solution:**
```tsx
// Use arbitrary values for exact pixel match
className="p-[18px]"  // Instead of p-4 (16px) or p-5 (20px)
```

#### "Font looks different"

**Cause:** Custom font not installed or not loaded.

**Solution:**
1. Add font to project:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
   ```
2. Or use system font stack as fallback:
   ```css
   font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
   ```

#### "Colors look slightly off"

**Cause:** Color profile differences or hex value mismatch.

**Solution:**
1. Use exact hex values from Figma: `text-[#111211]`
2. Don't rely on Tailwind color palette approximations
3. Check if Figma uses RGB vs HSL

#### "Wrong asset downloaded (component variant issue)"

**Cause:** Figma MCP limitation — `get_design_context` returns base component assets instead of variant-specific assets.

**Symptoms:**
- Downloaded "Wells Fargo" logo but screenshot shows "Chase"
- All bank chips show the same logo
- Icon variants all return the base icon

**Detection:** Asset verification will catch this — the rendered asset won't match the Figma screenshot.

**Solutions (in order of preference):**

1. **Figma REST API with token:**
   ```bash
   curl -H "X-Figma-Token: YOUR_TOKEN" \
     "https://api.figma.com/v1/images/FILE_KEY?ids=NODE_ID&format=png&scale=2"
   ```
   Returns the correct variant-specific asset.

2. **Screenshot extraction:**
   - Use full screen screenshot from `get_screenshot` (shows correct variant)
   - Identify asset bounding box from metadata
   - Crop the region to extract asset
   - Lower fidelity but visually correct

3. **Manual export:**
   - Open Figma desktop app
   - Select the specific variant instance
   - Export → PNG/SVG at 2x
   - Save to `public/{flow}-assets/`

**How to get a Figma API token:**
1. Go to Figma → Settings → Account
2. Scroll to "Personal access tokens"
3. Generate new token
4. Store securely (treat like a password)

---

## Examples

### Complete Screen Component

```tsx
import { useState } from 'react';
import type { ScreenProps } from '../registry';

export function CredentialsScreen({ onNext, onBack, onClose }: ScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#e5e5e5]">
        <button
          onClick={onBack}
          className="p-2 active:scale-[0.97] transition-transform duration-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="#111211" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <img src="/plaid-assets/flagstar-logo.png" alt="Flagstar Bank" className="h-6" />
        <button
          onClick={onClose}
          className="p-2 active:scale-[0.97] transition-transform duration-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="#111211" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        <h1 className="text-[24px] font-semibold text-[#111211] mb-2">
          Enter your credentials
        </h1>
        <p className="text-[16px] text-[#6a6a6a] mb-8">
          Enter your Flagstar Bank username and password.
        </p>

        {/* Username Input */}
        <div className="mb-4">
          <label className="block text-[14px] font-medium text-[#111211] mb-2">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 border border-[#d1d1d1] rounded-xl text-[16px] focus:outline-none focus:border-[#111211] transition-colors"
            placeholder="Enter username"
          />
        </div>

        {/* Password Input */}
        <div className="mb-6">
          <label className="block text-[14px] font-medium text-[#111211] mb-2">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 pr-12 border border-[#d1d1d1] rounded-xl text-[16px] focus:outline-none focus:border-[#111211] transition-colors"
              placeholder="Enter password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6a6a6a]"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <a href="#" className="text-[14px] text-[#0066cc] font-medium">
          Forgot username or password?
        </a>
      </div>

      {/* Footer */}
      <div className="p-6 pt-0">
        <button
          onClick={onNext}
          disabled={!username || !password}
          className="w-full py-4 bg-[#111211] text-white rounded-xl text-[17px] font-semibold active:scale-[0.97] transition-transform duration-100 disabled:opacity-50 disabled:active:scale-100"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
```

### Demo Page with Animations

```tsx
import { useState, useCallback } from 'react';
import { screens, screenFlow, getScreenById, getNextScreenId, getPrevScreenId } from './screens/registry';
import { DeviceFrame } from '@/components/DeviceFrame';

export function PlaidDemoPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const directScreen = searchParams.get('screen');

  const [currentScreenId, setCurrentScreenId] = useState(
    directScreen && screenFlow.includes(directScreen) ? directScreen : screenFlow[0]
  );
  const [direction, setDirection] = useState<'forward' | 'back' | 'none'>('none');
  const [isAnimating, setIsAnimating] = useState(false);

  const navigate = useCallback((newScreenId: string, dir: 'forward' | 'back') => {
    if (isAnimating) return;
    setDirection(dir);
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentScreenId(newScreenId);
      setIsAnimating(false);
    }, 500);
  }, [isAnimating]);

  const handleNext = useCallback(() => {
    const next = getNextScreenId(currentScreenId);
    if (next) navigate(next, 'forward');
  }, [currentScreenId, navigate]);

  const handleBack = useCallback(() => {
    const prev = getPrevScreenId(currentScreenId);
    if (prev) navigate(prev, 'back');
  }, [currentScreenId, navigate]);

  const handleClose = useCallback(() => {
    navigate(screenFlow[0], 'back');
  }, [navigate]);

  const currentScreen = getScreenById(currentScreenId);
  if (!currentScreen) return null;

  const CurrentComponent = currentScreen.component;

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <DeviceFrame>
        <div className="relative w-full h-full overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              transform: isAnimating
                ? direction === 'forward'
                  ? 'translateX(-33%)'
                  : 'translateX(100%)'
                : 'translateX(0)',
              transition: 'transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1)',
            }}
          >
            <CurrentComponent
              onNext={handleNext}
              onBack={handleBack}
              onClose={handleClose}
            />
          </div>
        </div>
      </DeviceFrame>
    </div>
  );
}
```
