---
name: figma-to-react
version: 2.1.0
description: Convert Figma designs to pixel-perfect React components. Auto-extracts design tokens, downloads assets, and outputs production-ready code.
license: MIT
compatibility: Requires Figma MCP server (mcp__figma__*). React + Tailwind CSS project.
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch mcp__plugin_figma_figma__get_metadata mcp__plugin_figma_figma__get_screenshot mcp__plugin_figma_figma__get_design_context mcp__plugin_figma_figma-desktop__get_metadata mcp__plugin_figma_figma-desktop__get_screenshot mcp__plugin_figma_figma-desktop__get_design_context AskUserQuestion
---

# Figma to React

Convert Figma designs to pixel-perfect React components with Tailwind CSS.

## How It Works

1. **Figma MCP** outputs React/TSX with Tailwind classes + temporary asset URLs
2. **PostToolUse hook** captures the response and suppresses raw output from context
3. **Processing script** extracts design tokens, downloads assets, outputs ready-to-use components
4. **Sub-agents** process each screen in isolation to keep parent context clean
5. **Visual validation** uses dev-browser to compare rendered output vs Figma screenshot, fixing MCP bugs

---

When the user invokes this skill, follow this workflow:

## 0. Arm the Capture Hook (FIRST THING)

**Do this immediately when the skill starts:**

```bash
touch /tmp/figma-skill-capture-active
mkdir -p /tmp/figma-captures
```

This ensures ALL Figma MCP calls have their output captured and suppressed from context. The hook will show "✅ Captured..." instead of 50KB of React code.

**Disarm when completely done** (after all screens processed):
```bash
rm /tmp/figma-skill-capture-active
```

## 1. Detect Project Structure

Scan the codebase to detect framework and conventions:

```bash
# Check package.json for framework
cat package.json | grep -E '"(react|next|vite|@vitejs)"'

# Find existing component directories
ls -d src/components/ components/ app/components/ 2>/dev/null

# Find existing style directories
ls -d src/styles/ styles/ src/css/ 2>/dev/null

# Find public/static asset directories
ls -d public/ static/ public/assets/ 2>/dev/null
```

## 2. Confirm Configuration with User

Before processing, confirm paths with the user:

```
Detected: Vite + React + Tailwind

Output paths (confirm or edit):
  Components: src/components/
  Assets:     public/figma-assets/
  Tokens:     src/styles/figma-tokens.css
  URL prefix: /figma-assets

Proceed? [Y/n/edit]
```

Use `AskUserQuestion` if the user wants to customize paths.

## 3. Naming

Figma frame names are often generic ("Frame 1", "Mobile 3"). Use AI analysis to generate meaningful names.

**For screens/components:**

1. Get screenshot: `mcp__plugin_figma_figma__get_screenshot(nodeId: "...")`
2. Analyze the screenshot visually
3. Generate a descriptive component name based on:
   - UI purpose (login, checkout, profile, etc.)
   - Key elements visible (form, list, modal, etc.)
   - Screen type (mobile, desktop, tablet)

**For assets without descriptions:**

1. After downloading assets, analyze each image
2. Generate names based on visual content:
   - Icons: `close-icon.svg`, `arrow-back.svg`, `menu-hamburger.svg`
   - Images: `hero-background.png`, `user-avatar.png`
   - Illustrations: `empty-state.svg`, `success-checkmark.svg`

**Example AI naming flow:**

```
Analyzing screen "237:2571"...
Screenshot shows: Motion capture UI with face outline, instruction text, camera frame

Suggested name: MotionCaptureScreen
  - Purpose: Identity verification face capture
  - Key elements: camera frame, instruction overlay, navigation bar

Use this name? [Y/n/custom]
```

## 4. Process Each Screen with Sub-Agent

**Parse Figma URL** to extract fileKey and nodeId:
```
https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
```

**Spawn a sub-agent for each screen** using the Task tool (hook is already armed from step 0):

```
Task(
  subagent_type: "general-purpose",
  prompt: """
    Process Figma screen for the figma-to-react skill.

    INPUTS:
    - fileKey: "abc123"
    - nodeId: "237:2571"
    - componentName: "MotionCaptureScreen"
    - componentPath: "src/components/MotionCaptureScreen.tsx"
    - assetDir: "public/figma-assets"
    - urlPrefix: "/figma-assets"
    - tokensFile: "src/styles/figma-tokens.css"
    - SKILL_DIR: "/path/to/skills/figma-to-react"

    STEPS:
    1. Call mcp__plugin_figma_figma__get_design_context(
         fileKey: "abc123",
         nodeId: "237:2571",
         clientFrameworks: "react",
         clientLanguages: "typescript"
       )

       The hook will:
       - Capture response to /tmp/figma-captures/figma-237-2571.txt
       - Suppress raw output (you'll see "✅ Captured..." message)

    2. Run the processing script:
       $SKILL_DIR/scripts/process-figma.sh \\
         /tmp/figma-captures/figma-237-2571.txt \\
         src/components/MotionCaptureScreen.tsx \\
         public/figma-assets \\
         /figma-assets \\
         src/styles/figma-tokens.css

    3. Return a summary: component path, asset count, any errors.
  """
)
```

**Why sub-agents?**
- Each Figma MCP response is ~50KB of React code
- Sub-agents keep this isolated from parent context
- Multiple screens can be processed in parallel
- Parent only sees the summary, not the raw code

**After all screens processed:** Continue to visual validation.

## 5. Visual Validation with Dev Browser

The Figma MCP sometimes generates incorrect CSS values (especially for images in clipped containers). Use dev-browser to validate.

**For each generated component:**

1. **Get Figma screenshot** (if not already captured):
   ```
   mcp__plugin_figma_figma__get_screenshot(nodeId: "237:2571")
   ```

2. **Start dev server** (if not running):
   ```bash
   pnpm dev  # or npm run dev
   ```

3. **Use dev-browser skill** to render and screenshot the component:
   ```
   /dev-browser
   Navigate to http://localhost:5173/component-preview
   Take a screenshot of the rendered component
   ```

4. **Compare visually** - Look for discrepancies:
   - Image positioning/cropping differences
   - Text alignment issues
   - Spacing/sizing mismatches

5. **Fix MCP bugs** - Common issues to check:
   - `h-[200%]` or `w-[200%]` on images → usually wrong, adjust based on visual
   - `top-[-30%]` with `overflow-clip` parents → check against screenshot
   - Absolute positioning with extreme percentages (>150%)

6. **Iterate** - Edit component, refresh browser, re-compare until pixel-perfect

**After validation complete:** Disarm the hook (see step 0) and do one-time setup.

**One-time setup:** Import tokens in main CSS:
```css
/* src/index.css */
@import "./styles/figma-tokens.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Prerequisites

### Hook (Auto-configured)

When installed as a plugin, the PostToolUse hook is automatically configured. The hook:

1. **Always captures** Figma MCP responses to `/tmp/figma-captures/`
2. **Conditionally suppresses** output when skill is active (marker file exists)

When the marker file `/tmp/figma-skill-capture-active` exists:
- Raw MCP output is hidden from Claude's context
- Claude sees: "✅ Captured to /tmp/... NEXT: run process-figma.sh"

When marker file does NOT exist (using Figma MCP directly):
- Normal MCP output is shown
- Capture still happens (useful for debugging)

## Script Reference

### process-figma.sh

Main processing script. Does everything in one command.

```bash
./process-figma.sh <input> <output> <asset-dir> <url-prefix> [tokens-file]
```

| Argument | Description |
|----------|-------------|
| `input` | Captured MCP response file |
| `output` | Output component path |
| `asset-dir` | Where to save downloaded assets |
| `url-prefix` | URL prefix for assets in code (e.g., `/assets`) |
| `tokens-file` | Optional. CSS tokens file (created/merged if provided) |

**What it does:**
1. Extracts design tokens → CSS variables file
2. Downloads assets with content-hash deduplication
3. Replaces Figma URLs with local paths
4. Outputs clean component file

### extract-tokens.sh

Standalone token extraction (usually called by process-figma.sh).

```bash
./extract-tokens.sh <input> <output-css>
```

### rename-assets.sh

Rename generic assets using component descriptions from MCP output.

```bash
./rename-assets.sh <captured-response> <asset-dir> <component-file>
```

Reads "Component descriptions" from MCP response and renames:
- `asset-abc123.svg` → `close-icon.svg` (from "x, close" description)
- `asset-def456.svg` → `arrow-back.svg` (from "arrow, back" description)

---

## Why CSS Variables?

The Figma MCP outputs code like:
```jsx
className="bg-[var(--background\/overlay,rgba(0,0,0,0.8))]"
```

This uses CSS variables with fallback values. Without the variables defined, Tailwind can't parse the class correctly.

**Our solution:** Extract variables from fallbacks and define them in CSS:
```css
:root {
  --background\/overlay: rgba(0,0,0,0.8);
}
```

Now the MCP output works directly - no code modification needed.

---

## Troubleshooting

### Classes not applying (transparent backgrounds)

**Cause:** CSS variables not defined or escaping issues.

**Fix:** Ensure tokens file is imported in your main CSS:
```css
@import "./styles/figma-tokens.css";
```

### Assets not loading

**Cause:** URL prefix doesn't match your static file serving.

**Fix:** Adjust `url-prefix` to match your setup:
- Vite with `public/`: use `/assets`
- Next.js: use `/assets` (files in `public/assets/`)
- Custom: match your static file route

### Rate limits on Figma MCP

**Cause:** Too many parallel requests to figma.com MCP.

**Fix:** Use `mcp__plugin_figma_figma-desktop__get_design_context` instead (requires Figma desktop app open with the file). No rate limits.

### Hook not suppressing output

**Cause:** Marker file missing (skill not armed).

**Fix:**
```bash
# Arm the skill before calling Figma MCP
touch /tmp/figma-skill-capture-active
```

### Hook not capturing at all

**Cause:** Plugin hooks not loaded (restart needed).

**Fix:**
1. Restart Claude Code to reload plugin hooks
2. Check `/tmp/figma-captures/` for captured files

---

## Example Output

```
src/
├── components/ 
│   └── OnfidoCapture.tsx    # Generated component
├── styles/
│   └── figma-tokens.css     # Design tokens
└── index.css                # Imports tokens

public/
└── figma-assets/
    ├── close-icon.svg
    ├── arrow-back.svg
    └── face-image.png
```

---

## Limitations

- **Fonts:** MCP uses font family names from Figma. You need to import/load the fonts separately.
- **Animations:** Static output only. Add animations manually if needed.
- **Interactivity:** No onClick handlers. Wire up interactivity after generation.
