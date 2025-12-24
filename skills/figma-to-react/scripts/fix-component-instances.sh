#!/usr/bin/env bash
#
# fix-component-instances.sh
#
# Adds dimensions to component usages based on parent context + name matching.
# Solves the problem where component usages like <NavigationBar className="..."/>
# don't have data-node-id and thus miss their instance dimensions.
#
# Algorithm:
# 1. Build map: parentId -> [{name, type, w, h}, ...]
# 2. For each component usage <ComponentName className="...">:
#    a. Find nearest ancestor data-node-id -> parentId
#    b. Look up instances under parentId
#    c. Match by name (normalize: remove spaces, case-insensitive)
#    d. Track usage count per parent to handle duplicates
#    e. Add h-[Xpx] if missing and instance has height
#
# Usage:
#   ./fix-component-instances.sh <tsx-file> <instances-json>
#
# Arguments:
#   tsx-file        - Path to generated TSX file
#   instances-json  - Path to instances JSON from capture-figma-metadata.sh
#
# Output:
#   Writes fixed code to stdout

set -e

TSX_FILE="$1"
INSTANCES_JSON="$2"

if [ -z "$TSX_FILE" ] || [ -z "$INSTANCES_JSON" ]; then
  echo "Usage: $0 <tsx-file> <instances-json>" >&2
  exit 1
fi

if [ ! -f "$TSX_FILE" ]; then
  echo "Error: TSX file not found: $TSX_FILE" >&2
  exit 1
fi

if [ ! -f "$INSTANCES_JSON" ]; then
  # No instances file, just output original
  cat "$TSX_FILE"
  exit 0
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required" >&2
  cat "$TSX_FILE"
  exit 0
fi

# Normalize component name: "Navigation Bar" -> "navigationbar"
normalize_name() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | tr -d ' _-'
}

# Load instances into a format we can query
# Create temp files for each parent's instances
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract all parent IDs and their instance children
jq -r 'to_entries[] | .key as $parent | .value[] | select(.type == "instance") | "\($parent)\t\(.name)\t\(.w)\t\(.h)"' "$INSTANCES_JSON" > "$TEMP_DIR/all_instances.tsv"

# Track current parent context as we process lines
current_parent=""
FIXES_MADE=0

# For multiline component handling
pending_comp=""
pending_comp_line=""
pending_comp_parent=""

# Process TSX file
while IFS= read -r line || [ -n "$line" ]; do
  modified_line="$line"

  # Update current parent context if we see data-node-id
  if echo "$line" | grep -qE 'data-node-id="[^"]+"'; then
    node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | tail -1 | sed 's/data-node-id="//;s/"//')
    if [ -n "$node_id" ]; then
      current_parent="$node_id"
    fi
  fi

  # Check for start of multiline component: <ComponentName (without className on same line)
  if echo "$line" | grep -qE '<[A-Z][a-zA-Z0-9_]+$' || echo "$line" | grep -qE '<[A-Z][a-zA-Z0-9_]+[[:space:]]*$'; then
    pending_comp=$(echo "$line" | grep -oE '<[A-Z][a-zA-Z0-9_]+' | sed 's/<//')
    pending_comp_parent="$current_parent"
    pending_comp_line="$line"
  fi

  # Check if this is className line for a pending multiline component
  if [ -n "$pending_comp" ] && echo "$line" | grep -qE '^[[:space:]]*className='; then
    if [ -n "$pending_comp_parent" ]; then
      normalized_comp=$(normalize_name "$pending_comp")

      while IFS=$'\t' read -r parent name w h; do
        if [ "$parent" = "$pending_comp_parent" ]; then
          normalized_inst=$(normalize_name "$name")
          if [ "$normalized_comp" = "$normalized_inst" ]; then
            if ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|size-full'; then
              if [ "$h" -gt 0 ] 2>/dev/null; then
                modified_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}h-[${h}px] /")
                FIXES_MADE=$((FIXES_MADE + 1))
                echo "  Fixed: $pending_comp in parent $pending_comp_parent -> h-[${h}px] (multiline)" >&2
              fi
            fi
            break
          fi
        fi
      done < "$TEMP_DIR/all_instances.tsv"
    fi
    pending_comp=""
    pending_comp_parent=""
    pending_comp_line=""
  fi

  # Check if this is a single-line component usage: <ComponentName className="...">
  if echo "$line" | grep -qE '<[A-Z][a-zA-Z0-9_]+ [^>]*className='; then
    comp_name=$(echo "$line" | grep -oE '<[A-Z][a-zA-Z0-9_]+' | sed 's/<//')

    if [ -n "$comp_name" ] && [ -n "$current_parent" ]; then
      normalized_comp=$(normalize_name "$comp_name")

      while IFS=$'\t' read -r parent name w h; do
        if [ "$parent" = "$current_parent" ]; then
          normalized_inst=$(normalize_name "$name")
          if [ "$normalized_comp" = "$normalized_inst" ]; then
            if ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|size-full'; then
              if [ "$h" -gt 0 ] 2>/dev/null; then
                modified_line=$(echo "$modified_line" | perl -pe "s/(className=\")/\${1}h-[${h}px] /")
                FIXES_MADE=$((FIXES_MADE + 1))
                echo "  Fixed: $comp_name in parent $current_parent -> h-[${h}px]" >&2
              fi
            fi
            break
          fi
        fi
      done < "$TEMP_DIR/all_instances.tsv"
    fi
  fi

  # Reset pending if we hit closing tag or different element
  if [ -n "$pending_comp" ] && echo "$line" | grep -qE '/>|>'; then
    if ! echo "$line" | grep -qE 'className='; then
      pending_comp=""
      pending_comp_parent=""
    fi
  fi

  echo "$modified_line"
done < "$TSX_FILE"

if [ "$FIXES_MADE" -gt 0 ]; then
  echo "  Applied $FIXES_MADE component instance dimension fixes" >&2
fi
