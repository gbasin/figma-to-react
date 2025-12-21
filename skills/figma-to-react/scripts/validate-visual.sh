#!/usr/bin/env bash
#
# validate-visual.sh
#
# Compare a Figma screenshot against a rendered component screenshot.
# Uses ImageMagick to compute similarity and output pass/fail.
#
# Usage:
#   ./validate-visual.sh <figma-screenshot> <rendered-screenshot> [threshold]
#
# Arguments:
#   figma-screenshot    - Path to Figma reference image
#   rendered-screenshot - Path to rendered component screenshot
#   threshold           - Max allowed difference (0-100, default: 5)
#
# Output:
#   - Creates diff image at /tmp/figma-validation/diff-{timestamp}.png
#   - Prints PASS or FAIL with diff percentage
#   - Exit code: 0 = pass, 1 = fail, 2 = error
#
# Example:
#   ./validate-visual.sh /tmp/figma-screenshot.png /tmp/rendered.png 5

set -e

FIGMA_IMG="$1"
RENDERED_IMG="$2"
THRESHOLD="${3:-5}"

if [ -z "$FIGMA_IMG" ] || [ -z "$RENDERED_IMG" ]; then
  echo "Usage: $0 <figma-screenshot> <rendered-screenshot> [threshold]" >&2
  echo "" >&2
  echo "Arguments:" >&2
  echo "  figma-screenshot    - Path to Figma reference image" >&2
  echo "  rendered-screenshot - Path to rendered component screenshot" >&2
  echo "  threshold           - Max allowed difference % (default: 5)" >&2
  exit 2
fi

if [ ! -f "$FIGMA_IMG" ]; then
  echo "Error: Figma screenshot not found: $FIGMA_IMG" >&2
  exit 2
fi

if [ ! -f "$RENDERED_IMG" ]; then
  echo "Error: Rendered screenshot not found: $RENDERED_IMG" >&2
  exit 2
fi

# Check for ImageMagick
if ! command -v magick &> /dev/null; then
  echo "Error: ImageMagick not found. Install with: brew install imagemagick" >&2
  exit 2
fi

# Create output directory with timestamp
TIMESTAMP=$(date +%s)
OUTPUT_DIR="/tmp/figma-validation/${TIMESTAMP}"
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

# If sizes differ, resize Figma to match rendered (rendered is ground truth for layout)
if [ "$FIGMA_SIZE" != "$RENDERED_SIZE" ]; then
  echo "Resizing Figma screenshot to match rendered..." >&2
  magick "$FIGMA_IMG" -resize "${RENDERED_SIZE}!" "$RESIZED_FIGMA"
  COMPARE_IMG="$RESIZED_FIGMA"
  cp "$RESIZED_FIGMA" "$FIGMA_COPY"
else
  COMPARE_IMG="$FIGMA_IMG"
  cp "$FIGMA_IMG" "$FIGMA_COPY"
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
  exit 2
fi

# Convert to percentage (RMSE is 0-1, multiply by 100)
DIFF_PERCENT=$(echo "$NORMALIZED * 100" | bc -l | xargs printf "%.2f")

echo "" >&2
echo "Output: $OUTPUT_DIR" >&2
echo "  figma.png    - Figma reference" >&2
echo "  rendered.png - Rendered component" >&2
echo "  diff.png     - Heatmap (brighter = more different)" >&2
echo "Difference: ${DIFF_PERCENT}%" >&2
echo "" >&2

# Compare against threshold
PASS=$(echo "$DIFF_PERCENT <= $THRESHOLD" | bc -l)

if [ "$PASS" -eq 1 ]; then
  echo "PASS (${DIFF_PERCENT}% <= ${THRESHOLD}% threshold)"
  echo ""
  echo "View: open $OUTPUT_DIR"
  exit 0
else
  echo "FAIL (${DIFF_PERCENT}% > ${THRESHOLD}% threshold)"
  echo ""
  echo "View: open $OUTPUT_DIR"
  exit 1
fi
