#!/usr/bin/env bash
#
# validate-dimensions-coverage.sh
#
# Validates that all data-node-id values in the TSX have corresponding
# dimensions in the dimensions JSON. Reports missing ones that have
# collapse-prone patterns (padding + positioning).
#
# Usage:
#   ./validate-dimensions-coverage.sh <tsx-file> <dimensions-json> [--all]
#   ./validate-dimensions-coverage.sh <captures-dir> <metadata-dir> [--all]
#   ./validate-dimensions-coverage.sh <tsx-file1> <tsx-file2> ... <metadata-dir> [--all]
#
# Arguments:
#   tsx-file        - Path to generated TSX file (or capture txt)
#   dimensions-json - Path to dimensions JSON map
#   captures-dir    - Directory containing figma-*.txt files
#   metadata-dir    - Directory containing *-dimensions.json files
#   --all           - Report ALL missing IDs, not just collapse-prone ones
#
# Examples:
#   # Single file
#   ./validate-dimensions-coverage.sh captures/figma-237-2571.txt metadata/237-2571-dimensions.json
#
#   # All files in directories
#   ./validate-dimensions-coverage.sh captures/ metadata/
#
#   # Multiple specific files
#   ./validate-dimensions-coverage.sh captures/figma-237-2571.txt captures/figma-237-2416.txt metadata/
#
# Output:
#   - JSON with missing node IDs that need dimensions (per file or combined)
#   - Human-readable summary to stderr
#
# Exit codes:
#   0 - All collapse-prone node IDs have dimensions
#   1 - Missing dimensions for collapse-prone nodes

set -e

# Parse arguments - check for --all flag
REPORT_ALL=""
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--all" ]; then
    REPORT_ALL="--all"
  else
    ARGS+=("$arg")
  fi
done

if [ ${#ARGS[@]} -lt 2 ]; then
  echo "Usage: $0 <tsx-file|captures-dir> <dimensions-json|metadata-dir> [--all]" >&2
  echo "       $0 <tsx1> <tsx2> ... <metadata-dir> [--all]" >&2
  exit 1
fi

# Determine mode: single file, directory, or multi-file
LAST_ARG="${ARGS[-1]}"
FIRST_ARG="${ARGS[0]}"

# Function to extract node ID from filename (e.g., figma-237-2571.txt -> 237-2571)
extract_node_id() {
  basename "$1" | sed -E 's/^figma-//; s/\.(txt|tsx)$//'
}

# Function to find matching dimensions JSON for a tsx/txt file
find_dimensions_json() {
  local tsx_file="$1"
  local metadata_dir="$2"
  local node_id=$(extract_node_id "$tsx_file")
  local dim_file="$metadata_dir/${node_id}-dimensions.json"
  if [ -f "$dim_file" ]; then
    echo "$dim_file"
  fi
}

# Collect file pairs to process
declare -a TSX_FILES
declare -a DIM_FILES

if [ -d "$FIRST_ARG" ] && [ -d "$LAST_ARG" ]; then
  # Both are directories - match by node ID
  CAPTURES_DIR="$FIRST_ARG"
  METADATA_DIR="$LAST_ARG"
  for tsx in "$CAPTURES_DIR"/figma-*.txt; do
    [ -f "$tsx" ] || continue
    dim=$(find_dimensions_json "$tsx" "$METADATA_DIR")
    if [ -n "$dim" ]; then
      TSX_FILES+=("$tsx")
      DIM_FILES+=("$dim")
    else
      echo "Warning: No dimensions file for $(basename "$tsx")" >&2
    fi
  done
elif [ -d "$LAST_ARG" ]; then
  # Last arg is directory, rest are files
  METADATA_DIR="$LAST_ARG"
  for ((i=0; i<${#ARGS[@]}-1; i++)); do
    tsx="${ARGS[$i]}"
    if [ ! -f "$tsx" ]; then
      echo "Error: File not found: $tsx" >&2
      exit 1
    fi
    dim=$(find_dimensions_json "$tsx" "$METADATA_DIR")
    if [ -n "$dim" ]; then
      TSX_FILES+=("$tsx")
      DIM_FILES+=("$dim")
    else
      echo "Warning: No dimensions file for $(basename "$tsx")" >&2
    fi
  done
else
  # Single file pair (original behavior)
  TSX_FILES=("$FIRST_ARG")
  DIM_FILES=("$LAST_ARG")
fi

if [ ${#TSX_FILES[@]} -eq 0 ]; then
  echo "Error: No matching file pairs found" >&2
  exit 1
fi

# Validate files exist
for tsx in "${TSX_FILES[@]}"; do
  if [ ! -f "$tsx" ]; then
    echo "Error: TSX file not found: $tsx" >&2
    exit 1
  fi
done
for dim in "${DIM_FILES[@]}"; do
  if [ ! -f "$dim" ]; then
    echo "Error: Dimensions JSON not found: $dim" >&2
    exit 1
  fi
done

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required" >&2
  exit 1
fi

# Helper: check if a line has collapse pattern (padding + positioning, no explicit dimension)
has_collapse_pattern() {
  local line="$1"
  # Must have positioning
  if ! echo "$line" | grep -qE 'relative|absolute'; then
    return 1
  fi
  # Must have padding without explicit dimension
  # Use word boundaries to avoid matching top-[, gap-[, etc.
  # Padding classes: p-[...], py-[...], px-[...], pt-[...], pb-[...], pl-[...], pr-[...]
  if echo "$line" | grep -qE '(^|[" ])p[ytblrx]?-\[' && ! echo "$line" | grep -qE 'h-\[[0-9]+px\]|h-full|size-full'; then
    return 0
  fi
  if echo "$line" | grep -qE '(^|[" ])p[xlr]?-\[' && ! echo "$line" | grep -qE 'w-\[[0-9]+px\]|w-full|size-full'; then
    return 0
  fi
  return 1
}

# Process a single file pair and output JSON fragment
process_file_pair() {
  local tsx_file="$1"
  local dim_json="$2"
  local file_idx="$3"

  # Extract all node IDs from dimensions.json
  local DIM_NODE_IDS=$(jq -r 'keys[]' "$dim_json" 2>/dev/null | sort -u)

  # Find missing node IDs
  local -a MISSING=()
  local -a MISSING_CRITICAL=()
  local -a ALL_TSX_IDS=()
  local -A NODE_NAMES=()

  while IFS= read -r line; do
    # Extract node ID from line
    local node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | sed 's/data-node-id="//;s/"//')
    [ -z "$node_id" ] && continue

    # Extract component/element name if present
    local node_name=$(echo "$line" | grep -oE 'data-name="[^"]+"' | sed 's/data-name="//;s/"//')
    if [ -z "$node_name" ]; then
      # Try to get component name from tag like <ComponentName
      node_name=$(echo "$line" | grep -oE '<[A-Z][A-Za-z0-9_]+' | head -1 | tr -d '<')
    fi
    [ -n "$node_name" ] && NODE_NAMES["$node_id"]="$node_name"

    ALL_TSX_IDS+=("$node_id")

    # Check if dimensions exist
    if ! echo "$DIM_NODE_IDS" | grep -qx "$node_id"; then
      MISSING+=("$node_id")

      # Check if this is a collapse-prone node
      if has_collapse_pattern "$line"; then
        MISSING_CRITICAL+=("$node_id")
      fi
    fi
  done < "$tsx_file"

  # Deduplicate
  MISSING=($(printf '%s\n' "${MISSING[@]}" | sort -u))
  MISSING_CRITICAL=($(printf '%s\n' "${MISSING_CRITICAL[@]}" | sort -u))
  ALL_TSX_IDS=($(printf '%s\n' "${ALL_TSX_IDS[@]}" | sort -u))

  local TSX_COUNT=${#ALL_TSX_IDS[@]}
  local DIM_COUNT=$(echo "$DIM_NODE_IDS" | wc -l | tr -d ' ')
  local MISSING_COUNT=${#MISSING[@]}
  local CRITICAL_COUNT=${#MISSING_CRITICAL[@]}

  echo "=== $(basename "$tsx_file") ===" >&2
  echo "  TSX node IDs:           $TSX_COUNT" >&2
  echo "  Dimensions entries:     $DIM_COUNT" >&2
  echo "  Missing dimensions:     $MISSING_COUNT" >&2
  echo "  Missing (collapse-prone): $CRITICAL_COUNT" >&2

  # Decide which list to report
  local -a REPORT_LIST
  local REPORT_COUNT
  if [ "$REPORT_ALL" = "--all" ]; then
    REPORT_LIST=("${MISSING[@]}")
    REPORT_COUNT=$MISSING_COUNT
  else
    REPORT_LIST=("${MISSING_CRITICAL[@]}")
    REPORT_COUNT=$CRITICAL_COUNT
  fi

  if [ $REPORT_COUNT -eq 0 ]; then
    if [ $MISSING_COUNT -eq 0 ]; then
      echo "  ✓ All node IDs have dimensions" >&2
    else
      echo "  ✓ All collapse-prone nodes have dimensions ($MISSING_COUNT non-critical missing)" >&2
    fi
  else
    echo "  ⚠ Missing dimensions for collapse-prone nodes:" >&2
    for node_id in "${REPORT_LIST[@]}"; do
      local name="${NODE_NAMES[$node_id]}"
      if [ -n "$name" ]; then
        echo "    - $name ($node_id)" >&2
      else
        echo "    - $node_id" >&2
      fi
    done
  fi
  echo "" >&2

  # Output JSON for this file
  echo "    {"
  echo "      \"tsx_file\": \"$tsx_file\","
  echo "      \"dimensions_file\": \"$dim_json\","
  echo "      \"missing\": ["
  for i in "${!REPORT_LIST[@]}"; do
    local node_id="${REPORT_LIST[$i]}"
    local name="${NODE_NAMES[$node_id]}"
    if [ $i -eq $((REPORT_COUNT - 1)) ]; then
      echo "        {\"id\": \"$node_id\", \"name\": \"${name:-unknown}\"}"
    else
      echo "        {\"id\": \"$node_id\", \"name\": \"${name:-unknown}\"},"
    fi
  done
  echo "      ],"
  echo "      \"total_missing\": $MISSING_COUNT,"
  echo "      \"critical_missing\": $CRITICAL_COUNT"
  echo "    }"

  # Return counts for exit code calculation
  echo "$CRITICAL_COUNT $REPORT_COUNT" > /tmp/validate-dims-critical-$$-$file_idx
}

# Main processing
TOTAL_CRITICAL=0
TOTAL_REPORTED=0
FILE_COUNT=${#TSX_FILES[@]}

echo "=== Dimensions Coverage Validation ===" >&2
echo "Processing $FILE_COUNT file(s)..." >&2
echo "" >&2

# Collect JSON output in array to handle commas properly
declare -a JSON_PARTS

for i in "${!TSX_FILES[@]}"; do
  # Capture JSON output from function
  JSON_PART=$(process_file_pair "${TSX_FILES[$i]}" "${DIM_FILES[$i]}" "$i")
  JSON_PARTS+=("$JSON_PART")

  # Accumulate counts
  if [ -f "/tmp/validate-dims-critical-$$-$i" ]; then
    read CRITICAL REPORTED < "/tmp/validate-dims-critical-$$-$i"
    TOTAL_CRITICAL=$((TOTAL_CRITICAL + CRITICAL))
    TOTAL_REPORTED=$((TOTAL_REPORTED + REPORTED))
    rm -f "/tmp/validate-dims-critical-$$-$i"
  fi
done

# Output combined JSON
echo "{"
echo "  \"files\": ["
for i in "${!JSON_PARTS[@]}"; do
  echo "${JSON_PARTS[$i]}"
  if [ $i -lt $((FILE_COUNT - 1)) ]; then
    echo "    ,"
  fi
done
echo "  ],"
echo "  \"total_files\": $FILE_COUNT,"
echo "  \"total_critical_missing\": $TOTAL_CRITICAL,"
echo "  \"total_reported_missing\": $TOTAL_REPORTED"
echo "}"

# Summary
echo "=== Summary ===" >&2
echo "Files processed:        $FILE_COUNT" >&2
echo "Total critical missing: $TOTAL_CRITICAL" >&2
if [ "$REPORT_ALL" = "--all" ]; then
  echo "Total reported missing: $TOTAL_REPORTED" >&2
fi

# Exit code: with --all, exit 1 if any reported; otherwise exit 1 if any critical
if [ "$REPORT_ALL" = "--all" ]; then
  if [ $TOTAL_REPORTED -eq 0 ]; then
    echo "✓ All node IDs have dimensions" >&2
    exit 0
  else
    echo "⚠ Some files have missing dimensions" >&2
    exit 1
  fi
else
  if [ $TOTAL_CRITICAL -eq 0 ]; then
    echo "✓ All collapse-prone nodes have dimensions" >&2
    exit 0
  else
    echo "⚠ Some files have missing dimensions" >&2
    exit 1
  fi
fi
