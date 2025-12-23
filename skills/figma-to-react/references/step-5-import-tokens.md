# Step 5: Import Tokens CSS

One-time setup to import generated design tokens.

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

## Next Step

Read step-6-validation.md.
