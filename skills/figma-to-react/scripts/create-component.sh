#!/bin/bash
#
# create-component.sh
#
# Transforms processed Figma output (.out.txt) into a React component file
# WITHOUT LLM transcription - pure text transformation
#
# Usage:
#   ./create-component.sh input.out.txt ComponentName output/path/ComponentName.tsx
#
# The script:
#   1. Adds ScreenProps import
#   2. Changes the main "export default function" to accept ScreenProps
#   3. Keeps ALL JSX and helper components verbatim (no simplification)
#

set -e

INPUT_FILE="$1"
COMPONENT_NAME="$2"
OUTPUT_FILE="$3"

if [ -z "$INPUT_FILE" ] || [ -z "$COMPONENT_NAME" ] || [ -z "$OUTPUT_FILE" ]; then
  echo "Usage: $0 <input.out.txt> <ComponentName> <output.tsx>" >&2
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "Error: Input file not found: $INPUT_FILE" >&2
  exit 1
fi

# Create output directory if needed
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Transform the file:
# 1. Add ScreenProps import at the top
# 2. Replace ONLY "export default function XXX()" - the main component
#    (Helper functions like "function FieldLabel(...)" are left untouched)

{
  echo "import type { ScreenProps } from '../registry';"
  echo ""

  # Only transform "export default function" - not internal helper functions
  sed -E \
    "s/export default function [A-Za-z0-9_]+\(\)/export function ${COMPONENT_NAME}({ onNext, onBack, onClose }: ScreenProps)/" \
    "$INPUT_FILE"

} > "$OUTPUT_FILE"

echo "Created: $OUTPUT_FILE" >&2
