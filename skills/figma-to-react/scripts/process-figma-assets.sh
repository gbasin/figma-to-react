#!/usr/bin/env bash
#
# process-figma-assets.sh
#
# Downloads Figma MCP assets and transforms code to use local paths.
# Deduplicates by content hash (since Figma MCP generates unique URLs per request).
#
# Usage (single screen):
#   echo "$FIGMA_RESPONSE" | ./process-figma-assets.sh ./public/assets /assets
#
# Usage (multiple screens - recommended):
#   ./process-figma-assets.sh ./public/assets /assets screen1.txt screen2.txt screen3.txt
#   # Outputs transformed code to screen1.out.txt, screen2.out.txt, etc.

set -e

ASSET_DIR="${1:-.}"
URL_PREFIX="${2:-/assets}"
shift 2 2>/dev/null || true

mkdir -p "$ASSET_DIR"

# Temp files
ASSET_LIST="/tmp/figma-assets-$$.txt"
MAPPING_FILE="/tmp/figma-mapping-$$.txt"
HASH_MAP="/tmp/figma-hashes-$$.txt"
FILE_LIST="/tmp/figma-files-$$.txt"
trap "rm -f $ASSET_LIST $MAPPING_FILE $HASH_MAP $FILE_LIST /tmp/figma-input-$$-*.txt /tmp/figma-dl-$$-*.bin /tmp/figma-sed-$$.txt" EXIT

# Collect inputs
INPUT_COUNT=0
> "$FILE_LIST"
if [ $# -gt 0 ]; then
    for f in "$@"; do
        cp "$f" "/tmp/figma-input-$$-$INPUT_COUNT.txt"
        echo "$f" >> "$FILE_LIST"
        INPUT_COUNT=$((INPUT_COUNT + 1))
    done
else
    cat > "/tmp/figma-input-$$-0.txt"
    echo "-" >> "$FILE_LIST"
    INPUT_COUNT=1
fi

echo "Collecting assets from $INPUT_COUNT screen(s)..." >&2

# Extract all assets: varName|url (one per line)
> "$ASSET_LIST"
for i in $(seq 0 $((INPUT_COUNT - 1))); do
    perl -ne 'while (/const\s+(\w+)\s*=\s*"(https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"]+)"/g) { print "$1|$2\n"; }' \
        "/tmp/figma-input-$$-$i.txt" >> "$ASSET_LIST"
done

TOTAL_REFS=$(wc -l < "$ASSET_LIST" | tr -d ' ')
UNIQUE_URLS=$(cut -d'|' -f2 "$ASSET_LIST" | sort -u | wc -l | tr -d ' ')
echo "Found $TOTAL_REFS asset references ($UNIQUE_URLS unique URLs)" >&2

echo "Downloading and deduplicating by content..." >&2

> "$MAPPING_FILE"
> "$HASH_MAP"  # hash|localPath

for URL in $(cut -d'|' -f2 "$ASSET_LIST" | sort -u); do
    [ -z "$URL" ] && continue

    # Get first var name for this URL
    VAR_NAME=$(grep "|$URL$" "$ASSET_LIST" | head -1 | cut -d'|' -f1)

    # Derive base filename
    BASE_NAME=$(echo "$VAR_NAME" | sed -E 's/^img([A-Z])/\1/' | sed -E 's/^img$/img/' | \
        sed -E 's/^img([0-9])/img-\1/' | \
        sed -E 's/([a-z])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')

    # Download
    TEMP_FILE="/tmp/figma-dl-$$-${BASE_NAME}.bin"
    echo -n "  $BASE_NAME: " >&2
    if ! curl -sL "$URL" -o "$TEMP_FILE"; then
        echo "FAILED" >&2
        continue
    fi

    # Hash content
    HASH=$(md5 -q "$TEMP_FILE" 2>/dev/null || md5sum "$TEMP_FILE" | cut -d' ' -f1)

    # Check if we already have this content
    EXISTING=$(grep "^$HASH|" "$HASH_MAP" | cut -d'|' -f2 || true)

    if [ -n "$EXISTING" ]; then
        # Duplicate - reuse existing file
        echo "duplicate of $EXISTING" >&2
        rm "$TEMP_FILE"
        URL_PATH="$EXISTING"
    else
        # New unique content - detect type and save
        FILE_TYPE=$(file -b "$TEMP_FILE")
        case "$FILE_TYPE" in
            *"SVG"*) EXT="svg" ;;
            *"PNG"*) EXT="png" ;;
            *"JPEG"*|*"JPG"*) EXT="jpg" ;;
            *"GIF"*) EXT="gif" ;;
            *"WebP"*) EXT="webp" ;;
            *)
                if head -c 100 "$TEMP_FILE" | grep -q "<svg"; then
                    EXT="svg"
                else
                    EXT="bin"
                fi
                ;;
        esac

        FILENAME="${BASE_NAME}.${EXT}"
        LOCAL_PATH="${ASSET_DIR}/${FILENAME}"
        URL_PATH="${URL_PREFIX}/${FILENAME}"

        # Handle filename collision (different content, same name)
        if [ -f "$LOCAL_PATH" ]; then
            SHORT_HASH="${HASH:0:6}"
            FILENAME="${BASE_NAME}-${SHORT_HASH}.${EXT}"
            LOCAL_PATH="${ASSET_DIR}/${FILENAME}"
            URL_PATH="${URL_PREFIX}/${FILENAME}"
        fi

        mv "$TEMP_FILE" "$LOCAL_PATH"
        echo "$HASH|$URL_PATH" >> "$HASH_MAP"
        echo "saved as $FILENAME ($EXT)" >&2
    fi

    # Map this URL to the local path
    echo "$URL|$URL_PATH" >> "$MAPPING_FILE"
done

UNIQUE_FILES=$(wc -l < "$HASH_MAP" | tr -d ' ')
echo "Downloaded $UNIQUE_FILES unique assets (deduplicated by content)" >&2

echo "Transforming code..." >&2

# Build sed script: for each varName, find its URL, then find that URL's local path
SED_SCRIPT="/tmp/figma-sed-$$.txt"
> "$SED_SCRIPT"

while IFS='|' read -r VAR_NAME URL; do
    [ -z "$VAR_NAME" ] && continue
    LOCAL_PATH=$(grep "^$URL|" "$MAPPING_FILE" | head -1 | cut -d'|' -f2)
    [ -z "$LOCAL_PATH" ] && continue
    echo "s|src={${VAR_NAME}}|src=\"${LOCAL_PATH}\"|g" >> "$SED_SCRIPT"
    echo "s|src={ ${VAR_NAME} }|src=\"${LOCAL_PATH}\"|g" >> "$SED_SCRIPT"
done < "$ASSET_LIST"

# Transform each input
i=0
while IFS= read -r ORIG_FILE; do
    INPUT_FILE="/tmp/figma-input-$$-$i.txt"

    OUTPUT=$(perl -pe 's/^const\s+\w+\s*=\s*"https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"]+";?\s*\n?//gm' "$INPUT_FILE")

    if [ -s "$SED_SCRIPT" ]; then
        OUTPUT=$(echo "$OUTPUT" | sed -f "$SED_SCRIPT")
    fi

    if [ "$ORIG_FILE" = "-" ]; then
        echo "$OUTPUT"
    else
        OUT_FILE="${ORIG_FILE%.txt}.out.txt"
        echo "$OUTPUT" > "$OUT_FILE"
        echo "  Wrote: $OUT_FILE" >&2
    fi

    i=$((i + 1))
done < "$FILE_LIST"

echo "" >&2
echo "Summary: $TOTAL_REFS references -> $UNIQUE_FILES unique files" >&2
