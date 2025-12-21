# Step 6: Create Preview Route

Create a dedicated route to render generated components for validation.

## Why

The validation step needs to screenshot each component in isolation. A preview route lets us load any component via query param: `/figma-preview?screen=ComponentName`

## For Vite/React Router

Create `src/pages/FigmaPreview.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom';

// Import all generated components
import { ScreenOne } from '../components/ScreenOne';
import { ScreenTwo } from '../components/ScreenTwo';

const screens: Record<string, React.ComponentType> = {
  ScreenOne,
  ScreenTwo,
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
  return <Screen />;
}
```

Add route in your router config:

```tsx
<Route path="/figma-preview" element={<FigmaPreview />} />
```

## For Next.js App Router

Create `app/figma-preview/page.tsx`:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';

// Import all generated components
import { ScreenOne } from '@/components/ScreenOne';
import { ScreenTwo } from '@/components/ScreenTwo';

const screens: Record<string, React.ComponentType> = {
  ScreenOne,
  ScreenTwo,
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
  return <Screen />;
}
```

## Verify

1. Start dev server: `pnpm dev`
2. Navigate to `/figma-preview`
3. Should see list of component links
4. Click one - should render that component

## Next Step

Read step-7-validation.md.
