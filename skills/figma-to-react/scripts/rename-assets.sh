#!/usr/bin/env bash
#
# rename-assets.sh
#
# Renames generic asset files using Component descriptions from Figma MCP output.
# Updates references in the component file.
#
# The MCP output includes descriptions like:
#   ## x
#   **Node ID:** 3:439
#   Source: boxicons --- icon, x, close
#
# This script parses those and renames:
#   asset-abc123.svg → close-icon.svg (from "x, close")
#   asset-def456.svg → arrow-back.svg (from "arrow, back")
#
# Usage:
#   ./rename-assets.sh <captured-response> <asset-dir> <component-file-or-dir> [component-file2...]
#
# Examples:
#   ./rename-assets.sh /tmp/figma-to-react/captures/figma-237-2571.txt public/figma-assets src/components/MyScreen.tsx
#   ./rename-assets.sh /tmp/figma-to-react/captures/figma-237-2571.txt public/figma-assets src/components/
#   ./rename-assets.sh /tmp/figma-to-react/captures/figma-237-2571.txt public/figma-assets src/A.tsx src/B.tsx

set -e

INPUT="$1"
ASSET_DIR="$2"
shift 2
COMPONENT_ARGS=("$@")

if [ -z "$INPUT" ] || [ -z "$ASSET_DIR" ] || [ ${#COMPONENT_ARGS[@]} -eq 0 ]; then
  echo "Usage: $0 <captured-response> <asset-dir> <component-file-or-dir> [component-file2...]" >&2
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "Error: Input file not found: $INPUT" >&2
  exit 1
fi

if [ ! -d "$ASSET_DIR" ]; then
  echo "Error: Asset directory not found: $ASSET_DIR" >&2
  exit 1
fi

# Build list of component files
COMPONENT_FILES=()
for ARG in "${COMPONENT_ARGS[@]}"; do
  if [ -d "$ARG" ]; then
    # Directory: find all .tsx files
    while IFS= read -r F; do
      COMPONENT_FILES+=("$F")
    done < <(find "$ARG" -maxdepth 1 -name "*.tsx" -type f 2>/dev/null)
  elif [ -f "$ARG" ]; then
    COMPONENT_FILES+=("$ARG")
  else
    echo "Warning: Component not found: $ARG" >&2
  fi
done

if [ ${#COMPONENT_FILES[@]} -eq 0 ]; then
  echo "Error: No component files found" >&2
  exit 1
fi

echo "Processing ${#COMPONENT_FILES[@]} component file(s)" >&2

echo "=== Asset Renamer ===" >&2
echo "" >&2

# Parse component descriptions from MCP output
# Looking for patterns like:
#   ## x
#   **Node ID:** 3:439
#   Source: boxicons --- 🔎 icon, x, close

RENAME_COUNT=0

# Extract component description blocks
# Format: ## name\n**Node ID:** id\nSource: ... --- keywords
perl -0777 -ne '
  while (/## (\w+[-\w]*)\s*\n\*\*Node ID:\*\*[^\n]+\n[^\n]*---[^\n]*🔎\s*([^\n]+)/g) {
    my $name = $1;
    my $keywords = $2;
    # Clean up keywords
    $keywords =~ s/^\s+|\s+$//g;
    print "$name|$keywords\n";
  }
' "$INPUT" | while IFS='|' read -r NAME KEYWORDS; do
  [ -z "$NAME" ] && continue

  # Parse keywords to generate meaningful filename
  # "icon, x, close" → "close-icon"
  # "icon, arrow, back" → "arrow-back"

  # Extract the most meaningful keywords (skip generic ones like "icon")
  MEANINGFUL=$(echo "$KEYWORDS" | tr ',' '\n' | sed 's/^\s*//;s/\s*$//' | \
    grep -v -E '^(icon|image|img|logo|graphic)$' | head -2 | tr '\n' '-' | sed 's/-$//')

  if [ -z "$MEANINGFUL" ]; then
    MEANINGFUL="$NAME"
  fi

  # Look for assets that might match this component
  # Check if there's an asset file we can rename
  # Use find instead of brace expansion which doesn't work reliably with wildcards
  while IFS= read -r ASSET_FILE; do
    [ -f "$ASSET_FILE" ] || continue

    BASENAME=$(basename "$ASSET_FILE")
    EXT="${BASENAME##*.}"

    # Check if this asset is referenced in any component with a generic name
    FOUND_IN_COMPONENT=false
    for COMPONENT in "${COMPONENT_FILES[@]}"; do
      if grep -q "src=\"[^\"]*${BASENAME}\"" "$COMPONENT" 2>/dev/null; then
        FOUND_IN_COMPONENT=true
        break
      fi
    done

    if $FOUND_IN_COMPONENT; then
      # This asset is used - check if it has a generic name
      if echo "$BASENAME" | grep -qE '^(asset|img|image)-'; then
        NEW_NAME="${MEANINGFUL}.${EXT}"
        NEW_PATH="$ASSET_DIR/$NEW_NAME"

        # Avoid overwriting existing files
        if [ -f "$NEW_PATH" ] && [ "$ASSET_FILE" != "$NEW_PATH" ]; then
          # Cross-platform md5: macOS uses md5 -q, Linux uses md5sum
          if command -v md5 &>/dev/null; then
            SHORT_HASH=$(md5 -q "$ASSET_FILE" 2>/dev/null | cut -c1-4 || echo "xxxx")
          elif command -v md5sum &>/dev/null; then
            SHORT_HASH=$(md5sum "$ASSET_FILE" 2>/dev/null | cut -d' ' -f1 | cut -c1-4 || echo "xxxx")
          else
            SHORT_HASH="xxxx"
          fi
          NEW_NAME="${MEANINGFUL}-${SHORT_HASH}.${EXT}"
          NEW_PATH="$ASSET_DIR/$NEW_NAME"
        fi

        if [ "$ASSET_FILE" != "$NEW_PATH" ]; then
          echo "  $BASENAME → $NEW_NAME" >&2
          mv "$ASSET_FILE" "$NEW_PATH"

          # Update references in all component files (cross-platform sed -i)
          OLD_REF=$(basename "$ASSET_FILE")
          for COMPONENT in "${COMPONENT_FILES[@]}"; do
            if [[ "$OSTYPE" == "darwin"* ]]; then
              sed -i '' "s|${OLD_REF}|${NEW_NAME}|g" "$COMPONENT"
            else
              sed -i "s|${OLD_REF}|${NEW_NAME}|g" "$COMPONENT"
            fi
          done

          RENAME_COUNT=$((RENAME_COUNT + 1))
        fi
      fi
    fi
  done < <(find "$ASSET_DIR" -maxdepth 1 -type f \( -name "*.svg" -o -name "*.png" -o -name "*.jpg" -o -name "*.gif" -o -name "*.webp" \) 2>/dev/null)
done

echo "" >&2
echo "Renamed $RENAME_COUNT assets" >&2

# ============================================================================
# Phase 2: Deduplicate identical assets
# ============================================================================
echo "" >&2
echo "=== Deduplicating Identical Assets ===" >&2
echo "" >&2

DEDUP_COUNT=0

# Build checksum map: hash -> list of files
declare -A CHECKSUM_MAP

# Helper: compute normalized checksum
# For SVGs, strip id attributes so visually-identical files match
compute_hash() {
  local FILE="$1"
  local EXT="${FILE##*.}"
  local CONTENT

  if [ "$EXT" = "svg" ]; then
    # Normalize SVG: remove id attributes (they often differ but content is same)
    CONTENT=$(sed -E 's/ id="[^"]*"//g' "$FILE" 2>/dev/null)
  else
    CONTENT=$(cat "$FILE" 2>/dev/null)
  fi

  if command -v md5 &>/dev/null; then
    echo "$CONTENT" | md5 -q 2>/dev/null
  elif command -v md5sum &>/dev/null; then
    echo "$CONTENT" | md5sum 2>/dev/null | cut -d' ' -f1
  fi
}

while IFS= read -r ASSET_FILE; do
  [ -f "$ASSET_FILE" ] || continue

  # Compute normalized checksum
  HASH=$(compute_hash "$ASSET_FILE")

  [ -z "$HASH" ] && continue

  # Append to list (space-separated)
  if [ -z "${CHECKSUM_MAP[$HASH]}" ]; then
    CHECKSUM_MAP[$HASH]="$ASSET_FILE"
  else
    CHECKSUM_MAP[$HASH]="${CHECKSUM_MAP[$HASH]}|$ASSET_FILE"
  fi
done < <(find "$ASSET_DIR" -maxdepth 1 -type f \( -name "*.svg" -o -name "*.png" -o -name "*.jpg" -o -name "*.gif" -o -name "*.webp" \) 2>/dev/null)

# Process each group of duplicates
for HASH in "${!CHECKSUM_MAP[@]}"; do
  FILES="${CHECKSUM_MAP[$HASH]}"

  # Skip if only one file with this hash
  [[ "$FILES" != *"|"* ]] && continue

  # Split into array
  IFS='|' read -ra FILE_ARRAY <<< "$FILES"

  # Pick the canonical file (prefer shorter name without numeric suffix)
  CANONICAL=""
  CANONICAL_SCORE=999

  for FILE in "${FILE_ARRAY[@]}"; do
    NAME=$(basename "$FILE")
    SCORE=${#NAME}

    # Penalize names with numeric suffixes like -2, -3
    if echo "$NAME" | grep -qE '-[0-9]+\.'; then
      SCORE=$((SCORE + 100))
    fi
    # Penalize names with hash suffixes
    if echo "$NAME" | grep -qE '-[a-f0-9]{4,}\.'; then
      SCORE=$((SCORE + 50))
    fi

    if [ $SCORE -lt $CANONICAL_SCORE ]; then
      CANONICAL_SCORE=$SCORE
      CANONICAL="$FILE"
    fi
  done

  CANONICAL_NAME=$(basename "$CANONICAL")

  # Remove duplicates and update references
  for FILE in "${FILE_ARRAY[@]}"; do
    [ "$FILE" = "$CANONICAL" ] && continue

    DUP_NAME=$(basename "$FILE")

    # Update references in all component files
    for COMPONENT in "${COMPONENT_FILES[@]}"; do
      if grep -q "$DUP_NAME" "$COMPONENT" 2>/dev/null; then
        echo "  $DUP_NAME → $CANONICAL_NAME (merged)" >&2
        if [[ "$OSTYPE" == "darwin"* ]]; then
          sed -i '' "s|$DUP_NAME|$CANONICAL_NAME|g" "$COMPONENT"
        else
          sed -i "s|$DUP_NAME|$CANONICAL_NAME|g" "$COMPONENT"
        fi
      fi
    done

    # Remove the duplicate file
    rm "$FILE"
    DEDUP_COUNT=$((DEDUP_COUNT + 1))
  done
done

echo "" >&2
echo "Merged $DEDUP_COUNT duplicate assets" >&2
