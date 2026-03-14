# Assets Directory

This directory contains visual assets for the extension.

## Files

### logo-final.svg
**Source SVG** — master vector logo (kanban board + AI sparkles on dark gradient background).
Used as the source for generating `icon-128.png`.

### icon-128.png
**Marketplace icon** — 128×128 PNG, referenced in `package.json` → `"icon"`.
Displayed in VS Code Marketplace and extension details.

### sidebar-icon.svg
**Activity Bar icon** — monochrome SVG using `currentColor`, referenced in `package.json` → `viewsContainers.activitybar[0].icon`.
Adapts to light/dark VS Code themes automatically.
