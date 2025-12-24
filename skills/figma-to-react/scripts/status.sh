#!/bin/bash
#
# status.sh
#
# Report pipeline status by examining /tmp files.
# Used to determine current step and recover after context compaction.
#
# Usage:
#   ./status.sh           - Output JSON status
#   ./status.sh --check N - Verify current step is N, exit 0 if yes, 1 if no
#
# Output:
#   Default: JSON with current step, progress, and next action
#   --check: Exit code 0 if on expected step, 1 if not (prints correct step)
#
# The agent should run this:
#   - At skill start
#   - After each step completes
#   - When resuming after context compaction
#

set -e

BASE="/tmp/figma-to-react"
CHECK_MODE=""
EXPECTED_STEP=""

# Parse arguments
if [ "$1" = "--check" ]; then
  CHECK_MODE="true"
  EXPECTED_STEP="$2"
  if [ -z "$EXPECTED_STEP" ]; then
    echo "Usage: $0 --check <step>" >&2
    exit 2
  fi
fi

# Check if skill is active
if [ ! -f "$BASE/capture-active" ]; then
  STEP="1"
  NEXT="Run step 1 setup to start"
  if [ "$CHECK_MODE" = "true" ]; then
    if [ "$STEP" = "$EXPECTED_STEP" ]; then
      echo "OK: on step $STEP"
      exit 0
    else
      echo "WRONG STEP: expected $EXPECTED_STEP but on $STEP"
      echo "Action: $NEXT"
      exit 1
    fi
  fi
  cat << 'EOF'
{
  "active": false,
  "current_step": "1",
  "next_action": "Run step 1 setup to start"
}
EOF
  exit 0
fi

# Read config
if [ ! -f "$BASE/config.json" ]; then
  STEP="3"
  NEXT="Save config.json"
  if [ "$CHECK_MODE" = "true" ]; then
    if [ "$STEP" = "$EXPECTED_STEP" ]; then
      echo "OK: on step $STEP"
      exit 0
    else
      echo "WRONG STEP: expected $EXPECTED_STEP but on $STEP"
      echo "Action: $NEXT"
      exit 1
    fi
  fi
  cat << 'EOF'
{
  "active": true,
  "current_step": "3",
  "next_action": "Save config.json"
}
EOF
  exit 0
fi

# Get expected screen count from config
SCREENS=0
if [ -f "$BASE/config.json" ]; then
  SCREENS=$(jq -r '.screens | length' "$BASE/config.json" 2>/dev/null || echo 0)
fi

# Fallback: count lines in input.txt
if [ "$SCREENS" -eq 0 ] && [ -f "$BASE/input.txt" ]; then
  SCREENS=$(wc -l < "$BASE/input.txt" | tr -d ' ')
fi

# Get paths from config
COMPONENT_DIR=$(jq -r '.componentDir // "src/components/figma"' "$BASE/config.json" 2>/dev/null)
TOKENS_FILE=$(jq -r '.tokensFile // "src/styles/figma-tokens.css"' "$BASE/config.json" 2>/dev/null)

# Detect main CSS file (for checking token import)
MAIN_CSS=""
for candidate in src/index.css src/App.css src/styles/index.css src/app/globals.css; do
  if [ -f "$candidate" ]; then
    MAIN_CSS="$candidate"
    break
  fi
done

# Count progress at each stage
CAPTURES=$(ls "$BASE/captures/figma-"*.txt 2>/dev/null | wc -l | tr -d ' ')
COMPONENTS=$(ls "$COMPONENT_DIR/"*.tsx 2>/dev/null | wc -l | tr -d ' ')

# Count step 4b dimension validations (exclude user-decisions.json and complete.json)
DIM_VALS=0
if [ -d "$BASE/steps/4b" ]; then
  DIM_VALS=$(ls "$BASE/steps/4b/"*.json 2>/dev/null | grep -v 'user-decisions\|complete' | wc -l | tr -d ' ')
fi

# Check step 4b user decision status
MISSING_DIMS=0
if [ "$DIM_VALS" -gt 0 ]; then
  # Sum critical_missing from all validation JSONs
  MISSING_DIMS=$(jq -s 'map(.critical_missing // 0) | add // 0' "$BASE/steps/4b/"*.json 2>/dev/null | grep -v 'user-decisions\|complete' || echo 0)
  # Ensure numeric
  MISSING_DIMS=${MISSING_DIMS:-0}
  [[ "$MISSING_DIMS" =~ ^[0-9]+$ ]] || MISSING_DIMS=0
fi

# Check if user addressed ALL missing dimensions (not just some)
USER_DECIDED="false"
if [ -f "$BASE/steps/4b/user-decisions.json" ]; then
  ADDRESSED=$(jq '.addressed_ids | length' "$BASE/steps/4b/user-decisions.json" 2>/dev/null || echo 0)
  if [ "$ADDRESSED" -ge "$MISSING_DIMS" ]; then
    USER_DECIDED="true"
  fi
fi

# Check step 5 (token import)
TOKEN_IMPORTED="false"
if [ -f "$TOKENS_FILE" ]; then
  # Check if import exists in main CSS
  if [ -n "$MAIN_CSS" ] && grep -q 'figma-tokens.css' "$MAIN_CSS" 2>/dev/null; then
    TOKEN_IMPORTED="true"
  fi
  # Also check step completion marker
  if [ -f "$BASE/steps/5/complete.json" ]; then
    TOKEN_IMPORTED="true"
  fi
fi

# Check step 6 (visual validation)
VIS_DONE=0
VIS_PENDING=0
for comp in "$COMPONENT_DIR"/*.tsx; do
  [ -f "$comp" ] || continue
  NAME=$(basename "$comp" .tsx)
  RESULT="$BASE/validation/$NAME/result.json"
  if [ -f "$RESULT" ]; then
    STATUS=$(jq -r '.status' "$RESULT" 2>/dev/null)
    if [ "$STATUS" = "success" ] || [ "$STATUS" = "good_enough" ] || [ "$STATUS" = "max_passes" ]; then
      VIS_DONE=$((VIS_DONE + 1))
    else
      VIS_PENDING=$((VIS_PENDING + 1))
    fi
  else
    VIS_PENDING=$((VIS_PENDING + 1))
  fi
done

# Check step 7 (asset rename)
ASSETS_RENAMED="false"
if [ -f "$BASE/steps/7/complete.json" ]; then
  ASSETS_RENAMED="true"
fi

# Determine current step and next action
if [ "$COMPONENTS" -lt "$SCREENS" ]; then
  STEP="4"
  MISSING=$((SCREENS - COMPONENTS))
  NEXT="Generate $MISSING remaining components (have $COMPONENTS of $SCREENS)"
elif [ "$DIM_VALS" -lt "$SCREENS" ]; then
  STEP="4b"
  MISSING=$((SCREENS - DIM_VALS))
  NEXT="Run validate-dimensions-coverage.sh for $MISSING screens"
elif [ "$MISSING_DIMS" -gt 0 ] && [ "$USER_DECIDED" = "false" ]; then
  STEP="4b"
  if [ -f "$BASE/steps/4b/user-decisions.json" ]; then
    ADDRESSED=$(jq '.addressed_ids | length' "$BASE/steps/4b/user-decisions.json" 2>/dev/null || echo 0)
    REMAINING=$((MISSING_DIMS - ADDRESSED))
    NEXT="Ask user about $REMAINING remaining missing dimensions ($ADDRESSED of $MISSING_DIMS addressed)"
  else
    NEXT="Ask user about $MISSING_DIMS missing dimensions"
  fi
elif [ "$TOKEN_IMPORTED" = "false" ]; then
  STEP="5"
  NEXT="Add @import for figma-tokens.css to main stylesheet"
elif [ "$VIS_PENDING" -gt 0 ]; then
  STEP="6"
  NEXT="Validate $VIS_PENDING components visually ($VIS_DONE done)"
elif [ "$ASSETS_RENAMED" = "false" ]; then
  STEP="7"
  NEXT="Check for generic asset names, offer to rename"
else
  STEP="8"
  NEXT="Disarm hook and verify results"
fi

# Handle --check mode
if [ "$CHECK_MODE" = "true" ]; then
  if [ "$STEP" = "$EXPECTED_STEP" ]; then
    echo "OK: on step $STEP"
    exit 0
  else
    echo "WRONG STEP: expected $EXPECTED_STEP but on $STEP"
    echo "Action: $NEXT"
    exit 1
  fi
fi

# Default: output JSON status
cat << EOF
{
  "active": true,
  "current_step": "$STEP",
  "total_screens": $SCREENS,
  "progress": {
    "captures": $CAPTURES,
    "components": $COMPONENTS,
    "dim_validations": $DIM_VALS,
    "missing_dimensions": $MISSING_DIMS,
    "user_decisions": $USER_DECIDED,
    "token_imported": $TOKEN_IMPORTED,
    "vis_validated": $VIS_DONE,
    "vis_pending": $VIS_PENDING,
    "assets_renamed": $ASSETS_RENAMED
  },
  "next_action": "$NEXT"
}
EOF
