#!/bin/bash
#
# PostToolUse hook for capturing Figma MCP get_design_context responses
#
# Only activates when /tmp/figma-skill-capture-active marker exists.
# Saves responses to /tmp/figma-captures/figma-{nodeId}.txt
#
# This ensures verbatim code capture without LLM transcription modifications.

MARKER="/tmp/figma-skill-capture-active"
OUTPUT_DIR="/tmp/figma-captures"

# Check if skill has armed the capture
if [ ! -f "$MARKER" ]; then
  # Skill not active - pass through silently
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

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Extract the code from tool_response
# The response can be:
#   - A JSON array: [{"type": "text", "text": "...code..."}, ...]
#   - A raw string
# We need to get just the first text block which contains the React code

OUTPUT_FILE="${OUTPUT_DIR}/figma-${NODE_ID}.txt"

# Try to extract from JSON array structure
CODE=$(echo "$INPUT" | jq -r '
  if .tool_response | type == "array" then
    .tool_response[0].text // empty
  elif .tool_response | type == "string" then
    .tool_response
  else
    empty
  end
' 2>/dev/null)

if [ -z "$CODE" ]; then
  # Fallback: try to extract raw tool_response
  CODE=$(echo "$INPUT" | jq -r '.tool_response // empty' 2>/dev/null)
fi

if [ -z "$CODE" ]; then
  echo "Warning: Could not extract code from response" >&2
  echo '{"decision": "allow"}'
  exit 0
fi

# Save extracted code (jq already handles JSON string unescaping)
printf '%s' "$CODE" > "$OUTPUT_FILE"

# Log capture
BYTES=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
echo "✓ Captured: figma-${NODE_ID}.txt (${BYTES} bytes)" >&2

echo '{"decision": "allow"}'
