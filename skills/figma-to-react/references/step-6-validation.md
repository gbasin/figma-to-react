# Step 6: Validate Screens (Sequential)

Compare rendered components to Figma screenshots. Run ONE at a time (browser contention).

## First: Create Preview Route

Create a dedicated preview route that can render any generated component via query param.

**For Vite/React Router** - create `src/pages/FigmaPreview.tsx`:
```tsx
import { useSearchParams } from 'react-router-dom';

// Import all generated components
import { ScreenOne } from '../components/ScreenOne';
import { ScreenTwo } from '../components/ScreenTwo';
// ... add imports for each generated component

const screens: Record<string, React.ComponentType> = {
  ScreenOne,
  ScreenTwo,
  // ... add each component
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

**Add route** in your router config:
```tsx
<Route path="/figma-preview" element={<FigmaPreview />} />
```

## For Each Screen

Spawn a validation sub-agent:

```
Task(
  subagent_type: "general-purpose",
  prompt: """
    Validate Figma-to-React component for pixel-perfect accuracy.

    INPUTS:
    - nodeId: "{nodeId}"
    - componentPath: "{componentPath}"
    - componentName: "{ComponentName}"
    - previewUrl: "http://localhost:5173/figma-preview?screen={ComponentName}"

    STEPS:

    1. GET FIGMA SCREENSHOT
       Call mcp__plugin_figma_figma__get_screenshot(nodeId: "{nodeId}")
       Save/note the reference image.

    2. START DEV SERVER (if not running)
       ```bash
       pnpm dev  # or npm run dev
       ```

    3. TAKE SCREENSHOT
       Use /dev-browser skill:
       - Navigate to {previewUrl}
       - Take screenshot of rendered component

    4. COMPARE SCREENSHOTS
       List specific differences you observe, even if minor:
       - Image positioning/cropping
       - Text alignment
       - Spacing/sizing
       - Colors/backgrounds

    5. FIX EACH DIFFERENCE
       For each difference:
       a. Identify the CSS property causing it
       b. Edit the component file
       c. Common MCP bugs:
          - h-[200%] or w-[200%] on images -> usually wrong
          - top-[-30%] with overflow-clip -> check against screenshot
          - Extreme percentages (>150%) -> likely incorrect

    6. RE-SCREENSHOT AND VERIFY
       After fixes, take another screenshot.
       Compare again. Repeat steps 4-6 until pixel-perfect.

    RETURN: validation status, list of changes made.
  """
)
```

## Why Sequential

Browser and dev-server can only show one component at a time. Running validation in parallel would cause contention.

## Why Sub-Agents

Fresh context for each validation. Parent doesn't need to hold all the comparison details.

## Next Step

Mark this step complete. Read step-7-rename-assets.md.
