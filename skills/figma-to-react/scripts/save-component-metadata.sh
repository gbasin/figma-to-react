#!/usr/bin/env bash
#
# save-component-metadata.sh
#
# Save or update component metadata. Links component name to nodeId metadata.
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
#   Creates/updates /tmp/figma-to-react/metadata/{ComponentName}.json
#
# Example:
#   ./save-component-metadata.sh LoginScreen "237:2571"  # Link to existing nodeId
#   ./save-component-metadata.sh LoginScreen "237:2571" 390 844 src/components/LoginScreen.tsx

set -e

COMPONENT_NAME="$1"
NODE_ID="$2"

if [ -z "$COMPONENT_NAME" ] || [ -z "$NODE_ID" ]; then
  echo "Usage: $0 <component-name> <node-id> [component-path]" >&2
  echo "       $0 <component-name> <node-id> <width> <height> [component-path]" >&2
  exit 1
fi

# Check if width/height provided or if we're just linking
if [[ "$3" =~ ^[0-9]+$ ]] && [[ "$4" =~ ^[0-9]+$ ]]; then
  WIDTH="$3"
  HEIGHT="$4"
  COMPONENT_PATH="${5:-}"
else
  WIDTH=""
  HEIGHT=""
  COMPONENT_PATH="${3:-}"
fi

METADATA_DIR="/tmp/figma-to-react/metadata"
mkdir -p "$METADATA_DIR"

# Sanitize node ID for filename (replace : with -)
SAFE_NODE_ID="${NODE_ID//:/-}"
NODE_FILE="${METADATA_DIR}/${SAFE_NODE_ID}.json"
COMPONENT_FILE="${METADATA_DIR}/${COMPONENT_NAME}.json"

if [ -n "$WIDTH" ] && [ -n "$HEIGHT" ]; then
  # Full entry with dimensions provided
  cat > "$COMPONENT_FILE" << EOF
{"nodeId": "$NODE_ID", "width": $WIDTH, "height": $HEIGHT, "name": "$COMPONENT_NAME", "componentPath": "$COMPONENT_PATH"}
EOF
  echo "Saved metadata for $COMPONENT_NAME: ${WIDTH}x${HEIGHT}" >&2
else
  # Link to existing nodeId file
  if [ -f "$NODE_FILE" ]; then
    if ! command -v jq >/dev/null 2>&1; then
      echo "Error: jq is required to read node metadata. Install jq and try again." >&2
      exit 1
    fi
    # Read existing and add component info
    EXISTING=$(cat "$NODE_FILE")
    WIDTH=$(echo "$EXISTING" | jq -r '.width')
    HEIGHT=$(echo "$EXISTING" | jq -r '.height')
    cat > "$COMPONENT_FILE" << EOF
{"nodeId": "$NODE_ID", "width": $WIDTH, "height": $HEIGHT, "name": "$COMPONENT_NAME", "componentPath": "$COMPONENT_PATH"}
EOF
    echo "Linked $COMPONENT_NAME to nodeId $NODE_ID: ${WIDTH}x${HEIGHT}" >&2
  else
    echo "Warning: No existing entry for nodeId $NODE_ID at $NODE_FILE" >&2
    exit 1
  fi
fi

echo "$COMPONENT_FILE"
