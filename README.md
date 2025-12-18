# figma-to-react

A Claude Code plugin that converts linear Figma screen flows into pixel-perfect React components with Tailwind CSS and iOS-native animations.

## Features

- **Pixel-perfect conversion** — Exact assets, colors, spacing, and typography from Figma
- **Asset verification** — Each downloaded/extracted asset is screenshot-compared against Figma before use
- **iOS-native animations** — Authentic navigation transitions using iOS spring curves
- **Interactive elements** — Inputs, toggles, and buttons work out of the box
- **Screen visual verification** — Full screenshot comparison with auto-fix for discrepancies
- **Parallel processing** — Assets, screens, and verification run concurrently

## Prerequisites

Before using this plugin, ensure you have:

1. **Figma MCP Server** configured and authenticated
   ```
   # Test with:
   mcp__figma__whoami
   ```

2. **Browser automation** for visual verification (configurable)
   - Default: `dev-browser` skill
   - Alternatives: `playwright`, `puppeteer`, or skip verification

3. **React + Tailwind CSS** project with a runnable dev server

## Installation

```bash
# Add the marketplace
/plugin marketplace add gbasin/figma-to-react

# Install the plugin
/plugin install figma-to-react
```

## Usage

### Slash Command

```
/figma-to-react https://www.figma.com/design/abc123/My-Flow?node-id=1-234
```

### Natural Language

```
Convert this Figma flow to React: https://www.figma.com/design/abc123/My-Flow?node-id=1-234
```

## Configuration

The plugin will ask for configuration upfront (with auto-detected suggestions):

| Setting | Description | Auto-detect |
|---------|-------------|-------------|
| Flow name | kebab-case identifier (e.g., `plaid-link`) | From Figma file name |
| Output directory | Where to create components | Project structure |
| Asset directory | Where to save images/icons | `/public/` or `/assets/` |
| DeviceFrame | Existing component or create new | Glob search |
| Container mode | `phone-frame`, `modal`, `fullscreen`, `none` | Figma frame analysis |
| Brand substitutions | Company name, bank name | Project files |
| Browser tool | `dev-browser`, `playwright`, `puppeteer`, `skip` | Default: `dev-browser` |
| Dev server | Command to start dev server | Auto-detect from package.json |
| Dev server URL | URL where dev server runs | Auto-detect (checks if already running) |

## Output

```
src/{flow}/
├── screens/
│   ├── registry.ts
│   └── components/
│       ├── WelcomeScreen.tsx
│       ├── SelectBankScreen.tsx
│       └── ...
├── {Flow}DemoPage.tsx
└── components/
    └── DeviceFrame.tsx (if created)

public/{flow}-assets/
├── logo.svg
├── icon-close.svg
└── ...
```

## Container Modes

| Mode | Description |
|------|-------------|
| `phone-frame` | iPhone device chrome with status bar, dynamic island |
| `modal` | Centered modal over blurred backdrop |
| `fullscreen` | Screens fill viewport, no chrome |
| `none` | Raw components only |

## iOS Animations

The plugin uses authentic iOS animation curves:

| Transition | Curve | Duration |
|------------|-------|----------|
| Navigation push/pop | `cubic-bezier(0.36, 0.66, 0.04, 1)` | 500ms |
| Modal present/dismiss | `cubic-bezier(0.32, 0.72, 0, 1)` | 500ms |
| Button press | `ease-out` | 100ms |

## Visual Verification

The plugin automatically:

1. Starts your dev server
2. Opens each screen in a browser (parallel)
3. Screenshots at exact viewport size
4. Compares against Figma screenshots
5. Auto-fixes discrepancies (up to 10 attempts)
6. Reports any remaining TODOs

### Auto-fixable Issues

- Border radius
- Spacing/padding
- Colors
- Font size/weight
- Opacity

### Not Auto-fixable (flagged as TODO)

- Missing assets
- Font family (requires installation)
- Complex layout issues
- Animation timing

## Asset Handling

**Important:** The plugin uses EXACT assets from Figma:

- SVGs are copied verbatim (never approximated)
- Images are downloaded directly
- Icons are not substituted with libraries

If an asset cannot be extracted, it's flagged as a TODO — never substituted.

## Direct Screen Access

The generated demo page supports URL parameters for direct screen access:

```
http://localhost:5173/plaid?screen=select-bank
```

This enables parallel visual verification.

## Example Output

```
Created 7 files:
  - src/plaid/screens/registry.ts
  - src/plaid/screens/components/WelcomeScreen.tsx
  - src/plaid/screens/components/SelectBankScreen.tsx
  - src/plaid/screens/components/CredentialsScreen.tsx
  - src/plaid/screens/components/SuccessScreen.tsx
  - src/plaid/PlaidDemoPage.tsx
  - Added route to App.tsx

Asset Extraction & Verification:
  plaid-logo.svg         PASS (verified: 120x40)
  flagstar-logo.png      PASS (verified: 80x32)
  success-check.svg      PASS (verified: 64x64)
  bank-illustration.png  PASS (verified: 200x150)
  search-icon.svg        PASS (verified: 24x24)

Screen Visual Verification:
  WelcomeScreen       PASS
  SelectBankScreen    PASS (auto-fixed)
  CredentialsScreen   PASS
  SuccessScreen       PASS

TODOs (1):
  - SuccessScreen.tsx:78 — Font "SF Pro" not available

Run: pnpm dev
Visit: http://localhost:5173/plaid
```

## License

MIT
