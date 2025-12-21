# Step 7: Validate Screens

Compare rendered components to Figma screenshots. Loop until visual diff ≤ 5%.

## Prerequisites

- ImageMagick: `brew install imagemagick`
- Playwright: `pnpm add -D playwright && npx playwright install chromium`
- Dev server running: `pnpm dev`
- Preview route created (step 6)

## Scripts

### capture-screenshot.ts

Captures rendered component using headless Playwright.

```bash
npx tsx scripts/capture-screenshot.ts <url> <output.png> [width] [height]

# Example:
npx tsx scripts/capture-screenshot.ts \
  "http://localhost:5173/figma-preview?screen=Login" \
  /tmp/figma-to-react/rendered-Login.png
```

### validate-visual.sh

Compares two images using ImageMagick RMSE. Outputs diff percentage to stdout.

```bash
./scripts/validate-visual.sh <figma.png> <rendered.png>

# Example:
DIFF=$(./scripts/validate-visual.sh \
  /tmp/figma-to-react/figma-123.png \
  /tmp/figma-to-react/rendered-Login.png)
echo "Diff: ${DIFF}%"
# Output: Diff: 3.45%
```

**Output files** in `/tmp/figma-to-react/validation/{timestamp}/`:
- `figma.png` - Reference image
- `rendered.png` - Captured render
- `diff.png` - Heatmap (brighter = more different)

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

    LOOP:

    1. GET FIGMA SCREENSHOT
       mcp__plugin_figma_figma__get_screenshot(nodeId: "{nodeId}")
       Save to: /tmp/figma-to-react/figma-{nodeId}.png

    2. CAPTURE RENDERED
       npx tsx {capture} "{previewUrl}" /tmp/figma-to-react/rendered-{ComponentName}.png

    3. VALIDATE
       DIFF=$({validate} /tmp/figma-to-react/figma-{nodeId}.png /tmp/figma-to-react/rendered-{ComponentName}.png)
       echo "Current diff: ${DIFF}%"

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

    7. LOOP to step 2

    MAX: 10 iterations. Report final diff % if still above 5%.

    RETURN: status, final diff %, list of fixes
  """
)
```

## Run Sequentially

Each validation needs the dev server. Run one screen at a time to avoid port conflicts.

## Interpreting Diff Heatmap

- **Black**: Pixels match
- **Gray**: Minor differences
- **Bright/white**: Significant differences

Fix brightest areas first for maximum impact.

## Next Step

Read step-8-rename-assets.md.
