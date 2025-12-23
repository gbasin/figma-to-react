# Step 3b: Create Preview Route

Create the preview infrastructure BEFORE component generation so users can watch components appear in real-time.

## Why Before Generation

- Preview route with dynamic imports auto-discovers new components
- User sees components appear as step 4 generates them
- During step 4b (dimension validation), user can see the preview while deciding

## Key Principle: Standalone Preview

The preview must render components in isolation, without inheriting any layout chrome (headers, navbars) from the user's app. This ensures pixel-perfect screenshot validation.

## Framework Detection

From step 2, determine:
- **Vite/React Router** → separate HTML entry point
- **Next.js** → pages/ directory (bypasses App Router layouts)

## Vite/React Router Implementation

Use a **separate HTML entry point** to avoid inheriting any App.tsx layout:

1. Copy templates to project:
   ```bash
   cp $SKILL_DIR/templates/figma-preview.html figma-preview.html
   cp $SKILL_DIR/templates/figma-preview-entry.vite.tsx src/pages/figma-preview-entry.tsx
   ```

2. Access via: `http://localhost:5173/figma-preview.html?screen=ComponentName`

**Why separate entry?** This bypasses the main App.tsx entirely. No routes to configure, no layout inheritance.

**Template locations:**
- `$SKILL_DIR/templates/figma-preview.html`
- `$SKILL_DIR/templates/figma-preview-entry.vite.tsx`

## Next.js Implementation

Use the `pages/` directory to bypass App Router layouts entirely:

1. Copy templates to project:
   ```bash
   mkdir -p pages app/api/figma-screens
   cp $SKILL_DIR/templates/figma-preview.nextjs-pages.tsx pages/figma-preview.tsx
   cp $SKILL_DIR/templates/figma-screens-api.nextjs.ts app/api/figma-screens/route.ts
   ```

2. Update the CSS import path in `pages/figma-preview.tsx` if needed:
   ```tsx
   import '../app/globals.css'; // Adjust to your global CSS location
   ```

3. Access via: `http://localhost:3000/figma-preview?screen=ComponentName`

**Why pages/ directory?** Even in App Router projects, pages in `pages/` don't inherit `app/layout.tsx`. No changes to existing app structure needed.

**Template locations:**
- `$SKILL_DIR/templates/figma-preview.nextjs-pages.tsx`
- `$SKILL_DIR/templates/figma-screens-api.nextjs.ts`

## Adjust Glob/Import Path If Needed

If `componentDir` in config differs from default (`src/components/figma`), update the import pattern:

**Vite:**
```tsx
// Default
const modules = import.meta.glob('../components/figma/*.tsx');

// Custom location
const modules = import.meta.glob('../../path/to/figma/*.tsx');
```

**Next.js:**
```tsx
// Default
import(`@/components/figma/${screenName}`)

// Custom location - update the path accordingly
```

## Start Dev Server

After creating the preview, start the dev server:

```bash
pnpm dev
# or: npm run dev
```

Note the port from output (e.g., `localhost:5173` for Vite, `localhost:3000` for Next.js).

## Tell the User

After starting the server:

**Vite:**
```
Preview created at /figma-preview.html
Dev server running at http://localhost:[port]

As components are generated, they will automatically appear in the preview.
Open http://localhost:[port]/figma-preview.html to watch progress.
```

**Next.js:**
```
Preview route created at /figma-preview
Dev server running at http://localhost:[port]

As components are generated, they will automatically appear in the preview.
Open http://localhost:[port]/figma-preview to watch progress.
```

## Next Step

Mark this step complete. Read step-4-generation.md.
