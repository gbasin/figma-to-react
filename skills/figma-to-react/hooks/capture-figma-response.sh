#!/bin/bash
#
# PostToolUse hook for capturing Figma MCP get_design_context responses
# Only activates when /tmp/figma-skill-capture-active marker exists
#
# Creates TWO files per capture:
#   1. /tmp/figma-captures/figma-{nodeId}.txt - raw JSON response (for debugging)
#   2. /tmp/figma-captures/figma-{nodeId}.tsx - extracted React code (for processing)
#
# Also auto-creates numbered flow-screen files for asset processing:
#   /tmp/flow-screen-{N}.txt - auto-incremented counter
#
# This ensures pixel-perfect code extraction without LLM transcription modifications
#

MARKER="/tmp/figma-skill-capture-active"
OUTPUT_DIR="/tmp/figma-captures"
COUNTER_FILE="/tmp/figma-screen-counter"

# Check if skill has armed the capture
if [ ! -f "$MARKER" ]; then
  # Skill not active - pass through silently (consume stdin)
  cat > /dev/null
  echo '{"decision": "allow"}'
  exit 0
fi

# Read the full hook input
INPUT=$(cat)

# Extract nodeId for filename (convert : to - for filesystem safety)
NODE_ID=$(echo "$INPUT" | jq -r '.tool_input.nodeId // "unknown"' 2>/dev/null | tr ':' '-')
if [ -z "$NODE_ID" ] || [ "$NODE_ID" = "null" ]; then
  NODE_ID="unknown-$(date +%s)"
fi

# Get and increment counter for flow-screen numbering
if [ -f "$COUNTER_FILE" ]; then
  SCREEN_NUM=$(cat "$COUNTER_FILE")
else
  SCREEN_NUM=0
fi
SCREEN_NUM=$((SCREEN_NUM + 1))
echo "$SCREEN_NUM" > "$COUNTER_FILE"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Extract the React code from tool_response
# The tool_response is a JSON array: [{"type": "text", "text": "...code..."}, ...]
CODE=$(echo "$INPUT" | jq -r '.tool_response[0].text // .tool_response // empty')

# Save raw response for debugging
echo "$INPUT" > "${OUTPUT_DIR}/figma-${NODE_ID}.json"

# Save extracted code
echo "$CODE" > "${OUTPUT_DIR}/figma-${NODE_ID}.tsx"

# Also create numbered flow-screen file (used by process-figma-assets.sh)
echo "$CODE" > "/tmp/flow-screen-${SCREEN_NUM}.txt"

# Log capture for debugging (goes to stderr, visible in hook output)
echo "✓ Captured node ${NODE_ID} -> flow-screen-${SCREEN_NUM}.txt (${#CODE} bytes)" >&2

echo '{"decision": "allow"}'
