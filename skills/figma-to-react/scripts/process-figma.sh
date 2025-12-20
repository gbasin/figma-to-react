#!/usr/bin/env bash
#
# process-figma.sh
#
# All-in-one Figma MCP processor:
#   1. Extracts design tokens → CSS variables file
#   2. Downloads assets with content-hash deduplication
#   3. Replaces Figma URLs with local paths
#   4. Outputs production-ready component
#
# Usage:
#   ./process-figma.sh <input> <output> <asset-dir> <url-prefix> [tokens-file]
#
# Example:
#   ./process-figma.sh \
#     /tmp/figma-captures/figma-237-2571.txt \
#     src/components/MyScreen.tsx \
#     public/figma-assets \
#     /figma-assets \
#     src/styles/figma-tokens.css

set -e

INPUT="$1"
OUTPUT="$2"
ASSET_DIR="$3"
URL_PREFIX="$4"
TOKENS_FILE="${5:-}"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ] || [ -z "$ASSET_DIR" ] || [ -z "$URL_PREFIX" ]; then
  echo "Usage: $0 <input> <output> <asset-dir> <url-prefix> [tokens-file]" >&2
  echo "" >&2
  echo "Arguments:" >&2
  echo "  input       - Captured MCP response file" >&2
  echo "  output      - Output component path (.tsx)" >&2
  echo "  asset-dir   - Directory to save downloaded assets" >&2
  echo "  url-prefix  - URL prefix for assets in code (e.g., /assets)" >&2
  echo "  tokens-file - Optional. CSS tokens file path" >&2
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "Error: Input file not found: $INPUT" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create directories
mkdir -p "$ASSET_DIR"
mkdir -p "$(dirname "$OUTPUT")"

# Temp files
TEMP_CODE="/tmp/figma-code-$$.txt"
ASSET_LIST="/tmp/figma-assets-$$.txt"
MAPPING_FILE="/tmp/figma-mapping-$$.txt"
HASH_MAP="/tmp/figma-hashes-$$.txt"
trap "rm -f $TEMP_CODE $ASSET_LIST $MAPPING_FILE $HASH_MAP /tmp/figma-dl-$$-*.bin" EXIT

echo "=== Figma → React Processor ===" >&2
echo "" >&2

# Step 1: Extract tokens (if tokens file specified)
if [ -n "$TOKENS_FILE" ]; then
  echo "Step 1: Extracting design tokens..." >&2
  if [ -x "$SCRIPT_DIR/extract-tokens.sh" ]; then
    "$SCRIPT_DIR/extract-tokens.sh" "$INPUT" "$TOKENS_FILE"
  else
    # Inline token extraction if script not available
    mkdir -p "$(dirname "$TOKENS_FILE")"
    {
      echo "/* Figma Design Tokens - auto-generated */"
      echo ":root {"
      grep -oE 'var\(--[^)]+\)' "$INPUT" | sort -u | while read -r var; do
        name=$(echo "$var" | sed -E 's/var\((--[^,]+),.*/\1/')
        fallback=$(echo "$var" | sed -E 's/var\([^,]+,([^)]+)\)/\1/')
        [ -n "$name" ] && [ -n "$fallback" ] && echo "  ${name}: ${fallback};"
      done
      echo "}"
    } > "$TOKENS_FILE"
    echo "Written: $TOKENS_FILE" >&2
  fi
  echo "" >&2
else
  echo "Step 1: Skipping token extraction (no tokens file specified)" >&2
  echo "" >&2
fi

# Step 2: Extract and download assets
echo "Step 2: Processing assets..." >&2

# Extract all asset URLs and their variable names
# Format: varName|url
# Use perl for reliable cross-platform regex
# Supports both:
#   - Remote Figma MCP: https://figma.com/api/mcp/asset/...
#   - Local Figma Desktop MCP: http://localhost:PORT/assets/...
perl -ne 'if (/const\s+(\w+)\s*=\s*"(https?:\/\/(?:(?:www\.)?figma\.com\/api\/mcp\/asset|localhost:\d+\/assets)\/[^"]+)"/) { print "$1|$2\n"; }' "$INPUT" > "$ASSET_LIST" || true

TOTAL_REFS=$(wc -l < "$ASSET_LIST" | tr -d ' ')
UNIQUE_URLS=$(cut -d'|' -f2 "$ASSET_LIST" | sort -u | wc -l | tr -d ' ')

echo "  Found $TOTAL_REFS asset references ($UNIQUE_URLS unique URLs)" >&2

> "$MAPPING_FILE"
> "$HASH_MAP"

if [ "$TOTAL_REFS" -gt 0 ]; then
  echo "  Downloading with content-hash deduplication..." >&2

  for URL in $(cut -d'|' -f2 "$ASSET_LIST" | sort -u); do
    [ -z "$URL" ] && continue

    # Get variable name for this URL (for naming)
    VAR_NAME=$(grep "|${URL}$" "$ASSET_LIST" | head -1 | cut -d'|' -f1)

    # Derive base filename from variable name
    BASE_NAME=$(echo "$VAR_NAME" | \
      sed -E 's/^img([A-Z])/\1/' | \
      sed -E 's/^img$/asset/' | \
      sed -E 's/^img([0-9])/asset-\1/' | \
      sed -E 's/([a-z])([A-Z])/\1-\2/g' | \
      tr '[:upper:]' '[:lower:]')

    # Download to temp
    TEMP_FILE="/tmp/figma-dl-$$-${BASE_NAME}.bin"
    if ! curl -sL "$URL" -o "$TEMP_FILE" 2>/dev/null; then
      echo "    ✗ Failed: $BASE_NAME" >&2
      continue
    fi

    # Hash content for deduplication
    HASH=$(md5 -q "$TEMP_FILE" 2>/dev/null || md5sum "$TEMP_FILE" | cut -d' ' -f1)

    # Check if we already have this content
    EXISTING=$(grep "^$HASH|" "$HASH_MAP" 2>/dev/null | cut -d'|' -f2 || true)

    if [ -n "$EXISTING" ]; then
      # Duplicate content - reuse existing file
      echo "    ↔ Duplicate: $BASE_NAME → $EXISTING" >&2
      rm "$TEMP_FILE"
      URL_PATH="$EXISTING"
    else
      # New unique content
      FILE_TYPE=$(file -b "$TEMP_FILE" 2>/dev/null || echo "unknown")
      case "$FILE_TYPE" in
        *"SVG"*) EXT="svg" ;;
        *"PNG"*) EXT="png" ;;
        *"JPEG"*|*"JPG"*) EXT="jpg" ;;
        *"GIF"*) EXT="gif" ;;
        *"WebP"*) EXT="webp" ;;
        *)
          # Check for SVG content
          if head -c 200 "$TEMP_FILE" 2>/dev/null | grep -q "<svg"; then
            EXT="svg"
          else
            EXT="png"
          fi
          ;;
      esac

      FILENAME="${BASE_NAME}.${EXT}"
      LOCAL_PATH="${ASSET_DIR}/${FILENAME}"
      URL_PATH="${URL_PREFIX}/${FILENAME}"

      # Handle filename collision (different content, same derived name)
      if [ -f "$LOCAL_PATH" ]; then
        SHORT_HASH="${HASH:0:6}"
        FILENAME="${BASE_NAME}-${SHORT_HASH}.${EXT}"
        LOCAL_PATH="${ASSET_DIR}/${FILENAME}"
        URL_PATH="${URL_PREFIX}/${FILENAME}"
      fi

      mv "$TEMP_FILE" "$LOCAL_PATH"
      echo "$HASH|$URL_PATH" >> "$HASH_MAP"
      echo "    ✓ Downloaded: $FILENAME" >&2
    fi

    # Map original URL → local path
    echo "$URL|$URL_PATH" >> "$MAPPING_FILE"
  done

  UNIQUE_FILES=$(wc -l < "$HASH_MAP" | tr -d ' ')
  echo "  Saved $UNIQUE_FILES unique files (deduplicated from $UNIQUE_URLS URLs)" >&2
fi
echo "" >&2

# Step 3: Transform code
echo "Step 3: Generating component..." >&2

# Start with the input file
cp "$INPUT" "$TEMP_CODE"

# Remove asset const declarations (const imgXxx = "https://...")
perl -i -pe 's/^const\s+\w+\s*=\s*"https?:\/\/(?:www\.figma\.com\/api\/mcp\/asset|localhost:\d+\/assets)\/[^"]+";?\s*\n?//gm' "$TEMP_CODE"

# Replace src={varName} with src="localPath"
while IFS='|' read -r VAR_NAME URL; do
  [ -z "$VAR_NAME" ] && continue
  LOCAL_PATH=$(grep "^${URL}|" "$MAPPING_FILE" 2>/dev/null | head -1 | cut -d'|' -f2)
  [ -z "$LOCAL_PATH" ] && continue

  # Handle both src={var} and src={ var } patterns
  sed -i '' "s|src={${VAR_NAME}}|src=\"${LOCAL_PATH}\"|g" "$TEMP_CODE"
  sed -i '' "s|src={ ${VAR_NAME} }|src=\"${LOCAL_PATH}\"|g" "$TEMP_CODE"
done < "$ASSET_LIST"

# Write output
cp "$TEMP_CODE" "$OUTPUT"

echo "  Written: $OUTPUT" >&2
echo "" >&2

# Summary
echo "=== Done ===" >&2
echo "" >&2
echo "Component: $OUTPUT" >&2
[ -n "$TOKENS_FILE" ] && echo "Tokens:    $TOKENS_FILE" >&2
echo "Assets:    $ASSET_DIR/ ($UNIQUE_FILES files)" >&2
echo "" >&2
echo "Next steps:" >&2
echo "  1. Import tokens in your CSS: @import \"$(basename "$TOKENS_FILE")\";" >&2
echo "  2. Rename component export if needed" >&2
echo "  3. Add interactivity (onClick, useState, etc.)" >&2
