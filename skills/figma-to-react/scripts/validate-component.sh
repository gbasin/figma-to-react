#!/usr/bin/env bash
#
# validate-component.sh
#
# Run one validation pass for a component. Deterministic - no LLM logic.
# Returns status code indicating what to do next.
#
# Usage:
#   ./validate-component.sh <component> <figma-png> <preview-url> <component-path> [prev-diff]
#
# Arguments:
#   component       - Component name (e.g., LoginScreen)
#   figma-png       - Path to Figma reference screenshot
#   preview-url     - URL to capture
#   component-path  - Path to component file (for revert on no improvement)
#   prev-diff       - Previous diff % (optional, for detecting improvement)
#
# Exit codes:
#   0 - Success (diff ≤ 5%)
#   1 - Needs fix (first pass or improved, but still > 5%)
#   2 - Good enough (diff ≤ 1%)
#   5 - Max passes reached (10)
#   6 - No improvement (reverted to last good state, try something DIFFERENT)
#   10 - Error
#
# Output (JSON to stdout):
#   { "status": "...", "diff": 4.23, "diff_image": "...", "message": "..." }

set -e

COMPONENT="$1"
FIGMA_PNG="$2"
PREVIEW_URL="$3"
COMPONENT_PATH="$4"
PREV_DIFF="$5"

TARGET=5
GOOD_ENOUGH=1
MAX_PASSES=10
SKILL_DIR="${SKILL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

error_exit() {
  echo "{\"status\": \"error\", \"message\": \"$1\"}"
  exit 10
}

[ -z "$COMPONENT" ] || [ -z "$FIGMA_PNG" ] || [ -z "$PREVIEW_URL" ] || [ -z "$COMPONENT_PATH" ] && \
  error_exit "Usage: $0 <component> <figma-png> <preview-url> <component-path> [prev-diff]"

[ ! -f "$FIGMA_PNG" ] && error_exit "Figma screenshot not found: $FIGMA_PNG"
[ ! -f "$COMPONENT_PATH" ] && error_exit "Component file not found: $COMPONENT_PATH"

# Validation directory and state
VALIDATION_DIR="/tmp/figma-to-react/validation/${COMPONENT}"
KNOWN_GOOD="${VALIDATION_DIR}/.known-good-component"
mkdir -p "$VALIDATION_DIR"

# Determine pass number from existing directories
PASS=$(ls -d "${VALIDATION_DIR}"/pass-* 2>/dev/null | wc -l | tr -d ' ')
PASS=$((PASS + 1))

# Check max passes
if [ "$PASS" -gt "$MAX_PASSES" ]; then
  echo "{\"status\": \"max_passes\", \"pass\": $PASS, \"message\": \"Max passes ($MAX_PASSES) reached\"}"
  exit 5
fi

PASS_DIR="${VALIDATION_DIR}/pass-${PASS}"
mkdir -p "$PASS_DIR"
RENDERED_PNG="${PASS_DIR}/rendered.png"

# Capture
npx tsx "${SKILL_DIR}/scripts/capture-screenshot.ts" "$PREVIEW_URL" "$RENDERED_PNG" 2>/dev/null \
  || error_exit "Capture failed"

[ ! -f "$RENDERED_PNG" ] && error_exit "Screenshot not created"

# Validate (just get diff %, don't let it create dirs - we already did)
DIFF=$("${SKILL_DIR}/scripts/validate-visual.sh" "$FIGMA_PNG" "$RENDERED_PNG" "$COMPONENT" "$PASS" 2>/dev/null) \
  || error_exit "Validation failed"

DIFF_IMAGE="${PASS_DIR}/diff.png"

# Determine status
if (( $(echo "$DIFF <= $GOOD_ENOUGH" | bc -l) )); then
  STATUS="good_enough"
  MSG="Pass $PASS: ${DIFF}% (≤${GOOD_ENOUGH}%, done)"
  EXIT=2
  # Save as known good
  cp "$COMPONENT_PATH" "$KNOWN_GOOD"

elif (( $(echo "$DIFF <= $TARGET" | bc -l) )); then
  STATUS="success"
  MSG="Pass $PASS: ${DIFF}% (≤${TARGET}%, done)"
  EXIT=0
  # Save as known good
  cp "$COMPONENT_PATH" "$KNOWN_GOOD"

elif [ -n "$PREV_DIFF" ]; then
  # Check if we improved
  IMPROVED=$(echo "$DIFF < $PREV_DIFF" | bc -l)

  if [ "$IMPROVED" -eq 1 ]; then
    DELTA=$(echo "$PREV_DIFF - $DIFF" | bc -l | xargs printf "%.2f")
    STATUS="needs_fix"
    MSG="Pass $PASS: ${DIFF}% (improved ${DELTA}% from ${PREV_DIFF}%)"
    EXIT=1
    # Save as known good (we improved)
    cp "$COMPONENT_PATH" "$KNOWN_GOOD"
  else
    # No improvement - revert to last known good state
    if [ -f "$KNOWN_GOOD" ]; then
      cp "$KNOWN_GOOD" "$COMPONENT_PATH"
      STATUS="no_improvement"
      MSG="Pass $PASS: ${DIFF}% (was ${PREV_DIFF}%, reverted - try DIFFERENT fix)"
    else
      STATUS="no_improvement"
      MSG="Pass $PASS: ${DIFF}% (was ${PREV_DIFF}%, no baseline to revert - try DIFFERENT fix)"
    fi
    EXIT=6
  fi

else
  # First pass - save as baseline
  STATUS="needs_fix"
  MSG="Pass $PASS: ${DIFF}% (target: ≤${TARGET}%)"
  EXIT=1
  cp "$COMPONENT_PATH" "$KNOWN_GOOD"
fi

cat <<EOF
{
  "status": "$STATUS",
  "pass": $PASS,
  "diff": $DIFF,
  "prev_diff": ${PREV_DIFF:-null},
  "diff_image": "$DIFF_IMAGE",
  "message": "$MSG"
}
EOF

exit $EXIT
