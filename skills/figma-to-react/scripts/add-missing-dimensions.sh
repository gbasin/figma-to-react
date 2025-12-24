#!/usr/bin/env bash
#
# add-missing-dimensions.sh
#
# Adds dimension entries to dimensions JSON files with manual: true flag.
#
# Usage modes:
#   # Single ID (backward compatible)
#   ./add-missing-dimensions.sh <json> <node-id> <width> <height>
#
#   # Multiple IDs to single file (same dimensions)
#   ./add-missing-dimensions.sh <json> <width> <height> <id1> [id2] [id3]...
#
#   # Multiple files (same dimensions)
#   ./add-missing-dimensions.sh <width> <height> --file <json1> <id1> [id2]... [--file <json2> <id3>...]
#
# Examples:
#   # Single ID
#   ./add-missing-dimensions.sh dims.json "232:1470" 393 64
#
#   # Multiple IDs to single file
#   ./add-missing-dimensions.sh dims.json 393 48 "I2006:2073;2603:5160" "I2006:2073;2603:5161"
#
#   # Multiple files
#   ./add-missing-dimensions.sh 393 48 \
#     --file metadata/2006-2062-dimensions.json "I2006:2073;2603:5160" "I2006:2073;2603:5161" \
#     --file metadata/2006-2075-dimensions.json "I2006:2086;2603:5160"

set -e

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required" >&2
  exit 1
fi

# Helper: add single dimension to JSON file
add_dimension() {
  local json_file="$1"
  local node_id="$2"
  local width="$3"
  local height="$4"

  if [ ! -f "$json_file" ]; then
    echo "Error: Dimensions JSON not found: $json_file" >&2
    return 1
  fi

  local temp_file=$(mktemp)
  jq --arg id "$node_id" --argjson w "$width" --argjson h "$height" \
    '. + {($id): {"w": $w, "h": $h, "manual": true}}' "$json_file" > "$temp_file"
  mv "$temp_file" "$json_file"
  echo "✓ Added $node_id: ${width}x${height} to $(basename "$json_file")" >&2
}

# Helper: check if string is a positive integer
is_number() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

# Detect mode based on arguments
if [ $# -lt 4 ]; then
  echo "Usage:" >&2
  echo "  $0 <json> <node-id> <width> <height>           # Single ID" >&2
  echo "  $0 <json> <width> <height> <id1> [id2]...      # Multiple IDs" >&2
  echo "  $0 <width> <height> --file <json> <ids>...     # Multiple files" >&2
  exit 1
fi

# Mode 3: Multiple files (first arg is width)
if is_number "$1" && is_number "$2" && [ "$3" = "--file" ]; then
  WIDTH="$1"
  HEIGHT="$2"
  shift 2  # Remove width and height

  CURRENT_JSON=""
  ADDED=0

  while [ $# -gt 0 ]; do
    if [ "$1" = "--file" ]; then
      shift
      if [ $# -eq 0 ]; then
        echo "Error: --file requires a filename" >&2
        exit 1
      fi
      CURRENT_JSON="$1"
      shift
    elif [ -n "$CURRENT_JSON" ]; then
      add_dimension "$CURRENT_JSON" "$1" "$WIDTH" "$HEIGHT"
      ADDED=$((ADDED + 1))
      shift
    else
      echo "Error: Node ID '$1' specified before --file" >&2
      exit 1
    fi
  done

  echo "✓ Added $ADDED dimensions (${WIDTH}x${HEIGHT})" >&2
  exit 0
fi

# Mode 2: Multiple IDs to single file (json, width, height, id1, id2...)
# Detect: 2nd and 3rd args are numbers, 4th+ are node IDs
if [ -f "$1" ] && is_number "$2" && is_number "$3" && [ $# -ge 4 ]; then
  DIMENSIONS_JSON="$1"
  WIDTH="$2"
  HEIGHT="$3"
  shift 3  # Remove json, width, height

  ADDED=0
  for node_id in "$@"; do
    add_dimension "$DIMENSIONS_JSON" "$node_id" "$WIDTH" "$HEIGHT"
    ADDED=$((ADDED + 1))
  done

  echo "✓ Added $ADDED dimensions (${WIDTH}x${HEIGHT}) to $(basename "$DIMENSIONS_JSON")" >&2
  exit 0
fi

# Mode 1: Single ID (original backward-compatible mode)
# Format: <json> <id> <width> <height>
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

if ! is_number "$WIDTH" || ! is_number "$HEIGHT"; then
  echo "Error: Width and height must be positive integers" >&2
  exit 1
fi

add_dimension "$DIMENSIONS_JSON" "$NODE_ID" "$WIDTH" "$HEIGHT"
