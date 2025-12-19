---
name: figma-to-react
version: 1.3.0
description: Convert linear Figma screen flows into pixel-perfect React components with Tailwind CSS. Creates fully functional screens with iOS-native animations, interactive elements, and automated visual verification. Use when converting Figma mobile flows to React, building demo apps from designs, or replicating vendor UIs (like Plaid, Stripe, etc.).
license: MIT
compatibility: Requires Figma MCP server (mcp__figma__*) and dev-browser skill for visual verification. Node.js environment with React/Tailwind project.
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch mcp__figma__get_metadata mcp__figma__get_screenshot mcp__figma__get_design_context AskUserQuestion
---

# Figma to React Flow Conversion

Convert linear Figma screen flows into pixel-perfect, fully functional React components.

## Core Principle: Manifest-Driven Execution

This skill uses a **manifest file** as the single source of truth. The manifest:
- Tracks every screen from Figma node → React component
- Tracks every asset from Figma URL → local file
- Enforces phase gates (cannot proceed until prior phase complete)
- Provides audit trail of what succeeded/failed

Write the manifest first, then update it as you progress. Never skip updating the manifest.

### Real-Time Manifest Updates

Update the manifest after each action, not in batches at the end.

```
Bad:  Extract all → Download all → Generate all → Update manifest once
Good: Extract screen 1 → update manifest → Extract screen 2 → update manifest → ...
```

This allows recovery if the agent loses context, and gives the user visibility into progress.

---

## Phase 1: Configuration & Manifest Creation

### Step 1.1: Get Figma URL

Use `AskUserQuestion` to get the Figma URL (required):
- File URL: `https://www.figma.com/design/{fileKey}/{fileName}`
- Or frame URL: `https://www.figma.com/design/{fileKey}/{fileName}?node-id=1-234`

### Step 1.2: Auto-Detect & Discover

Run these detections automatically:

```
1. SCREENS: Call mcp__figma__get_metadata(fileKey, nodeId)
   → Filter for screen-like frames (consistent dimensions)
   → Order by x-position (left-to-right) or by name
   → Derive component names from layer names

2. FLOW NAME: Derive from Figma file/frame name (kebab-case)

3. OUTPUT DIR: Glob for src/, match project structure patterns

4. ASSET DIR: Look for public/ or src/assets/

5. DEVICE FRAME: Glob for **/DeviceFrame.tsx, **/PhoneFrame.tsx
   → null if not found

6. CONTAINER MODE: Infer from Figma frame dimensions
   → 390x844 or similar = phone-frame
   → Has overlay/backdrop = modal
   → Otherwise = fullscreen

7. VERIFICATION TOOL: Check available browser automation options
   → Check if mcp__claude-in-chrome__* tools available → "claude-in-chrome"
   → Check if dev-browser skill available → "dev-browser"
   → If neither available → "skip" (no visual verification)
   → Default recommendation: first available tool, or "skip" if none
```

### Step 1.3: Confirm Configuration with User

**MANDATORY: Present all detected values for user confirmation before creating manifest.**

Use `AskUserQuestion` to show detected configuration:

```
I've analyzed the Figma file and your project. Please confirm or adjust:

┌─────────────────────────────────────────────────────────────────┐
│ DETECTED CONFIGURATION                                          │
├─────────────────────────────────────────────────────────────────┤
│ Flow name:      plaid-link (from Figma frame name)              │
│ Output dir:     src/plaid/ (matches src/{feature}/ pattern)     │
│ Asset dir:      public/plaid-assets/                            │
│ Device frame:   src/components/DeviceFrame.tsx (found)          │
│ Container:      phone-frame (390x844 frames detected)           │
│ Verification:   claude-in-chrome (detected, recommended)        │
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

**If user chooses "Adjust settings"**, ask specific follow-up questions:
- Different flow name?
- Different output directory?
- Exclude any screens?
- Different screen order?
- Override container mode?
- Different verification tool? (claude-in-chrome | dev-browser | skip)

### Step 1.4: Create Manifest

**Only after user confirms configuration, create `{flow-name}-manifest.json`.**

**Why a manifest?** The manifest is important because it organizes and tracks progress throughout the process so the agent does not have to rely on their context window.

```json
{
  "meta": {
    "flowName": "plaid-link",
    "figmaFileKey": "abc123",
    "figmaUrl": "https://www.figma.com/design/abc123/Plaid-Flow",
    "createdAt": "2024-12-19T10:00:00Z",
    "currentPhase": "extraction"
  },
  "config": {
    "outputDir": "src/plaid",
    "assetDir": "public/plaid-assets",
    "containerMode": "phone-frame",
    "deviceFrame": "src/components/DeviceFrame.tsx",
    "verificationTool": "claude-in-chrome"
  },
  "screens": [
    {
      "order": 1,
      "figma": {
        "nodeId": "1:234",
        "url": "https://www.figma.com/design/abc123/Plaid?node-id=1-234",
        "layerName": "01 - Welcome"
      },
      "react": {
        "componentName": "WelcomeScreen",
        "filePath": "src/plaid/screens/components/WelcomeScreen.tsx",
        "registryId": "welcome"
      },
      "extraction": {
        "status": "pending",
        "screenshot": null,
        "designContext": null
      },
      "generation": {
        "status": "blocked"
      },
      "verification": {
        "status": "blocked",
        "attempts": 0,
        "passed": false
      },
      "assetRefs": []
    }
  ],
  "assets": [],
  "files": {
    "registry": { "path": "src/plaid/screens/registry.ts", "status": "pending" },
    "demoPage": { "path": "src/plaid/PlaidDemoPage.tsx", "status": "pending" },
    "route": { "path": "src/App.tsx", "routePath": "/plaid", "status": "pending" }
  },
  "phases": {
    "config": { "status": "complete" },
    "extraction": { "status": "in_progress" },
    "assets": { "status": "blocked" },
    "architecture": { "status": "blocked" },
    "screens": { "status": "blocked" },
    "verification": { "status": "blocked" }
  }
}
```

### Step 1.4: Confirm with User

Display configuration summary and screen list. Get explicit confirmation before proceeding.

```
Configuration:
  Flow: plaid-link
  Screens: 5 discovered
  Output: src/plaid/
  Assets: public/plaid-assets/

Screens to convert:
  1. 01 - Welcome (1:234) → WelcomeScreen.tsx
  2. 02 - Select Bank (1:567) → SelectBankScreen.tsx
  3. 03 - Credentials (1:890) → CredentialsScreen.tsx
  ...

Proceed? [Y/n]
```

---

## Phase 2: Figma Extraction & Asset Download

### Gate Check
```
READ manifest
VERIFY phases.config.status === "complete"
IF NOT → STOP, complete Phase 1
```

### Step 2.1: Extract Screenshots

For each screen in `manifest.screens`:

```
Get screenshot:
  mcp__figma__get_screenshot(fileKey, nodeId)
  → Save to temp location
  → UPDATE manifest: screens[i].extraction.screenshot = path
```

### Step 2.2: Extract Design Context (All Screens)

Extract design context for ALL screens, then process together for deduplication:

```
1. For each screen, get design context and save to temp file:

   mcp__figma__get_design_context(fileKey, nodeId)
   → Save raw response to /tmp/{flow}-screen-{i}.txt

   (Figma MCP generates unique URLs per request, so the same icon
   in different screens will have different URLs. We deduplicate by content.)

2. After ALL screens extracted, run the asset processing script:

   Write this script to `/tmp/process-figma-assets.sh`:

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
   echo "Phase 1: Collecting assets from $INPUT_COUNT screen(s)..." >&2
   > "$ASSET_LIST"
   for i in $(seq 0 $((INPUT_COUNT - 1))); do
       perl -ne 'while (/const\s+(\w+)\s*=\s*"(https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"]+)"/g) { print "$1|$2\n"; }' "/tmp/figma-input-$$-$i.txt" >> "$ASSET_LIST"
   done
   TOTAL_REFS=$(wc -l < "$ASSET_LIST" | tr -d ' '); UNIQUE_URLS=$(cut -d'|' -f2 "$ASSET_LIST" | sort -u | wc -l | tr -d ' ')
   echo "Found $TOTAL_REFS asset references ($UNIQUE_URLS unique URLs)" >&2
   echo "Phase 2: Downloading and deduplicating by content..." >&2
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
   UNIQUE_FILES=$(wc -l < "$HASH_MAP" | tr -d ' '); echo "Downloaded $UNIQUE_FILES unique assets (deduplicated by content)" >&2
   echo "Phase 3: Transforming code..." >&2
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
   echo ""; echo "Summary: $TOTAL_REFS references -> $UNIQUE_FILES unique files" >&2
   ```

   Then run it:
   ```bash
   chmod +x /tmp/process-figma-assets.sh
   /tmp/process-figma-assets.sh ./public/plaid-assets /plaid-assets \
     /tmp/plaid-screen-1.txt /tmp/plaid-screen-2.txt /tmp/plaid-screen-3.txt
   ```

   Outputs: screen1.out.txt, screen2.out.txt, screen3.out.txt

   The script:
   - Collects all assets from all screens
   - Downloads each unique URL
   - Deduplicates by content hash (same icon = same file, even if URLs differ)
   - Detects actual file type (SVG/PNG/JPG) using `file` command
   - Replaces `src={imgXxx}` with local paths in the code
   - Outputs transformed code to .out.txt files

3. Review and rename generic assets:

   After the script runs, check the asset directory for generic names:
   - `img.svg`, `img-1.svg`, `img-2.svg` (generic)
   - `rectangle-*.svg`, `frame-*.svg`, `group-*.svg` (generic)
   - `image.png`, `image-1.png` (generic)

   For each generic asset:
   - Open the file to see what it actually is (SVG content, or view the image)
   - Infer meaning from context (where it's used in the screens, nearby elements)
   - Rename to something descriptive: `close-icon.svg`, `arrow-back.svg`, `logo.svg`
   - Update all references in the .out.txt files

   Example renames:
   ```
   img.svg → x-icon.svg (it's an X/close icon)
   img-1.svg → arrow-back.svg (it's a back arrow)
   img-2.svg → onfido-wordmark.svg (it's the Onfido text logo)
   rectangle-266.svg → head-turn-guide-left.svg (it's part of a head-turn animation)
   ```

4. Use the transformed code output for component generation

   → UPDATE manifest: screens[i].extraction.designContext = "extracted"
   → UPDATE manifest: screens[i].extraction.status = "complete"
```

### Step 2.3: Update Manifest

After ALL screens extracted:
```
UPDATE manifest: phases.extraction.status = "complete"
UPDATE manifest: phases.assets.status = "complete"  (assets downloaded by script)
UPDATE manifest: phases.architecture.status = "in_progress"
```

**CHECKPOINT: Read manifest. Every screen must have `extraction.status === "complete"`**

---

## Phase 3: Architecture (Skip Asset Download)

Assets are now downloaded automatically during extraction by the `process-figma-assets.sh` script.
Proceed directly to architecture.

### Gate Check
```
READ manifest
VERIFY phases.extraction.status === "complete"
IF NOT → STOP, complete Phase 2
```

### Step 3.1: Complete Phase

```
UPDATE manifest: phases.assets.status = "complete"
UPDATE manifest: phases.architecture.status = "in_progress"
```

**Note:** Failed assets don't block progress. They get placeholder code in Phase 5 and are reported in the final summary.

---

## Phase 4: Generate Architecture

### Gate Check
```
READ manifest
VERIFY phases.assets.status === "complete"
IF NOT → STOP, complete Phase 3
```

### Step 4.1: Create Registry

Write `{outputDir}/screens/registry.ts`:

```typescript
import type { ComponentType } from 'react';

export interface ScreenProps {
  onNext?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}

export interface Screen {
  id: string;
  title: string;
  component: ComponentType<ScreenProps>;
}

// Imports generated from manifest.screens
import { WelcomeScreen } from './components/WelcomeScreen';
// ... for each screen

export const screens: Screen[] = [
  { id: 'welcome', title: 'Welcome', component: WelcomeScreen },
  // ... from manifest
];

export const screenFlow: string[] = ['welcome', /* ... */];

export function getScreenById(id: string): Screen | undefined {
  return screens.find(s => s.id === id);
}

export function getNextScreenId(currentId: string): string | null {
  const index = screenFlow.indexOf(currentId);
  return index >= 0 && index < screenFlow.length - 1 ? screenFlow[index + 1] : null;
}

export function getPrevScreenId(currentId: string): string | null {
  const index = screenFlow.indexOf(currentId);
  return index > 0 ? screenFlow[index - 1] : null;
}
```

UPDATE manifest: `files.registry.status = "complete"`

### Step 4.2: Create Demo Page

Write `{outputDir}/{FlowName}DemoPage.tsx`:

```typescript
import { useState } from 'react';
import { screens, screenFlow, getScreenById, getNextScreenId, getPrevScreenId } from './screens/registry';
import { DeviceFrame } from '@/components/DeviceFrame';

export function PlaidDemoPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const directScreen = searchParams.get('screen');

  const [currentScreenId, setCurrentScreenId] = useState(
    directScreen && screenFlow.includes(directScreen) ? directScreen : screenFlow[0]
  );

  const currentScreen = getScreenById(currentScreenId);
  if (!currentScreen) return null;

  const CurrentComponent = currentScreen.component;

  const handleNext = () => {
    const next = getNextScreenId(currentScreenId);
    if (next) setCurrentScreenId(next);
  };

  const handleBack = () => {
    const prev = getPrevScreenId(currentScreenId);
    if (prev) setCurrentScreenId(prev);
  };

  const handleClose = () => setCurrentScreenId(screenFlow[0]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <DeviceFrame>
        <CurrentComponent onNext={handleNext} onBack={handleBack} onClose={handleClose} />
      </DeviceFrame>

      {/* Screen selector sidebar */}
      <div className="ml-8 space-y-2">
        {screens.map((screen, i) => (
          <button
            key={screen.id}
            onClick={() => setCurrentScreenId(screen.id)}
            className={`block text-left px-3 py-1 rounded ${
              screen.id === currentScreenId ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {i + 1}. {screen.title}
          </button>
        ))}
      </div>
    </div>
  );
}
```

UPDATE manifest: `files.demoPage.status = "complete"`

### Step 4.3: Add Route

Add route to App.tsx or router config.

UPDATE manifest: `files.route.status = "complete"`

### Step 4.4: Complete Phase

```
UPDATE manifest: phases.architecture.status = "complete"
UPDATE manifest: phases.screens.status = "in_progress"
UPDATE manifest: ALL screens[].generation.status = "pending" (unblock them)
```

---

## Phase 5: Generate Screen Components

### Gate Check
```
READ manifest
VERIFY phases.architecture.status === "complete"
VERIFY files.registry.status === "complete"
IF NOT → STOP, complete Phase 4
```

### Step 5.1: Generate Each Screen (Sequential)

For each screen in `manifest.screens`:

**Before generating, gather required assets:**
```
READ manifest
FOR assetId IN screen.assetRefs:
  asset = manifest.assets.find(a => a.id === assetId)

  IF asset.status === "verified" OR asset.status === "degraded":
    → Use asset.local.filePath in code

  IF asset.status === "failed":
    → Use visible placeholder (gray box with "MISSING: {name}")
    → Add to screen's failedAssets list for summary
```

**Assets are already transformed**

The `process-figma-assets.sh` script in Phase 2 already:
- Downloaded all assets with correct extensions
- Replaced `src={imgXxx}` with local paths like `src="/assets/face.svg"`
- Removed the const declarations

Use the transformed code directly. Only add placeholders for any failed downloads.

**Generate component:**

```typescript
import type { ScreenProps } from '../registry';

export function WelcomeScreen({ onNext, onBack, onClose }: ScreenProps) {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Use EXACT Tailwind classes from Figma design context */}
      {/* Use EXACT SVG code from Figma */}

      {/* Verified asset - use LOCAL file path, NOT Figma URL */}
      <img src="/plaid-assets/plaid-logo.svg" alt="Plaid" className="w-[120px] h-[40px]" />

      {/* Failed asset - visible placeholder so user sees what's missing */}
      <div className="w-[48px] h-[48px] bg-red-100 border-2 border-red-300 border-dashed flex items-center justify-center">
        <span className="text-[10px] text-red-500 text-center">MISSING:<br/>bank-chip</span>
      </div>
    </div>
  );
}
```

**Placeholders are intentionally ugly** — red dashed borders make missing assets obvious when viewing the app, rather than silently broken.

**Update manifest after each screen:**
```
UPDATE manifest: screens[i].generation.status = "complete"
```

### Step 5.2: Complete Phase

```
READ manifest
VERIFY ALL screens[].generation.status === "complete"

UPDATE manifest: phases.screens.status = "complete"
UPDATE manifest: phases.verification.status = "in_progress"
UPDATE manifest: ALL screens[].verification.status = "pending"
```

---

## Phase 6: Visual Verification

### Gate Check
```
READ manifest
VERIFY phases.screens.status === "complete"
CHECK config.verificationTool:
  - IF "skip" → Skip to Phase 7, mark all verification as "skipped"
  - IF "claude-in-chrome" or "dev-browser" → Continue
IF NOT → STOP, complete Phase 5
```

### Step 6.1: Start Dev Server

Ensure dev server is running.

### Step 6.2: Initialize Browser Automation

Based on `config.verificationTool`:

**claude-in-chrome:**
```
1. Call mcp__claude-in-chrome__tabs_context_mcp to get/create tab group
2. Create new tab with mcp__claude-in-chrome__tabs_create_mcp
3. Use mcp__claude-in-chrome__navigate to load pages
4. Use mcp__claude-in-chrome__computer with action="screenshot" for captures
```

**dev-browser:**
```
1. Invoke /dev-browser skill to start browser session
2. Use dev-browser navigation and screenshot capabilities
3. Follow dev-browser skill patterns for page interaction
```

### Step 6.3: Verify Each Screen

For each screen in `manifest.screens`:

```
1. Navigate to /{flow}?screen={registryId}
2. Wait for render + asset loading
3. Screenshot at device dimensions (use configured tool)
4. Compare against Figma screenshot (from extraction phase)

5. IF discrepancies found:
   a. Identify issue (spacing, color, border-radius, etc.)
   b. Auto-fix if possible (Tailwind class adjustment)
   c. Re-screenshot and compare
   d. Repeat up to 10 times
   e. UPDATE manifest: screens[i].verification.attempts++

6. UPDATE manifest:
   - Pass: screens[i].verification.status = "passed", .passed = true
   - Fail after 10 attempts: screens[i].verification.status = "failed"
     Add issues to screens[i].verification.issues[]
```

### Step 6.4: Complete Phase

```
UPDATE manifest: phases.verification.status = "complete"
UPDATE manifest: meta.currentPhase = "complete"
```

---

## Phase 7: Output Summary

Read manifest and generate summary:

```
✅ Flow: plaid-link
   Route: /plaid
   Screens: 5

📁 Files Created:
   src/plaid/screens/registry.ts
   src/plaid/screens/components/WelcomeScreen.tsx
   src/plaid/screens/components/SelectBankScreen.tsx
   ...
   src/plaid/PlaidDemoPage.tsx

🎨 Assets (8 total, 6 verified, 1 degraded, 1 failed):
   ✅ plaid-logo.svg (verified, direct)
   ✅ success-check.svg (verified, direct)
   ✅ close-icon.svg (verified, direct)
   ✅ back-arrow.svg (verified, direct)
   ✅ flagstar-logo.png (verified, direct)
   ✅ bank-illustration.png (verified, api)
   ⚠️  search-icon.svg (degraded, screenshot) — lower quality
   ❌ bank-chip-chase.png (failed) — variant mismatch, all methods failed

🖼️  Screen Verification:
   ✅ WelcomeScreen (passed)
   ✅ SelectBankScreen (passed, auto-fixed: rounded-lg → rounded-xl)
   ⚠️  CredentialsScreen (passed with placeholder - 1 missing asset)
   ✅ SuccessScreen (passed)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 ACTION REQUIRED (1 failed asset):

   bank-chip-chase.png
   ├─ Figma node: https://www.figma.com/design/abc123/Plaid?node-id=1-890
   ├─ Reason: Component variant - get_design_context returned base variant
   ├─ Used in: CredentialsScreen (currently showing red placeholder)
   └─ Fix: Export manually from Figma → public/plaid-assets/bank-chip-chase.png

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Manifest: plaid-link-manifest.json

Run: pnpm dev
Visit: http://localhost:5173/plaid
```

**The summary shows exactly what succeeded, what failed, and what the user needs to do.** Failed assets have direct links to the Figma node for easy manual export.

---

## Absolute Rules

### NEVER:
- Skip creating/updating the manifest
- Proceed to next phase without gate check passing
- Approximate SVGs or substitute similar icons
- Silently fail (always record failures in manifest with reasons)
- Use Figma MCP asset URLs directly in generated code (must be local)
- Batch manifest updates at the end
- Generate screens without downloading assets first

### ALWAYS:
- Create manifest first before any other work
- Update manifest after each significant action
- Parse asset URLs from `get_design_context` (look for `const img* = "https://www.figma.com/api/mcp/asset/..."`)
- Download assets to local paths in Phase 3
- Replace Figma URLs with local paths in Phase 5
- Make failures visible (red placeholder boxes, not invisible broken images)
- Report everything in final summary

---

## Manifest Schema Reference

```typescript
interface Manifest {
  meta: {
    flowName: string;
    figmaFileKey: string;
    figmaUrl: string;
    createdAt: string;
    currentPhase: 'config' | 'extraction' | 'assets' | 'architecture' | 'screens' | 'verification' | 'complete';
  };
  config: {
    outputDir: string;
    assetDir: string;
    containerMode: 'phone-frame' | 'modal' | 'fullscreen' | 'none';
    deviceFrame: string | null;
    verificationTool: 'claude-in-chrome' | 'dev-browser' | 'skip';
  };
  screens: Array<{
    order: number;
    figma: {
      nodeId: string;
      url: string;
      layerName: string;
    };
    react: {
      componentName: string;
      filePath: string;
      registryId: string;
    };
    extraction: {
      status: 'pending' | 'complete';
      screenshot: string | null;
      designContext: 'pending' | 'extracted';
    };
    generation: {
      status: 'blocked' | 'pending' | 'complete';
    };
    verification: {
      status: 'blocked' | 'pending' | 'passed' | 'failed' | 'skipped';
      attempts: number;
      passed: boolean;
      issues: string[];
    };
    assetRefs: string[];
  }>;
  assets: Array<{
    id: string;
    figma: {
      nodeId: string;
      layerName: string;
      url: string;
    };
    local: {
      fileName: string;
      filePath: string;
      type: 'svg' | 'png' | 'jpg';
    };
    status: 'pending' | 'downloading' | 'verified' | 'degraded' | 'failed';
    extractionMethod: 'direct' | 'api' | 'screenshot' | null;
    failureReason: string | null;
    usedBy: string[];
  }>;
  files: {
    registry: { path: string; status: 'pending' | 'complete' };
    demoPage: { path: string; status: 'pending' | 'complete' };
    route: { path: string; routePath: string; status: 'pending' | 'complete' };
  };
  phases: {
    config: { status: 'pending' | 'in_progress' | 'complete' };
    extraction: { status: 'blocked' | 'in_progress' | 'complete' };
    assets: { status: 'blocked' | 'in_progress' | 'complete' };
    architecture: { status: 'blocked' | 'in_progress' | 'complete' };
    screens: { status: 'blocked' | 'in_progress' | 'complete' };
    verification: { status: 'blocked' | 'in_progress' | 'complete' };
  };
}
```

---

## Quick Reference

### Phase Gates Summary

| Phase | Gate Check |
|-------|-----------|
| 2. Extraction | `phases.config === "complete"` |
| 3. Assets | `phases.extraction === "complete"` AND all `screens[].extraction.status === "complete"` |
| 4. Architecture | `phases.assets === "complete"` (assets always complete - failures don't block) |
| 5. Screens | `phases.architecture === "complete"` AND `files.registry.status === "complete"` |
| 6. Verification | `phases.screens === "complete"` AND all `screens[].generation.status === "complete"` |

### Figma MCP Tools

```
mcp__figma__get_metadata(fileKey, nodeId)     → Screen structure
mcp__figma__get_screenshot(fileKey, nodeId)   → Visual reference
mcp__figma__get_design_context(fileKey, nodeId) → Code + assets
```

### iOS Animation Curves

```css
/* Navigation */ cubic-bezier(0.36, 0.66, 0.04, 1) 500ms
/* Modal */      cubic-bezier(0.32, 0.72, 0, 1) 500ms
```

### Asset Handling Flow

```
Phase 2: EXTRACT + DOWNLOAD (automated, batch all screens)

  1. For each screen, call get_design_context(fileKey, nodeId)
     → Save raw response to /tmp/{flow}-screen-{i}.txt

  2. Write the asset processing script (see Phase 2 for full script)
     Then process ALL screens for content-hash deduplication:
     /tmp/process-figma-assets.sh ./public/assets /assets /tmp/flow-screen-1.txt /tmp/flow-screen-2.txt ...
     → Outputs: flow-screen-1.out.txt, flow-screen-2.out.txt, ...

  3. Script automatically:
     - Downloads all unique URLs
     - Deduplicates by content hash (same icon = same file)
     - Detects types (SVG/PNG/JPG) with `file` command
     - Replaces src={imgXxx} → src="/assets/face.svg"
     - Outputs transformed code to .out.txt files

  4. Use transformed code for component generation
```
