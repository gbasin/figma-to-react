# Step 4b: Validate Dimension Coverage

Check that all collapse-prone elements have dimensions in the metadata. Prompt user for any missing values.

> **Note:** All code blocks in this document are **examples only**. Use the actual node IDs, file paths, and element names from the current conversion at runtime.

## Why This Step

The MCP metadata may not include dimensions for all node IDs in the generated TSX, especially:
- Nested component instances (IDs like `I237:2572;2708:1961`)
- Elements from component libraries
- Deeply nested frames

Without dimensions, `fix-collapsed-containers.sh` can't fix elements that collapse due to absolute-positioned children.

## For Each Generated Screen

Run the validation script with the actual node ID from the current conversion:

```bash
SKILL_DIR=$(dirname "$(dirname "$0")")
$SKILL_DIR/scripts/validate-dimensions-coverage.sh \
  /tmp/figma-to-react/captures/figma-{nodeId}.txt \
  /tmp/figma-to-react/metadata/{nodeId}-dimensions.json
```

Replace `{nodeId}` with the actual node ID (e.g., `237-2571`).

The script outputs JSON with any missing dimensions (example output):

```json
{
  "missing": [
    {"id": "I237:2572;2708:1961;2026:14620", "name": "padding"},
    {"id": "I237:2583;2603:5165", "name": "footer"}
  ],
  "critical_missing": 2
}
```

## If Missing Dimensions Found

1. **Show the user** what's missing with friendly names (example format):
   ```
   Found 3 elements that may need dimensions:
   1. padding (exit button) - I237:2572;2708:1961;2026:14620
   2. padding (back button) - I237:2572;2708:1962;2026:14620
   3. footer - I237:2583;2603:5165
   ```

2. **Ask about EACH element separately** using AskUserQuestion with multiple questions.
   Build the questions array from the actual missing elements. Example structure:
   ```
   AskUserQuestion(questions: [
     {
       question: "Dimensions for 'padding' in exit button?",
       header: "Exit btn",
       options: [
         {label: "48 x 48", description: "Square button"},
         {label: "Skip", description: "Don't fix"}
       ]
     },
     {
       question: "Dimensions for 'padding' in back button?",
       header: "Back btn",
       options: [
         {label: "48 x 48", description: "Square button"},
         {label: "Skip", description: "Don't fix"}
       ]
     },
     {
       question: "Dimensions for 'footer'?",
       header: "Footer",
       options: [
         {label: "Skip", description: "Likely doesn't need fixing"},
         {label: "393 x 32", description: "Full width footer"}
       ]
     }
   ])
   ```

   Tips for options:
   - Suggest common sizes based on element name (buttons often 48x48, footers often full-width)
   - Always include "Skip" option
   - Include "Let me check Figma" if unsure what to suggest

3. **For each non-skipped dimension**, run (substitute actual values):
   ```bash
   $SKILL_DIR/scripts/add-missing-dimensions.sh \
     /tmp/figma-to-react/metadata/{nodeId}-dimensions.json \
     "{element-id}" {width} {height}
   ```
   Replace `{nodeId}`, `{element-id}`, `{width}`, and `{height}` with the actual values.

   **Note:** Manually-added dimensions get a `manual: true` flag in the JSON. This tells
   `fix-collapsed-containers.sh` to **aggressively replace** relative sizing classes
   (`h-full`, `w-full`, `h-auto`, `w-auto`, `h-fit`, `w-fit`) with explicit pixel values.

   Dimensions from Figma MCP (without the flag) use **conservative** behavior that preserves
   relative sizing classes, trusting the original design intent.

4. **Re-run fix-collapsed-containers.sh** if any dimensions were added (substitute actual paths):
   ```bash
   $SKILL_DIR/scripts/fix-collapsed-containers.sh \
     {componentPath} \
     /tmp/figma-to-react/metadata/{nodeId}-dimensions.json \
     > {componentPath}.tmp && mv {componentPath}.tmp {componentPath}
   ```
   Replace `{componentPath}` and `{nodeId}` with the actual values from the current conversion.

## Skip Conditions

- If `critical_missing` is 0, no user interaction needed
- User can say "skip all" to proceed without fixing
- Some elements may render correctly despite being flagged (false positives)

## Next Step

Mark this step complete. Read step-5-import-tokens.md.
