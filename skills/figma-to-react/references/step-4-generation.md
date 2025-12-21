# Step 4: Generate Screens (Parallel)

Spawn sub-agents to process each screen. Can run in parallel.

## For Each Screen

Spawn a sub-agent using Task tool:

```
Task(
  subagent_type: "general-purpose",
  prompt: """
    Process Figma screen for the figma-to-react skill.

    INPUTS:
    - fileKey: "{fileKey}"
    - nodeId: "{nodeId}"
    - componentName: "{ComponentName}"
    - componentPath: "{componentDir}/{ComponentName}.tsx"
    - assetDir: "{assetDir}"
    - urlPrefix: "{urlPrefix}"
    - tokensFile: "{tokensFile}"
    - SKILL_DIR: "{skillDir}"

    STEPS:
    1. Call the Figma MCP get_metadata tool to get frame dimensions.

       Use whichever server is available:
       - mcp__plugin_figma_figma__get_metadata (web - requires auth, uses fileKey)
       - mcp__plugin_figma_figma-desktop__get_metadata (desktop - uses active tab)

       Parameters:
         fileKey: "{fileKey}" (web only)
         nodeId: "{nodeId}"

       A hook automatically extracts dimensions and saves them to
       /tmp/figma-to-react/component-metadata.json (keyed by nodeId).

    2. Call the Figma MCP get_design_context tool.

       Use whichever server is available:
       - mcp__plugin_figma_figma__get_design_context (web - requires auth, uses fileKey)
       - mcp__plugin_figma_figma-desktop__get_design_context (desktop - uses active tab)

       Parameters:
         fileKey: "{fileKey}" (web only)
         nodeId: "{nodeId}"
         clientFrameworks: "react"
         clientLanguages: "typescript"

       The hook will capture response to /tmp/figma-to-react/captures/figma-{nodeId}.txt

    3. Run the processing script:
       $SKILL_DIR/scripts/process-figma.sh \\
         /tmp/figma-to-react/captures/figma-{nodeId}.txt \\
         {componentPath} \\
         {assetDir} \\
         {urlPrefix} \\
         {tokensFile}

    4. Link component name to metadata:
       $SKILL_DIR/scripts/save-component-metadata.sh \\
         "{ComponentName}" "{nodeId}" "{componentPath}"

       This adds the component name to the dimensions already saved by the hook.

    5. Lint and auto-fix Tailwind issues:
       npx eslint --fix {componentPath}

       This auto-fixes ~90% of MCP output issues:
       - Class ordering
       - Unnecessary arbitrary values (translate-x-[-50%] → -translate-x-1/2)
       - Redundant classes (filter in TW v3)
       - Shorthand opportunities (top-X bottom-X → inset-y-X)

    6. Check for remaining issues:
       npx eslint {componentPath}

       Review any warnings that couldn't be auto-fixed:
       - Invalid classes (e.g., object-50%-50% → object-center)
       - Context-dependent fixes (overflow-clip vs text-clip)

       Fix these manually based on the component's intent.

    7. Return summary: component path, asset count, eslint fixes applied, any errors.
       (Dimensions are already in the metadata file.)
  """
)
```

## Why Sub-Agents

- Each Figma MCP response is ~50KB
- Sub-agents keep this isolated from parent context
- Multiple screens can run in parallel
- Parent only sees summaries

## Collect Results

Track for each screen:
- Component file path
- Figma nodeId (needed for validation)
- Success/failure status

Dimensions are stored in `/tmp/figma-to-react/component-metadata.json` (keyed by component name) for step 6.

## Next Step

Mark this step complete. Read step-5-import-tokens.md.
