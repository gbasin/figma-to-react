#!/bin/bash
#
# PostToolUse hook for capturing Figma MCP get_design_context responses
#
# ALWAYS captures responses to /tmp/figma-captures/figma-{nodeId}.txt
# ONLY suppresses output when skill is active (marker file exists)
#
# This ensures:
# - Verbatim code capture without LLM transcription modifications
# - Normal Figma MCP experience when skill is not active
# - Debug captures available even without skill

MARKER="/tmp/figma-skill-capture-active"
OUTPUT_DIR="/tmp/figma-captures"

# Always read the full hook input
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
#   - A JSON string containing a serialized array: "[{\"type\": \"text\", ...}]"
#   - A raw string
# We need to get just the first text block which contains the React code

OUTPUT_FILE="${OUTPUT_DIR}/figma-${NODE_ID}.txt"

# Try to extract from JSON - handle both parsed arrays and serialized JSON strings
CODE=$(echo "$INPUT" | jq -r '
  # Get tool_response
  .tool_response as $resp |

  # If it is an array, get first text element
  if ($resp | type) == "array" then
    $resp[0].text // empty

  # If it is a string, try to parse it as JSON
  elif ($resp | type) == "string" then
    # Try to parse as JSON array
    (try ($resp | fromjson) catch null) as $parsed |
    if ($parsed | type) == "array" then
      $parsed[0].text // empty
    else
      # Not parseable as array, return as-is
      $resp
    end

  else
    empty
  end
' 2>/dev/null)

if [ -z "$CODE" ]; then
  # Fallback: try to extract raw tool_response as string
  CODE=$(echo "$INPUT" | jq -r '.tool_response // empty' 2>/dev/null)
fi

if [ -z "$CODE" ]; then
  echo "Warning: Could not extract code from response" >&2
  # No code to capture, allow normal flow
  echo '{}'
  exit 0
fi

# ALWAYS save extracted code (useful for debugging even without skill)
printf '%s' "$CODE" > "$OUTPUT_FILE"
BYTES=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')

# CONDITIONAL: Only suppress output when skill is active
if [ -f "$MARKER" ]; then
  # Skill is active - suppress raw output, replace with instruction
  echo "✓ Captured: figma-${NODE_ID}.txt (${BYTES} bytes) [suppressing output]" >&2
  cat << EOF
{
  "suppressOutput": true,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "✅ Figma response captured to ${OUTPUT_FILE} (${BYTES} bytes)\n\nNEXT: Run the processing script to extract tokens and download assets:\n\n\$SKILL_DIR/scripts/process-figma.sh ${OUTPUT_FILE} <component.tsx> <asset-dir> <url-prefix> <tokens.css>"
  }
}
EOF
else
  # Skill not active - allow normal output (capture still happened for debugging)
  echo "✓ Captured: figma-${NODE_ID}.txt (${BYTES} bytes) [passthrough]" >&2
  echo '{}'
fi
