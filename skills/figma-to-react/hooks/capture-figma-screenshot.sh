#!/bin/bash
#
# PostToolUse hook for capturing Figma MCP get_screenshot responses
#
# Saves screenshot images to /tmp/figma-to-react/screenshots/figma-{nodeId}.png
# The image data comes as base64 in the tool_response
#

OUTPUT_DIR="/tmp/figma-to-react/screenshots"

# Read the full hook input
INPUT=$(cat)

# Extract nodeId for filename (convert : to - for filesystem safety)
NODE_ID=$(echo "$INPUT" | jq -r '.tool_input.nodeId // "unknown"' 2>/dev/null | tr ':' '-')
if [ -z "$NODE_ID" ] || [ "$NODE_ID" = "null" ]; then
  NODE_ID="unknown-$(date +%s)"
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="${OUTPUT_DIR}/figma-${NODE_ID}.png"

# Extract base64 image data from the response
# The response format is typically: [{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}}]
# Or it could be: [{"type": "image", "data": "base64string", ...}]

# Try multiple extraction patterns
IMAGE_DATA=$(echo "$INPUT" | jq -r '
  .tool_response as $resp |

  # If array, get first image element
  if ($resp | type) == "array" then
    ($resp[] | select(.type == "image") | .source.data // .data) // empty

  # If string, try to parse
  elif ($resp | type) == "string" then
    (try ($resp | fromjson) catch null) as $parsed |
    if ($parsed | type) == "array" then
      ($parsed[] | select(.type == "image") | .source.data // .data) // empty
    else
      empty
    end
  else
    empty
  end
' 2>/dev/null)

if [ -z "$IMAGE_DATA" ] || [ "$IMAGE_DATA" = "null" ]; then
  # Fallback: try direct extraction patterns
  IMAGE_DATA=$(echo "$INPUT" | jq -r '.tool_response[0].source.data // empty' 2>/dev/null)
fi

if [ -z "$IMAGE_DATA" ] || [ "$IMAGE_DATA" = "null" ]; then
  IMAGE_DATA=$(echo "$INPUT" | jq -r '.tool_response[0].data // empty' 2>/dev/null)
fi

if [ -z "$IMAGE_DATA" ] || [ "$IMAGE_DATA" = "null" ]; then
  echo "Warning: Could not extract image data from response" >&2
  # Debug: save raw response for inspection
  echo "$INPUT" | jq '.tool_response' > "${OUTPUT_DIR}/debug-${NODE_ID}.json" 2>/dev/null
  echo '{}'
  exit 0
fi

# Decode base64 and save as PNG
echo "$IMAGE_DATA" | base64 -d > "$OUTPUT_FILE" 2>/dev/null

if [ -f "$OUTPUT_FILE" ] && [ -s "$OUTPUT_FILE" ]; then
  BYTES=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
  echo "Screenshot saved: ${OUTPUT_FILE} (${BYTES} bytes)" >&2

  # Return success with file path info
  cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Screenshot saved to ${OUTPUT_FILE}"
  }
}
EOF
else
  echo "Warning: Failed to decode image" >&2
  echo '{}'
fi
