# Screenshots Directory

This directory contains screenshots used in the README.md and other documentation.

## Required Screenshots

The following screenshots are needed for complete documentation:

### 1. Sidebar TreeView (`sidebar-treeview.png`)
**What to capture:** The VS Code sidebar showing the Workflow AI extension with all 4 sections expanded:
- PIPELINE section
- TICKETS section (showing tickets by status)
- PLANS section
- REPORTS section

**How to capture:**
1. Open a workspace with `.workflow/` directory
2. Expand all sections in the sidebar
3. Take a screenshot showing the full sidebar

### 2. Kanban Board (`kanban-board.png`)
**What to capture:** The Kanban panel showing all 6 columns with tickets:
- BACKLOG
- READY
- IN PROGRESS
- BLOCKED
- REVIEW
- DONE

**How to capture:**
1. Click the Kanban icon in the Activity Bar
2. Ensure tickets are visible in multiple columns
3. Take a screenshot showing the full Kanban view

### 3. Pipeline Monitor (`pipeline-monitor.png`)
**What to capture:** Pipeline view showing execution status:
- Current stage indicator
- Progress visualization
- Start/Stop buttons

**How to capture:**
1. Open the Pipeline view in sidebar
2. Start pipeline execution (or show idle state)
3. Capture the pipeline controls and status

### 4. StatusBar (`statusbar.png`)
**What to capture:** VS Code status bar showing Workflow AI indicator:
- "WF: Idle" or "WF: Running" status

**How to capture:**
1. Look at the bottom status bar in VS Code
2. Capture the area showing the Workflow status

### 5. CodeLens (`codelens.png`)
**What to capture:** A ticket file open in editor showing CodeLens actions:
- Move ticket links above the title
- Dependency information

**How to capture:**
1. Open any ticket file (e.g., `IMPL-001.md`)
2. Show the CodeLens actions above the title
3. Capture the editor area

### 6. Hover Preview (`hover-preview.png`)
**What to capture:** Hover popup when hovering over a ticket ID reference:
- Ticket title
- Status
- Priority

**How to capture:**
1. Open a file that references a ticket (e.g., a plan or another ticket)
2. Hover over a ticket ID (e.g., `IMPL-001`)
3. Capture the hover popup

### 7. Diagnostics Panel (`diagnostics-panel.png`)
**What to capture:** Problems panel showing validation errors:
- Invalid frontmatter
- Missing required fields

**How to capture:**
1. Open a ticket with validation errors
2. Open the Problems panel (Ctrl+Shift+M)
3. Capture the error messages

## Screenshot Guidelines

### Technical Requirements
- **Format:** PNG
- **Resolution:** 1920x1080 or higher (scaled if needed)
- **Theme:** Use VS Code Dark+ theme for consistency
- **Clean workspace:** Hide unnecessary UI elements
- **Focus:** Highlight the feature being documented

### Naming Convention
- Use lowercase with hyphens: `feature-name.png`
- Match the filename to the reference in README.md

### Updating Screenshots
When the UI changes significantly:
1. Replace the old screenshot with the new one
2. Update the figure caption if needed
3. Note the change in CHANGELOG.md

## Placeholder Workflow

Until real screenshots are added:
1. The README.md references these placeholder files
2. Images will appear broken until screenshots are added
3. This is acceptable for initial documentation

## Tools for Capturing

### Windows
- **Built-in:** Win + Shift + S (Snip & Sketch)
- **Full screen:** Print Screen key
- **Active window:** Alt + Print Screen

### Cross-platform
- **VS Code extension:** "Screenshot" extensions
- **External tools:** ShareX, Greenshot, etc.

## Checklist

- [ ] sidebar-treeview.png
- [ ] kanban-board.png
- [ ] pipeline-monitor.png
- [ ] statusbar.png
- [ ] codelens.png
- [ ] hover-preview.png
- [ ] diagnostics-panel.png
