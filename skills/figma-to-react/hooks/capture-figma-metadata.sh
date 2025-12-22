#!/usr/bin/env bash
#
# capture-figma-metadata.sh
#
# PostToolUse hook for Figma MCP get_metadata.
# Extracts frame dimensions from XML response and saves to component-metadata.json.
#
# Input (stdin): JSON with tool_input and tool_result
# Output: Updated /tmp/figma-to-react/component-metadata.json
#

set -e

# Read JSON from stdin
INPUT=$(cat)

# Extract nodeId from tool_input
NODE_ID=$(echo "$INPUT" | jq -r '.tool_input.nodeId // empty')
if [ -z "$NODE_ID" ]; then
  echo "Warning: No nodeId in get_metadata call" >&2
  echo '{}'
  exit 0
fi

# Extract the XML content from tool_response (not tool_result!)
# The response can be a string or array of content blocks
XML_CONTENT=$(echo "$INPUT" | jq -r '
  .tool_response as $resp |
  if ($resp | type) == "array" then
    $resp[0].text // empty
  elif ($resp | type) == "string" then
    $resp
  else
    empty
  end
' 2>/dev/null)
if [ -z "$XML_CONTENT" ]; then
  echo "Warning: No XML content in get_metadata response" >&2
  echo '{}'
  exit 0
fi

# Extract width and height from the root frame element
# Look for patterns like width="390" height="844" or size="390x844"
# The XML format varies, so try multiple patterns

# Try width="X" height="Y" pattern (common in Figma XML)
WIDTH=$(echo "$XML_CONTENT" | grep -oE 'width="[0-9.]+"' | head -1 | grep -oE '[0-9.]+')
HEIGHT=$(echo "$XML_CONTENT" | grep -oE 'height="[0-9.]+"' | head -1 | grep -oE '[0-9.]+')

# If not found, try w="X" h="Y" pattern
if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
  WIDTH=$(echo "$XML_CONTENT" | grep -oE '\bw="[0-9.]+"' | head -1 | grep -oE '[0-9.]+')
  HEIGHT=$(echo "$XML_CONTENT" | grep -oE '\bh="[0-9.]+"' | head -1 | grep -oE '[0-9.]+')
fi

# If still not found, try size attribute
if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
  SIZE=$(echo "$XML_CONTENT" | grep -oE 'size="[0-9.]+x[0-9.]+"' | head -1)
  if [ -n "$SIZE" ]; then
    WIDTH=$(echo "$SIZE" | grep -oE '[0-9.]+' | head -1)
    HEIGHT=$(echo "$SIZE" | grep -oE '[0-9.]+' | tail -1)
  fi
fi

if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
  echo "Warning: Could not extract dimensions from get_metadata response" >&2
  echo "XML preview: ${XML_CONTENT:0:500}" >&2
  echo '{}'
  exit 0
fi

# Round to integers
WIDTH=$(printf "%.0f" "$WIDTH")
HEIGHT=$(printf "%.0f" "$HEIGHT")

# Create metadata directory
METADATA_FILE="/tmp/figma-to-react/component-metadata.json"
mkdir -p "$(dirname "$METADATA_FILE")"

# Initialize file if it doesn't exist
if [ ! -f "$METADATA_FILE" ]; then
  echo '{"components":{}}' > "$METADATA_FILE"
fi

# Sanitize node ID for use as JSON key (replace : with -)
SAFE_NODE_ID="${NODE_ID//:/-}"

# Update the metadata file - keyed by nodeId since we don't have component name yet
jq --arg nodeId "$NODE_ID" \
   --arg safeId "$SAFE_NODE_ID" \
   --argjson width "$WIDTH" \
   --argjson height "$HEIGHT" \
   '.components[$safeId] = {
      nodeId: $nodeId,
      width: $width,
      height: $height
    }' "$METADATA_FILE" > "${METADATA_FILE}.tmp" && mv "${METADATA_FILE}.tmp" "$METADATA_FILE"

echo "✓ Captured dimensions for $NODE_ID: ${WIDTH}x${HEIGHT}" >&2

# Output JSON for hook system
echo '{}'
