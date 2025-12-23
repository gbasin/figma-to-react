# Step 3b: Create Preview Route

Create the preview infrastructure BEFORE component generation so users can watch components appear in real-time.

## Why Before Generation

- Preview route with dynamic imports auto-discovers new components
- User sees components appear as step 4 generates them
- During step 4b (dimension validation), user can see the preview while deciding

## Framework Detection

From step 2, determine:
- **Vite/React Router** → use `import.meta.glob`
- **Next.js App Router** → use dynamic imports + API route

## Vite/React Router Implementation

1. Copy template to project:
   ```bash
   cp $SKILL_DIR/templates/FigmaPreview.vite.tsx src/pages/FigmaPreview.tsx
   ```

2. Add route to router config:
   ```tsx
   import { FigmaPreview } from './pages/FigmaPreview';

   // In your routes:
   <Route path="/figma-preview" element={<FigmaPreview />} />
   ```

**Template location:** `$SKILL_DIR/templates/FigmaPreview.vite.tsx`

## Next.js App Router Implementation

1. Copy template to project:
   ```bash
   mkdir -p app/figma-preview app/api/figma-screens
   cp $SKILL_DIR/templates/FigmaPreview.nextjs.tsx app/figma-preview/page.tsx
   cp $SKILL_DIR/templates/figma-screens-api.nextjs.ts app/api/figma-screens/route.ts
   ```

**Template locations:**
- `$SKILL_DIR/templates/FigmaPreview.nextjs.tsx`
- `$SKILL_DIR/templates/figma-screens-api.nextjs.ts`

## Adjust Glob Path If Needed

If `componentDir` in config differs from default (`src/components/figma`), update the glob pattern in the preview component:

```tsx
// Default (src/components/figma)
const modules = import.meta.glob('../components/figma/*.tsx');

// If components are in a different location, adjust relative path
const modules = import.meta.glob('../../path/to/figma/*.tsx');
```

## Tell the User

After creating the preview route:

```
Preview route created at /figma-preview

As components are generated, they will automatically appear in the preview.
You can open http://localhost:[port]/figma-preview to watch progress.
```

## Next Step

Mark this step complete. Read step-4-generation.md.
