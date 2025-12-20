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
#   ./rename-assets.sh <captured-response> <asset-dir> <component-file>
#
# Example:
#   ./rename-assets.sh /tmp/figma-captures/figma-237-2571.txt public/figma-assets src/components/MyScreen.tsx

set -e

INPUT="$1"
ASSET_DIR="$2"
COMPONENT="$3"

if [ -z "$INPUT" ] || [ -z "$ASSET_DIR" ] || [ -z "$COMPONENT" ]; then
  echo "Usage: $0 <captured-response> <asset-dir> <component-file>" >&2
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

if [ ! -f "$COMPONENT" ]; then
  echo "Error: Component file not found: $COMPONENT" >&2
  exit 1
fi

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
  for ASSET_FILE in "$ASSET_DIR"/*.{svg,png,jpg,gif,webp} 2>/dev/null; do
    [ -f "$ASSET_FILE" ] || continue

    BASENAME=$(basename "$ASSET_FILE")
    EXT="${BASENAME##*.}"

    # Check if this asset is referenced in the component with a generic name
    # and the component also references this node ID
    if grep -q "src=\"[^\"]*${BASENAME}\"" "$COMPONENT" 2>/dev/null; then
      # This asset is used - check if it has a generic name
      if echo "$BASENAME" | grep -qE '^(asset|img|image)-'; then
        NEW_NAME="${MEANINGFUL}.${EXT}"
        NEW_PATH="$ASSET_DIR/$NEW_NAME"

        # Avoid overwriting existing files
        if [ -f "$NEW_PATH" ] && [ "$ASSET_FILE" != "$NEW_PATH" ]; then
          SHORT_HASH=$(md5 -q "$ASSET_FILE" 2>/dev/null | cut -c1-4 || echo "xxxx")
          NEW_NAME="${MEANINGFUL}-${SHORT_HASH}.${EXT}"
          NEW_PATH="$ASSET_DIR/$NEW_NAME"
        fi

        if [ "$ASSET_FILE" != "$NEW_PATH" ]; then
          echo "  $BASENAME → $NEW_NAME" >&2
          mv "$ASSET_FILE" "$NEW_PATH"

          # Update component references
          OLD_REF=$(basename "$ASSET_FILE")
          sed -i '' "s|${OLD_REF}|${NEW_NAME}|g" "$COMPONENT"

          RENAME_COUNT=$((RENAME_COUNT + 1))
        fi
      fi
    fi
  done
done

echo "" >&2
echo "Renamed $RENAME_COUNT assets" >&2
