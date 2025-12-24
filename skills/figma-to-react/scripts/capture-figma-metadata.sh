#!/usr/bin/env bash
#
# capture-figma-metadata.sh
#
# PostToolUse hook for Figma MCP get_metadata.
# Extracts frame dimensions from XML response and saves to component-metadata.json.
#
# Input (stdin): JSON with tool_input and tool_result
# Output: /tmp/figma-to-react/metadata/{nodeId}.json
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

# Create metadata directory (per-file approach avoids race conditions)
METADATA_DIR="/tmp/figma-to-react/metadata"
mkdir -p "$METADATA_DIR"

# Sanitize node ID for filename (replace : with -)
SAFE_NODE_ID="${NODE_ID//:/-}"
METADATA_FILE="${METADATA_DIR}/${SAFE_NODE_ID}.json"

# Write per-nodeId file (atomic, no contention)
cat > "$METADATA_FILE" << EOF
{"nodeId": "$NODE_ID", "width": $WIDTH, "height": $HEIGHT}
EOF

# Save full XML for fix-collapsed-containers.sh to use
XML_FILE="${METADATA_DIR}/${SAFE_NODE_ID}.xml"
echo "$XML_CONTENT" > "$XML_FILE"

# Extract ALL node dimensions to a JSON map for quick lookup
# Parse: <frame id="237:2572" ... width="393" height="64">
# Output: {"237:2572": {"w": 393, "h": 64}, ...}
DIMENSIONS_FILE="${METADATA_DIR}/${SAFE_NODE_ID}-dimensions.json"

# Use grep to extract all id/width/height from XML elements
# Match patterns like: id="237:2572" ... width="393" height="64"
echo "$XML_CONTENT" | grep -oE '<[^>]+ id="[^"]+"[^>]*>' | while read -r line; do
  id=$(echo "$line" | grep -oE 'id="[^"]+"' | sed 's/id="//;s/"//')
  w=$(echo "$line" | grep -oE 'width="[0-9.]+"' | grep -oE '[0-9.]+')
  h=$(echo "$line" | grep -oE 'height="[0-9.]+"' | grep -oE '[0-9.]+')
  if [ -n "$id" ] && [ -n "$w" ] && [ -n "$h" ]; then
    # Round to integers
    w=$(printf "%.0f" "$w")
    h=$(printf "%.0f" "$h")
    echo "\"$id\": {\"w\": $w, \"h\": $h}"
  fi
done | paste -sd ',' - | sed 's/^/{/;s/$/}/' > "$DIMENSIONS_FILE"

# Count how many dimensions we extracted
DIM_COUNT=$(grep -c '"w":' "$DIMENSIONS_FILE" 2>/dev/null || echo "0")

# ============================================================================
# Extract parent-child instance mapping for fix-component-instances.sh
# Format: {"parentId": [{"id": "...", "name": "...", "type": "instance", "w": X, "h": Y}, ...]}
# ============================================================================
INSTANCES_FILE="${METADATA_DIR}/${SAFE_NODE_ID}-instances.json"

# Parse XML to build parent-child structure using temp file for parent stack
TEMP_STACK=$(mktemp)
echo "root" > "$TEMP_STACK"

echo "$XML_CONTENT" | while IFS= read -r line; do
  # Count leading spaces to determine depth
  spaces=$(echo "$line" | sed 's/[^ ].*//' | wc -c)
  spaces=$((spaces - 1))
  depth=$((spaces / 2))

  # Extract element type (frame, instance, text)
  type=""
  if echo "$line" | grep -q '<frame '; then type="frame"; fi
  if echo "$line" | grep -q '<instance '; then type="instance"; fi
  if echo "$line" | grep -q '<text '; then type="text"; fi
  [ -z "$type" ] && continue

  # Extract id, name, dimensions
  id=$(echo "$line" | grep -oE 'id="[^"]+"' | sed 's/id="//;s/"//')
  name=$(echo "$line" | grep -oE 'name="[^"]+"' | sed 's/name="//;s/"//')
  w=$(echo "$line" | grep -oE 'width="[0-9.]+"' | grep -oE '[0-9.]+')
  h=$(echo "$line" | grep -oE 'height="[0-9.]+"' | grep -oE '[0-9.]+')
  # Round decimals to integers (matching dimensions map behavior)
  w=${w:+$(printf "%.0f" "$w")}
  h=${h:+$(printf "%.0f" "$h")}

  [ -z "$id" ] && continue

  # Get parent from line (depth+1) in stack file
  parent_id=$(sed -n "$((depth + 1))p" "$TEMP_STACK")

  # Update stack: keep lines up to depth+1, add new id
  head -n $((depth + 1)) "$TEMP_STACK" > "${TEMP_STACK}.tmp"
  echo "$id" >> "${TEMP_STACK}.tmp"
  mv "${TEMP_STACK}.tmp" "$TEMP_STACK"

  # Output JSON line for jq to process
  echo "{\"parent\": \"$parent_id\", \"id\": \"$id\", \"name\": \"$name\", \"type\": \"$type\", \"w\": ${w:-0}, \"h\": ${h:-0}}"
done | jq -s 'group_by(.parent) | map({(.[0].parent): [.[] | del(.parent)]}) | add // {}' > "$INSTANCES_FILE"

rm -f "$TEMP_STACK" "${TEMP_STACK}.tmp" 2>/dev/null

# Validate JSON (fix if empty or malformed)
if ! jq empty "$INSTANCES_FILE" 2>/dev/null; then
  echo '{}' > "$INSTANCES_FILE"
fi

INSTANCE_COUNT=$(jq 'to_entries | map(.value | length) | add // 0' "$INSTANCES_FILE" 2>/dev/null || echo "0")
echo "✓ Captured dimensions for $NODE_ID: ${WIDTH}x${HEIGHT} (+${DIM_COUNT} child nodes, ${INSTANCE_COUNT} instances)" >&2

# Output JSON for hook system
echo '{}'
