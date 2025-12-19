---
name: figma-to-react
description: Convert linear Figma screen flows into pixel-perfect React components with Tailwind CSS. Creates fully functional screens with iOS-native animations, interactive elements, and automated visual verification. Use when converting Figma mobile flows to React, building demo apps from designs, or replicating vendor UIs (like Plaid, Stripe, etc.). Requires figma MCP server and dev-browser skill.
license: MIT
compatibility: Requires Figma MCP server with authentication, React project with Tailwind CSS, and optionally dev-browser/playwright/puppeteer for visual verification.
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch mcp__figma__get_metadata mcp__figma__get_screenshot mcp__figma__get_design_context AskUserQuestion
---

# Figma to React Flow Conversion

Convert linear Figma screen flows into pixel-perfect, fully functional React components.

## Prerequisites

Before using this skill, ensure:

1. **Figma MCP Server** is configured and authenticated
   - Test: `mcp__figma__whoami` should return your Figma user info
   - Tools used: `get_metadata`, `get_screenshot`, `get_design_context`

2. **Browser automation** for visual verification (configurable)
   - Default: `chrome` (Claude in Chrome integration — start with `--chrome` flag)
   - Alternatives: `dev-browser` skill, `playwright` skill, `puppeteer`, or skip verification

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
| 9 | **Browser tool** | Default: `chrome`. Options: `chrome`, `dev-browser`, `playwright`, `puppeteer`, or skip |
| 10 | **Dev server command** | Auto-detect (see below) |
| 11 | **Dev server URL** | Auto-detect (see below) |

### Dev Server Detection

Before asking the user, detect the dev server setup:

```
1. Check if server is ALREADY RUNNING:
   - curl http://localhost:5173, :3000, :3001, :8080
   - If responding, use that URL and skip starting server

2. Detect package manager:
   - pnpm-lock.yaml → pnpm
   - yarn.lock → yarn
   - package-lock.json → npm

3. Detect dev script from package.json:
   - scripts.dev → "{pm} dev"
   - scripts.start → "{pm} start"
   - scripts.serve → "{pm} serve"

4. Detect port from config:
   - vite.config.ts → server.port
   - next.config.js → typically 3000
   - package.json scripts → --port flag
```

**Present to user:**
```
Dev server detected:
  Command:  pnpm dev
  URL:      http://localhost:5173
  Status:   Not running (will start automatically)

  [Use detected] / [Customize] / [Already running at different URL]
```

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
  Browser tool:   dev-browser
  Dev server:     pnpm dev → http://localhost:5173 (detected, not running)

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

### CRITICAL: Prefer SVG Over Raster

> **Always export as SVG when the asset is vector-based.**
>
> | Asset Type | Format | Reason |
> |------------|--------|--------|
> | Icons | SVG | Scalable, tiny file size, crisp at any resolution |
> | Logos | SVG | Scalable, often have transparency |
> | Illustrations (vector) | SVG | Preserves paths, gradients, scalability |
> | Photos / raster art | PNG/JPG | Already rasterized, SVG won't help |
>
> **How to tell:** In Figma, vector assets show paths/shapes in the layers panel. Raster assets show as embedded images.
>
> When `get_design_context` returns both SVG code AND an image URL for the same asset, **always use the SVG**.

### CRITICAL: Exact Assets Only

> **NEVER approximate assets. NEVER substitute similar icons/images.**
>
> - **SVGs**: Copy EXACT SVG code from Figma. Embed inline or save as .svg
> - **Images**: Download EXACT asset from Figma URL (only for raster assets)
> - **Icons**: Use PRECISE icon from Figma, not "close enough" from a library
> - **Illustrations**: Must be the exact file — prefer SVG if vector-based
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

### Asset Extraction Priority

When an asset fails to extract correctly, try in this order:

1. **Direct extraction** via `get_design_context` SVG/image URL
2. **Figma REST API** — ask user for token, then: `curl -H "X-Figma-Token: {token}" "https://api.figma.com/v1/images/{fileKey}?ids={nodeId}&format=png&scale=2"`
3. **Manual export** — ask user to export from Figma desktop
4. **Flag as TODO** — default if above fail
5. **Screenshot extraction** — LAST RESORT, only if user explicitly approves AND asset is NOT an SVG

> **Screenshot extraction rules:**
> - NEVER use for SVGs (vectors become raster)
> - NEVER auto-extract without asking user first
> - Always mark in output: `⚠️ DEGRADED (screenshot extract)`

### Asset Verification Output

```
Assets (5 total):
  plaid-logo.svg       PASS (verified 24x24)
  flagstar-logo.png    PASS (verified 120x40)
  success-check.svg    PASS (verified 64x64)
  bank-illustration.png PASS (verified 200x150)
  search-icon.svg      FAIL → TODO: SVG gradient not rendering, needs manual fix
```

### CRITICAL: Generate Asset Manifest & Registry

**After extracting all assets, generate these files to prevent assets being forgotten during component generation:**

#### 1. Asset Manifest (`public/{flow}-assets/manifest.json`)

```json
{
  "generatedAt": "2024-01-15T10:30:00Z",
  "basePath": "/plaid-assets",
  "assets": {
    "plaid-logo": {
      "file": "plaid-logo.svg",
      "path": "/plaid-assets/plaid-logo.svg",
      "type": "svg",
      "dimensions": { "width": 120, "height": 40 },
      "screens": ["welcome"],
      "status": "verified"
    },
    "flagstar-logo": {
      "file": "flagstar-logo.png",
      "path": "/plaid-assets/flagstar-logo.png",
      "type": "png",
      "dimensions": { "width": 80, "height": 32 },
      "screens": ["select-bank", "credentials"],
      "status": "verified"
    },
    "close-icon": {
      "file": "close-icon.svg",
      "path": "/plaid-assets/close-icon.svg",
      "type": "svg",
      "dimensions": { "width": 24, "height": 24 },
      "screens": ["welcome", "select-bank", "credentials", "success"],
      "status": "verified",
      "inline": true
    }
  }
}
```

#### 2. Asset Registry (`src/{flow}/assets.ts`)

```typescript
// Auto-generated asset registry - DO NOT EDIT MANUALLY
// Generated from: public/plaid-assets/manifest.json

export const assets = {
  plaidLogo: '/plaid-assets/plaid-logo.svg',
  flagstarLogo: '/plaid-assets/flagstar-logo.png',
  closeIcon: '/plaid-assets/close-icon.svg',
  successCheck: '/plaid-assets/success-check.svg',
  bankIllustration: '/plaid-assets/bank-illustration.png',
} as const;

export type AssetKey = keyof typeof assets;

// Inline SVGs (for icons that need color manipulation)
export const inlineSvgs = {
  closeIcon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>`,
} as const;
```

**Why this matters:** Without these files, the agent may "forget" downloaded assets when generating components later. The registry creates a concrete import that components MUST use.

Only proceed to Phase 4 after:
1. All critical assets pass verification (or are flagged as TODOs)
2. `manifest.json` is written
3. `assets.ts` registry is generated

---

## Phase 4: Generate Core Architecture

Generate these files FIRST (sequential, establishes structure):

### 4.1: Registry (`screens/registry.ts`)

- Export `ScreenProps` interface with `onNext`, `onBack`, `onClose` callbacks
- Export `Screen` interface with `id`, `title`, `component`
- Export `screens` array and `screenFlow` order
- Export helper functions: `getScreenById`, `getNextScreenId`, `getPrevScreenId`

### 4.2: Demo Page (`{Flow}DemoPage.tsx`)

**Must support direct screen access via URL params** for parallel verification:
```
/{flow}?screen={screenId}
```

- Read `?screen=` param to allow direct navigation
- Render current screen component with `onNext`/`onBack`/`onClose` handlers
- Wrap in DeviceFrame (if container mode requires it)
- Optional: sidebar showing all screens for easy navigation

### 4.3: DeviceFrame Component (if needed)

For `phone-frame` container mode, create iPhone 14 Pro frame:
- 390x844 viewport
- Black bezel with rounded corners
- Status bar (9:41, signal, wifi, battery)
- Dynamic Island

---

## Phase 5: Generate Screen Components (Parallel)

Once core architecture is in place, generate each screen component IN PARALLEL.

### CRITICAL: Read Asset Manifest First

**Before generating ANY component, read the asset manifest:**

```
1. Read `public/{flow}-assets/manifest.json`
2. For each screen, identify which assets it uses (from the `screens` field)
3. Import from the asset registry, NOT hardcoded paths
```

### Component Template

For each screen, create `screens/components/{ScreenName}.tsx`:

```typescript
import type { ScreenProps } from '../registry';
import { assets, inlineSvgs } from '../../assets';  // ALWAYS import from registry

export function WelcomeScreen({ onNext, onBack, onClose }: ScreenProps) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header with close button */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="p-2 active:scale-[0.97] transition-transform duration-100"
          dangerouslySetInnerHTML={{ __html: inlineSvgs.closeIcon }}
        />
      </div>

      {/* Content - use exact Tailwind classes from Figma */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <img
          src={assets.plaidLogo}  {/* USE REGISTRY, not hardcoded path */}
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

### Asset Usage Rules

| Asset Type | How to Use |
|------------|------------|
| Images (png/jpg) | `<img src={assets.assetName} />` |
| SVG files | `<img src={assets.assetName} />` |
| Inline SVGs (for color manipulation) | `dangerouslySetInnerHTML={{ __html: inlineSvgs.iconName }}` |

**NEVER hardcode asset paths.** Always import from `assets.ts`. This ensures:
1. Type safety (TypeScript will error if asset doesn't exist)
2. Single source of truth (paths defined once)
3. Assets can't be "forgotten" (import forces you to use what was extracted)

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

### Animation Curves

| Transition | Curve | Duration |
|------------|-------|----------|
| Navigation (push/pop) | `cubic-bezier(0.36, 0.66, 0.04, 1)` | 500ms |
| Modal (present/dismiss) | `cubic-bezier(0.32, 0.72, 0, 1)` | 500ms |
| Button press | `ease-out` | 100ms |

### Implementation

- **Forward nav:** Screen slides in from right (`translateX(100%) → 0`)
- **Back nav:** Screen slides out to right, previous screen from `translateX(-33%) → 0`
- **Button press:** `active:scale-[0.97] transition-transform duration-100`

Optionally add to Tailwind config: `'ios-spring': 'cubic-bezier(0.36, 0.66, 0.04, 1)'`

---

## Phase 7: Add Route

Add route to app router: `<Route path="/{flow}" element={<{Flow}DemoPage />} />`

---

## Phase 8: Visual Verification (Parallel)

Use the configured browser tool to verify each screen matches Figma pixel-perfect.

**If user chose "skip verification":** Skip this phase entirely, note in output summary.

### Browser Tool Options

| Tool | How to use |
|------|------------|
| `chrome` (default) | Use Claude in Chrome integration (`--chrome` flag or `/chrome` command) |
| `dev-browser` | Use the dev-browser skill for navigation and screenshots |
| `playwright` | Use the playwright skill for browser automation |
| `puppeteer` | Run puppeteer scripts via Bash |
| `skip` | Skip visual verification phase |

**Claude in Chrome** is the recommended option — it's built into Claude Code and provides:
- Direct browser control (navigate, click, type, scroll)
- Console log and network request reading
- Screenshot capture and GIF recording
- Tab management
- Works with your authenticated browser sessions

**Enabling Chrome:**
- If user started with `--chrome` flag: already enabled
- Otherwise: run `/chrome` command to enable within the session
- If Chrome extension not installed: prompt user to install from Chrome Web Store

**Before visual verification, check Chrome status:**
```
1. Run `/chrome` to check connection status
2. If not connected:
   - If extension missing → ask user to install
   - If can be enabled → the /chrome command will connect
3. Once connected, proceed with verification
```

**Using Claude in Chrome for verification:**

The `claude-in-chrome` MCP provides these tools (run `/mcp` → `claude-in-chrome` to see full list):

| Tool | Usage |
|------|-------|
| `mcp__claude-in-chrome__navigate` | Navigate to URL |
| `mcp__claude-in-chrome__screenshot` | Capture current page |
| `mcp__claude-in-chrome__click` | Click on element |
| `mcp__claude-in-chrome__fill` | Fill input field |
| `mcp__claude-in-chrome__scroll` | Scroll the page |
| `mcp__claude-in-chrome__resize` | Set viewport size |
| `mcp__claude-in-chrome__console` | Read console logs |

**Example verification workflow:**
```
1. mcp__claude-in-chrome__resize({ width: 390, height: 844 })
2. mcp__claude-in-chrome__navigate({ url: "http://localhost:5173/plaid?screen=welcome" })
3. Wait for load (check for network idle or specific element)
4. mcp__claude-in-chrome__screenshot({ path: "tmp/welcome.png" })
5. Compare against Figma screenshot
```

### IMPORTANT: Avoid Repeated Permission Prompts (for non-Chrome tools)

**Problem:** Each unique inline `<<'EOF'` script is a different command, requiring permission every time — even if `Bash(bun x tsx:*)` is allowed. This breaks autonomous flow.

**Why:** Claude Code permissions are "per project directory and command". Different heredoc content = different command = new permission prompt.

**Solution:** Write a reusable script file ONCE, then call it with arguments. Same command pattern = auto-approved after first run.

**Step 1:** At the start of Phase 8, create this script:

```typescript
// scripts/verify-screen.ts
import { connect, waitForPageLoad } from "@/client.js";

const [screenId, outputPath, baseUrl] = process.argv.slice(2);

const client = await connect();
const page = await client.page("main");

await page.goto(`${baseUrl}?screen=${screenId}`);
await waitForPageLoad(page);
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: outputPath });

await client.disconnect();
```

**Step 2:** Call with arguments (same command pattern each time):

```bash
# First call - requires permission
bun x tsx scripts/verify-screen.ts welcome tmp/welcome.png http://localhost:5173/plaid

# Subsequent calls - auto-approved (same script, different args)
bun x tsx scripts/verify-screen.ts select-bank tmp/select-bank.png http://localhost:5173/plaid
bun x tsx scripts/verify-screen.ts credentials tmp/credentials.png http://localhost:5173/plaid
```

**Why this works:** The command `bun x tsx scripts/verify-screen.ts` is the same each time. Claude Code recognizes it as the same executable with different arguments, so it reuses the permission from the first call.

**Iterating on the script:** If you need to change the verification logic (different selectors, wait times, click actions, etc.):
1. **Edit** `scripts/verify-screen.ts` using the Edit tool
2. **Re-run** the same command → still auto-approved (same command pattern)
3. Repeat as needed — no new permission prompts

**DO NOT:** Generate inline `<<'EOF'` scripts in a loop — each one prompts for permission.

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
