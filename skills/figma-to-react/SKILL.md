---
name: figma-to-react
version: 1.3.2
description: Convert Figma screen flows into TypeScript React components. Extracts design context, downloads assets, and generates pixel-perfect components.
license: MIT
compatibility: Requires Figma MCP server (mcp__figma__*). React + Tailwind CSS project (Figma MCP outputs Tailwind classes).
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch mcp__figma__get_metadata mcp__figma__get_screenshot mcp__figma__get_design_context AskUserQuestion
---

# Figma to React

Convert Figma screen flows into TypeScript React components with local assets.

## Step 1: Get Figma URL & Auto-Detect Configuration

### 1.1 Download Asset Script

Download the asset processing script:

```bash
curl -sL "https://raw.githubusercontent.com/gbasin/figma-to-react/master/skills/figma-to-react/scripts/process-figma-assets.sh" -o /tmp/process-figma-assets.sh && chmod +x /tmp/process-figma-assets.sh
```

Local path (if running from plugin): `scripts/process-figma-assets.sh`

### 1.2 Get Figma URL

Ask user for the Figma URL:
- File URL: `https://www.figma.com/design/{fileKey}/{fileName}`
- Or frame URL: `https://www.figma.com/design/{fileKey}/{fileName}?node-id=1-234`

### 1.3 Auto-Detect Everything

Run these detections automatically:

```
1. SCREENS: Call mcp__figma__get_metadata(fileKey, nodeId)
   → Filter for screen-like frames (consistent dimensions)
   → Order by x-position (left-to-right) or by name
   → Derive component names from layer names

2. FLOW NAME: Derive from Figma file/frame name (kebab-case)

3. OUTPUT DIR: Glob for src/, match project structure patterns

4. ASSET DIR: Look for public/ or src/assets/

5. FRAME DIMENSIONS: Get from Figma metadata
   → Use for demo page container sizing
```

### 1.4 Confirm with User

Present all detected values for user confirmation:

```
I've analyzed the Figma file and your project. Please confirm or adjust:

┌─────────────────────────────────────────────────────────────────┐
│ DETECTED CONFIGURATION                                          │
├─────────────────────────────────────────────────────────────────┤
│ Flow name:      plaid-link (from Figma frame name)              │
│ Output dir:     src/plaid/ (matches src/{feature}/ pattern)     │
│ Asset dir:      public/plaid-assets/                            │
│ Dimensions:     390x844 (from Figma frames)                     │
├─────────────────────────────────────────────────────────────────┤
│ SCREENS DETECTED (5)                                            │
├─────────────────────────────────────────────────────────────────┤
│  1. "01 - Welcome" (1:234)      → WelcomeScreen.tsx             │
│  2. "02 - Select Bank" (1:567)  → SelectBankScreen.tsx          │
│  3. "03 - Credentials" (1:890)  → CredentialsScreen.tsx         │
│  4. "04 - Loading" (1:901)      → LoadingScreen.tsx             │
│  5. "05 - Success" (1:912)      → SuccessScreen.tsx             │
└─────────────────────────────────────────────────────────────────┘

Options:
1. Proceed with detected configuration
2. Adjust settings (I'll ask follow-up questions)
```

If user chooses "Adjust settings", ask about:
- Different flow name?
- Different output directory?
- Exclude any screens?
- Different screen order?

## Step 2: Extract All Screens

For each screen node ID, call `mcp__figma__get_design_context(fileKey, nodeId)` and save the raw response:

```bash
# Save each screen's design context to a temp file
# /tmp/flow-screen-1.txt, /tmp/flow-screen-2.txt, etc.
```

**Parallelization:** These calls are independent — extract all screens in parallel for faster processing.

The response includes:
- Full React/TypeScript code with Tailwind classes
- Asset URLs as `const imgXxx = "https://www.figma.com/api/mcp/asset/..."`
- `data-name` attributes with layer names (use for component naming)
- Component descriptions (hints for asset naming)

## Step 3: Process Assets

Run the asset processing script (downloaded in Step 1):
```bash
/tmp/process-figma-assets.sh ./public/onfido-assets /onfido-assets \
  /tmp/flow-screen-1.txt /tmp/flow-screen-2.txt /tmp/flow-screen-3.txt
```

Output: `flow-screen-1.out.txt`, `flow-screen-2.out.txt`, etc. with:
- Asset const declarations removed
- `src={imgXxx}` replaced with `src="/onfido-assets/filename.svg"`

## Step 4: Rename Generic Assets

Check the asset directory for generic names and rename to meaningful ones:

| Generic | → | Meaningful |
|---------|---|------------|
| `img.svg` | → | `x-icon.svg` (it's a close icon) |
| `img-1.svg` | → | `arrow-back.svg` (it's a back arrow) |
| `img-2.svg` | → | `onfido-wordmark.svg` (Onfido text logo) |
| `rectangle-266.svg` | → | `head-turn-guide.svg` (animation guide) |

To identify what an asset is:
- Read SVG files to see the shapes/paths
- Check component descriptions from Figma MCP (e.g., "x" = close icon)
- Look at context where it's used (e.g., "Navigation Bar" → probably nav icons)

After renaming, update references in the `.out.txt` files.

## Step 5: Generate Components

For each screen, read the `.out.txt` file and create a React component.

**IMPORTANT: Use Figma MCP output verbatim.** Do not simplify, rewrite, or "clean up" the JSX structure. The nested divs, absolute positioning, and percentage insets are intentional - they ensure pixel-perfect rendering. Rewriting loses fidelity.

```typescript
// src/onfido/screens/MotionMobile2Screen.tsx
import type { ScreenProps } from '../registry';

export function MotionMobile2Screen({ onNext, onBack, onClose }: ScreenProps) {
  return (
    // PASTE the code from flow-screen-2.out.txt verbatim
    // Only modify to: wire up onClick handlers, add state for interactivity
    // Do NOT restructure or simplify the JSX
  );
}
```

Derive component name from `data-name` attribute: `"Motion / Mobile 2"` → `MotionMobile2Screen`

**Parallelization:** Component generation is independent per screen — generate all components in parallel.

### Wire Up Navigation

Identify interactive elements and connect them to navigation callbacks:

| Element | Action |
|---------|--------|
| Back arrow / "←" icon | `onClick={onBack}` |
| X / close icon | `onClick={onClose}` |
| "Continue", "Next", "Get Started", primary CTA buttons | `onClick={onNext}` |
| "Skip" links | `onClick={onNext}` (or custom handler) |

Look for `data-name` hints like "Navigation Bar", "Back Button", "Close", "CTA Button" to identify these elements. Make buttons/icons clickable with `cursor-pointer` if not already.

### Wire Up Interactive Elements

Make all form elements functional with local state. Infer the flow's purpose and wire accordingly:

**Text Inputs:**
```typescript
const [email, setEmail] = useState('');
<input value={email} onChange={(e) => setEmail(e.target.value)} />
```

**Dropdowns/Selects:**
- Convert static dropdown designs to working `<select>` or custom dropdown
- Track selected value in state
- If options are visible in Figma, extract them

**Toggles/Switches:**
```typescript
const [enabled, setEnabled] = useState(false);
<div onClick={() => setEnabled(!enabled)} className={enabled ? 'bg-blue-500' : 'bg-gray-300'}>
```

**Checkboxes/Radio Buttons:**
- Make clickable with state tracking
- Radio groups should be mutually exclusive

**Lists with Selection:**
- Bank lists, option lists → track selected item
- Highlight selected state visually

**Data Flow Between Screens:**
- Infer what data carries forward (e.g., selected bank → credentials screen)
- Pass data via props or lift state to Demo Page
- Example: `onNext({ selectedBank: 'Chase' })`

No input validation required - just make elements interactive and functional.

### Add Animations

Infer and add basic animations based on context:

**Button States:**
- Add `active:scale-95` or `active:opacity-80` for press feedback
- Add `transition-transform duration-100` for smooth feel

**Loading/Waiting States:**
- Spinners: Add `animate-spin` to rotating elements
- Pulsing: Add `animate-pulse` to skeleton loaders
- Progress bars: Animate width with CSS transitions

**Screen Transitions (handled in Demo Page):**
- Detect mobile dimensions (< 500px width) → use iOS-like curves
- Desktop/web: `ease-out` over 200-300ms

**iOS-like Animation Curves (CSS approximations):**
```typescript
// iOS uses spring physics, these are CSS approximations that feel similar
const transitions = {
  // Navigation push/pop (~0.35s in iOS)
  push: 'transform 350ms cubic-bezier(0.2, 0.9, 0.4, 1)',
  // Modal present/dismiss
  modal: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
  // Interactive/interruptible
  interactive: 'transform 300ms ease-out',
};
```

Note: True iOS springs use damping/stiffness and can "bounce" - CSS cubic-bezier can only approximate the feel. For exact replication, use `framer-motion` or CSS `linear()` with spring keyframes.

## Step 6: Create Registry

Create `{outputDir}/screens/registry.ts` with:
- `ScreenProps` interface (onNext, onBack, onClose callbacks)
- Import all screen components
- `screens` array with id, title, component for each
- `screenFlow` array of screen IDs in order
- Helper functions: `getScreenById`, `getNextScreenId`, `getPrevScreenId`

## Step 7: Create Demo Page

Create `{outputDir}/{FlowName}DemoPage.tsx` with:
- State for current screen ID
- Render current screen component with navigation callbacks
- Sidebar/nav with screen selector buttons
- Container sized to match Figma frame dimensions (phone, tablet, desktop, etc.)

## Step 8: Add Route

Add route to your app's router (App.tsx, router config, etc.):

```typescript
<Route path="/onfido" element={<OnfidoDemoPage />} />
```

## Done

Output summary:
```
Created:
  src/onfido/screens/registry.ts
  src/onfido/screens/components/MotionMobile1Screen.tsx
  src/onfido/screens/components/MotionMobile2Screen.tsx
  src/onfido/screens/components/MotionMobile3Screen.tsx
  src/onfido/OnfidoDemoPage.tsx
  public/onfido-assets/*.svg, *.png

Run: pnpm dev
Visit: http://localhost:5173/onfido
```

---

## Quick Reference

### Figma MCP Tools

```
mcp__figma__get_metadata(fileKey, nodeId)       → Screen structure, child nodes
mcp__figma__get_screenshot(fileKey, nodeId)     → Visual reference image
mcp__figma__get_design_context(fileKey, nodeId) → React code + asset URLs
```

### Asset Script Flow

```
1. Download script from GitHub (or use local: scripts/process-figma-assets.sh)
2. get_design_context for each screen → save to /tmp/flow-screen-{i}.txt
3. Run: /tmp/process-figma-assets.sh {assetDir} {urlPrefix} screen1.txt screen2.txt ...
4. Script downloads assets, dedupes by content hash, transforms code
5. Output: flow-screen-{i}.out.txt with local asset paths
6. Rename generic assets (img-1.svg → arrow-back.svg)
7. Use transformed code in components
```

### Key Rules

- Never use Figma asset URLs in generated code (must be local paths)
- Deduplicate assets by content hash (Figma generates unique URLs per request)
- Detect actual file type with `file` command (don't trust extensions)
- Rename generic assets to meaningful names based on content/context
