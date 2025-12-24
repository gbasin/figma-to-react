# Step 7: Rename Generic Assets (Optional)

Offer to rename assets with generic names to meaningful ones.

## Pre-flight Check

```bash
$SKILL_DIR/scripts/status.sh --check 7
```

If this fails, it prints the correct step. Uncheck wrongly-completed TodoWrite items and read that step file instead.

## Check for Generic Names

Look for assets like:
- `asset.svg`, `asset-1.svg`, `asset-abc123.svg`
- `image.png`, `image-1.png`

```bash
ls {assetDir}/*.{svg,png,jpg} 2>/dev/null | grep -E '(asset|image)[-0-9]*\.'
```

## If Generic Assets Found

Present to user:
```
Found 12 assets with generic names. Analyze and rename?

Current -> Suggested:
  asset.svg      -> close-icon.svg (X shape, likely close button)
  asset-1.svg    -> back-arrow.svg (left-pointing arrow)
  image.png      -> face-capture-bg.png (blurred face photo)

Apply renames? [Y/n/select]
```

## Renaming Process

Use the rename-assets.sh script:
```bash
# Single component
$SKILL_DIR/scripts/rename-assets.sh \
  /tmp/figma-to-react/captures/figma-{nodeId}.txt \
  {assetDir} \
  {componentPath}

# Directory of components (finds all .tsx files)
$SKILL_DIR/scripts/rename-assets.sh \
  /tmp/figma-to-react/captures/figma-{nodeId}.txt \
  {assetDir} \
  src/components/

# Multiple component files
$SKILL_DIR/scripts/rename-assets.sh \
  /tmp/figma-to-react/captures/figma-{nodeId}.txt \
  {assetDir} \
  src/A.tsx src/B.tsx
```

The script has two phases:
1. **Rename**: Parses MCP output for component descriptions, renames `asset-*.svg` to meaningful names
2. **Dedup**: Merges identical assets (normalizes SVG ids before comparing), keeps shortest/best name

## Mark Complete

After renaming (or if no generic assets found), save completion marker:

```bash
mkdir -p /tmp/figma-to-react/steps/7
echo '{"complete": true}' > /tmp/figma-to-react/steps/7/complete.json
```

## Next Step

Read step-8-disarm-hook.md.
