---
name: figma-to-react
version: 2.0.0
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

## Quick Start

### Step 1: Get Figma URL

Get the frame URL from Figma:
```
https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
```

### Step 2: Download Scripts

```bash
curl -sL "https://raw.githubusercontent.com/gbasin/figma-to-react/master/skills/figma-to-react/scripts/process-figma.sh" -o /tmp/process-figma.sh && chmod +x /tmp/process-figma.sh
```

### Step 3: Arm Capture Hook

```bash
touch /tmp/figma-skill-capture-active
mkdir -p /tmp/figma-captures
```

### Step 4: Call Figma MCP

```
mcp__plugin_figma_figma__get_design_context(
  fileKey: "YOUR_FILE_KEY",
  nodeId: "123:456",
  clientFrameworks: "react",
  clientLanguages: "typescript"
)
```

The hook automatically saves the response to `/tmp/figma-captures/figma-{nodeId}.txt`

### Step 5: Process & Generate

```bash
/tmp/process-figma.sh \
  /tmp/figma-captures/figma-123-456.txt \
  src/components/MyScreen.tsx \
  public/figma-assets \
  /figma-assets \
  src/styles/figma-tokens.css
```

This single command:
- Downloads all assets (deduplicated by content hash)
- Extracts design tokens to CSS variables
- Outputs component with local asset paths

### Step 6: Import Tokens

Add to your main CSS (one-time setup):
```css
/* src/index.css */
@import "./styles/figma-tokens.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 7: Disarm Hook

```bash
rm /tmp/figma-skill-capture-active
```

Done! Your component is ready at `src/components/MyScreen.tsx`

---

## Multi-Screen Flows

For flows with multiple screens:

### 1. Arm hook and capture all screens

```bash
touch /tmp/figma-skill-capture-active
mkdir -p /tmp/figma-captures
```

Call `get_design_context` for each screen (can be parallel if no rate limits).

### 2. Process all screens

```bash
# Process each screen
for node in "237-2571" "237-2572" "237-2573"; do
  /tmp/process-figma.sh \
    /tmp/figma-captures/figma-${node}.txt \
    src/screens/Screen${node}.tsx \
    public/assets \
    /assets \
    src/styles/figma-tokens.css
done
```

Tokens are merged automatically - run on any/all screens, same result.

### 3. Rename components

```bash
# Rename exports to meaningful names
sed -i '' 's/export default function [A-Za-z0-9_]*/export default function WelcomeScreen/' src/screens/Screen237-2571.tsx
mv src/screens/Screen237-2571.tsx src/screens/WelcomeScreen.tsx
```

---

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

## Comparison: Old vs New Approach

| Old (v1.x) | New (v2.0) |
|------------|------------|
| Strip CSS vars, use fallbacks | Define CSS vars from fallbacks |
| Complex escaping workarounds | MCP output works directly |
| Multiple processing steps | Single `process-figma.sh` command |
| Manual checkpoint verification | Automatic processing |

---

## Limitations

- **Fonts:** MCP uses font family names from Figma. You need to import/load the fonts separately.
- **Animations:** Static output only. Add animations manually if needed.
- **Interactivity:** No onClick handlers. Wire up interactivity after generation.
