---
name: figma-to-react
version: 0.9.17
description: Convert Figma designs to pixel-perfect React components with Tailwind CSS.
license: MIT
compatibility: Requires Figma MCP server (mcp__figma__*). React + Tailwind CSS project. Optional: eslint-plugin-tailwindcss for auto-fixing MCP output issues.
allowed-tools: Bash Read Write Edit Glob Grep Task WebFetch TodoWrite AskUserQuestion mcp__plugin_figma_figma__get_metadata mcp__plugin_figma_figma__get_screenshot mcp__plugin_figma_figma__get_design_context mcp__plugin_figma_figma-desktop__get_metadata mcp__plugin_figma_figma-desktop__get_screenshot mcp__plugin_figma_figma-desktop__get_design_context mcp__figma__get_metadata mcp__figma__get_screenshot mcp__figma__get_design_context
---

# Figma to React

Convert Figma designs to pixel-perfect React components with Tailwind CSS.

## Workflow

When invoked, create a TodoWrite list with these steps. Use Glob to find each step file:

```
1. Setup - Glob **/step-1-setup.md then Read it
2. Detect structure - Glob **/step-2-detect-structure.md then Read it
3. Confirm config - Glob **/step-3-confirm-config.md then Read it
3b. Create preview route - Glob **/step-3b-preview-route.md then Read it
4. Generate screens (parallel) - Glob **/step-4-generation.md then Read it
4b. Validate dimensions - Glob **/step-4b-validate-dimensions.md then Read it
5. Import tokens - Glob **/step-5-import-tokens.md then Read it
6. Validate screens (parallel) - Glob **/step-6-validation.md then Read it
7. Rename assets - Glob **/step-7-rename-assets.md then Read it
8. Disarm hook - Glob **/step-8-disarm-hook.md then Read it
```

For each step:
1. Mark it as `in_progress` in TodoWrite
2. Use Glob to find the step file, then Read it
3. Execute the instructions
4. Mark as `completed` immediately when done

The TodoWrite list persists in context - even when this file falls out of context, the step file names in the todo items tell you what to find.

## Recovery After Compaction

If context is compacted during a multi-screen job, recover state from:
- `/tmp/figma-to-react/input.txt` - Original Figma links (one per line)
- `/tmp/figma-to-react/config.json` - Confirmed output paths
- `/tmp/figma-to-react/metadata/*.json` - Dimensions for processed screens
- `/tmp/figma-to-react/captures/figma-*.txt` - Which screens were captured

Check which screens still need processing by comparing input.txt against existing files.
