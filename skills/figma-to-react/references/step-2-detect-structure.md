# Step 2: Detect Project Structure

Scan the codebase to detect framework and conventions.

## Actions

```bash
# Check package.json for framework
cat package.json | grep -E '"(react|next|vite|@vitejs)"'

# Find existing component directories
ls -d src/components/ components/ app/components/ 2>/dev/null

# Find existing style directories
ls -d src/styles/ styles/ src/css/ 2>/dev/null

# Find public/static asset directories
ls -d public/ static/ public/assets/ 2>/dev/null
```

## What to Look For

- **Framework**: Vite, Next.js, Create React App
- **Component location**: Where existing components live
- **Styles location**: Where CSS/tokens should go
- **Assets location**: Where static files are served from

## Output

Prepare a configuration summary for user confirmation:
- Components directory
- Assets directory
- Tokens file path
- URL prefix for assets

## Next Step

Mark this step complete. Read step-3-confirm-config.md.
