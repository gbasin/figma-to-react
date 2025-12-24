# Step 5: Import Tokens CSS

One-time setup to import generated design tokens.

## Pre-flight Check

```bash
$SKILL_DIR/scripts/status.sh --check 5
```

If this fails, it prints the correct step. Uncheck wrongly-completed TodoWrite items and read that step file instead.

## Check If Already Imported

Look for existing import in main CSS file:
```bash
grep -l "figma-tokens.css" src/index.css src/App.css src/styles/*.css 2>/dev/null
```

## If Not Imported

Add to main CSS file (e.g., `src/index.css`):

```css
@import "./styles/figma-tokens.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
```

The import must come BEFORE Tailwind directives.

## Why This Matters

Figma MCP outputs code like:
```jsx
className="bg-[var(--background\/overlay,rgba(0,0,0,0.8))]"
```

The CSS variables need to be defined for Tailwind to parse these correctly. The tokens file provides:
```css
:root {
  --background\/overlay: rgba(0,0,0,0.8);
}
```

## Mark Complete

After importing (or if already imported), save completion marker:

```bash
mkdir -p /tmp/figma-to-react/steps/5
echo '{"complete": true}' > /tmp/figma-to-react/steps/5/complete.json
```

## Next Step

Read step-6-validation.md.
