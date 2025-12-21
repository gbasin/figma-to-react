# Step 7: Validate Screens

Compare rendered components to Figma screenshots. Loop until visual diff ≤ 5%.

## Prerequisites

- Dev server running: `pnpm dev`
- Preview route created (step 6)
- Tools installed (step 1): ImageMagick, Playwright

## Scripts

### capture-screenshot.ts

Captures the component element at its natural size using Playwright. The preview route wraps components in `<div data-figma-component>`, and this script screenshots that element directly—no viewport math needed.

```bash
npx tsx scripts/capture-screenshot.ts <url> <output.png>

# Example:
npx tsx scripts/capture-screenshot.ts \
  "http://localhost:5173/figma-preview?screen=Login" \
  /tmp/figma-to-react/rendered-Login.png
```

### validate-visual.sh

Compares two images using ImageMagick RMSE. Outputs diff percentage to stdout.

```bash
./scripts/validate-visual.sh <figma.png> <rendered.png> [component] [pass]

# Example:
DIFF=$(./scripts/validate-visual.sh \
  /tmp/figma-to-react/figma-123.png \
  /tmp/figma-to-react/rendered-Login.png \
  LoginScreen 1)
echo "Diff: ${DIFF}%"
# Output: Diff: 3.45%
```

**Output files** in `/tmp/figma-to-react/validation/{component}/`:
- `figma.png` - Reference image (copied once)
- `pass-1/`, `pass-2/`, etc:
  - `rendered.png` - Captured render for that pass
  - `diff.png` - Heatmap (brighter = more different)

**Dimension check**: The script logs whether dimensions match. With the fixed-dimension wrapper from step 6 (using dimensions from `/tmp/figma-to-react/component-metadata.json`), dimensions should match automatically. If you see a `"WARNING: Dimension mismatch"`, check that the preview route has the correct dimensions set.

## Validation Loop

Target: **≤ 5% diff**

For each screen, spawn a sub-agent that loops until target is met:

```
Task(
  subagent_type: "general-purpose",
  prompt: """
    Validate and fix component until visual diff ≤ 5%.

    INPUTS:
    - nodeId: "{nodeId}"
    - componentPath: "{componentPath}"
    - componentName: "{ComponentName}"
    - previewUrl: "http://localhost:5173/figma-preview?screen={ComponentName}"

    SCRIPTS (relative to figma-to-react repo):
    - capture: skills/figma-to-react/scripts/capture-screenshot.ts
    - validate: skills/figma-to-react/scripts/validate-visual.sh

    LOOP (track pass number starting at 1):

    1. GET FIGMA SCREENSHOT (only on first pass)
       Use whichever Figma MCP server is available:
       - mcp__plugin_figma_figma__get_screenshot (web - requires auth, uses fileKey)
       - mcp__plugin_figma_figma-desktop__get_screenshot (desktop - uses active tab)

       Parameters: nodeId: "{nodeId}", fileKey: "{fileKey}" (web only)
       Save to: /tmp/figma-to-react/figma-{nodeId}.png

    2. CAPTURE RENDERED
       npx tsx {capture} "{previewUrl}" /tmp/figma-to-react/rendered-{ComponentName}.png

    3. VALIDATE
       DIFF=$({validate} /tmp/figma-to-react/figma-{nodeId}.png /tmp/figma-to-react/rendered-{ComponentName}.png {ComponentName} $PASS)
       echo "Pass $PASS diff: ${DIFF}%"

    4. CHECK RESULT
       If DIFF ≤ 5: Done, return success
       If DIFF > 5: Continue to step 5

    5. ANALYZE DIFF
       Read the diff.png heatmap. Bright areas = differences.
       Common issues:
       - h-[200%] or w-[200%] on images → wrong
       - Negative positioning with overflow-clip
       - Extreme percentages (>150%)
       - Wrong colors/backgrounds
       - Font weight or alignment

    6. FIX COMPONENT
       Edit {componentPath} to fix the brightest diff area.

    7. INCREMENT PASS and loop to step 2

    MAX: 10 passes. Report final diff % if still above 5%.

    RETURN: status, final diff %, list of fixes
  """
)
```

## Run in Parallel

Spawn all validation sub-agents simultaneously. Each uses its own preview URL (`?screen=ComponentName`) on the shared dev server—no conflicts.

## Interpreting Diff Heatmap

- **Black**: Pixels match
- **Gray**: Minor differences
- **Bright/white**: Significant differences

Fix brightest areas first for maximum impact.

## Next Step

Read step-8-rename-assets.md.
