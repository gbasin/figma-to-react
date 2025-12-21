#!/usr/bin/env bash
#
# validate-visual.sh
#
# Compare a Figma screenshot against a rendered component screenshot.
# Uses ImageMagick to compute similarity and output diff percentage.
#
# Usage:
#   ./validate-visual.sh <figma-screenshot> <rendered-screenshot>
#
# Arguments:
#   figma-screenshot    - Path to Figma reference image
#   rendered-screenshot - Path to rendered component screenshot
#
# Output:
#   - Creates /tmp/figma-to-react/validation/{timestamp}/ containing:
#     - figma.png    - Figma reference (resized if needed)
#     - rendered.png - Rendered component screenshot
#     - diff.png     - Heatmap (brighter = more different)
#   - Prints diff percentage to stdout
#   - Exit code: 0 = success, 1 = error
#
# Example:
#   ./validate-visual.sh /tmp/figma.png /tmp/rendered.png
#   # Output: 3.45

set -e

FIGMA_IMG="$1"
RENDERED_IMG="$2"

if [ -z "$FIGMA_IMG" ] || [ -z "$RENDERED_IMG" ]; then
  echo "Usage: $0 <figma-screenshot> <rendered-screenshot>" >&2
  echo "" >&2
  echo "Arguments:" >&2
  echo "  figma-screenshot    - Path to Figma reference image" >&2
  echo "  rendered-screenshot - Path to rendered component screenshot" >&2
  echo "" >&2
  echo "Output: diff percentage (e.g., 3.45)" >&2
  exit 1
fi

if [ ! -f "$FIGMA_IMG" ]; then
  echo "Error: Figma screenshot not found: $FIGMA_IMG" >&2
  exit 1
fi

if [ ! -f "$RENDERED_IMG" ]; then
  echo "Error: Rendered screenshot not found: $RENDERED_IMG" >&2
  exit 1
fi

# Check for ImageMagick
if ! command -v magick &> /dev/null; then
  echo "Error: ImageMagick not found. Install with: brew install imagemagick" >&2
  exit 1
fi

# Create output directory with timestamp
TIMESTAMP=$(date +%s)
OUTPUT_DIR="/tmp/figma-to-react/validation/${TIMESTAMP}"
mkdir -p "$OUTPUT_DIR"

# Output paths - all stored together
FIGMA_COPY="${OUTPUT_DIR}/figma.png"
RENDERED_COPY="${OUTPUT_DIR}/rendered.png"
DIFF_IMG="${OUTPUT_DIR}/diff.png"
RESIZED_FIGMA="${OUTPUT_DIR}/figma-resized.png"

# Get dimensions
FIGMA_SIZE=$(magick identify -format "%wx%h" "$FIGMA_IMG")
RENDERED_SIZE=$(magick identify -format "%wx%h" "$RENDERED_IMG")

echo "Figma size:    $FIGMA_SIZE" >&2
echo "Rendered size: $RENDERED_SIZE" >&2

# Copy rendered to output dir
cp "$RENDERED_IMG" "$RENDERED_COPY"

# Check if sizes match (they should with element-level screenshots)
if [ "$FIGMA_SIZE" = "$RENDERED_SIZE" ]; then
  echo "Dimensions match: $FIGMA_SIZE (good)" >&2
  COMPARE_IMG="$FIGMA_IMG"
  cp "$FIGMA_IMG" "$FIGMA_COPY"
else
  echo "WARNING: Dimension mismatch! This may indicate a rendering issue." >&2
  echo "  Expected: $FIGMA_SIZE (Figma)" >&2
  echo "  Got:      $RENDERED_SIZE (rendered)" >&2
  echo "  Resizing Figma to match for comparison..." >&2
  magick "$FIGMA_IMG" -resize "${RENDERED_SIZE}!" "$RESIZED_FIGMA"
  COMPARE_IMG="$RESIZED_FIGMA"
  cp "$RESIZED_FIGMA" "$FIGMA_COPY"
fi

# Compare images
echo "Computing visual similarity..." >&2

# Normalize both to RGB (remove alpha) for fair comparison
NORM_FIGMA="${OUTPUT_DIR}/.figma-norm.png"
NORM_RENDERED="${OUTPUT_DIR}/.rendered-norm.png"
magick "$COMPARE_IMG" -alpha off "$NORM_FIGMA"
magick "$RENDERED_IMG" -alpha off "$NORM_RENDERED"

# Create heatmap diff (brighter = more different)
# Output as RGB (not grayscale) for better Preview.app compatibility
magick "$NORM_FIGMA" "$NORM_RENDERED" \
  -compose difference -composite \
  -grayscale Rec709Luminance \
  -auto-level \
  -colorspace sRGB \
  "$DIFF_IMG"

# Get RMSE metric for pass/fail calculation
RESULT=$(magick compare -metric RMSE "$NORM_FIGMA" "$NORM_RENDERED" null: 2>&1 || true)

# Clean up temp files
rm -f "$NORM_FIGMA" "$NORM_RENDERED"

# Extract the normalized value (in parentheses)
NORMALIZED=$(echo "$RESULT" | grep -oE '\([0-9.]+\)' | tr -d '()')

if [ -z "$NORMALIZED" ]; then
  echo "Error: Could not parse comparison result: $RESULT" >&2
  exit 1
fi

# Convert to percentage (RMSE is 0-1, multiply by 100)
DIFF_PERCENT=$(echo "$NORMALIZED * 100" | bc -l | xargs printf "%.2f")

echo "" >&2
echo "Output: $OUTPUT_DIR" >&2
echo "  figma.png    - Figma reference" >&2
echo "  rendered.png - Rendered component" >&2
echo "  diff.png     - Heatmap (brighter = more different)" >&2
echo "" >&2

# Output just the percentage to stdout
echo "$DIFF_PERCENT"
