# figma-to-react

A Claude Code plugin that converts Figma designs into pixel-perfect TypeScript React components with Tailwind CSS.

## Features

- **Pixel-perfect conversion** — Uses Figma MCP output verbatim, preserving exact layout and styling
- **Visual validation** — Automated screenshot comparison with iterative fixes until match
- **Smart asset handling** — Downloads, deduplicates by content hash, renames to semantic names
- **Token extraction** — Extracts CSS variables from Figma designs automatically
- **Auto-detection** — Detects framework, directories, and frame dimensions
- **Collapsed container fix** — Automatically fixes containers with only absolute children

## Prerequisites

1. **Figma MCP Server** — Either web or desktop, authenticated:
   ```
   mcp__figma__whoami
   ```

2. **React + Tailwind CSS project** — Vite, Next.js, or CRA

3. **ImageMagick** (for visual validation):
   ```bash
   brew install imagemagick
   ```

## Installation

```bash
# Add the marketplace
/plugin marketplace add gbasin/figma-to-react

# Install the plugin
/plugin install figma-to-react

# Restart Claude Code to activate hooks
```

## Usage

```
Convert this Figma flow to React: https://www.figma.com/design/abc123/My-Flow?node-id=1-234
```

Or use the skill directly:

```
/figma-to-react
```

## How It Works

### 9-Step Workflow

| Step | Description |
|------|-------------|
| 1. Setup | Install tools, create temp dirs, arm capture hooks |
| 2. Detect | Scan project for framework, paths, patterns |
| 3. Confirm | Present config to user for approval |
| 4. Generate | Process each screen in parallel via sub-agents |
| 5. Tokens | Import extracted CSS variables into project |
| 6. Preview | Create `/figma-preview` route for validation |
| 7. Validate | Screenshot comparison loop with auto-fixes |
| 8. Rename | Intelligently rename assets from MCP descriptions |
| 9. Cleanup | Disarm hooks, remove temp files |

### Generation Pipeline

For each screen:

```
get_metadata → extract dimensions → save to /tmp/figma-to-react/metadata/
     ↓
get_design_context → hook captures response → /tmp/figma-to-react/captures/
     ↓
process-figma.sh → extract tokens, download assets, transform code
     ↓
fix-collapsed-containers.sh → add explicit dimensions where needed
     ↓
eslint --fix → auto-fix ~90% of Tailwind issues
```

### Visual Validation Loop

```
capture screenshot → compare to Figma reference → calculate diff %
     ↓
≤5% diff? → Done
     ↓
>5% diff? → LLM makes targeted fix → loop (max 10 passes)
     ↓
No improvement? → Revert, try different approach
```

## Output Structure

```
src/{flow}/
├── screens/
│   ├── registry.ts
│   └── components/
│       ├── WelcomeScreen.tsx
│       ├── SelectBankScreen.tsx
│       └── ...
└── {Flow}DemoPage.tsx

public/{flow}-assets/
├── logo.svg
├── arrow-back.svg
└── ...

src/styles/
└── figma-tokens.css
```

## Scripts

| Script | Purpose |
|--------|---------|
| `process-figma.sh` | Main processor: tokens, assets, code transform |
| `extract-tokens.sh` | Parse CSS variables from MCP output |
| `validate-component.sh` | Orchestrate single validation pass |
| `validate-visual.sh` | ImageMagick RMSE comparison |
| `capture-screenshot.ts` | Playwright headless capture |
| `fix-collapsed-containers.sh` | Add dimensions to collapsing containers |
| `rename-assets.sh` | Semantic asset naming from descriptions |

## Hooks

The plugin uses PostToolUse hooks to capture Figma MCP responses:

| Hook | Trigger | Action |
|------|---------|--------|
| `capture-figma-response.sh` | `get_design_context` | Save response, suppress output |
| `capture-figma-metadata.sh` | `get_metadata` | Extract frame dimensions |
| `capture-figma-screenshot.sh` | `get_screenshot` | Decode and save image |

Hooks always capture for debugging. Output suppression only activates when the skill is running (saves ~50KB context per screen).

## Key Features

### Content Hash Deduplication

Same icon across multiple screens = one file. Assets are downloaded once and deduplicated by MD5 hash.

### Collapsed Container Detection

Containers with only absolutely-positioned children would collapse. The plugin detects these and adds explicit `h-[Xpx]` dimensions from Figma metadata.

### Root Dimension Hardcoding

Replaces `size-full` on root elements with explicit `w-[390px] h-[844px]` to ensure pixel-perfect sizing regardless of container.

### Intelligent Asset Renaming

Parses MCP component descriptions like `Source: boxicons --- icon, x, close` to rename `asset-abc.svg` → `close-icon.svg`.

## Development

Prereqs: Node 20+, pnpm 9+, and Bun (https://bun.sh) for screenshot capture.

```bash
pnpm install
pnpm test:e2e        # Run tests (~10s)
pnpm test:e2e:watch  # Watch mode
```

### Test Fixtures

Tests use captured Figma responses from the Onfido Web SDK Community file:
- Frame 237-2571: Motion / Mobile 3
- Frame 238-1790: Motion / Mobile 4

### Project Structure

```
├── skills/figma-to-react/
│   ├── SKILL.md              # Skill definition
│   ├── references/           # Step guides (1-9)
│   ├── scripts/              # Shell & TS processors
│   └── hooks/                # PostToolUse hooks
├── tests/e2e/
│   ├── fixtures/             # Captured MCP responses
│   └── *.test.ts             # Test suites
└── hooks.json                # Hook configuration
```

## Troubleshooting

**Hooks not working?**
- Restart Claude Code after installation
- Check `hooks.json` exists at project root

**Visual validation failing?**
- Install ImageMagick: `brew install imagemagick`
- Ensure dev server is running

**Assets not downloading?**
- Check Figma MCP authentication
- Verify asset URLs are accessible

## License

MIT
