# Step 6: Validate Screens

Compare rendered components to Figma screenshots. Fix until visual diff ≤ 5%.

## Pre-flight Check

```bash
$SKILL_DIR/scripts/status.sh --check 6
```

If this fails, it prints the correct step. Uncheck wrongly-completed TodoWrite items and read that step file instead.

## Prerequisites

- Dev server running (started in step 3b)
- Preview created (step 3b)
- Figma screenshots captured
- Bun installed (step 1)

## Preview URL Format

The preview URL depends on framework (from step 3b):

- **Vite**: `http://localhost:{port}/figma-preview.html?screen={ComponentName}`
- **Next.js**: `http://localhost:{port}/figma-preview?screen={ComponentName}`

## Script: validate-component.sh

Runs one validation pass. Captures screenshot, compares, returns status.

```bash
$SKILL_DIR/scripts/validate-component.sh \
  <component> <figma-png> <preview-url> <component-path> [prev-diff]
```

**Exit codes:**
| Code | Status | Action |
|------|--------|--------|
| 0 | `success` | Done - diff ≤ 5% |
| 1 | `needs_fix` | Make ONE fix, re-run with new diff as prev-diff |
| 2 | `good_enough` | Done - diff ≤ 1% |
| 5 | `max_passes` | Done - 10 passes reached, accept current state |
| 6 | `no_improvement` | Change was reverted, try a DIFFERENT fix |

**Output (JSON):**
```json
{
  "status": "needs_fix",
  "pass": 2,
  "diff": 8.45,
  "prev_diff": 12.30,
  "diff_image": "/tmp/.../pass-2/diff.png",
  "message": "Pass 2: 8.45% (improved 3.85% from 12.30%)"
}
```

## Validation Loop

For each screen, spawn a sub-agent:

```
Task(
  subagent_type: "general-purpose",
  prompt: """
    Validate component until done.

    INPUTS:
    - component: "{ComponentName}"
    - componentPath: "{componentPath}"
    - figmaPng: "/tmp/figma-to-react/screenshots/figma-{nodeId}.png"
    - previewUrl: "{previewUrl}" (see Preview URL Format above)
    - SKILL_DIR: "{skillDir}"

    NOTE: previewUrl format depends on framework - see Preview URL Format section

    Track current diff across iterations.

    LOOP:

    1. RUN VALIDATION
       result=$($SKILL_DIR/scripts/validate-component.sh \
         "{ComponentName}" "{figmaPng}" "{previewUrl}" "{componentPath}" $PREV_DIFF)

       Parse JSON output. Note the exit code.

    2. CHECK STATUS
       - Exit 0 or 2: DONE - report success
       - Exit 5: DONE - max passes reached, report final state
       - Exit 1: Continue to step 3 (fix needed)
       - Exit 6: Continue to step 3 (try different fix, change was reverted)

    3. FIX
       - Read diff_image from output
       - Bright areas = differences
       - Make ONE targeted fix to {componentPath}
       - If exit was 6: your last fix didn't help, try something DIFFERENT
       - Update PREV_DIFF to current diff
       - Go to step 1

    RETURN: final status, diff %, fixes made
  """
)
```

## Run in Parallel

Spawn all validation sub-agents simultaneously. Each uses its own preview URL.

## Save Results

Each validation must save its final result for status.sh tracking:

```bash
# The validate-component.sh script outputs JSON. Save it:
mkdir -p /tmp/figma-to-react/validation/{ComponentName}

$SKILL_DIR/scripts/validate-component.sh \
  "{ComponentName}" "{figmaPng}" "{previewUrl}" "{componentPath}" $PREV_DIFF \
  | tee /tmp/figma-to-react/validation/{ComponentName}/result.json
```

Or let the sub-agent redirect stdout to result.json after the final pass.

**Note:** status.sh checks for `result.json` with status = `success`, `good_enough`, or `max_passes` to determine completion.

## Next Step

Read step-7-rename-assets.md.
