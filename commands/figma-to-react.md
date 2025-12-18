---
description: Convert a linear Figma screen flow into pixel-perfect React components with Tailwind CSS and iOS-native animations
argument-hint: <figma-url> [screen-node-ids...]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, mcp__figma__get_metadata, mcp__figma__get_screenshot, mcp__figma__get_design_context, AskUserQuestion
---

# Figma to React Flow Conversion

Convert a linear Figma screen flow into fully functional React components.

## Arguments
$ARGUMENTS

**Format:**
- First argument: Figma URL (required) — the parent frame or any screen in the flow
- Additional arguments (optional): Screen node IDs or full URLs in flow order

**Examples:**
```
# Auto-detect screens from parent frame
/figma-to-react https://www.figma.com/design/abc123/Flow?node-id=0-1

# Explicit screen order via node IDs
/figma-to-react https://www.figma.com/design/abc123/Flow?node-id=0-1 1:234 1:567 1:890

# Explicit screen order via full URLs
/figma-to-react https://www.figma.com/design/abc123/Flow?node-id=0-1 \
  https://www.figma.com/design/abc123/Flow?node-id=1-234 \
  https://www.figma.com/design/abc123/Flow?node-id=1-567
```

## Instructions

Follow the workflow defined in the `figma-to-react` skill to:

1. **Gather configuration** (frontloaded questions)
2. **Extract designs** from Figma (use explicit node IDs if provided, otherwise auto-detect)
3. **Generate components** with exact assets
4. **Verify visually** with auto-fix
5. **Output summary**

Use the skill's detailed workflow - this command is just the entry point.
