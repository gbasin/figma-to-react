# Step 3: Confirm Configuration with User

Get user approval on output paths before processing.

## Present to User

```
Detected: [Framework] + React + Tailwind

Output paths (confirm or edit):
  Components: src/components/
  Assets:     public/figma-assets/
  Tokens:     src/styles/figma-tokens.css
  URL prefix: /figma-assets

Proceed? [Y/n/edit]
```

## If User Wants Changes

Use `AskUserQuestion` to gather custom paths:
- Component output directory
- Asset output directory
- Tokens CSS file location
- URL prefix for assets in code

## Parse Figma URL

Extract from user's Figma link:
```
https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
```

Get list of nodeIds to process (may be multiple screens).

## Write Recovery Files

Save state for compaction resilience. If context is compacted mid-job, agent can re-read these files to recover.

**1. Save raw user input** (use actual links/IDs from user, not these examples):
```bash
cat > /tmp/figma-to-react/input.txt << 'EOF'
https://www.figma.com/design/abc123/MyFile?node-id=237-2571
https://www.figma.com/design/abc123/MyFile?node-id=237-2572
EOF
```
Store exactly what the user provided (links or node IDs), one per line.

**2. Save confirmed config** (use actual paths confirmed above, not these examples):
```bash
cat > /tmp/figma-to-react/config.json << 'EOF'
{
  "componentDir": "src/components",
  "assetDir": "public/figma-assets",
  "tokensFile": "src/styles/figma-tokens.css",
  "urlPrefix": "/figma-assets"
}
EOF
```

## Next Step

Mark this step complete. Read step-4-generation.md.
