---
name: figma-to-react
version: 1.3.0
description: Convert Figma screen flows into React components. Extracts design context, downloads assets, and generates pixel-perfect components.
license: MIT
compatibility: Requires Figma MCP server (mcp__figma__*). Node.js environment with React project.
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch mcp__figma__get_metadata mcp__figma__get_screenshot mcp__figma__get_design_context AskUserQuestion
---

# Figma to React

Convert Figma screen flows into React components with local assets.

## Step 1: Get Figma URL & Auto-Detect Configuration

### 1.1 Get Figma URL

Ask user for the Figma URL:
- File URL: `https://www.figma.com/design/{fileKey}/{fileName}`
- Or frame URL: `https://www.figma.com/design/{fileKey}/{fileName}?node-id=1-234`

### 1.2 Auto-Detect Everything

Run these detections automatically:

```
1. SCREENS: Call mcp__figma__get_metadata(fileKey, nodeId)
   → Filter for screen-like frames (consistent dimensions)
   → Order by x-position (left-to-right) or by name
   → Derive component names from layer names

2. FLOW NAME: Derive from Figma file/frame name (kebab-case)

3. OUTPUT DIR: Glob for src/, match project structure patterns

4. ASSET DIR: Look for public/ or src/assets/

5. FRAME DIMENSIONS: Get from Figma metadata
   → Use for demo page container sizing
```

### 1.3 Confirm with User

Present all detected values for user confirmation:

```
I've analyzed the Figma file and your project. Please confirm or adjust:

┌─────────────────────────────────────────────────────────────────┐
│ DETECTED CONFIGURATION                                          │
├─────────────────────────────────────────────────────────────────┤
│ Flow name:      plaid-link (from Figma frame name)              │
│ Output dir:     src/plaid/ (matches src/{feature}/ pattern)     │
│ Asset dir:      public/plaid-assets/                            │
│ Dimensions:     390x844 (from Figma frames)                     │
├─────────────────────────────────────────────────────────────────┤
│ SCREENS DETECTED (5)                                            │
├─────────────────────────────────────────────────────────────────┤
│  1. "01 - Welcome" (1:234)      → WelcomeScreen.tsx             │
│  2. "02 - Select Bank" (1:567)  → SelectBankScreen.tsx          │
│  3. "03 - Credentials" (1:890)  → CredentialsScreen.tsx         │
│  4. "04 - Loading" (1:901)      → LoadingScreen.tsx             │
│  5. "05 - Success" (1:912)      → SuccessScreen.tsx             │
└─────────────────────────────────────────────────────────────────┘

Options:
1. Proceed with detected configuration
2. Adjust settings (I'll ask follow-up questions)
```

If user chooses "Adjust settings", ask about:
- Different flow name?
- Different output directory?
- Exclude any screens?
- Different screen order?

## Step 2: Extract All Screens

For each screen node ID, call `mcp__figma__get_design_context(fileKey, nodeId)` and save the raw response:

```bash
# Save each screen's design context to a temp file
# /tmp/flow-screen-1.txt, /tmp/flow-screen-2.txt, etc.
```

The response includes:
- Full React/TypeScript code with Tailwind classes
- Asset URLs as `const imgXxx = "https://www.figma.com/api/mcp/asset/..."`
- `data-name` attributes with layer names (use for component naming)
- Component descriptions (hints for asset naming)

## Step 3: Process Assets

Write the asset processing script to `/tmp/process-figma-assets.sh`:

```bash
#!/usr/bin/env bash
# Downloads Figma MCP assets, deduplicates by content hash, transforms code.
# Usage: ./process-figma-assets.sh {assetDir} {urlPrefix} screen1.txt screen2.txt ...
set -e
ASSET_DIR="${1:-.}"; URL_PREFIX="${2:-/assets}"; shift 2 2>/dev/null || true
mkdir -p "$ASSET_DIR"
ASSET_LIST="/tmp/figma-assets-$$.txt"; MAPPING_FILE="/tmp/figma-mapping-$$.txt"
HASH_MAP="/tmp/figma-hashes-$$.txt"; FILE_LIST="/tmp/figma-files-$$.txt"
trap "rm -f $ASSET_LIST $MAPPING_FILE $HASH_MAP $FILE_LIST /tmp/figma-input-$$-*.txt /tmp/figma-dl-$$-*.bin /tmp/figma-sed-$$.txt" EXIT
INPUT_COUNT=0; > "$FILE_LIST"
if [ $# -gt 0 ]; then
    for f in "$@"; do cp "$f" "/tmp/figma-input-$$-$INPUT_COUNT.txt"; echo "$f" >> "$FILE_LIST"; INPUT_COUNT=$((INPUT_COUNT + 1)); done
else cat > "/tmp/figma-input-$$-0.txt"; echo "-" >> "$FILE_LIST"; INPUT_COUNT=1; fi
echo "Collecting assets from $INPUT_COUNT screen(s)..." >&2
> "$ASSET_LIST"
for i in $(seq 0 $((INPUT_COUNT - 1))); do
    perl -ne 'while (/const\s+(\w+)\s*=\s*"(https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"]+)"/g) { print "$1|$2\n"; }' "/tmp/figma-input-$$-$i.txt" >> "$ASSET_LIST"
done
TOTAL_REFS=$(wc -l < "$ASSET_LIST" | tr -d ' '); UNIQUE_URLS=$(cut -d'|' -f2 "$ASSET_LIST" | sort -u | wc -l | tr -d ' ')
echo "Found $TOTAL_REFS asset references ($UNIQUE_URLS unique URLs)" >&2
echo "Downloading and deduplicating by content..." >&2
> "$MAPPING_FILE"; > "$HASH_MAP"
for URL in $(cut -d'|' -f2 "$ASSET_LIST" | sort -u); do
    [ -z "$URL" ] && continue
    VAR_NAME=$(grep "|$URL$" "$ASSET_LIST" | head -1 | cut -d'|' -f1)
    BASE_NAME=$(echo "$VAR_NAME" | sed -E 's/^img([A-Z])/\1/' | sed -E 's/^img$/img/' | sed -E 's/^img([0-9])/img-\1/' | sed -E 's/([a-z])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')
    TEMP_FILE="/tmp/figma-dl-$$-${BASE_NAME}.bin"; echo -n "  $BASE_NAME: " >&2
    if ! curl -sL "$URL" -o "$TEMP_FILE"; then echo "FAILED" >&2; continue; fi
    HASH=$(md5 -q "$TEMP_FILE" 2>/dev/null || md5sum "$TEMP_FILE" | cut -d' ' -f1)
    EXISTING=$(grep "^$HASH|" "$HASH_MAP" | cut -d'|' -f2 || true)
    if [ -n "$EXISTING" ]; then echo "duplicate of $EXISTING" >&2; rm "$TEMP_FILE"; URL_PATH="$EXISTING"
    else
        FILE_TYPE=$(file -b "$TEMP_FILE")
        case "$FILE_TYPE" in *"SVG"*) EXT="svg";; *"PNG"*) EXT="png";; *"JPEG"*|*"JPG"*) EXT="jpg";; *"GIF"*) EXT="gif";; *"WebP"*) EXT="webp";;
            *) if head -c 100 "$TEMP_FILE" | grep -q "<svg"; then EXT="svg"; else EXT="bin"; fi;; esac
        FILENAME="${BASE_NAME}.${EXT}"; LOCAL_PATH="${ASSET_DIR}/${FILENAME}"; URL_PATH="${URL_PREFIX}/${FILENAME}"
        if [ -f "$LOCAL_PATH" ]; then SHORT_HASH="${HASH:0:6}"; FILENAME="${BASE_NAME}-${SHORT_HASH}.${EXT}"; LOCAL_PATH="${ASSET_DIR}/${FILENAME}"; URL_PATH="${URL_PREFIX}/${FILENAME}"; fi
        mv "$TEMP_FILE" "$LOCAL_PATH"; echo "$HASH|$URL_PATH" >> "$HASH_MAP"; echo "saved as $FILENAME ($EXT)" >&2
    fi
    echo "$URL|$URL_PATH" >> "$MAPPING_FILE"
done
UNIQUE_FILES=$(wc -l < "$HASH_MAP" | tr -d ' '); echo "Downloaded $UNIQUE_FILES unique assets" >&2
echo "Transforming code..." >&2
SED_SCRIPT="/tmp/figma-sed-$$.txt"; > "$SED_SCRIPT"
while IFS='|' read -r VAR_NAME URL; do
    [ -z "$VAR_NAME" ] && continue; LOCAL_PATH=$(grep "^$URL|" "$MAPPING_FILE" | head -1 | cut -d'|' -f2); [ -z "$LOCAL_PATH" ] && continue
    echo "s|src={${VAR_NAME}}|src=\"${LOCAL_PATH}\"|g" >> "$SED_SCRIPT"; echo "s|src={ ${VAR_NAME} }|src=\"${LOCAL_PATH}\"|g" >> "$SED_SCRIPT"
done < "$ASSET_LIST"
i=0; while IFS= read -r ORIG_FILE; do
    INPUT_FILE="/tmp/figma-input-$$-$i.txt"
    OUTPUT=$(perl -pe 's/^const\s+\w+\s*=\s*"https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"]+";?\s*\n?//gm' "$INPUT_FILE")
    if [ -s "$SED_SCRIPT" ]; then OUTPUT=$(echo "$OUTPUT" | sed -f "$SED_SCRIPT"); fi
    if [ "$ORIG_FILE" = "-" ]; then echo "$OUTPUT"; else OUT_FILE="${ORIG_FILE%.txt}.out.txt"; echo "$OUTPUT" > "$OUT_FILE"; echo "  Wrote: $OUT_FILE" >&2; fi
    i=$((i + 1))
done < "$FILE_LIST"
echo "Summary: $TOTAL_REFS references -> $UNIQUE_FILES unique files" >&2
```

Run it:
```bash
chmod +x /tmp/process-figma-assets.sh
/tmp/process-figma-assets.sh ./public/onfido-assets /onfido-assets \
  /tmp/flow-screen-1.txt /tmp/flow-screen-2.txt /tmp/flow-screen-3.txt
```

Output: `flow-screen-1.out.txt`, `flow-screen-2.out.txt`, etc. with:
- Asset const declarations removed
- `src={imgXxx}` replaced with `src="/onfido-assets/filename.svg"`

## Step 4: Rename Generic Assets

Check the asset directory for generic names and rename to meaningful ones:

| Generic | → | Meaningful |
|---------|---|------------|
| `img.svg` | → | `x-icon.svg` (it's a close icon) |
| `img-1.svg` | → | `arrow-back.svg` (it's a back arrow) |
| `img-2.svg` | → | `onfido-wordmark.svg` (Onfido text logo) |
| `rectangle-266.svg` | → | `head-turn-guide.svg` (animation guide) |

To identify what an asset is:
- Read SVG files to see the shapes/paths
- Check component descriptions from Figma MCP (e.g., "x" = close icon)
- Look at context where it's used (e.g., "Navigation Bar" → probably nav icons)

After renaming, update references in the `.out.txt` files.

## Step 5: Generate Components

For each screen, read the `.out.txt` file and create a React component:

```typescript
// src/onfido/screens/MotionMobile2Screen.tsx
import type { ScreenProps } from '../registry';

export function MotionMobile2Screen({ onNext, onBack, onClose }: ScreenProps) {
  return (
    // Paste the transformed code from flow-screen-2.out.txt
    // The code already has local asset paths
  );
}
```

Derive component name from `data-name` attribute: `"Motion / Mobile 2"` → `MotionMobile2Screen`

## Step 6: Create Registry

Create `{outputDir}/screens/registry.ts` with:
- `ScreenProps` interface (onNext, onBack, onClose callbacks)
- Import all screen components
- `screens` array with id, title, component for each
- `screenFlow` array of screen IDs in order
- Helper functions: `getScreenById`, `getNextScreenId`, `getPrevScreenId`

## Step 7: Create Demo Page

Create `{outputDir}/{FlowName}DemoPage.tsx` with:
- State for current screen ID
- Render current screen component with navigation callbacks
- Sidebar/nav with screen selector buttons
- Container sized to match Figma frame dimensions (phone, tablet, desktop, etc.)

## Step 8: Add Route

Add route to your app's router (App.tsx, router config, etc.):

```typescript
<Route path="/onfido" element={<OnfidoDemoPage />} />
```

## Done

Output summary:
```
Created:
  src/onfido/screens/registry.ts
  src/onfido/screens/components/MotionMobile1Screen.tsx
  src/onfido/screens/components/MotionMobile2Screen.tsx
  src/onfido/screens/components/MotionMobile3Screen.tsx
  src/onfido/OnfidoDemoPage.tsx
  public/onfido-assets/*.svg, *.png

Run: pnpm dev
Visit: http://localhost:5173/onfido
```

---

## Quick Reference

### Figma MCP Tools

```
mcp__figma__get_metadata(fileKey, nodeId)       → Screen structure, child nodes
mcp__figma__get_screenshot(fileKey, nodeId)     → Visual reference image
mcp__figma__get_design_context(fileKey, nodeId) → React code + asset URLs
```

### Asset Script Flow

```
1. get_design_context for each screen → save to /tmp/flow-screen-{i}.txt
2. Run script: /tmp/process-figma-assets.sh {assetDir} {urlPrefix} screen1.txt screen2.txt ...
3. Script downloads assets, dedupes by content hash, transforms code
4. Output: flow-screen-{i}.out.txt with local asset paths
5. Rename generic assets (img-1.svg → arrow-back.svg)
6. Use transformed code in components
```

### Key Rules

- Never use Figma asset URLs in generated code (must be local paths)
- Deduplicate assets by content hash (Figma generates unique URLs per request)
- Detect actual file type with `file` command (don't trust extensions)
- Rename generic assets to meaningful names based on content/context
