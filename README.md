# figma-to-react

A Claude Code plugin that converts Figma screen flows into pixel-perfect TypeScript React components with Tailwind CSS.

## Features

- **Pixel-perfect conversion** — Uses Figma MCP output verbatim, preserving exact layout and styling
- **Smart asset handling** — Downloads assets, deduplicates by content hash, renames generics to meaningful names
- **Auto-detection** — Automatically detects screens, flow name, output directories, and frame dimensions
- **Interactive components** — Wires up inputs, dropdowns, toggles, and navigation
- **iOS-like animations** — Adds appropriate animations for mobile flows

## Prerequisites

1. **Figma MCP Server** configured and authenticated
   ```
   # Test with:
   mcp__figma__whoami
   ```

2. **React + Tailwind CSS** project (Figma MCP outputs Tailwind classes)

## Installation

```bash
# Add the marketplace
/plugin marketplace add gbasin/figma-to-react

# Install the plugin
/plugin install figma-to-react
```

## Usage

### Natural Language

```
Convert this Figma flow to React: https://www.figma.com/design/abc123/My-Flow?node-id=1-234
```

## How It Works

### 1. Auto-Detect Configuration

The plugin analyzes your Figma file and project structure:

```
┌─────────────────────────────────────────────────────────────────┐
│ DETECTED CONFIGURATION                                          │
├─────────────────────────────────────────────────────────────────┤
│ Flow name:      plaid-link (from Figma frame name)              │
│ Output dir:     src/plaid/ (matches src/{feature}/ pattern)     │
│ Asset dir:      public/plaid-assets/                            │
│ Dimensions:     390x844 (from Figma frames)                     │
├─────────────────────────────────────────────────────────────────┤
│ SCREENS DETECTED (5)                                            │
├─────────────────────────────────────────────────────────────────┤
│  1. "01 - Welcome" (1:234)      → WelcomeScreen.tsx             │
│  2. "02 - Select Bank" (1:567)  → SelectBankScreen.tsx          │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Extract & Process Assets

- Calls Figma MCP `get_design_context` for each screen
- Downloads all assets (SVGs, PNGs, etc.)
- Deduplicates by content hash (same icon across screens = 1 file)
- Renames generic names (`img-1.svg` → `arrow-back.svg`)

### 3. Generate Components

Uses Figma MCP output **verbatim** — the nested divs, absolute positioning, and percentage insets ensure pixel-perfect rendering.

Components are wired up with:
- **Navigation**: back, next, close handlers
- **Interactive elements**: inputs, dropdowns, toggles, selectable lists
- **Animations**: button press states, spinners, screen transitions

### 4. Create Demo Page

Generates a navigable demo with:
- Screen state management
- Navigation between screens
- Container sized to Figma frame dimensions

## Output

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
├── icon-close.svg
└── ...
```

## Animations

For mobile flows (< 500px width), iOS-like animations are applied:

| Element | Animation |
|---------|-----------|
| Buttons | `active:scale-95` press feedback |
| Spinners | `animate-spin` |
| Screen transitions | `cubic-bezier(0.2, 0.9, 0.4, 1)` ~350ms |

## Example Output

```
Created:
  src/plaid/screens/registry.ts
  src/plaid/screens/components/WelcomeScreen.tsx
  src/plaid/screens/components/SelectBankScreen.tsx
  src/plaid/screens/components/CredentialsScreen.tsx
  src/plaid/screens/components/SuccessScreen.tsx
  src/plaid/PlaidDemoPage.tsx
  public/plaid-assets/*.svg, *.png

Run: pnpm dev
Visit: http://localhost:5173/plaid
```

## License

MIT
