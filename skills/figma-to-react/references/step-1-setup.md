# Step 1: Setup

Prepare the environment and install required tools.

## Install Tools

```bash
# ImageMagick for visual comparison
brew install imagemagick

# Playwright for screenshot capture
pnpm add -D playwright && npx playwright install chromium
```

## Arm the Capture Hook

```bash
# Clean up any previous run
rm -rf /tmp/figma-to-react

# Arm the hook
mkdir -p /tmp/figma-to-react/captures
touch /tmp/figma-to-react/capture-active
```

## What This Does

**Tool installations:**
- ImageMagick provides the `magick` CLI for image comparison (used in step 6)
- Playwright enables headless screenshot capture of rendered components

**Capture hook:**
The PostToolUse hook watches for Figma MCP calls. When the marker file exists:
- Captures full response to `/tmp/figma-to-react/captures/figma-{nodeId}.txt`
- Suppresses raw output from Claude's context (saves ~50KB per screen)
- Shows brief confirmation: "Captured to figma-{nodeId}.txt"

Without the marker file, Figma MCP works normally (useful for debugging).

**Recovery files (created in step 3):**
- `input.txt` - Raw Figma links from user (one per line)
- `config.json` - Confirmed output paths

These enable recovery if context is compacted during a multi-screen job.

## Next Step

Mark this step complete. Read step-2-detect-structure.md.
