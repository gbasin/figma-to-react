---
name: figma-to-react
description: Convert linear Figma screen flows into pixel-perfect React components with Tailwind CSS. Creates fully functional screens with iOS-native animations, interactive elements, and automated visual verification. Use when converting Figma mobile flows to React, building demo apps from designs, or replicating vendor UIs (like Plaid, Stripe, etc.). Requires figma MCP server and dev-browser skill.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, mcp__figma__get_metadata, mcp__figma__get_screenshot, mcp__figma__get_design_context, AskUserQuestion
---

# Figma to React Flow Conversion

Convert linear Figma screen flows into pixel-perfect, fully functional React components.

## Prerequisites

Before using this skill, ensure:

1. **Figma MCP Server** is configured and authenticated
   - Test: `mcp__figma__whoami` should return your Figma user info
   - Tools used: `get_metadata`, `get_screenshot`, `get_design_context`

2. **dev-browser Skill** is available
   - Used for visual verification and screenshot comparison

3. **Project has React + Tailwind CSS**
   - Dev server runnable via `pnpm dev`, `npm run dev`, or similar

---

## Phase 1: Frontloaded Configuration

Gather ALL configuration upfront before starting work. Use `AskUserQuestion` for each:

### Required Information

| # | Question | Auto-detect Strategy |
|---|----------|---------------------|
| 1 | **Figma URL** | Required from user |
| 2 | **Screen node IDs** (optional) | If not provided, auto-detect from parent frame via `get_metadata` |
| 3 | **Flow name** (kebab-case) | Derive from Figma file/frame name |
| 4 | **Output directory** | Glob for `src/`, match project structure |
| 5 | **Asset directory** | Look for `/public/` or `/assets/` |
| 6 | **DeviceFrame component** | Glob for `**/DeviceFrame.tsx`, `**/PhoneFrame.tsx`, `**/IPhoneFrame.tsx` |
| 7 | **Container mode** | Infer from Figma (phone bezel = phone-frame, modal chrome = modal) |
| 8 | **Brand substitutions** | Scan package.json, README, existing components for company/bank names |

### Screen Node IDs

Users can optionally provide explicit screen node IDs if:
- The Figma structure is messy or nested
- Screens aren't direct children of the parent frame
- They want a specific subset of screens
- They need a specific order different from Figma layout

**Formats accepted:**
```
# Node IDs (colon or dash separator)
1:234 1:567 1:890
1-234 1-567 1-890

# Full URLs
https://www.figma.com/design/abc/File?node-id=1-234
https://www.figma.com/design/abc/File?node-id=1-567
```

If no explicit node IDs provided, use `get_metadata` on the parent frame to discover screens automatically.

### Container Modes

- `phone-frame` — iPhone device chrome with status bar, dynamic island
- `modal` — Centered modal over blurred/dimmed backdrop
- `fullscreen` — Screens fill the viewport, no chrome
- `none` — Raw components only, user provides wrapper

### Auto-detection Examples

```typescript
// Detect DeviceFrame
const frameFiles = await glob('**/DeviceFrame.tsx', '**/PhoneFrame.tsx', '**/IPhoneFrame.tsx');
if (frameFiles.length > 0) {
  suggest(frameFiles[0]); // Offer first match, let user confirm/override
}

// Detect brand from package.json
const pkg = await read('package.json');
const companyName = pkg.name.split('/')[0].replace('@', ''); // e.g., "@usonia/app" -> "usonia"

// Detect container mode from Figma
// If Figma frame has iPhone bezel/notch elements -> phone-frame
// If Figma frame has modal backdrop/overlay -> modal
// Otherwise -> fullscreen
```

### Present Configuration for Confirmation

Before proceeding, show the user:

```
Configuration:
  Flow name:      plaid-link
  Output:         src/plaid/
  Assets:         public/plaid-assets/
  DeviceFrame:    src/components/DeviceFrame.tsx (existing)
  Container:      phone-frame
  Company:        Usonia
  Bank:           Flagstar Bank

Proceed? [Y/n]
```

---

## Phase 2: Extract Figma Designs

### Step 2.1: Determine Screen Nodes

**If explicit node IDs were provided:**
```
Parse provided node IDs/URLs
  -> Convert URL format (1-234) to API format (1:234)
  -> Use in the order provided by user
  -> Skip metadata discovery
```

**If no explicit node IDs (auto-detect):**
```
mcp__figma__get_metadata(fileKey, parentNodeId)
  -> Returns all child nodes in the frame
  -> Filter for screen-like frames (consistent dimensions, sequential naming)
  -> Order by x-position (left-to-right) or by name
  -> Present discovered screens to user for confirmation
```

### Step 2.2: Get Screenshots (Parallel)

For each screen node (in parallel):
```
mcp__figma__get_screenshot(fileKey, screenNodeId)
  -> Save to temp location for later comparison
```

### Step 2.3: Get Design Context (Parallel)

For each screen node (in parallel):
```
mcp__figma__get_design_context(fileKey, screenNodeId)
  -> Returns:
     - Tailwind CSS classes
     - Asset URLs (images, icons)
     - SVG code (exact, not approximated)
     - Font families, colors, spacing
```

---

## Phase 3: Asset Handling

### CRITICAL: Exact Assets Only

> **NEVER approximate assets. NEVER substitute similar icons/images.**
>
> - **SVGs**: Copy EXACT SVG code from Figma. Embed inline or save as .svg
> - **Images**: Download EXACT asset from Figma URL
> - **Icons**: Use PRECISE icon from Figma, not "close enough" from a library
> - **Illustrations**: Must be the exact file
>
> If an asset cannot be extracted, flag as TODO — do not substitute.

### Asset Naming

AI derives names from Figma layer names and visual context:

| Figma Layer Name | Derived Asset Name |
|------------------|-------------------|
| "Bank Logo" | `bank-logo.png` |
| "Success Illustration" | `success-illustration.svg` |
| "icon/search" | `search-icon.svg` |
| "Plaid Logo" | `plaid-logo.svg` |

### Download Process with Verification

For each asset, download/extract AND verify before proceeding:

```
For each asset (can parallelize):
  1. EXTRACT
     - Images: curl -L "{figma-asset-url}" -o public/{flow}-assets/{name}.png
     - SVGs: Copy exact SVG code to public/{flow}-assets/{name}.svg

  2. VERIFY (immediate, before moving to next asset)
     a. Get Figma reference:
        - Use get_screenshot on the specific node containing this asset
        - Or crop the asset region from the full screen screenshot

     b. Render local asset:
        - Open browser to a minimal HTML page that displays just this asset
        - Screenshot the rendered asset at same dimensions

     c. Compare:
        - Visual diff between Figma asset and local render
        - Check: dimensions match, colors match, no corruption, no missing parts

     d. Result:
        - PASS: Asset verified, continue
        - FAIL: Re-download/re-extract (up to 3 attempts)
        - GIVE UP: Flag as TODO, note what went wrong
```

### Asset Verification HTML Template

```html
<!-- Temporary page for asset verification -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 20px; background: white; }
    img, svg { display: block; }
  </style>
</head>
<body>
  <!-- For images -->
  <img src="/flow-assets/asset-name.png" />

  <!-- For SVGs (inline) -->
  <svg width="24" height="24" viewBox="0 0 24 24">...</svg>
</body>
</html>
```

### Verification Criteria

| Asset Type | Check |
|------------|-------|
| **PNG/JPG** | File not corrupt, dimensions match Figma, colors accurate |
| **SVG** | Renders correctly, paths complete, colors match, no missing elements |
| **Icons** | Crisp at intended size, stroke widths correct |
| **Illustrations** | All elements present, gradients render, no clipping |

### Figma MCP Variant Limitation

**Known Issue:** The Figma MCP has a limitation with component variants:

| Tool | Behavior |
|------|----------|
| `get_screenshot` | ✅ Renders correct variant (e.g., shows "Chase" bank chip) |
| `get_design_context` | ❌ Returns base component assets (e.g., always "Wells Fargo") |

When the design uses component variants (e.g., bank chips, icon variants, themed buttons), `get_design_context` may return the wrong asset.

**Detection:** Asset verification will catch this — the downloaded asset won't match the Figma screenshot.

### CRITICAL: Screenshot Extraction Guardrails

> **NEVER silently fall back to screenshot extraction.**
>
> Screenshot extraction (cropping assets from full-screen screenshots) is a **LAST RESORT** that:
> - Introduces compression artifacts
> - Loses vector fidelity (SVGs become raster)
> - May have incorrect dimensions
> - Cannot be scaled without quality loss
>
> **Rules:**
> 1. **NEVER use screenshot extraction for SVGs** — flag as TODO instead
> 2. **NEVER auto-extract without explicit user consent** — always ask first
> 3. **Prefer TODO over screenshot extraction** — let user export manually
> 4. **If user approves screenshot extraction, mark asset clearly** in output summary

**Fallback Strategy (ask user):**

```
Asset verification FAILED for "bank-chip-chase.png"
  - Downloaded: Wells Fargo logo (base variant)
  - Expected: Chase logo (from screenshot)

This appears to be a Figma component variant issue.

Options:
1. Provide Figma API token → I'll call REST API directly:
   GET /v1/images/{fileKey}?ids={nodeId}&format=png
   (Recommended - preserves full quality)

2. Flag as TODO → Skip this asset, add TODO comment in code
   You can export manually from Figma later
   (Safe choice if you don't have API token)

3. Manual export now → Export this asset from Figma desktop app
   and save to: public/plaid-assets/bank-chip-chase.png
   (Best quality, requires manual step)

4. Screenshot extraction (NOT RECOMMENDED) → I'll crop from
   the full screen screenshot
   ⚠️  WARNING: Lower fidelity, compression artifacts, not scalable
   ⚠️  BLOCKED for SVG assets - vectors cannot be extracted this way

Which approach? [1/2/3/4]
```

**If user chooses screenshot extraction (option 4):**
- Confirm again: "Screenshot extraction will produce a lower-quality raster image. Are you sure? [y/N]"
- If SVG asset: "Screenshot extraction is not available for SVG assets. Flagging as TODO instead."
- Mark in output: `bank-chip-chase.png  ⚠️ DEGRADED (screenshot extract)`

### Asset Extraction Priority

Always attempt in this order:
1. **Direct extraction** via `get_design_context` SVG/image URL
2. **Figma REST API** (if user provides token)
3. **Manual export** (ask user to export from Figma)
4. **Flag as TODO** (default if above fail)
5. **Screenshot extraction** (only if user explicitly requests AND asset is not SVG)

**If user provides API token:**
```bash
curl -H "X-Figma-Token: {token}" \
  "https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png&scale=2"
```

**If using screenshot extraction:**
- Get full screen screenshot from `get_screenshot`
- Identify asset bounding box from design context metadata
- Crop the region to extract the asset
- Note: May have compression artifacts, but visually correct

### Asset Verification Output

```
Assets (5 total):
  plaid-logo.svg       PASS (verified 24x24)
  flagstar-logo.png    PASS (verified 120x40)
  success-check.svg    PASS (verified 64x64)
  bank-illustration.png PASS (verified 200x150)
  search-icon.svg      FAIL → TODO: SVG gradient not rendering, needs manual fix
```

Only proceed to Phase 4 after all critical assets pass verification (or are flagged as TODOs).

---

## Phase 4: Generate Core Architecture

Generate these files FIRST (sequential, establishes structure):

### 4.1: Registry (`screens/registry.ts`)

```typescript
import type { ComponentType } from 'react';

export interface ScreenProps {
  onNext?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

export interface Screen {
  id: string;
  title: string;
  component: ComponentType<ScreenProps>;
}

// Import screen components
import { WelcomeScreen } from './components/WelcomeScreen';
import { SelectBankScreen } from './components/SelectBankScreen';
// ... more imports

export const screens: Screen[] = [
  { id: 'welcome', title: 'Welcome', component: WelcomeScreen },
  { id: 'select-bank', title: 'Select Bank', component: SelectBankScreen },
  // ... more screens
];

export const screenFlow: string[] = ['welcome', 'select-bank', /* ... */];

export function getScreenById(id: string): Screen | undefined {
  return screens.find(s => s.id === id);
}

export function getNextScreenId(currentId: string): string | null {
  const index = screenFlow.indexOf(currentId);
  return index >= 0 && index < screenFlow.length - 1
    ? screenFlow[index + 1]
    : null;
}

export function getPrevScreenId(currentId: string): string | null {
  const index = screenFlow.indexOf(currentId);
  return index > 0 ? screenFlow[index - 1] : null;
}
```

### 4.2: Demo Page (`{Flow}DemoPage.tsx`)

Must support direct screen access via URL params for parallel verification:

```typescript
import { useState, useEffect } from 'react';
import { screens, screenFlow, getScreenById, getNextScreenId, getPrevScreenId } from './screens/registry';
import { DeviceFrame } from '@/components/DeviceFrame'; // or create new

export function PlaidDemoPage() {
  // Support direct screen access: /plaid?screen=select-bank
  const searchParams = new URLSearchParams(window.location.search);
  const directScreen = searchParams.get('screen');

  const [currentScreenId, setCurrentScreenId] = useState(
    directScreen && screenFlow.includes(directScreen)
      ? directScreen
      : screenFlow[0]
  );

  const currentScreen = getScreenById(currentScreenId);
  if (!currentScreen) return null;

  const CurrentComponent = currentScreen.component;

  const handleNext = () => {
    const next = getNextScreenId(currentScreenId);
    if (next) setCurrentScreenId(next);
  };

  const handleBack = () => {
    const prev = getPrevScreenId(currentScreenId);
    if (prev) setCurrentScreenId(prev);
  };

  const handleClose = () => {
    // Navigate away or reset flow
    setCurrentScreenId(screenFlow[0]);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      {/* Container based on mode */}
      <DeviceFrame>
        <div className="relative w-full h-full overflow-hidden">
          <CurrentComponent
            onNext={handleNext}
            onBack={handleBack}
            onClose={handleClose}
          />
        </div>
      </DeviceFrame>

      {/* Optional: Flow progress sidebar */}
      <div className="ml-8 space-y-2">
        {screens.map((screen, i) => (
          <button
            key={screen.id}
            onClick={() => setCurrentScreenId(screen.id)}
            className={`block text-left px-3 py-1 rounded ${
              screen.id === currentScreenId
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {i + 1}. {screen.title}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 4.3: DeviceFrame Component (if needed)

```typescript
import type { ReactNode } from 'react';

interface DeviceFrameProps {
  children: ReactNode;
}

export function DeviceFrame({ children }: DeviceFrameProps) {
  return (
    <div className="relative">
      {/* iPhone 14 Pro frame */}
      <div className="w-[390px] h-[844px] bg-black rounded-[55px] p-[14px] shadow-2xl">
        <div className="relative w-full h-full bg-white rounded-[41px] overflow-hidden">
          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 h-[47px] flex items-center justify-between px-8 z-50">
            <span className="text-sm font-semibold">9:41</span>
            <div className="flex items-center gap-1">
              {/* Signal, WiFi, Battery icons */}
            </div>
          </div>

          {/* Dynamic Island */}
          <div className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[126px] h-[37px] bg-black rounded-full z-50" />

          {/* Content */}
          <div className="pt-[47px] h-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Phase 5: Generate Screen Components (Parallel)

Once core architecture is in place, generate each screen component IN PARALLEL.

For each screen, create `screens/components/{ScreenName}.tsx`:

```typescript
import type { ScreenProps } from '../registry';

export function WelcomeScreen({ onNext, onBack, onClose }: ScreenProps) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header with close button */}
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} className="p-2 active:scale-[0.97] transition-transform duration-100">
          {/* Exact SVG from Figma */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="#111211" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Content - use exact Tailwind classes from Figma */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <img
          src="/plaid-assets/plaid-logo.svg"
          alt="Plaid"
          className="w-[120px] h-[40px] mb-8"
        />
        <h1 className="text-[24px] font-semibold text-[#111211] text-center mb-4">
          Connect your bank account
        </h1>
        <p className="text-[16px] text-[#6a6a6a] text-center">
          Usonia uses Plaid to securely connect to your bank.
        </p>
      </div>

      {/* Footer with CTA */}
      <div className="p-6">
        <button
          onClick={onNext}
          className="w-full py-4 bg-[#111211] text-white rounded-xl text-[17px] font-semibold active:scale-[0.97] transition-transform duration-100"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
```

### Interactive Elements

Make ALL interactive elements functional with local state:

```typescript
// Text inputs
const [email, setEmail] = useState('');
<input
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  className="..."
  placeholder="Email address"
/>

// Checkboxes
const [agreed, setAgreed] = useState(false);
<button
  onClick={() => setAgreed(!agreed)}
  className={`w-6 h-6 rounded border-2 ${agreed ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}
>
  {agreed && <CheckIcon />}
</button>

// Toggles
const [enabled, setEnabled] = useState(false);
<button
  onClick={() => setEnabled(!enabled)}
  className={`w-12 h-7 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
>
  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
</button>
```

**No validation** — inputs are purely visual/interactive.

---

## Phase 6: iOS-Native Animations

Apply iOS-native animation curves from Ionic Framework's iOS implementation.

### Tailwind Config Extension

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      transitionTimingFunction: {
        'ios-spring': 'cubic-bezier(0.36, 0.66, 0.04, 1)',
        'ios-modal': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    }
  }
}
```

### Animation Implementation

| Trigger | Animation | CSS |
|---------|-----------|-----|
| Navigate forward | Slide from right | `transform: translateX(100%) → translateX(0)`<br>`transition: transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1)` |
| Navigate back | Slide to right | Previous screen: `translateX(-33%) → translateX(0)` |
| Modal open | Slide up | `transform: translateY(100%) → translateY(0)`<br>`transition: transform 500ms cubic-bezier(0.32, 0.72, 0, 1)` |
| Modal close | Slide down | Same curve, reversed |
| Button press | Scale | `active:scale-[0.97]`<br>`transition: transform 100ms ease-out` |

### Screen Transition Component

```typescript
import { useState, useEffect, type ReactNode } from 'react';

interface ScreenTransitionProps {
  children: ReactNode;
  direction: 'forward' | 'back' | 'none';
}

export function ScreenTransition({ children, direction }: ScreenTransitionProps) {
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 50);
    return () => clearTimeout(timer);
  }, []);

  const getTransform = () => {
    if (!isEntering) return 'translateX(0)';
    if (direction === 'forward') return 'translateX(100%)';
    if (direction === 'back') return 'translateX(-100%)';
    return 'translateX(0)';
  };

  return (
    <div
      style={{
        transform: getTransform(),
        transition: 'transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1)',
      }}
      className="absolute inset-0"
    >
      {children}
    </div>
  );
}
```

---

## Phase 7: Add Route

Add the new flow to the app router:

```typescript
// App.tsx or router config
import { PlaidDemoPage } from './plaid/PlaidDemoPage';

// Add route
<Route path="/plaid" element={<PlaidDemoPage />} />

// Add navigation link (if applicable)
<Link to="/plaid">Plaid Demo</Link>
```

---

## Phase 8: Visual Verification (Parallel)

Use dev-browser to verify each screen matches Figma pixel-perfect.

### Process

```
1. Start dev server (single instance)
2. For each screen (IN PARALLEL via multiple browser tabs):
   a. Open /{flow}?screen={screenId}
   b. Wait for render + asset loading
   c. Screenshot at 390x844 viewport
   d. Compare against Figma screenshot
   e. If discrepancy found → auto-fix → re-verify (max 10 attempts)
   f. If still wrong after 10 attempts → flag as TODO
```

### Comparison Criteria

| Element | Requirement |
|---------|-------------|
| Illustrations/SVGs | EXACT match (these were copied exactly) |
| Spacing/padding | Within 2px tolerance |
| Border radius | Exact match |
| Colors | Exact hex match |
| Typography | Correct font, size, weight |
| Asset loading | All images visible, no broken refs |

### Auto-Fix Process

When a discrepancy is detected:

1. **Identify the issue** (e.g., "border-radius: Figma=12px, Rendered=8px")
2. **Locate in component** (search for relevant Tailwind class)
3. **Fix** (e.g., `rounded-lg` → `rounded-xl`)
4. **Re-verify** (screenshot again)
5. **Repeat** up to 10 times
6. **Give up** if still wrong → add TODO comment

Auto-fixable issues:
- Border radius (`rounded-*`)
- Spacing/padding (`p-*`, `m-*`, `gap-*`)
- Colors (update hex value)
- Font size (`text-*`)
- Font weight (`font-*`)
- Opacity (`opacity-*`)

NOT auto-fixable (flag as TODO):
- Missing/wrong assets
- Complex layout issues
- Animation timing
- Font family (requires installation)

---

## Phase 9: Output Summary

```
Created 7 files:
  - src/plaid/screens/registry.ts
  - src/plaid/screens/components/WelcomeScreen.tsx
  - src/plaid/screens/components/SelectBankScreen.tsx
  - src/plaid/screens/components/CredentialsScreen.tsx
  - src/plaid/screens/components/SuccessScreen.tsx
  - src/plaid/PlaidDemoPage.tsx
  - Added route to App.tsx

Asset Extraction & Verification:
  plaid-logo.svg         PASS (verified: 120x40, colors match)
  flagstar-logo.png      PASS (verified: 80x32, no corruption)
  success-check.svg      PASS (verified: 64x64, paths complete)
  bank-illustration.png  PASS (verified: 200x150, colors match)
  search-icon.svg        PASS (verified: 24x24, strokes correct)
  bank-chip.png          TODO (variant mismatch - manual export needed)
  # If user approved screenshot extraction:
  # bank-chip.png        ⚠️ DEGRADED (screenshot extract - may have artifacts)

Screen Visual Verification:
  WelcomeScreen       PASS
  SelectBankScreen    PASS (auto-fixed: rounded-lg → rounded-xl)
  CredentialsScreen   PASS
  SuccessScreen       PASS

TODOs (2):
  - SuccessScreen.tsx:78 — Font "SF Pro" not available, using Inter
  - SelectBankScreen.tsx:45 — Asset "bank-chip.png" needs manual export from Figma

Run: pnpm dev
Visit: http://localhost:5173/plaid
Direct screen access: /plaid?screen={screenId}
```

---

## Edge Case Handling

| Issue | Action |
|-------|--------|
| SVG extraction fails | Flag TODO with Figma node link — **NEVER screenshot extract SVGs** |
| Font not available | Use closest system font, flag TODO |
| Complex gradient | Solid color approximation, flag TODO |
| Asset URL 404 | Flag TODO, note which asset |
| Animation in Figma | Note intended animation, flag TODO |
| **Component variant mismatch** | Ask user: API token → manual export → TODO. Screenshot extraction only if explicitly approved for raster images |
| **Any asset extraction failure** | Default to TODO, not screenshot extraction |

### Absolute Rules

**NEVER**:
- Approximate SVGs or substitute similar icons
- Use placeholder images
- Silently fall back to screenshot extraction
- Screenshot-extract SVG assets (vectors cannot be rasterized without loss)
- Auto-extract without asking user first

**ALWAYS**:
- Ask user before using screenshot extraction
- Flag degraded assets clearly in output
- Prefer TODO over low-quality extraction
- Explain why asset failed and what user can do

---

## Quick Reference

### Figma MCP Tools

```
mcp__figma__get_metadata(fileKey, nodeId)     → Screen structure
mcp__figma__get_screenshot(fileKey, nodeId)   → Visual reference
mcp__figma__get_design_context(fileKey, nodeId) → Code + assets
```

### iOS Animation Curves

```css
/* Navigation push/pop */
cubic-bezier(0.36, 0.66, 0.04, 1) /* 500ms */

/* Modal present/dismiss */
cubic-bezier(0.32, 0.72, 0, 1) /* 500ms */
```

### Screen URL Pattern

```
/{flow}?screen={screenId}
```

See [GUIDES.md](./GUIDES.md) for detailed examples and troubleshooting.
