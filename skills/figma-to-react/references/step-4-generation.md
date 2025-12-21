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
    1. Call mcp__plugin_figma_figma__get_design_context(
         fileKey: "{fileKey}",
         nodeId: "{nodeId}",
         clientFrameworks: "react",
         clientLanguages: "typescript"
       )

       The hook will capture response to /tmp/figma-captures/figma-{nodeId}.txt

    2. Run the processing script:
       $SKILL_DIR/scripts/process-figma.sh \\
         /tmp/figma-captures/figma-{nodeId}.txt \\
         {componentPath} \\
         {assetDir} \\
         {urlPrefix} \\
         {tokensFile}

    3. Return summary: component path, asset count, any errors.
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

## Next Step

Mark this step complete. Read step-5-import-tokens.md.
