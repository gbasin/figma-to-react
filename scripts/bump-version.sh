#!/bin/bash
# Bump version across all project files
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -e

BUMP_TYPE="${1:-patch}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Read current version from plugin.json (source of truth)
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$PROJECT_ROOT/.claude-plugin/plugin.json" | head -1 | sed 's/"version": "//;s/"//')

if [[ -z "$CURRENT_VERSION" ]]; then
    echo "Error: Could not read current version from .claude-plugin/plugin.json"
    exit 1
fi

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate new version
case "$BUMP_TYPE" in
    major)
        NEW_VERSION="$((MAJOR + 1)).0.0"
        ;;
    minor)
        NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
        ;;
    patch)
        NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
        ;;
    *)
        echo "Usage: $0 [patch|minor|major]"
        echo "  patch - bump patch version (0.9.15 -> 0.9.16)"
        echo "  minor - bump minor version (0.9.15 -> 0.10.0)"
        echo "  major - bump major version (0.9.15 -> 1.0.0)"
        exit 1
        ;;
esac

echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION ($BUMP_TYPE)"

# Update all version locations
# 1. .claude-plugin/plugin.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/g" "$PROJECT_ROOT/.claude-plugin/plugin.json"

# 2. .claude-plugin/marketplace.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/g" "$PROJECT_ROOT/.claude-plugin/marketplace.json"

# 3. skills/figma-to-react/SKILL.md (YAML frontmatter)
sed -i '' "s/^version: $CURRENT_VERSION$/version: $NEW_VERSION/" "$PROJECT_ROOT/skills/figma-to-react/SKILL.md"

# 4. package.json (optional - uncomment if you want to sync)
# sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json"

echo "Updated files:"
echo "  .claude-plugin/plugin.json"
echo "  .claude-plugin/marketplace.json"
echo "  skills/figma-to-react/SKILL.md"

echo ""
echo "Done! Run 'git diff' to review changes."
