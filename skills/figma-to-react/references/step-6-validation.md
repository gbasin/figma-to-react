# Step 6: Validate Screens (Sequential)

Compare rendered components to Figma screenshots. Run ONE at a time (browser contention).

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

    STEPS:

    1. GET FIGMA SCREENSHOT
       Call mcp__plugin_figma_figma__get_screenshot(nodeId: "{nodeId}")
       Save/note the reference image.

    2. SET UP PREVIEW
       Temporarily render the component in App.tsx:
       ```tsx
       import { {ComponentName} } from './components/{ComponentName}';
       export default function App() {
         return <{ComponentName} />;
       }
       ```

    3. START DEV SERVER (if not running)
       ```bash
       pnpm dev  # or npm run dev
       ```

    4. TAKE SCREENSHOT
       Use /dev-browser skill:
       - Navigate to http://localhost:5173
       - Take screenshot of rendered component

    5. COMPARE SCREENSHOTS
       List specific differences you observe, even if minor:
       - Image positioning/cropping
       - Text alignment
       - Spacing/sizing
       - Colors/backgrounds

    6. FIX EACH DIFFERENCE
       For each difference:
       a. Identify the CSS property causing it
       b. Edit the component file
       c. Common MCP bugs:
          - h-[200%] or w-[200%] on images -> usually wrong
          - top-[-30%] with overflow-clip -> check against screenshot
          - Extreme percentages (>150%) -> likely incorrect

    7. RE-SCREENSHOT AND VERIFY
       After fixes, take another screenshot.
       Compare again. Repeat steps 5-7 until pixel-perfect.

    8. RESTORE APP.TSX
       Remove temporary preview, restore original App.tsx.

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
