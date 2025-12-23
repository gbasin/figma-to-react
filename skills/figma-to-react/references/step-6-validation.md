# Step 6: Validate Screens

Compare rendered components to Figma screenshots. Fix until visual diff ≤ 5%.

## Prerequisites

- Dev server running: `pnpm dev` (note the port from output, e.g., `localhost:3000` or `localhost:5173`)
- Preview route created (step 3b)
- Figma screenshots captured
- Bun installed (https://bun.sh)

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
    - previewUrl: "{devServerUrl}/figma-preview?screen={ComponentName}"
    - SKILL_DIR: "{skillDir}"

    NOTE: {devServerUrl} is the dev server URL from your dev server (e.g., http://localhost:3000)

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

## Next Step

Read step-7-rename-assets.md.
