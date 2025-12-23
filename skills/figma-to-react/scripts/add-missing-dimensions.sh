#!/usr/bin/env bash
#
# add-missing-dimensions.sh
#
# Adds a dimension entry to the dimensions JSON file.
#
# Usage:
#   ./add-missing-dimensions.sh <dimensions-json> <node-id> <width> <height>
#
# Example:
#   ./add-missing-dimensions.sh dimensions.json "232:1470" 393 64

set -e

DIMENSIONS_JSON="$1"
NODE_ID="$2"
WIDTH="$3"
HEIGHT="$4"

if [ -z "$DIMENSIONS_JSON" ] || [ -z "$NODE_ID" ] || [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
  echo "Usage: $0 <dimensions-json> <node-id> <width> <height>" >&2
  exit 1
fi

if [ ! -f "$DIMENSIONS_JSON" ]; then
  echo "Error: Dimensions JSON not found: $DIMENSIONS_JSON" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required" >&2
  exit 1
fi

# Validate width and height are numbers
if ! [[ "$WIDTH" =~ ^[0-9]+$ ]] || ! [[ "$HEIGHT" =~ ^[0-9]+$ ]]; then
  echo "Error: Width and height must be positive integers" >&2
  exit 1
fi

# Add the new entry to the JSON with manual flag
# The "manual": true flag tells fix-collapsed-containers.sh to aggressively
# replace relative sizing (w-full, h-full, etc.) with explicit pixel values.
# Dimensions from Figma MCP don't have this flag, so they preserve relative sizing.
TEMP_FILE=$(mktemp)
jq --arg id "$NODE_ID" --argjson w "$WIDTH" --argjson h "$HEIGHT" \
  '. + {($id): {"w": $w, "h": $h, "manual": true}}' "$DIMENSIONS_JSON" > "$TEMP_FILE"

mv "$TEMP_FILE" "$DIMENSIONS_JSON"

echo "✓ Added manual dimensions for $NODE_ID: ${WIDTH}x${HEIGHT}" >&2
