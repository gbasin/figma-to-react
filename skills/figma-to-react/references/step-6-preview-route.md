# Step 6: Create Preview Route

Generate a preview route to render components for validation screenshots.

## Why

The validation step needs to screenshot each component in isolation. A preview route loads any component via query param: `/figma-preview?screen=ComponentName`

## Instructions

1. **Get component list from step 4**

   You generated components in step 4. Collect their names and paths.

2. **Detect framework** (from step 2 config)

   - Vite/React Router → create `src/pages/FigmaPreview.tsx`
   - Next.js App Router → create `app/figma-preview/page.tsx`

3. **Generate the preview file**

   **For Vite/React Router:**
   ```tsx
   import { useSearchParams } from 'react-router-dom';

   // Import each generated component
   import { ComponentA } from '../components/ComponentA';
   import { ComponentB } from '../components/ComponentB';
   // ... one import per component from step 4

   const screens: Record<string, React.ComponentType> = {
     ComponentA,
     ComponentB,
     // ... one entry per component
   };

   export function FigmaPreview() {
     const [params] = useSearchParams();
     const screenName = params.get('screen');

     if (!screenName || !screens[screenName]) {
       return (
         <div>
           <h1>Figma Preview</h1>
           <ul>
             {Object.keys(screens).map(name => (
               <li key={name}>
                 <a href={`?screen=${name}`}>{name}</a>
               </li>
             ))}
           </ul>
         </div>
       );
     }

     const Screen = screens[screenName];
     return (
       <div data-figma-component={screenName}>
         <Screen />
       </div>
     );
   }
   ```

   **For Next.js App Router:**
   ```tsx
   'use client';

   import { useSearchParams } from 'next/navigation';

   // Import each generated component
   import { ComponentA } from '@/components/ComponentA';
   import { ComponentB } from '@/components/ComponentB';

   const screens: Record<string, React.ComponentType> = {
     ComponentA,
     ComponentB,
   };

   export default function FigmaPreview() {
     const params = useSearchParams();
     const screenName = params.get('screen');

     if (!screenName || !screens[screenName]) {
       return (
         <div>
           <h1>Figma Preview</h1>
           <ul>
             {Object.keys(screens).map(name => (
               <li key={name}>
                 <a href={`?screen=${name}`}>{name}</a>
               </li>
             ))}
           </ul>
         </div>
       );
     }

     const Screen = screens[screenName];
     return (
       <div data-figma-component={screenName}>
         <Screen />
       </div>
     );
   }
   ```

4. **Add route** (Vite/React Router only)

   Find the router config and add:
   ```tsx
   <Route path="/figma-preview" element={<FigmaPreview />} />
   ```

5. **Verify**

   - Start dev server: `pnpm dev`
   - Navigate to `/figma-preview`
   - Should see list of component links
   - Click one → should render that component

## Next Step

Read step-7-validation.md.
