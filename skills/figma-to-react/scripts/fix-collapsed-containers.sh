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

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required for fix-collapsed-containers.sh" >&2
  cat "$TSX_FILE"
  exit 0
fi

# Function to lookup dimensions from JSON
lookup_dimensions() {
  local node_id="$1"
  jq -r --arg id "$node_id" '.[$id] // empty | "\(.w)x\(.h)"' "$DIMENSIONS_JSON" 2>/dev/null
}

# Function to check if dimensions were manually added (vs from Figma MCP)
# Manual dimensions should aggressively replace relative sizing (w-full, h-auto, etc.)
# Figma MCP dimensions should preserve relative sizing (trust the design intent)
is_manual_dimension() {
  local node_id="$1"
  jq -e --arg id "$node_id" '.[$id].manual // false' "$DIMENSIONS_JSON" &>/dev/null
}

# ============================================================================
# PASS 1: Build component name -> node-id map
# ============================================================================
# Look for patterns like:
#   function ComponentName(...) {
#     return (
#       <div data-node-id="X" className={className}>
# or:
#   type ComponentNameProps = { className?: string; };
#   function ComponentName({ className }: ComponentNameProps) {
#     return <div data-node-id="X" className={className}>

declare -A COMPONENT_NODE_IDS

# Use a temp file to build the map (avoids subshell issues with while read)
TEMP_MAP=$(mktemp)
trap "rm -f $TEMP_MAP" EXIT

current_component=""
in_component=false

while IFS= read -r line; do
  # Detect function definition: function ComponentName( or function ComponentName<
  if echo "$line" | grep -qE '^function [A-Z][A-Za-z0-9_]+\s*[(<]'; then
    current_component=$(echo "$line" | grep -oE 'function [A-Z][A-Za-z0-9_]+' | sed 's/function //')
    in_component=true
  fi

  # If in a component and we find data-node-id with className={className}, map it
  if [ "$in_component" = true ] && [ -n "$current_component" ]; then
    if echo "$line" | grep -qE 'data-node-id="[^"]+".*className=\{className\}|className=\{className\}.*data-node-id="[^"]+"'; then
      node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | head -1 | sed 's/data-node-id="//;s/"//')
      if [ -n "$node_id" ]; then
        echo "$current_component=$node_id" >> "$TEMP_MAP"
        echo "  Mapped component: $current_component -> $node_id" >&2
      fi
      in_component=false
      current_component=""
    fi
    # Also end component search if we hit another function or export
    if echo "$line" | grep -qE '^(function |export |const [A-Z])' && ! echo "$line" | grep -qE "^function $current_component"; then
      in_component=false
      current_component=""
    fi
  fi
done < "$TSX_FILE"

# Load the map into the associative array
while IFS='=' read -r comp_name node_id; do
  COMPONENT_NODE_IDS["$comp_name"]="$node_id"
done < "$TEMP_MAP"

echo "  Found ${#COMPONENT_NODE_IDS[@]} component mappings" >&2

# ============================================================================
# PASS 2: Process lines and apply fixes
# ============================================================================

FIXES_MADE=0

# Helper to check if line needs height fix (conservative - for Figma MCP dimensions)
# Excludes elements with relative sizing (h-full, etc.) - trust the design intent
needs_height_fix_conservative() {
  local line="$1"
  # Has vertical padding but no explicit height (pixel or relative)
  echo "$line" | grep -qE 'py-\[|p-\[' && ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|h-full|h-auto|h-fit|size-full|h-\[var'
}

# Helper to check if line needs height fix (aggressive - for manual dimensions)
# Does NOT exclude relative sizing - we may need to replace them
needs_height_fix_aggressive() {
  local line="$1"
  # Has vertical padding but no explicit pixel height
  echo "$line" | grep -qE 'py-\[|p-\[' && ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|size-full|h-\[var'
}

# Helper to check if line has relative height that should be replaced
# Includes: h-full, h-auto, h-fit
has_relative_height() {
  local line="$1"
  echo "$line" | grep -qE '(^|[" ])h-(full|auto|fit)[" ]'
}

# Helper to check if line needs width fix (conservative - for Figma MCP dimensions)
# Excludes elements with relative sizing (w-full, etc.) - trust the design intent
needs_width_fix_conservative() {
  local line="$1"
  # Has horizontal padding but no explicit width (pixel or relative)
  echo "$line" | grep -qE 'px-\[|p-\[' && ! echo "$line" | grep -qE 'w-\[[0-9]+px\]|w-full|w-auto|w-fit|size-full|w-\[var'
}

# Helper to check if line needs width fix (aggressive - for manual dimensions)
# Does NOT exclude relative sizing - we may need to replace them
needs_width_fix_aggressive() {
  local line="$1"
  # Has horizontal padding but no explicit pixel width
  echo "$line" | grep -qE 'px-\[|p-\[' && ! echo "$line" | grep -qE 'w-\[[0-9]+px\]|size-full|w-\[var'
}

# Helper to check if line has relative width that should be replaced
# Includes: w-full, w-auto, w-fit
has_relative_width() {
  local line="$1"
  echo "$line" | grep -qE '(^|[" ])w-(full|auto|fit)[" ]'
}

# Helper to check if line has collapse-prone positioning
has_positioning() {
  local line="$1"
  echo "$line" | grep -qE 'relative|absolute'
}

while IFS= read -r line || [ -n "$line" ]; do
  modified_line="$line"
  node_id=""

  # Case 1: Line has data-node-id directly (inline element)
  if echo "$line" | grep -qE 'data-node-id="[^"]+"'; then
    node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | sed 's/data-node-id="//;s/"//')
  fi

  # Case 2: Line is a component usage like <ComponentName className="..."/>
  # Check if it matches a known component with className prop
  if [ -z "$node_id" ]; then
    component_name=$(echo "$line" | grep -oE '<[A-Z][A-Za-z0-9_]+\s+className=' | sed 's/<//;s/[[:space:]]*className=//;s/[[:space:]]//g' | head -1)
    if [ -n "$component_name" ] && [ -n "${COMPONENT_NODE_IDS[$component_name]}" ]; then
      node_id="${COMPONENT_NODE_IDS[$component_name]}"
    fi
  fi

  # If we have a node_id, check if fixes are needed
  if [ -n "$node_id" ]; then
    dims=$(lookup_dimensions "$node_id")
    if [ -n "$dims" ]; then
      w=$(echo "$dims" | cut -d'x' -f1)
      h=$(echo "$dims" | cut -d'x' -f2)

      # Check className content - for component usages, the className is in this line
      # For inline elements, className might be a prop or literal

      # Only apply fixes if the line has positioning context
      if has_positioning "$line"; then
        # Check if this is a manually-added dimension (collapse fix)
        # Manual = aggressive (replace relative sizing)
        # Figma MCP = conservative (preserve relative sizing)
        is_manual=false
        if is_manual_dimension "$node_id"; then
          is_manual=true
        fi

        # Fix height
        if [ "$h" -gt 0 ]; then
          if [ "$is_manual" = true ] && needs_height_fix_aggressive "$line"; then
            # Manual dimension: aggressively replace relative sizing
            if has_relative_height "$modified_line"; then
              old_class=$(echo "$modified_line" | grep -oE '(^|[" ])h-(full|auto|fit)' | sed 's/^[" ]*//' | head -1)
              new_line=$(echo "$modified_line" | sed -E "s/([\" ])h-(full|auto|fit)([\" ])/\1h-[${h}px]\3/g")
              if [ "$new_line" != "$modified_line" ]; then
                modified_line="$new_line"
                FIXES_MADE=$((FIXES_MADE + 1))
                echo "  Fixed height: $node_id -> h-[${h}px] (replaced $old_class, manual)" >&2
              fi
            else
              new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}h-[${h}px] /")
              if [ "$new_line" != "$modified_line" ]; then
                modified_line="$new_line"
                FIXES_MADE=$((FIXES_MADE + 1))
                echo "  Fixed height: $node_id -> h-[${h}px] (manual)" >&2
              fi
            fi
          elif [ "$is_manual" = false ] && needs_height_fix_conservative "$line"; then
            # Figma MCP dimension: only add if no relative sizing present
            new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}h-[${h}px] /")
            if [ "$new_line" != "$modified_line" ]; then
              modified_line="$new_line"
              FIXES_MADE=$((FIXES_MADE + 1))
              echo "  Fixed height: $node_id -> h-[${h}px]" >&2
            fi
          fi
        fi

        # Fix width
        if [ "$w" -gt 0 ]; then
          if [ "$is_manual" = true ] && needs_width_fix_aggressive "$line"; then
            # Manual dimension: aggressively replace relative sizing
            if has_relative_width "$modified_line"; then
              old_class=$(echo "$modified_line" | grep -oE '(^|[" ])w-(full|auto|fit)' | sed 's/^[" ]*//' | head -1)
              new_line=$(echo "$modified_line" | sed -E "s/([\" ])w-(full|auto|fit)([\" ])/\1w-[${w}px]\3/g")
              if [ "$new_line" != "$modified_line" ]; then
                modified_line="$new_line"
                FIXES_MADE=$((FIXES_MADE + 1))
                echo "  Fixed width: $node_id -> w-[${w}px] (replaced $old_class, manual)" >&2
              fi
            else
              new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}w-[${w}px] /")
              if [ "$new_line" != "$modified_line" ]; then
                modified_line="$new_line"
                FIXES_MADE=$((FIXES_MADE + 1))
                echo "  Fixed width: $node_id -> w-[${w}px] (manual)" >&2
              fi
            fi
          elif [ "$is_manual" = false ] && needs_width_fix_conservative "$line"; then
            # Figma MCP dimension: only add if no relative sizing present
            new_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}w-[${w}px] /")
            if [ "$new_line" != "$modified_line" ]; then
              modified_line="$new_line"
              FIXES_MADE=$((FIXES_MADE + 1))
              echo "  Fixed width: $node_id -> w-[${w}px]" >&2
            fi
          fi
        fi
      fi
    fi
  fi

  echo "$modified_line"
done < "$TSX_FILE"

if [ "$FIXES_MADE" -gt 0 ]; then
  echo "✓ Applied $FIXES_MADE collapsed container fixes" >&2
else
  echo "✓ No collapsed containers detected" >&2
fi
