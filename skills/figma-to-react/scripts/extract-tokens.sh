#!/usr/bin/env bash
#
# extract-tokens.sh
#
# Extracts CSS variables from Figma MCP output and generates a tokens file.
# The MCP outputs var(--name,fallback) - we extract the name and fallback value.
#
# Usage:
#   ./extract-tokens.sh <input-file> <output-css>
#   ./extract-tokens.sh /tmp/figma-to-react/captures/figma-123-456.txt src/styles/figma-tokens.css
#
# Always overwrites output file. Deduplicates by variable name, preferring non-zero values.

set -e

INPUT="$1"
OUTPUT="$2"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: $0 <input-file> <output-css>" >&2
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "Error: Input file not found: $INPUT" >&2
  exit 1
fi

# Create output directory if needed
mkdir -p "$(dirname "$OUTPUT")"

# Temp file for new tokens
TEMP_TOKENS="/tmp/figma-tokens-$$.txt"
trap "rm -f $TEMP_TOKENS" EXIT

# Extract all var() patterns: var(--name,fallback)
# Handle both escaped slashes (--name\/sub) and regular names (--name-sub)
# Note: Fallback values can contain nested parens like rgba(0,0,0,0.8)
# Use perl for reliable extraction across platforms
perl -ne '
  # Match var(--name,fallback) with 1-level nested parens support
  # (?:[^()]|\([^()]*\))+ matches either non-parens or a balanced (...)
  while (/var\((--[^,)]+),((?:[^()]|\([^()]*\))+)\)/g) {
    my ($name, $val) = ($1, $2);
    # Fix double-escaped slashes (\\/ -> \/)
    $name =~ s/\\\\\//\\\//g;
    print "$name|$val\n";
  }
' "$INPUT" | \
  # Sort by name, then by value (reverse so non-"0px" comes before "0px")
  sort -t'|' -k1,1 -k2,2r | \
  # Keep first occurrence of each name (the non-zero value)
  awk -F'|' '!seen[$1]++' > "$TEMP_TOKENS"

# Count tokens found
TOKEN_COUNT=$(wc -l < "$TEMP_TOKENS" | tr -d ' ')

if [ "$TOKEN_COUNT" -eq 0 ]; then
  echo "No CSS variables found in input" >&2
  exit 0
fi

echo "Found $TOKEN_COUNT unique CSS variables" >&2

# Write output CSS file (always overwrite - no merge)
{
  echo "/* Figma Design Tokens - auto-generated */"
  echo "/* Do not edit manually - regenerate with extract-tokens.sh */"
  echo ":root {"

  while IFS='|' read -r name fallback; do
    echo "  ${name}: ${fallback};"
  done < "$TEMP_TOKENS"

  echo "}"
} > "$OUTPUT"

echo "Written: $OUTPUT" >&2
