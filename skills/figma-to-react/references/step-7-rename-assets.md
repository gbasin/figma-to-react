# Step 7: Rename Generic Assets (Optional)

Offer to rename assets with generic names to meaningful ones.

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
$SKILL_DIR/scripts/rename-assets.sh \
  /tmp/figma-to-react/captures/figma-{nodeId}.txt \
  {assetDir} \
  {componentPath}
```

Or manually:
1. Analyze each asset visually
2. Generate descriptive name
3. Rename file
4. Update references in component

The script handles atomic rename + reference update.

## Next Step

Read step-8-disarm-hook.md.
