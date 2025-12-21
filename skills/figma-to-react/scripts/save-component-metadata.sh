#!/usr/bin/env bash
#
# save-component-metadata.sh
#
# Save or update component metadata in the JSON file.
# Can either create a full entry or add component name to an existing nodeId entry.
#
# Usage:
#   ./save-component-metadata.sh <component-name> <node-id> [component-path]
#   ./save-component-metadata.sh <component-name> <node-id> <width> <height> [component-path]
#
# Arguments:
#   component-name  - Component name (e.g., LoginScreen)
#   node-id         - Figma node ID (e.g., 237:2571)
#   width           - Frame width in pixels (optional if hook already saved it)
#   height          - Frame height in pixels (optional if hook already saved it)
#   component-path  - Optional path to component file
#
# Output:
#   Updates /tmp/figma-to-react/component-metadata.json
#
# Example:
#   ./save-component-metadata.sh LoginScreen "237:2571"  # Add name to existing entry
#   ./save-component-metadata.sh LoginScreen "237:2571" 390 844 src/components/LoginScreen.tsx

set -e

COMPONENT_NAME="$1"
NODE_ID="$2"

if [ -z "$COMPONENT_NAME" ] || [ -z "$NODE_ID" ]; then
  echo "Usage: $0 <component-name> <node-id> [component-path]" >&2
  echo "       $0 <component-name> <node-id> <width> <height> [component-path]" >&2
  exit 1
fi

# Check if width/height provided or if we're just adding name
if [[ "$3" =~ ^[0-9]+$ ]] && [[ "$4" =~ ^[0-9]+$ ]]; then
  WIDTH="$3"
  HEIGHT="$4"
  COMPONENT_PATH="${5:-}"
else
  WIDTH=""
  HEIGHT=""
  COMPONENT_PATH="${3:-}"
fi

METADATA_FILE="/tmp/figma-to-react/component-metadata.json"
mkdir -p "$(dirname "$METADATA_FILE")"

# Initialize file if it doesn't exist
if [ ! -f "$METADATA_FILE" ]; then
  echo '{"components":{}}' > "$METADATA_FILE"
fi

# Check for jq
if ! command -v jq &> /dev/null; then
  echo "Error: jq not found. Install with: brew install jq" >&2
  exit 1
fi

# Sanitize node ID for use as JSON key (replace : with -)
SAFE_NODE_ID="${NODE_ID//:/-}"

# Update the metadata file
if [ -n "$WIDTH" ] && [ -n "$HEIGHT" ]; then
  # Full entry with dimensions
  jq --arg name "$COMPONENT_NAME" \
     --arg nodeId "$NODE_ID" \
     --arg safeId "$SAFE_NODE_ID" \
     --argjson width "$WIDTH" \
     --argjson height "$HEIGHT" \
     --arg path "$COMPONENT_PATH" \
     '.components[$name] = {
        nodeId: $nodeId,
        width: $width,
        height: $height,
        componentPath: $path
      }' "$METADATA_FILE" > "${METADATA_FILE}.tmp" && mv "${METADATA_FILE}.tmp" "$METADATA_FILE"
  echo "Saved metadata for $COMPONENT_NAME: ${WIDTH}x${HEIGHT}" >&2
else
  # Add component name to existing nodeId entry, copy to name-keyed entry
  EXISTING=$(jq -r --arg safeId "$SAFE_NODE_ID" '.components[$safeId] // empty' "$METADATA_FILE")
  if [ -n "$EXISTING" ]; then
    jq --arg name "$COMPONENT_NAME" \
       --arg safeId "$SAFE_NODE_ID" \
       --arg path "$COMPONENT_PATH" \
       '.components[$name] = .components[$safeId] | .components[$name].componentPath = $path | .components[$name].name = $name' \
       "$METADATA_FILE" > "${METADATA_FILE}.tmp" && mv "${METADATA_FILE}.tmp" "$METADATA_FILE"
    DIMS=$(echo "$EXISTING" | jq -r '"\(.width)x\(.height)"')
    echo "Linked $COMPONENT_NAME to nodeId $NODE_ID: $DIMS" >&2
  else
    echo "Warning: No existing entry for nodeId $NODE_ID" >&2
  fi
fi

echo "$METADATA_FILE"
