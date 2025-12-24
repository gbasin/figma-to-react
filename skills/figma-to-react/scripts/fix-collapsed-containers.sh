#!/usr/bin/env bash
#
# fix-collapsed-containers.sh
#
# Fix containers that collapse because all children are absolute-positioned.
# Adds explicit h-[Xpx] or w-[Xpx] classes from Figma metadata.
#
# Two-pass approach:
#   Pass 1: Build map of ComponentName -> node-id from function definitions
#   Pass 2: Fix both inline elements (with data-node-id) AND component usages
#
# Usage modes:
#   # Single file pair (outputs to stdout - backward compatible)
#   ./fix-collapsed-containers.sh <tsx-file> <dimensions-json>
#
#   # Directory mode (auto-match files, fix in-place)
#   ./fix-collapsed-containers.sh <tsx-dir> <dimensions-dir>
#
#   # Multiple pairs (fix in-place)
#   ./fix-collapsed-containers.sh --pair <tsx1> <dims1> [--pair <tsx2> <dims2>]...
#
# Examples:
#   # Single file (stdout)
#   ./fix-collapsed-containers.sh component.tsx dimensions.json > fixed.tsx
#
#   # Directory mode (in-place)
#   ./fix-collapsed-containers.sh src/persona/ /tmp/figma-to-react/metadata/
#
#   # Multiple pairs (in-place)
#   ./fix-collapsed-containers.sh \
#     --pair src/Screen1.tsx metadata/1-1-dimensions.json \
#     --pair src/Screen2.tsx metadata/2-2-dimensions.json

set -e

# ============================================================================
# Core processing function - takes tsx and dims, outputs to stdout
# ============================================================================
process_single_file() {
  local TSX_FILE="$1"
  local DIMENSIONS_JSON="$2"
  local QUIET="${3:-false}"

  if [ ! -f "$TSX_FILE" ]; then
    echo "Error: TSX file not found: $TSX_FILE" >&2
    return 1
  fi

  if [ ! -f "$DIMENSIONS_JSON" ]; then
    # Just output original if no dimensions available
    cat "$TSX_FILE"
    return 0
  fi

  # Function to lookup dimensions from JSON
  lookup_dimensions() {
    local node_id="$1"
    jq -r --arg id "$node_id" '.[$id] // empty | "\(.w)x\(.h)"' "$DIMENSIONS_JSON" 2>/dev/null
  }

  # Function to check if dimensions were manually added
  is_manual_dimension() {
    local node_id="$1"
    jq -e --arg id "$node_id" '.[$id].manual // false' "$DIMENSIONS_JSON" &>/dev/null
  }

  # ============================================================================
  # PASS 1: Build component name -> node-id map
  # ============================================================================
  declare -A COMPONENT_NODE_IDS

  TEMP_MAP=$(mktemp)
  trap "rm -f $TEMP_MAP" RETURN

  current_component=""
  in_component=false

  while IFS= read -r line; do
    if echo "$line" | grep -qE '^function [A-Z][A-Za-z0-9_]+\s*[(<]'; then
      current_component=$(echo "$line" | grep -oE 'function [A-Z][A-Za-z0-9_]+' | sed 's/function //')
      in_component=true
    fi

    if [ "$in_component" = true ] && [ -n "$current_component" ]; then
      if echo "$line" | grep -qE 'data-node-id="[^"]+".*className=\{className\}|className=\{className\}.*data-node-id="[^"]+"'; then
        node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | head -1 | sed 's/data-node-id="//;s/"//')
        if [ -n "$node_id" ]; then
          echo "$current_component=$node_id" >> "$TEMP_MAP"
          [ "$QUIET" = false ] && echo "  Mapped component: $current_component -> $node_id" >&2
        fi
        in_component=false
        current_component=""
      fi
      if echo "$line" | grep -qE '^(function |export |const [A-Z])' && ! echo "$line" | grep -qE "^function $current_component"; then
        in_component=false
        current_component=""
      fi
    fi
  done < "$TSX_FILE"

  while IFS='=' read -r comp_name node_id; do
    COMPONENT_NODE_IDS["$comp_name"]="$node_id"
  done < "$TEMP_MAP"

  [ "$QUIET" = false ] && echo "  Found ${#COMPONENT_NODE_IDS[@]} component mappings" >&2

  # ============================================================================
  # PASS 2: Process lines and apply fixes
  # ============================================================================
  FIXES_MADE=0

  needs_height_fix_conservative() {
    local line="$1"
    echo "$line" | grep -qE 'py-\[|p-\[' && ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|h-full|h-auto|h-fit|size-full|h-\[var'
  }

  needs_height_fix_aggressive() {
    local line="$1"
    echo "$line" | grep -qE 'py-\[|p-\[' && ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|size-full|h-\[var'
  }

  has_relative_height() {
    local line="$1"
    echo "$line" | grep -qE '(^|[" ])h-(full|auto|fit)[" ]'
  }

  needs_width_fix_conservative() {
    local line="$1"
    echo "$line" | grep -qE 'px-\[|p-\[' && ! echo "$line" | grep -qE 'w-\[[0-9]+px\]|w-full|w-auto|w-fit|size-full|w-\[var'
  }

  needs_width_fix_aggressive() {
    local line="$1"
    echo "$line" | grep -qE 'px-\[|p-\[' && ! echo "$line" | grep -qE 'w-\[[0-9]+px\]|size-full|w-\[var'
  }

  has_relative_width() {
    local line="$1"
    echo "$line" | grep -qE '(^|[" ])w-(full|auto|fit)[" ]'
  }

  has_positioning() {
    local line="$1"
    echo "$line" | grep -qE 'relative|absolute'
  }

  while IFS= read -r line || [ -n "$line" ]; do
    modified_line="$line"
    node_id=""

    if echo "$line" | grep -qE 'data-node-id="[^"]+"'; then
      node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | sed 's/data-node-id="//;s/"//')
    fi

    if [ -z "$node_id" ]; then
      component_name=$(echo "$line" | grep -oE '<[A-Z][A-Za-z0-9_]+\s+className=' | sed 's/<//;s/[[:space:]]*className=//;s/[[:space:]]//g' | head -1)
      if [ -n "$component_name" ] && [ -n "${COMPONENT_NODE_IDS[$component_name]}" ]; then
        node_id="${COMPONENT_NODE_IDS[$component_name]}"
      fi
    fi

    if [ -n "$node_id" ]; then
      dims=$(lookup_dimensions "$node_id")
      if [ -n "$dims" ]; then
        w=$(echo "$dims" | cut -d'x' -f1)
        h=$(echo "$dims" | cut -d'x' -f2)

        if has_positioning "$line"; then
          is_manual=false
          if is_manual_dimension "$node_id"; then
            is_manual=true
          fi

          if [ "$h" -gt 0 ]; then
            if [ "$is_manual" = true ] && needs_height_fix_aggressive "$line"; then
              if has_relative_height "$modified_line"; then
                old_class=$(echo "$modified_line" | grep -oE '(^|[" ])h-(full|auto|fit)' | sed 's/^[" ]*//' | head -1)
                new_line=$(echo "$modified_line" | sed -E "s/([\" ])h-(full|auto|fit)([\" ])/\1h-[${h}px]\3/g")
                if [ "$new_line" != "$modified_line" ]; then
                  modified_line="$new_line"
                  FIXES_MADE=$((FIXES_MADE + 1))
                  [ "$QUIET" = false ] && echo "  Fixed height: $node_id -> h-[${h}px] (replaced $old_class, manual)" >&2
                fi
              else
                new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}h-[${h}px] /")
                if [ "$new_line" != "$modified_line" ]; then
                  modified_line="$new_line"
                  FIXES_MADE=$((FIXES_MADE + 1))
                  [ "$QUIET" = false ] && echo "  Fixed height: $node_id -> h-[${h}px] (manual)" >&2
                fi
              fi
            elif [ "$is_manual" = false ] && needs_height_fix_conservative "$line"; then
              new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}h-[${h}px] /")
              if [ "$new_line" != "$modified_line" ]; then
                modified_line="$new_line"
                FIXES_MADE=$((FIXES_MADE + 1))
                [ "$QUIET" = false ] && echo "  Fixed height: $node_id -> h-[${h}px]" >&2
              fi
            fi
          fi

          if [ "$w" -gt 0 ]; then
            if [ "$is_manual" = true ] && needs_width_fix_aggressive "$line"; then
              if has_relative_width "$modified_line"; then
                old_class=$(echo "$modified_line" | grep -oE '(^|[" ])w-(full|auto|fit)' | sed 's/^[" ]*//' | head -1)
                new_line=$(echo "$modified_line" | sed -E "s/([\" ])w-(full|auto|fit)([\" ])/\1w-[${w}px]\3/g")
                if [ "$new_line" != "$modified_line" ]; then
                  modified_line="$new_line"
                  FIXES_MADE=$((FIXES_MADE + 1))
                  [ "$QUIET" = false ] && echo "  Fixed width: $node_id -> w-[${w}px] (replaced $old_class, manual)" >&2
                fi
              else
                new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}w-[${w}px] /")
                if [ "$new_line" != "$modified_line" ]; then
                  modified_line="$new_line"
                  FIXES_MADE=$((FIXES_MADE + 1))
                  [ "$QUIET" = false ] && echo "  Fixed width: $node_id -> w-[${w}px] (manual)" >&2
                fi
              fi
            elif [ "$is_manual" = false ] && needs_width_fix_conservative "$line"; then
              new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}w-[${w}px] /")
              if [ "$new_line" != "$modified_line" ]; then
                modified_line="$new_line"
                FIXES_MADE=$((FIXES_MADE + 1))
                [ "$QUIET" = false ] && echo "  Fixed width: $node_id -> w-[${w}px]" >&2
              fi
            fi
          fi
        fi
      fi
    fi

    echo "$modified_line"
  done < "$TSX_FILE"

  if [ "$FIXES_MADE" -gt 0 ]; then
    echo "✓ Applied $FIXES_MADE collapsed container fixes to $(basename "$TSX_FILE")" >&2
  else
    [ "$QUIET" = false ] && echo "✓ No collapsed containers in $(basename "$TSX_FILE")" >&2
  fi

  # Return fix count via exit code (capped at 125 for safety)
  return 0
}

# ============================================================================
# Mode detection and dispatch
# ============================================================================

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required for fix-collapsed-containers.sh" >&2
  exit 1
fi

# Mode 3: Multiple pairs (--pair flag)
if [ "$1" = "--pair" ]; then
  TOTAL_FIXES=0
  FILES_PROCESSED=0

  while [ $# -gt 0 ]; do
    if [ "$1" = "--pair" ]; then
      shift
      if [ $# -lt 2 ]; then
        echo "Error: --pair requires <tsx-file> <dimensions-json>" >&2
        exit 1
      fi
      TSX_FILE="$1"
      DIMS_FILE="$2"
      shift 2

      if [ ! -f "$TSX_FILE" ]; then
        echo "Error: TSX file not found: $TSX_FILE" >&2
        exit 1
      fi

      echo "Processing $(basename "$TSX_FILE")..." >&2
      TEMP_OUTPUT=$(mktemp)
      process_single_file "$TSX_FILE" "$DIMS_FILE" true > "$TEMP_OUTPUT"
      mv "$TEMP_OUTPUT" "$TSX_FILE"
      FILES_PROCESSED=$((FILES_PROCESSED + 1))
    else
      echo "Error: Expected --pair, got: $1" >&2
      exit 1
    fi
  done

  echo "✓ Processed $FILES_PROCESSED files" >&2
  exit 0
fi

# Mode 2: Directory mode (both args are directories)
if [ -d "$1" ] && [ -d "$2" ]; then
  TSX_DIR="$1"
  DIMS_DIR="$2"
  TOTAL_FIXES=0
  FILES_PROCESSED=0

  echo "=== Batch Processing ===" >&2
  echo "TSX directory: $TSX_DIR" >&2
  echo "Dimensions directory: $DIMS_DIR" >&2

  # Find all tsx files and try to match with dimensions
  for tsx_file in "$TSX_DIR"/*.tsx; do
    [ -f "$tsx_file" ] || continue

    # Try to find matching dimensions file
    # Extract potential node IDs from the tsx filename or content
    basename_tsx=$(basename "$tsx_file" .tsx)

    # Look for dimensions files that might match
    MATCHED_DIMS=""
    for dims_file in "$DIMS_DIR"/*-dimensions.json; do
      [ -f "$dims_file" ] || continue

      # Extract node ID from dimensions filename (e.g., 237-2571-dimensions.json -> 237-2571)
      dims_node_id=$(basename "$dims_file" -dimensions.json)

      # Check if the tsx file references this node ID
      if grep -q "data-node-id=\"${dims_node_id//-/:}\"" "$tsx_file" 2>/dev/null; then
        MATCHED_DIMS="$dims_file"
        break
      fi
    done

    if [ -n "$MATCHED_DIMS" ]; then
      echo "Processing $(basename "$tsx_file") with $(basename "$MATCHED_DIMS")..." >&2
      TEMP_OUTPUT=$(mktemp)
      process_single_file "$tsx_file" "$MATCHED_DIMS" true > "$TEMP_OUTPUT"
      mv "$TEMP_OUTPUT" "$tsx_file"
      FILES_PROCESSED=$((FILES_PROCESSED + 1))
    fi
  done

  if [ "$FILES_PROCESSED" -eq 0 ]; then
    echo "Warning: No matching tsx/dimensions pairs found" >&2
  else
    echo "✓ Processed $FILES_PROCESSED files" >&2
  fi
  exit 0
fi

# Mode 1: Single file pair (backward compatible - stdout)
TSX_FILE="$1"
DIMENSIONS_JSON="$2"

if [ -z "$TSX_FILE" ] || [ -z "$DIMENSIONS_JSON" ]; then
  echo "Usage:" >&2
  echo "  $0 <tsx-file> <dimensions-json>              # Single file (stdout)" >&2
  echo "  $0 <tsx-dir> <dimensions-dir>                # Directory mode (in-place)" >&2
  echo "  $0 --pair <tsx1> <dims1> [--pair <tsx2>...]  # Multiple pairs (in-place)" >&2
  exit 1
fi

if [ ! -f "$TSX_FILE" ]; then
  echo "Error: TSX file not found: $TSX_FILE" >&2
  exit 1
fi

if [ ! -f "$DIMENSIONS_JSON" ]; then
  echo "Error: Dimensions JSON not found: $DIMENSIONS_JSON" >&2
  cat "$TSX_FILE"
  exit 0
fi

process_single_file "$TSX_FILE" "$DIMENSIONS_JSON" false
