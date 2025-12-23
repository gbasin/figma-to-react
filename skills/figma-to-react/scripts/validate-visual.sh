#!/usr/bin/env bash
#
# validate-visual.sh
#
# Compare a Figma screenshot against a rendered component screenshot.
# Uses ImageMagick to compute similarity and output diff percentage.
#
# Usage:
#   ./validate-visual.sh <figma-screenshot> <rendered-screenshot> [component] [pass]
#
# Arguments:
#   figma-screenshot    - Path to Figma reference image
#   rendered-screenshot - Path to rendered component screenshot
#   component           - Component name (optional, defaults to timestamp)
#   pass                - Pass number (optional, defaults to 1)
#
# Output:
#   - Creates /tmp/figma-to-react/validation/{component}/ containing:
#     - figma.png         - Figma reference (copied once)
#     - pass-{N}/
#       - rendered.png    - Rendered component screenshot
#       - diff.png        - Heatmap (brighter = more different)
#   - Prints diff percentage to stdout
#   - Exit code: 0 = success, 1 = error
#
# Example:
#   ./validate-visual.sh /tmp/figma.png /tmp/rendered.png LoginScreen 2
#   # Output: 3.45

set -e

FIGMA_IMG="$1"
RENDERED_IMG="$2"
COMPONENT="${3:-$(date +%s)}"
PASS="${4:-1}"

if [ -z "$FIGMA_IMG" ] || [ -z "$RENDERED_IMG" ]; then
  echo "Usage: $0 <figma-screenshot> <rendered-screenshot> [component] [pass]" >&2
  echo "" >&2
  echo "Arguments:" >&2
  echo "  figma-screenshot    - Path to Figma reference image" >&2
  echo "  rendered-screenshot - Path to rendered component screenshot" >&2
  echo "  component           - Component name (optional)" >&2
  echo "  pass                - Pass number (optional, default: 1)" >&2
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

# Create output directories
VALIDATION_DIR="/tmp/figma-to-react/validation/${COMPONENT}"
PASS_DIR="${VALIDATION_DIR}/pass-${PASS}"
mkdir -p "$PASS_DIR"

# Output paths
FIGMA_COPY="${VALIDATION_DIR}/figma.png"
RENDERED_COPY="${PASS_DIR}/rendered.png"
DIFF_IMG="${PASS_DIR}/diff.png"
RESIZED_FIGMA="${PASS_DIR}/.figma-resized.png"

# Get dimensions
FIGMA_SIZE=$(magick identify -format "%wx%h" "$FIGMA_IMG")
RENDERED_SIZE=$(magick identify -format "%wx%h" "$RENDERED_IMG")

echo "Figma size:    $FIGMA_SIZE" >&2
echo "Rendered size: $RENDERED_SIZE" >&2

# Copy rendered to output dir (skip if same file)
if [ "$(realpath "$RENDERED_IMG")" != "$(realpath "$RENDERED_COPY" 2>/dev/null)" ]; then
  cp "$RENDERED_IMG" "$RENDERED_COPY"
fi

# Extract dimensions
FIGMA_W=$(echo "$FIGMA_SIZE" | cut -dx -f1)
FIGMA_H=$(echo "$FIGMA_SIZE" | cut -dx -f2)
RENDERED_W=$(echo "$RENDERED_SIZE" | cut -dx -f1)
RENDERED_H=$(echo "$RENDERED_SIZE" | cut -dx -f2)

# Check if sizes match (they should with element-level screenshots)
if [ "$FIGMA_SIZE" = "$RENDERED_SIZE" ]; then
  echo "Dimensions match: $FIGMA_SIZE (good)" >&2
  COMPARE_IMG="$FIGMA_IMG"
else
  # Check for fixed multiples (2x, 3x retina)
  W_RATIO=$((RENDERED_W / FIGMA_W))
  H_RATIO=$((RENDERED_H / FIGMA_H))
  W_MOD=$((RENDERED_W % FIGMA_W))
  H_MOD=$((RENDERED_H % FIGMA_H))

  # >= 2 to exclude 1x (which means sizes match, handled above)
  if [ "$W_RATIO" = "$H_RATIO" ] && [ "$W_MOD" -eq 0 ] && [ "$H_MOD" -eq 0 ] && [ "$W_RATIO" -ge 2 ]; then
    echo "Detected ${W_RATIO}x retina scaling" >&2
    echo "  Figma:    $FIGMA_SIZE (1x)" >&2
    echo "  Rendered: $RENDERED_SIZE (${W_RATIO}x)" >&2
    echo "  Upscaling Figma ${W_RATIO}x for comparison..." >&2
    magick "$FIGMA_IMG" -resize "$((W_RATIO * 100))%" "$RESIZED_FIGMA"
    COMPARE_IMG="$RESIZED_FIGMA"
  else
    echo "WARNING: Dimension mismatch! This may indicate a rendering issue." >&2
    echo "  Expected: $FIGMA_SIZE (Figma)" >&2
    echo "  Got:      $RENDERED_SIZE (rendered)" >&2
    echo "  Resizing Figma to match for comparison..." >&2
    magick "$FIGMA_IMG" -resize "${RENDERED_SIZE}!" "$RESIZED_FIGMA"
    COMPARE_IMG="$RESIZED_FIGMA"
  fi
fi

# Copy Figma reference once (at component level, not per-pass)
if [ ! -f "$FIGMA_COPY" ]; then
  cp "$FIGMA_IMG" "$FIGMA_COPY"
  echo "Saved Figma reference: $FIGMA_COPY" >&2
fi

# Compare images
echo "Computing visual similarity..." >&2

# Normalize both to RGB (remove alpha) for fair comparison
NORM_FIGMA="${PASS_DIR}/.figma-norm.png"
NORM_RENDERED="${PASS_DIR}/.rendered-norm.png"
magick "$COMPARE_IMG" -alpha off "$NORM_FIGMA"
magick "$RENDERED_IMG" -alpha off "$NORM_RENDERED"

# Create heatmap diff (brighter = more different)
# No auto-level so differences remain proportional to actual magnitude
magick "$NORM_FIGMA" "$NORM_RENDERED" \
  -compose difference -composite \
  -grayscale Rec709Luminance \
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
echo "Pass $PASS: $PASS_DIR" >&2
echo "  rendered.png - Rendered component" >&2
echo "  diff.png     - Heatmap (brighter = more different)" >&2
echo "Reference: $FIGMA_COPY" >&2
echo "" >&2

# Output just the percentage to stdout
echo "$DIFF_PERCENT"
