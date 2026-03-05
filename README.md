# Workflow AI for VS Code

**Workflow AI** is a VS Code extension that integrates the `wf` CLI tool into your development environment, providing a powerful project management and workflow automation system directly in your editor.

[![Version](https://img.shields.io/visual-studio-marketplace/v/workflow-ai.workflow-vscode)](https://marketplace.visualstudio.com/items?itemName=workflow-ai.workflow-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/workflow-ai.workflow-vscode)](https://marketplace.visualstudio.com/items?itemName=workflow-ai.workflow-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/workflow-ai.workflow-vscode)](https://marketplace.visualstudio.com/items?itemName=workflow-ai.workflow-vscode)

## Table of Contents

- [Description](#description)
- [Key Features](#key-features)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Requirements](#requirements)
- [Configuration](#configuration)
- [Commands](#commands)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)

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

> *Screenshot: Sidebar showing the 4 main sections with expandable tree items*

### Kanban Board

Six-column Kanban view for visual task management:

- **BACKLOG** — Unprioritized tasks and ideas
- **READY** — Tasks ready to be worked on
- **IN PROGRESS** — Currently active tasks
- **BLOCKED** — Tasks waiting on dependencies
- **REVIEW** — Tasks awaiting review/approval
- **DONE** — Completed tasks

> *Screenshot: Kanban board showing tickets distributed across 6 columns with priority indicators*

### Pipeline Monitor

Real-time pipeline execution monitoring:

- Current stage indicator
- Progress visualization
- Start/Stop controls
- Output viewer

> *Screenshot: Pipeline monitor showing active execution with progress indicator*

### StatusBar

Quick status access in the VS Code status bar:

- Workflow status indicator
- Pipeline state (Idle/Running)
- Quick actions

> *Screenshot: StatusBar showing "WF: Idle" status indicator*

### CodeLens in Ticket Files

Inline actions and information directly in markdown ticket files:

- Move ticket actions
- Dependency information
- Quick navigation

> *Screenshot: CodeLens actions visible above a ticket heading*

### Hover Preview

Quick ticket information when hovering over ticket IDs:

- Ticket title
- Current status
- Priority level

> *Screenshot: Hover popup showing ticket details when hovering over a ticket reference*

### Diagnostics Panel

Real-time validation with inline error highlighting:

- Invalid frontmatter detection
- Missing required fields
- Broken dependency references

> *Screenshot: Problems panel showing validation errors in a ticket file*

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

### Settings

Configure the extension in VS Code settings (`settings.json`):

| Setting | Description | Default |
|---------|-------------|---------|
| `workflow.cliPath` | Custom path to the wf CLI executable (leave empty for auto-detection) | `""` |

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

---

**License**: MIT  
**Repository**: [workflow-ai/wf-vscode](https://github.com/workflow-ai/wf-vscode)
