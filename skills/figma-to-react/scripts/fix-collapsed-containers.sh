#!/usr/bin/env bash
#
# fix-collapsed-containers.sh
#
# Fix containers that collapse because all children are absolute-positioned.
# Adds explicit h-[Xpx] or w-[Xpx] classes from Figma metadata.
#
# Usage:
#   ./fix-collapsed-containers.sh <tsx-file> <dimensions-json>
#
# Arguments:
#   tsx-file        - Path to generated TSX/HTML file
#   dimensions-json - Path to dimensions JSON map from capture-figma-metadata.sh
#
# Output:
#   Writes fixed code to stdout
#
# Example:
#   ./fix-collapsed-containers.sh component.tsx dimensions.json > fixed.tsx

set -e

TSX_FILE="$1"
DIMENSIONS_JSON="$2"

if [ -z "$TSX_FILE" ] || [ -z "$DIMENSIONS_JSON" ]; then
  echo "Usage: $0 <tsx-file> <dimensions-json>" >&2
  exit 1
fi

if [ ! -f "$TSX_FILE" ]; then
  echo "Error: TSX file not found: $TSX_FILE" >&2
  exit 1
fi

if [ ! -f "$DIMENSIONS_JSON" ]; then
  echo "Error: Dimensions JSON not found: $DIMENSIONS_JSON" >&2
  # Just output original if no dimensions available
  cat "$TSX_FILE"
  exit 0
fi

# Function to lookup dimensions from JSON (requires jq)
lookup_dimensions() {
  local node_id="$1"
  if ! command -v jq &>/dev/null; then
    echo "Error: jq is required for fix-collapsed-containers.sh" >&2
    return 1
  fi
  jq -r --arg id "$node_id" '.[$id] // empty | "\(.w)x\(.h)"' "$DIMENSIONS_JSON" 2>/dev/null
}

FIXES_MADE=0

# Process each line of the TSX file
while IFS= read -r line || [ -n "$line" ]; do
  # Check if line has data-node-id
  if echo "$line" | grep -qE 'data-node-id="[^"]+"'; then
    # Extract node ID
    node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | sed 's/data-node-id="//;s/"//')

    # Look up dimensions
    dims=$(lookup_dimensions "$node_id")
    if [ -n "$dims" ]; then
      w=$(echo "$dims" | cut -d'x' -f1)
      h=$(echo "$dims" | cut -d'x' -f2)

      # Check if this element needs height fix:
      # - Has py-[...] (vertical padding)
      # - Lacks h-[...px] or h-full or size-full
      # - Has absolute children (we check by looking at following lines)

      needs_height=false
      needs_width=false

      # Check for collapsed height (has padding, no explicit height)
      if echo "$line" | grep -qE 'py-\[|p-\[' && ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|h-full|size-full|h-\[var'; then
        needs_height=true
      fi

      # Check for collapsed width (has padding, no explicit width)
      if echo "$line" | grep -qE 'px-\[|p-\[' && ! echo "$line" | grep -qE 'w-\[[0-9]+px\]|w-full|size-full|w-\[var'; then
        needs_width=true
      fi

      # Only fix if the element has relative/absolute positioning context
      # and could potentially collapse
      if echo "$line" | grep -qE 'relative|absolute'; then
        modified_line="$line"

        if [ "$needs_height" = true ] && [ "$h" -gt 0 ]; then
          # Add h-[Xpx] to className in the SAME element as data-node-id
          # Use perl to match className followed by data-node-id within same tag (no > between)
          new_line=$(echo "$modified_line" | perl -pe "s/(className=\")([^\"]*)(\"[^>]*data-node-id=\"\Q${node_id}\E\")/\${1}h-[${h}px] \${2}\${3}/")
          if [ "$new_line" != "$modified_line" ]; then
            modified_line="$new_line"
            FIXES_MADE=$((FIXES_MADE + 1))
            echo "  Fixed height: $node_id -> h-[${h}px]" >&2
          fi
        fi

        # For width, only fix if element explicitly lacks w-full
        if [ "$needs_width" = true ] && [ "$w" -gt 0 ] && ! echo "$line" | grep -qE 'w-full|shrink-0 w-full'; then
          new_line=$(echo "$modified_line" | perl -pe "s/(className=\")([^\"]*)(\"[^>]*data-node-id=\"\Q${node_id}\E\")/\${1}w-[${w}px] \${2}\${3}/")
          if [ "$new_line" != "$modified_line" ]; then
            modified_line="$new_line"
            FIXES_MADE=$((FIXES_MADE + 1))
            echo "  Fixed width: $node_id -> w-[${w}px]" >&2
          fi
        fi

        echo "$modified_line"
      else
        echo "$line"
      fi
    else
      echo "$line"
    fi
  else
    echo "$line"
  fi
done < "$TSX_FILE"

if [ "$FIXES_MADE" -gt 0 ]; then
  echo "✓ Applied $FIXES_MADE collapsed container fixes" >&2
else
  echo "✓ No collapsed containers detected" >&2
fi
