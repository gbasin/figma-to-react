# Step 4b: Validate Dimension Coverage

Check that all collapse-prone elements have dimensions in the metadata. Prompt user for any missing values.

> **Note:** All code blocks in this document are **examples only**. Use the actual node IDs, file paths, and element names from the current conversion at runtime.

## Pre-flight Check

```bash
$SKILL_DIR/scripts/status.sh --check 4b
```

If this fails, it prints the correct step. Uncheck wrongly-completed TodoWrite items and read that step file instead.

## Why This Step

The MCP metadata may not include dimensions for all node IDs in the generated TSX, especially:
- Nested component instances (IDs like `I237:2572;2708:1961`)
- Elements from component libraries
- Deeply nested frames

Without dimensions, `fix-collapsed-containers.sh` can't fix elements that collapse due to absolute-positioned children.

## Multi-Screen: Detect Shared Components First

When converting **2+ screens**, run shared component detection BEFORE asking about any dimensions:

```bash
bun $SKILL_DIR/scripts/find-shared-components.ts \
  /tmp/figma-to-react/captures/figma-*.txt
```

**Output example:**
```json
{
  "shared": [
    {
      "definitionId": "2708:1961",
      "name": "exit button",
      "instances": [
        {"instanceId": "I237:2417;2708:1961", "screen": "237:2416"},
        {"instanceId": "I237:2572;2708:1961", "screen": "237:2571"}
      ]
    }
  ],
  "total_shared": 15
}
```

Save this output. When handling missing dimensions below:
- **Shared components** → ask ONCE, apply to ALL instances across ALL screen JSONs
- **Screen-specific** → ask and apply per-screen as normal

To check if a missing element is shared:
1. Extract definition ID from instance ID (last segment after `;`)
2. Check if that definition ID is in the shared list

**Skip this section for single-screen conversions.**

## Use the Preview

The preview (step 3b) is available at:
- **Vite**: `/figma-preview.html?screen={ComponentName}`
- **Next.js**: `/figma-preview?screen={ComponentName}`

When asking the user about missing dimensions, remind them they can check the preview
to see how elements currently render before deciding on dimensions.

## For Each Generated Screen

Run the validation script and **save output** for status.sh tracking:

```bash
mkdir -p /tmp/figma-to-react/steps/4b

# For each screen, save validation output
$SKILL_DIR/scripts/validate-dimensions-coverage.sh \
  /tmp/figma-to-react/captures/figma-{nodeId}.txt \
  /tmp/figma-to-react/metadata/{nodeId}-dimensions.json \
  > /tmp/figma-to-react/steps/4b/{nodeId}.json
```

Replace `{nodeId}` with the actual node ID (e.g., `237-2571`).

**IMPORTANT:** The saved JSON is used by status.sh to track partial completion.

### Batch Processing (Multi-Screen)

For multi-screen conversions, validate all files at once using directory mode:

```bash
# Validate all captures against all metadata files
$SKILL_DIR/scripts/validate-dimensions-coverage.sh \
  /tmp/figma-to-react/captures/ \
  /tmp/figma-to-react/metadata/
```

Or specify multiple files explicitly:

```bash
# Validate specific screens
$SKILL_DIR/scripts/validate-dimensions-coverage.sh \
  /tmp/figma-to-react/captures/figma-237-2571.txt \
  /tmp/figma-to-react/captures/figma-237-2416.txt \
  /tmp/figma-to-react/metadata/
```

The script auto-matches capture files to dimension files by node ID (e.g., `figma-237-2571.txt` → `237-2571-dimensions.json`).

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

3. **Save decisions to disk** before applying - see [Save User Decisions](#save-user-decisions) below.

4. **For each non-skipped dimension**, run (substitute actual values):
   ```bash
   $SKILL_DIR/scripts/add-missing-dimensions.sh \
     /tmp/figma-to-react/metadata/{nodeId}-dimensions.json \
     "{element-id}" {width} {height}
   ```
   Replace `{nodeId}`, `{element-id}`, `{width}`, and `{height}` with the actual values.

   ### Batch Adding Dimensions

   **Multiple IDs to single file (same dimensions):**
   ```bash
   # Add 393x48 to multiple button IDs in one file
   $SKILL_DIR/scripts/add-missing-dimensions.sh \
     /tmp/figma-to-react/metadata/2006-2030-dimensions.json \
     393 48 \
     "I2006:2037;2189:5232" "I2006:2037;2190:6255" "I2006:2037;2189:5226;661:724"
   ```

   **Multiple files (same dimensions):**
   ```bash
   # Add 393x48 to IDs across multiple files
   $SKILL_DIR/scripts/add-missing-dimensions.sh 393 48 \
     --file /tmp/figma-to-react/metadata/2006-2062-dimensions.json "I2006:2073;2603:5160" "I2006:2073;2603:5161" \
     --file /tmp/figma-to-react/metadata/2006-2075-dimensions.json "I2006:2086;2603:5160" "I2006:2086;2603:5161" \
     --file /tmp/figma-to-react/metadata/237-2416-dimensions.json "I237:2428;2603:5160"
   ```

   **For shared components (multi-screen):** Apply to ALL instances across ALL screen JSONs using batch mode:
   ```bash
   # If "exit button" (definition 2708:1961) is 48x48, apply to both screens in one call:
   $SKILL_DIR/scripts/add-missing-dimensions.sh 48 48 \
     --file /tmp/figma-to-react/metadata/237-2416-dimensions.json "I237:2417;2708:1961" \
     --file /tmp/figma-to-react/metadata/237-2571-dimensions.json "I237:2572;2708:1961"
   ```

   **Note:** Manually-added dimensions get a `manual: true` flag in the JSON. This tells
   `fix-collapsed-containers.sh` to **aggressively replace** relative sizing classes
   (`h-full`, `w-full`, `h-auto`, `w-auto`, `h-fit`, `w-fit`) with explicit pixel values.

   Dimensions from Figma MCP (without the flag) use **conservative** behavior that preserves
   relative sizing classes, trusting the original design intent.

5. **Re-run fix-collapsed-containers.sh** if any dimensions were added (substitute actual paths):
   ```bash
   $SKILL_DIR/scripts/fix-collapsed-containers.sh \
     {componentPath} \
     /tmp/figma-to-react/metadata/{nodeId}-dimensions.json \
     > {componentPath}.tmp && mv {componentPath}.tmp {componentPath}
   ```
   Replace `{componentPath}` and `{nodeId}` with the actual values from the current conversion.

   ### Batch Fixing Collapsed Containers

   **Directory mode (auto-match files by node ID):**
   ```bash
   # Process all tsx files in output/ with matching dimensions in metadata/
   $SKILL_DIR/scripts/fix-collapsed-containers.sh \
     /path/to/output/ \
     /tmp/figma-to-react/metadata/
   ```
   Files are matched by finding the node ID in the tsx content (e.g., `PersonaScreen1.tsx` with `data-node-id="2006:2038"` matches `2006-2038-dimensions.json`).

   **Multiple pairs mode:**
   ```bash
   # Fix multiple specific file pairs
   $SKILL_DIR/scripts/fix-collapsed-containers.sh \
     --pair /path/to/PersonaScreen1.tsx /tmp/figma-to-react/metadata/2006-2038-dimensions.json \
     --pair /path/to/PersonaScreen2.tsx /tmp/figma-to-react/metadata/2006-2062-dimensions.json \
     --pair /path/to/PersonaScreen3.tsx /tmp/figma-to-react/metadata/2006-2075-dimensions.json
   ```
   Batch modes fix files **in-place** (no stdout redirection needed).

## Skip Conditions

- If `critical_missing` is 0, no user interaction needed
- Some elements may render correctly despite being flagged (false positives)

## Many Missing Dimensions (>5)

If many elements are flagged, **still ask the user** - don't decide for them:

```
AskUserQuestion(questions: [
  {
    question: "21 collapse-prone elements found. How to proceed?",
    header: "Dimensions",
    options: [
      {label: "Skip all", description: "Proceed to visual validation - fix issues there if any"},
      {label: "Show me the list", description: "I'll pick which ones to fix"},
      {label: "Fix common patterns", description: "Auto-fix buttons (48x48), icons (24x24)"}
    ]
  }
])
```

**Never skip silently.** The user should always make the call.

## Save User Decisions

Save decisions to disk **before** applying them. This protects against compaction—if
context is summarized between asking and applying, specific dimension values would be lost.
Since `add-missing-dimensions.sh` is idempotent, recovery just means re-applying all
non-skip decisions from the saved file.

```bash
# EXAMPLE STRUCTURE - use actual IDs and decisions from current job:
cat > /tmp/figma-to-react/steps/4b/user-decisions.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "total_missing": ${TOTAL_MISSING},
  "addressed_ids": [
    "${ID_1}",
    "${ID_2}",
    "${ID_3}"
  ],
  "decisions": [
    {"id": "${ID_1}", "action": "48x48", "width": 48, "height": 48},
    {"id": "${ID_2}", "action": "skip"},
    {"id": "${ID_3}", "action": "48x48", "width": 48, "height": 48}
  ]
}
EOF
```

Replace `${...}` placeholders with actual values from the validation output and user responses.

`addressed_ids` must include ALL IDs from ALL validation JSONs:
- If 10 missing dimensions were found across all screens, all 10 must appear
- If you only ask about some, status.sh will detect incomplete and bounce you back
- "skip" counts as addressed

### Partial Completion / Recovery

If resuming after compaction, check `user-decisions.json` first. If it exists, re-apply
all non-skip decisions (idempotent). If not, re-ask the user.

If status.sh says you're still on step 4b:
1. Read `next_action` field for remaining count
2. Diff validation JSONs against `addressed_ids` to find remaining IDs
3. Ask user about remaining, append to user-decisions.json

## Next Step

Mark this step complete. Read step-5-import-tokens.md.
