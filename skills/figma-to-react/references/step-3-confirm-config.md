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

## Next Step

Mark this step complete. Read step-4-generation.md.
