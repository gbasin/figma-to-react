#!/bin/bash
#
# PostToolUse hook for capturing Figma MCP get_design_context responses
# Only activates when /tmp/figma-skill-capture-active marker exists
#
# Captures verbatim response to /tmp/figma-captures/figma-{nodeId}.txt
# This ensures pixel-perfect code extraction without LLM transcription modifications
#

MARKER="/tmp/figma-skill-capture-active"
OUTPUT_DIR="/tmp/figma-captures"

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

# Create output directory and extract the tool_response
mkdir -p "$OUTPUT_DIR"
echo "$INPUT" | jq -r '.tool_response // empty' > "${OUTPUT_DIR}/figma-${NODE_ID}.txt"

# Log capture for debugging (goes to stderr, visible in hook output)
echo "Captured Figma response for node ${NODE_ID} -> ${OUTPUT_DIR}/figma-${NODE_ID}.txt" >&2

echo '{"decision": "allow"}'
