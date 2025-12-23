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
#
# Arguments:
#   tsx-file        - Path to generated TSX file
#   dimensions-json - Path to dimensions JSON map
#   --all           - Report ALL missing IDs, not just collapse-prone ones
#
# Output:
#   - JSON with missing node IDs that need dimensions
#   - Human-readable summary to stderr
#
# Exit codes:
#   0 - All collapse-prone node IDs have dimensions
#   1 - Missing dimensions for collapse-prone nodes

set -e

TSX_FILE="$1"
DIMENSIONS_JSON="$2"
REPORT_ALL="${3:-}"

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
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required" >&2
  exit 1
fi

# Extract all node IDs from dimensions.json
DIM_NODE_IDS=$(jq -r 'keys[]' "$DIMENSIONS_JSON" 2>/dev/null | sort -u)

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

# Find missing node IDs (with optional collapse pattern filter)
MISSING=()
MISSING_CRITICAL=()
MISSING_NAMES=()
ALL_TSX_IDS=()

declare -A NODE_NAMES

while IFS= read -r line; do
  # Extract node ID from line
  node_id=$(echo "$line" | grep -oE 'data-node-id="[^"]+"' | sed 's/data-node-id="//;s/"//')
  [ -z "$node_id" ] && continue

  # Extract component/element name if present
  node_name=$(echo "$line" | grep -oE 'data-name="[^"]+"' | sed 's/data-name="//;s/"//')
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
done < "$TSX_FILE"

# Deduplicate
MISSING=($(printf '%s\n' "${MISSING[@]}" | sort -u))
MISSING_CRITICAL=($(printf '%s\n' "${MISSING_CRITICAL[@]}" | sort -u))
ALL_TSX_IDS=($(printf '%s\n' "${ALL_TSX_IDS[@]}" | sort -u))

TSX_COUNT=${#ALL_TSX_IDS[@]}
DIM_COUNT=$(echo "$DIM_NODE_IDS" | wc -l | tr -d ' ')
MISSING_COUNT=${#MISSING[@]}
CRITICAL_COUNT=${#MISSING_CRITICAL[@]}

echo "=== Dimensions Coverage Validation ===" >&2
echo "  TSX node IDs:           $TSX_COUNT" >&2
echo "  Dimensions entries:     $DIM_COUNT" >&2
echo "  Missing dimensions:     $MISSING_COUNT" >&2
echo "  Missing (collapse-prone): $CRITICAL_COUNT" >&2
echo "" >&2

# Decide which list to report
if [ "$REPORT_ALL" = "--all" ]; then
  REPORT_LIST=("${MISSING[@]}")
  REPORT_COUNT=$MISSING_COUNT
else
  REPORT_LIST=("${MISSING_CRITICAL[@]}")
  REPORT_COUNT=$CRITICAL_COUNT
fi

if [ $REPORT_COUNT -eq 0 ]; then
  if [ $MISSING_COUNT -eq 0 ]; then
    echo "✓ All node IDs have dimensions" >&2
  else
    echo "✓ All collapse-prone nodes have dimensions ($MISSING_COUNT non-critical missing)" >&2
  fi
  echo "{}"
  exit 0
fi

echo "⚠ Missing dimensions for collapse-prone nodes:" >&2
for node_id in "${REPORT_LIST[@]}"; do
  name="${NODE_NAMES[$node_id]}"
  if [ -n "$name" ]; then
    echo "  - $name ($node_id)" >&2
  else
    echo "  - $node_id" >&2
  fi
done
echo "" >&2

# Output missing node IDs as JSON for programmatic use
echo "{"
echo "  \"missing\": ["
for i in "${!REPORT_LIST[@]}"; do
  node_id="${REPORT_LIST[$i]}"
  name="${NODE_NAMES[$node_id]}"
  if [ $i -eq $((REPORT_COUNT - 1)) ]; then
    echo "    {\"id\": \"$node_id\", \"name\": \"${name:-unknown}\"}"
  else
    echo "    {\"id\": \"$node_id\", \"name\": \"${name:-unknown}\"},"
  fi
done
echo "  ],"
echo "  \"total_missing\": $MISSING_COUNT,"
echo "  \"critical_missing\": $CRITICAL_COUNT,"
echo "  \"tsx_file\": \"$TSX_FILE\","
echo "  \"dimensions_file\": \"$DIMENSIONS_JSON\""
echo "}"

exit 1
