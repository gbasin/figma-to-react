# Step 1: Arm the Capture Hook

Prepare the environment for capturing Figma MCP responses.

## Actions

```bash
# Clean up any previous run
rm -f /tmp/figma-skill-capture-active
rm -rf /tmp/figma-captures

# Arm the hook
touch /tmp/figma-skill-capture-active
mkdir -p /tmp/figma-captures
```

## What This Does

The PostToolUse hook watches for Figma MCP calls. When the marker file exists:
- Captures full response to `/tmp/figma-captures/figma-{nodeId}.txt`
- Suppresses raw output from Claude's context (saves ~50KB per screen)
- Shows brief confirmation: "Captured to figma-{nodeId}.txt"

Without the marker file, Figma MCP works normally (useful for debugging).

## Next Step

Mark this step complete. Read step-2-detect-structure.md.
