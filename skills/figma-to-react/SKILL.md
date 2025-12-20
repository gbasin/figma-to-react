---
name: figma-to-react
version: 1.0.0
description: Convert Figma designs to pixel-perfect React components. Auto-extracts design tokens, downloads assets, and outputs production-ready code.
license: MIT
compatibility: Requires Figma MCP server (mcp__figma__*). React + Tailwind CSS project.
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch mcp__plugin_figma_figma__get_metadata mcp__plugin_figma_figma__get_screenshot mcp__plugin_figma_figma__get_design_context mcp__plugin_figma_figma-desktop__get_metadata mcp__plugin_figma_figma-desktop__get_screenshot mcp__plugin_figma_figma-desktop__get_design_context AskUserQuestion
---

# Figma to React

Convert Figma designs to pixel-perfect React components with Tailwind CSS.

## How It Works

1. **Figma MCP** outputs React/TSX with Tailwind classes + temporary asset URLs
2. **This skill** extracts design tokens, downloads assets, and outputs ready-to-use components
3. **CSS variables** make the MCP output work directly (no manual code editing)

---

## AI-Assisted Workflow

When the user invokes this skill, follow this workflow:

### 1. Detect Project Structure

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

### 2. Confirm Configuration with User

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

### 3. AI-Powered Naming

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

### 4. Process with Confirmed Settings

**Parse Figma URL** to extract fileKey and nodeId:
```
https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
```

**Run the pipeline:**

```bash
# Arm capture hook
touch /tmp/figma-skill-capture-active
mkdir -p /tmp/figma-captures
```

Call MCP (use `figma-desktop` variant if rate limited):
```
mcp__plugin_figma_figma__get_design_context(
  fileKey: "abc123",
  nodeId: "237:2571",
  clientFrameworks: "react",
  clientLanguages: "typescript"
)
```

The hook auto-saves response to `/tmp/figma-captures/figma-{nodeId}.txt`

**Process captured response:**

Scripts are in `./scripts/` relative to this SKILL.md. Use the absolute path based on where you loaded this file.

```bash
# Example (replace SKILL_DIR with actual path to this skill's directory):
$SKILL_DIR/scripts/process-figma.sh \
  /tmp/figma-captures/figma-237-2571.txt \
  src/components/MotionCaptureScreen.tsx \
  public/figma-assets \
  /figma-assets \
  src/styles/figma-tokens.css

# Disarm hook
rm /tmp/figma-skill-capture-active
```

**For multiple screens:** Loop over node IDs. Tokens merge automatically, assets deduplicate by content hash.

```bash
for node in "237-2571" "237-2572" "237-2573"; do
  $SKILL_DIR/scripts/process-figma.sh \
    /tmp/figma-captures/figma-${node}.txt \
    src/components/${COMPONENT_NAME}.tsx \
    public/figma-assets \
    /figma-assets \
    src/styles/figma-tokens.css
done
```

**One-time setup:** Import tokens in main CSS:
```css
/* src/index.css */
@import "./styles/figma-tokens.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 5. AI Asset Renaming (Optional)

After processing, offer to rename generic assets:

```
Found 12 assets with generic names. Analyze and rename?

Current → Suggested:
  asset.svg      → close-icon.svg (X shape, likely close button)
  asset-1.svg    → back-arrow.svg (left-pointing arrow)
  image.png      → face-capture-bg.png (blurred face photo)

Apply renames? [Y/n/select]
```

---

## Prerequisites

### Hook Setup (Auto-captures MCP responses)

**If installed as a plugin:** Hooks are auto-configured. Restart Claude Code after installing.

**If using skill directly:** Add to `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "mcp__plugin_figma_figma__get_design_context",
        "hooks": [{ "type": "command", "command": "~/.claude/skills/figma-to-react/hooks/capture-figma-response.sh" }]
      },
      {
        "matcher": "mcp__plugin_figma_figma-desktop__get_design_context",
        "hooks": [{ "type": "command", "command": "~/.claude/skills/figma-to-react/hooks/capture-figma-response.sh" }]
      }
    ]
  }
}
```

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

### Hook not capturing

**Cause:** Marker file missing or hook not configured.

**Fix:**
```bash
# Ensure marker exists
touch /tmp/figma-skill-capture-active

# Check hook is configured
cat ~/.claude/settings.json | grep figma
```

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
