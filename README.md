# Workflow AI for VS Code

**Workflow AI** is a VS Code extension that integrates the `wf` CLI tool into your development environment, providing a powerful project management and workflow automation system directly in your editor.

[![Version](https://img.shields.io/visual-studio-marketplace/v/workflow-ai.workflow-vscode)](https://marketplace.visualstudio.com/items?itemName=workflow-ai.workflow-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/workflow-ai.workflow-vscode)](https://marketplace.visualstudio.com/items?itemName=workflow-ai.workflow-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/workflow-ai.workflow-vscode)](https://marketplace.visualstudio.com/items?itemName=workflow-ai.workflow-vscode)
[![License](https://img.shields.io/github/license/workflow-ai/wf-vscode)](https://github.com/workflow-ai/wf-vscode/blob/main/LICENSE)

## Table of Contents

- [Description](#description)
- [Key Features](#key-features)
- [Screenshots](#screenshots)
- [Installation](#installation)
  - [From VS Code Marketplace](#from-vs-code-marketplace)
  - [From .vsix File](#from-vsix-file)
  - [Requirements](#requirements)
  - [Installing the wf CLI](#installing-the-wf-cli)
- [Configuration](#configuration)
  - [Extension Settings](#extension-settings)
  - [Workflow Configuration File](#workflow-configuration-file)
  - [Pipeline Configuration](#pipeline-configuration)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [Customizing Keybindings](#customizing-keybindings)
- [Usage](#usage)
  - [Creating a Ticket](#creating-a-ticket)
  - [Moving a Ticket Through Statuses](#moving-a-ticket-through-statuses)
  - [Working with Kanban Board](#working-with-kanban-board)
  - [Running the Pipeline](#running-the-pipeline)
  - [Viewing Ticket Dependencies](#viewing-ticket-dependencies)
  - [Using CodeLens](#using-codelens)
- [Commands](#commands)
  - [Ticket Commands](#ticket-commands)
  - [Pipeline Commands](#pipeline-commands)
  - [Navigation Commands](#navigation-commands)
  - [Configuration Commands](#configuration-commands)
  - [Sorting Commands (Kanban)](#sorting-commands-kanban)
- [Troubleshooting](#troubleshooting)
  - [Extension Not Activating](#extension-not-activating)
  - [StatusBar Not Showing](#statusbar-not-showing)
  - [Pipeline Won't Start](#pipeline-wont-start)
  - [Diagnostics Not Working](#diagnostics-not-working)
  - [Tree Views Empty](#tree-views-empty)
  - [CLI Not Detected](#cli-not-detected)
  - [Keyboard Shortcuts Not Working](#keyboard-shortcuts-not-working)
  - [Getting Help](#getting-help)

## Description

**Workflow AI** brings the full power of the `wf` CLI project management tool to VS Code. It provides a comprehensive Kanban-style task management system with pipeline automation, real-time validation, and AI-assisted development features.

### Key Features

- **Sidebar TreeView** — Browse tickets, plans, reports, and pipeline configurations in an organized tree structure
- **Kanban Board** — Visual task management with 6 columns (Backlog, Ready, In Progress, Blocked, Review, Done)
- **Pipeline Monitor** — Real-time pipeline execution monitoring with start/stop controls
- **StatusBar Integration** — Quick access to workflow status and pipeline state
- **CodeLens Support** — Inline actions and information in ticket files
- **Hover Previews** — Quick ticket information on hover
- **Smart Completions** — Context-aware suggestions for ticket IDs and references
- **Real-time Diagnostics** — Automatic validation of ticket format and dependencies
- **Document Links** — Clickable references between tickets and configurations
- **Notifications** — Stay informed about pipeline events and ticket changes

### Integration with wf CLI

This extension is a companion to the `wf` CLI tool. All ticket operations sync with the underlying file-based workflow system, ensuring compatibility with command-line workflows and CI/CD pipelines.

## Screenshots

### Sidebar TreeView

The sidebar provides organized access to all workflow components:

- **PIPELINE** — Pipeline configuration and execution controls
- **TICKETS** — All tickets organized by status
- **PLANS** — Project plans and documentation
- **REPORTS** — Generated reports and summaries

![Sidebar TreeView](docs/images/sidebar-treeview.png)

> *Figure 1: Sidebar showing the 4 main sections with expandable tree items*

### Kanban Board

Six-column Kanban view for visual task management:

- **BACKLOG** — Unprioritized tasks and ideas
- **READY** — Tasks ready to be worked on
- **IN PROGRESS** — Currently active tasks
- **BLOCKED** — Tasks waiting on dependencies
- **REVIEW** — Tasks awaiting review/approval
- **DONE** — Completed tasks

![Kanban Board](docs/images/kanban-board.png)

> *Figure 2: Kanban board showing tickets distributed across 6 columns with priority indicators*

### Pipeline Monitor

Real-time pipeline execution monitoring:

- Current stage indicator
- Progress visualization
- Start/Stop controls
- Output viewer

![Pipeline Monitor](docs/images/pipeline-monitor.png)

> *Figure 3: Pipeline monitor showing active execution with progress indicator*

### StatusBar

Quick status access in the VS Code status bar:

- Workflow status indicator
- Pipeline state (Idle/Running)
- Quick actions

![StatusBar](docs/images/statusbar.png)

> *Figure 4: StatusBar showing "WF: Idle" status indicator*

### CodeLens in Ticket Files

Inline actions and information directly in markdown ticket files:

- Move ticket actions
- Dependency information
- Quick navigation

![CodeLens](docs/images/codelens.png)

> *Figure 5: CodeLens actions visible above a ticket heading*

### Hover Preview

Quick ticket information when hovering over ticket IDs:

- Ticket title
- Current status
- Priority level

![Hover Preview](docs/images/hover-preview.png)

> *Figure 6: Hover popup showing ticket details when hovering over a ticket reference*

### Diagnostics Panel

Real-time validation with inline error highlighting:

- Invalid frontmatter detection
- Missing required fields
- Broken dependency references

![Diagnostics Panel](docs/images/diagnostics-panel.png)

> *Figure 7: Problems panel showing validation errors in a ticket file*

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+P` (or `Cmd+P` on macOS)
3. Type `ext install workflow-ai.workflow-vscode`
4. Press Enter

Or visit the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=workflow-ai.workflow-vscode) and click "Install".

### From .vsix File

1. Download the latest `.vsix` file from the [Releases page](https://github.com/workflow-ai/wf-vscode/releases)
2. In VS Code, open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. Select "Extensions: Install from VSIX..."
4. Choose the downloaded `.vsix` file

### Requirements

- **VS Code**: Version `^1.96.0` or later
- **Node.js**: Version `18.0.0` or later (for CLI installation)
- **wf CLI**: Must be installed globally (`npm install -g workflow-ai`)

### Installing the wf CLI

The extension requires the `wf` CLI tool to be installed. You can install it:

1. **Automatically**: Click the "Install wf CLI" button when prompted by the extension
2. **Manually**: Run `npm install -g workflow-ai` in your terminal

After installation, the extension will automatically detect the CLI.

## Configuration

### Extension Settings

Configure the extension in VS Code settings (`settings.json`):

| Setting | Description | Default |
|---------|-------------|---------|
| `workflow.cliPath` | Custom path to the wf CLI executable (leave empty for auto-detection) | `""` |

### Workflow Configuration File

The extension uses `.workflow/config/config.yaml` for project-specific settings:

```yaml
# .workflow/config/config.yaml
version: "1.0"

project:
  name: "My Project"
  description: "Project description"

# Task types and their prefixes
task_types:
  planning:
    prefix: ARCH
    description: "Planning and architecture tasks"
  implementation:
    prefix: IMPL
    description: "Implementation tasks"
  bugfix:
    prefix: FIX
    description: "Bug fixes"
  documentation:
    prefix: DOCS
    description: "Documentation tasks"

# Priority levels
priorities:
  1: critical  # Blocks all work
  2: high      # Important for progress
  3: medium    # Standard priority
  4: low       # When time permits
  5: someday   # Maybe someday
```

### Pipeline Configuration

Pipeline execution is configured in `.workflow/config/pipeline.yaml`:

```yaml
# .workflow/config/pipeline.yaml
stages:
  - name: validate
    commands:
      - wf validate
  - name: build
    commands:
      - wf build
  - name: test
    commands:
      - wf test
```

### Keyboard Shortcuts

| Command | Shortcut | Description |
|---------|----------|-------------|
| `workflow.runPipeline` | `Ctrl+Shift+W R` | Start pipeline execution |
| `workflow.newTicket` | `Ctrl+Shift+W N` | Create a new ticket |
| `workflow.moveTicket` | `Ctrl+Shift+W M` | Move ticket to different status |

> **Note**: Shortcuts only work when the workflow is properly configured (`.workflow/` directory exists and CLI is installed).

### Customizing Keybindings

To change keyboard shortcuts:

1. Open Keyboard Shortcuts (`Ctrl+K Ctrl+S` or `Cmd+K Cmd+S`)
2. Search for `workflow.`
3. Click the pencil icon next to any command
4. Press your desired key combination

## Usage

This section covers common workflows and how to use the extension's key features.

### Creating a Ticket

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run `Workflow: Create Ticket` or click the "+" icon in the Tickets view
3. Follow the interactive prompts:
   - **Title**: Enter a descriptive title
   - **Type**: Select ticket type (IMPL, FIX, DOCS, etc.)
   - **Priority**: Choose priority level (1-5)
   - **Status**: Select initial status (usually "backlog")
4. The ticket file is created in the appropriate status directory

**Quick action**: Use the keyboard shortcut `Ctrl+Shift+W N` to create a ticket quickly.

### Moving a Ticket Through Statuses

Tickets progress through the workflow: `backlog` → `ready` → `in-progress` → `review` → `done`

**Method 1: Quick Move (Next Status)**
1. Find the ticket in the sidebar or Kanban board
2. Click the → arrow icon next to the ticket
3. The ticket moves to the next status automatically

**Method 2: Menu Move**
1. Right-click on the ticket in the sidebar
2. Select "Move Ticket" from the context menu
3. Choose the target status from the QuickPick list

**Method 3: Command**
1. Open Command Palette
2. Run `Workflow: Move Ticket`
3. Select the ticket and target status

### Working with Kanban Board

The Kanban board provides a visual overview of all tickets:

1. **Open Kanban**: Click the Kanban icon in the Activity Bar
2. **View Tickets**: See all tickets organized by status in 6 columns
3. **Quick Actions**:
   - Click a ticket to open it in the editor
   - Click → to move to next status
   - Use the sort buttons to organize by priority, ID, or title
4. **Create Ticket**: Click the "+" icon in any column header

**Tip**: Use `Ctrl+Shift+W F` to focus the Kanban view quickly.

### Running the Pipeline

The pipeline automates your workflow stages:

1. **Start Pipeline**:
   - Click the ▶️ icon in the Pipeline view
   - Or use `Ctrl+Shift+W R`
   - Or run `Workflow: Run Pipeline` from Command Palette

2. **Monitor Progress**:
   - Watch the current stage indicator
   - View real-time output in the Pipeline Output panel

3. **Stop Pipeline**:
   - Click the ⏹️ icon when pipeline is running
   - Or use `Workflow: Stop Pipeline` command

4. **View History**:
   - Click "Show Pipeline Output" to see past executions
   - Clear history with "Clear Pipeline History" command

### Viewing Ticket Dependencies

Tickets can have dependencies on other tickets:

1. Open a ticket file
2. Look for the `dependencies:` section in the frontmatter
3. In the sidebar, right-click a ticket and select "Show Dependencies"
4. Dependencies are validated automatically (shown in Problems panel if broken)

### Using CodeLens

CodeLens provides inline actions in ticket files:

- **Move actions**: Quick links to move the ticket to different statuses
- **Dependency info**: See how many tickets depend on this one
- **Quick navigation**: Jump to related tickets

CodeLens appears automatically above the ticket title when editing a `.md` file.

## Commands

All Workflow AI commands are accessible via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).

### Ticket Commands

| Command | Description | When Available |
|---------|-------------|----------------|
| `workflow.newTicket` | Create a new ticket with interactive prompts | Workflow configured |
| `workflow.createTicket` | Create a new ticket (icon action) | Workflow configured |
| `workflow.openTicket` | Open ticket file in editor | Hovering over ticket |
| `workflow.moveTicket` | Move ticket to different status | Workflow configured |
| `workflow.moveTicketNext` | Move ticket to next status | In ticket list |
| `workflow.moveTicketFromMenu` | Move ticket via context menu | Context menu |
| `workflow.editTicket` | Open ticket for editing | In ticket list |
| `workflow.showTicketDependencies` | Show ticket dependencies | In ticket list |
| `workflow.showDependencies` | Show dependencies view | Workflow configured |
| `workflow.copyTicketId` | Copy ticket ID to clipboard | In ticket list |
| `workflow.refreshTickets` | Refresh tickets view | In tickets view |

### Pipeline Commands

| Command | Description | When Available |
|---------|-------------|----------------|
| `workflow.runPipeline` | Start pipeline execution | Workflow configured, not running |
| `workflow.stopPipeline` | Stop running pipeline | Pipeline is running |
| `workflow.showPipelineOutput` | Show pipeline output panel | Workflow configured |
| `workflow.clearPipelineHistory` | Clear pipeline execution history | Workflow configured |
| `workflow.openPipelineConfig` | Open pipeline configuration file | Workflow configured |

### Navigation Commands

| Command | Description | When Available |
|---------|-------------|----------------|
| `workflow.focusTicketsView` | Focus the tickets sidebar view | Workflow configured |
| `workflow.focusKanban` | Focus the Kanban panel view | Workflow configured |
| `workflow.refreshAll` | Refresh all workflow views | Workflow configured |

### Configuration Commands

| Command | Description | When Available |
|---------|-------------|----------------|
| `workflow.installCli` | Install the wf CLI tool | CLI not installed |
| `workflow.init` | Initialize workflow in workspace | Workflow not found |
| `workflow.openConfig` | Open extension configuration | Workflow configured |
| `workflow.newPlan` | Create a new plan document | Workflow configured |
| `workflow.showStatistics` | Show workflow statistics | Workflow configured |

### Sorting Commands (Kanban)

| Command | Description | When Available |
|---------|-------------|----------------|
| `workflow.sortKanbanByPriority` | Sort Kanban by priority | In Kanban view |
| `workflow.sortKanbanById` | Sort Kanban by ticket ID | In Kanban view |
| `workflow.sortKanbanByTitle` | Sort Kanban by title | In Kanban view |

## Troubleshooting

### Extension Not Activating

**Problem**: The extension doesn't activate or show any views.

**Solutions**:
1. Ensure you have a `.workflow/` directory in your workspace root
2. Verify that `config.yaml` and `pipeline.yaml` exist in `.workflow/config/`
3. Check the VS Code Developer Tools console for errors (`Help > Toggle Developer Tools`)

### StatusBar Not Showing

**Problem**: The Workflow status bar indicator is not visible.

**Solutions**:
1. Check if `workflow.workflowFound` context is set (requires `.workflow/` directory)
2. Ensure the CLI is installed (`workflow --version` in terminal)
3. Right-click the status bar and ensure Workflow items are not hidden

### Pipeline Won't Start

**Problem**: Clicking "Run Pipeline" does nothing or shows an error.

**Solutions**:
1. Verify the `wf` CLI is installed: `npm list -g workflow-ai`
2. Check pipeline configuration syntax in `.workflow/config/pipeline.yaml`
3. Ensure all required stages are properly defined
4. Check the Output panel for error messages

### Diagnostics Not Working

**Problem**: Invalid ticket files don't show errors in the Problems panel.

**Solutions**:
1. Ensure the ticket has valid YAML frontmatter (between `---` markers)
2. Check that required fields are present: `id`, `title`, `status`
3. Verify the ticket file is in the correct status directory
4. Reload the VS Code window (`Ctrl+Shift+P` > "Developer: Reload Window")

### Tree Views Empty

**Problem**: Sidebar shows no tickets, plans, or reports.

**Solutions**:
1. Click the refresh icon in the respective view
2. Verify files exist in the correct directories
3. Check file naming convention: `TICKET-ID.md`
4. Ensure frontmatter `status` matches the directory name

### CLI Not Detected

**Problem**: Extension shows "CLI not installed" even after installation.

**Solutions**:
1. Restart VS Code after CLI installation
2. Add CLI to PATH if using a custom location
3. Set `workflow.cliPath` in settings to the full CLI path
4. On Windows, ensure npm global bin directory is in PATH

### Keyboard Shortcuts Not Working

**Problem**: Shortcuts don't trigger any action.

**Solutions**:
1. Ensure workflow is properly configured (`.workflow/` exists)
2. Check for shortcut conflicts in Keyboard Shortcuts settings
3. Verify the `when` clause conditions are met

### Getting Help

If you're still experiencing issues:

1. Check the [GitHub Issues](https://github.com/workflow-ai/wf-vscode/issues) for known problems
2. Review the [wf CLI documentation](https://github.com/workflow-ai/wf)
3. Open a new issue with:
   - VS Code version
   - Extension version
   - Steps to reproduce
   - Error messages from Developer Tools console

## See Also

- [CHANGELOG](CHANGELOG.md) — Version history and release notes
- [GitHub Repository](https://github.com/workflow-ai/wf-vscode) — Source code and issue tracker
- [wf CLI Documentation](https://github.com/workflow-ai/wf) — Command-line tool documentation

---

**License**: MIT  
**Repository**: [workflow-ai/wf-vscode](https://github.com/workflow-ai/wf-vscode)  
**Version**: 0.0.1
