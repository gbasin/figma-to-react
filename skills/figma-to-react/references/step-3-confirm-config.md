# Step 3: Confirm Configuration

Use hardcoded defaults with quick override option.

## Default Paths

```
Components: src/components/figma/
Assets:     public/figma-assets/
Tokens:     src/styles/figma-tokens.css
URL prefix: /figma-assets
```

## Present to User

```
Detected: [Framework] + React + Tailwind

Output paths:
  Components: src/components/figma/
  Assets:     public/figma-assets/
  Tokens:     src/styles/figma-tokens.css

Proceed with defaults? [Y/edit]
```

If user types "edit", use `AskUserQuestion` to gather custom paths.

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
  "componentDir": "src/components/figma",
  "assetDir": "public/figma-assets",
  "tokensFile": "src/styles/figma-tokens.css",
  "urlPrefix": "/figma-assets"
}
EOF
```

## Next Step

Mark this step complete. Read step-3b-preview-route.md.
