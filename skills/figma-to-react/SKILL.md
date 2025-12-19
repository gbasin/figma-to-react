---
name: figma-to-react
version: 1.4.0
description: Convert Figma screen flows into TypeScript React components. Extracts design context, downloads assets, and generates pixel-perfect components.
license: MIT
compatibility: Requires Figma MCP server (mcp__figma__*). React + Tailwind CSS project (Figma MCP outputs Tailwind classes).
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch mcp__figma__get_metadata mcp__figma__get_screenshot mcp__figma__get_design_context AskUserQuestion
---

# Figma to React

Convert Figma screen flows into TypeScript React components with local assets.

## Prerequisites: Hook Setup

This skill uses a PostToolUse hook to capture Figma MCP responses verbatim (bypassing LLM transcription).

**If installed as a plugin:** Hooks are auto-configured. Just restart Claude Code after installing.

**If using skill directly:** Add hook to `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__plugin_figma_figma__get_design_context",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'MARKER=\"/tmp/figma-skill-capture-active\"; OUTPUT_DIR=\"/tmp/figma-captures\"; if [ ! -f \"$MARKER\" ]; then cat > /dev/null; echo \"{\\\"decision\\\": \\\"allow\\\"}\"; exit 0; fi; INPUT=$(cat); mkdir -p \"$OUTPUT_DIR\"; NODE_ID=$(echo \"$INPUT\" | jq -r \".tool_input.nodeId // \\\"unknown\\\"\" 2>/dev/null | tr \":\" \"-\"); echo \"$INPUT\" | jq -r \".tool_response // empty\" > \"${OUTPUT_DIR}/figma-${NODE_ID}.txt\"; echo \"{\\\"decision\\\": \\\"allow\\\"}\"'"
          }
        ]
      }
    ]
  }
}
```

**Restart Claude Code** after configuring hooks.

The hook only activates when `/tmp/figma-skill-capture-active` marker exists, so it won't interfere with other Figma MCP usage.

## Step 1: Get Figma URL & Auto-Detect Configuration

### 1.1 Download Scripts

Download the processing scripts:

```bash
# Asset processing script
curl -sL "https://raw.githubusercontent.com/gbasin/figma-to-react/master/skills/figma-to-react/scripts/process-figma-assets.sh" -o /tmp/process-figma-assets.sh && chmod +x /tmp/process-figma-assets.sh

# Component creation script
curl -sL "https://raw.githubusercontent.com/gbasin/figma-to-react/master/skills/figma-to-react/scripts/create-component.sh" -o /tmp/create-component.sh && chmod +x /tmp/create-component.sh
```

Local paths (if running from plugin):
- `scripts/process-figma-assets.sh`
- `scripts/create-component.sh`

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

### 2.1 Arm the capture hook

```bash
touch /tmp/figma-skill-capture-active
mkdir -p /tmp/figma-captures
```

### 2.2 Call Figma MCP for each screen

For each screen node ID, call `mcp__figma__get_design_context(fileKey, nodeId)`.

The PostToolUse hook automatically captures each response verbatim to:
```
/tmp/figma-captures/figma-{nodeId}.txt
```

For example, nodeId `2006:2038` → `/tmp/figma-captures/figma-2006-2038.txt`

**Parallelization:** These calls are independent — extract all screens in parallel for faster processing.

### 2.3 Verify captures and disarm hook

```bash
# Verify all screens were captured
for NODE_ID in "2006-2038" "2006-2062" "2006-2075"; do
  if [ -f "/tmp/figma-captures/figma-${NODE_ID}.txt" ]; then
    echo "✓ Captured: $NODE_ID"
  else
    echo "✗ Missing: $NODE_ID"
  fi
done

# Disarm the hook
rm /tmp/figma-skill-capture-active
```

**Verify completeness** of captured files:
```bash
# Should output nothing if all files are complete
for f in /tmp/figma-captures/figma-*.txt; do
  grep -q "export default function\|export function" "$f" || echo "INCOMPLETE: $f"
done
```

If any files are incomplete, re-arm the hook and re-fetch from Figma MCP.

### 2.4 Copy to numbered files for asset processing

```bash
# Copy captured files to numbered format expected by asset script
i=1
for NODE_ID in "2006-2038" "2006-2062" "2006-2075"; do
  cp "/tmp/figma-captures/figma-${NODE_ID}.txt" "/tmp/flow-screen-${i}.txt"
  i=$((i + 1))
done
```

The captured response includes:
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

Check the asset directory for generic names and rename to meaningful ones.

**IMPORTANT:** Use the **Component descriptions** from the Figma MCP response to identify assets. These are at the end of the captured response and provide reliable naming hints:

```
## x
**Node ID:** 3:439
Source: boxicons --- 🔎 icon, x, close

## arrow-back
**Node ID:** 3:441
Source: boxicons --- 🔎 icon, arrow, back

## car
**Node ID:** 2006:1961
Source: boxicons --- 🔎 icon, car, driver's license
```

**Do NOT** try to interpret SVG path data - it's unreliable. Use component descriptions.

| Generic | → | Meaningful |
|---------|---|------------|
| `img.svg` | → | `x-close.svg` (from description: "x, close") |
| `img-1.svg` | → | `arrow-back.svg` (from description: "arrow, back") |
| `img-2.svg` | → | `car.svg` (from description: "car, driver's license") |

To identify what an asset is:
1. **Primary:** Check Component descriptions at end of Figma MCP response
2. **Secondary:** Look at `alt` attributes in the JSX (e.g., `alt="Close"`)
3. **Fallback:** Look at context where it's used (e.g., "Navigation Bar" → nav icons)

After renaming, update references in the `.out.txt` files:
```bash
# Example: rename img.svg to x-close.svg
mv public/assets/img.svg public/assets/x-close.svg
sed -i '' 's|/assets/img.svg|/assets/x-close.svg|g' /tmp/flow-screen-*.out.txt
```

## Step 5: Generate Components

Component generation uses a **two-phase approach** to ensure verbatim code:

### Phase 1: Create base components (bash - no LLM transcription)

Use the `create-component.sh` script to transform .out.txt files into component files:

```bash
# Download script (or use local if running from plugin)
curl -sL "https://raw.githubusercontent.com/gbasin/figma-to-react/master/skills/figma-to-react/scripts/create-component.sh" -o /tmp/create-component.sh && chmod +x /tmp/create-component.sh

# Create each component
/tmp/create-component.sh /tmp/flow-screen-1.out.txt DocumentSelectScreen src/onfido/screens/DocumentSelectScreen.tsx
/tmp/create-component.sh /tmp/flow-screen-2.out.txt CaptureScreen src/onfido/screens/CaptureScreen.tsx
/tmp/create-component.sh /tmp/flow-screen-3.out.txt SuccessScreen src/onfido/screens/SuccessScreen.tsx
```

The script:
- Adds `import type { ScreenProps } from '../registry';`
- Changes `export default function X()` to `export function ComponentName({ onNext, onBack, onClose }: ScreenProps)`
- Keeps **ALL JSX verbatim** - no simplification

Derive component names from `data-name` attribute: `"Document / Small 1"` → `DocumentSelectScreen`

### Phase 2: Wire up interactivity (LLM edit pass)

After base components are created, use the **Edit tool** to add:

1. **onClick handlers** - Find navigation elements and add handlers:
   - Back arrows → `onClick={onBack}`
   - X/close icons → `onClick={onClose}`
   - CTAs/buttons → `onClick={onNext}`

2. **Form state** - Add useState for interactive elements:
   ```typescript
   const [selected, setSelected] = useState<string | null>(null);
   ```

3. **Cursor styles** - Add `cursor-pointer` to clickable elements

**IMPORTANT:** Use targeted Edit tool calls on specific lines. Do NOT rewrite entire files.

**Parallelization:** Phase 1 (bash) can run for all screens. Phase 2 edits are independent per screen.

**Resilience:** Phase 1 creates files immediately. If context compaction occurs, check which files exist before Phase 2.

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

### Extraction Flow (Hook-Based)

```
1. Arm hook: touch /tmp/figma-skill-capture-active
2. Call get_design_context for each screen → hook captures to /tmp/figma-captures/figma-{nodeId}.txt
3. Verify captures, disarm hook: rm /tmp/figma-skill-capture-active
4. Copy to numbered files: /tmp/flow-screen-{i}.txt
5. Run: /tmp/process-figma-assets.sh {assetDir} {urlPrefix} screen1.txt screen2.txt ...
6. Output: flow-screen-{i}.out.txt with local asset paths
7. Rename generic assets using Component Descriptions (not SVG interpretation)
8. Run: /tmp/create-component.sh {input.out.txt} {ComponentName} {output.tsx}
9. Edit pass: Add onClick handlers and useState for interactivity
```

### Scripts

| Script | Purpose |
|--------|---------|
| `process-figma-assets.sh` | Download assets, dedupe, transform URLs to local paths |
| `create-component.sh` | Transform .out.txt to component file (verbatim, no LLM) |
| `capture-figma-response.sh` | PostToolUse hook for verbatim MCP capture |

### Key Rules

- Never use Figma asset URLs in generated code (must be local paths)
- Deduplicate assets by content hash (Figma generates unique URLs per request)
- Detect actual file type with `file` command (don't trust extensions)
- Rename assets using Component Descriptions from Figma MCP (not SVG path interpretation)
- Hook captures ensure verbatim code - do not simplify or restructure JSX
