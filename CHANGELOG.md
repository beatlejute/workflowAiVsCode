# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Enhanced dependency visualization
- Additional pipeline execution controls

---

## [0.1.0] - 2026-03-05

Initial release with comprehensive workflow management features for VS Code.

### Added

#### Data Layer (Phase 1)
- **WorkflowStore** — Central data store for tickets, plans, and reports with file system watching
- **TicketStatus type** — Type-safe status management (backlog, ready, in-progress, blocked, review, done)
- **Ticket, Plan, Report interfaces** — TypeScript type definitions for workflow entities
- **File system watcher** — Automatic refresh on file changes with debouncing

#### Core Services (Phase 1)
- **TicketService** — Create, read, update, move tickets with validation
- **DependencyService** — Track and validate ticket dependencies
- **PipelineService** — Pipeline execution with state management and event emission
- **Workflow validation** — Frontmatter schema validation using Ajv

#### UI Layer — Sidebar (Phase 2)
- **TicketsTreeProvider** — Tree view of tickets organized by status
- **PlansTreeProvider** — Tree view of plans (current/archive)
- **ReportsTreeProvider** — Tree view of reports
- **PipelineTreeProvider** — Pipeline configuration and status view
- **Context menu actions** — Move, edit, show dependencies, copy ID
- **Welcome view** — Guided setup when CLI or workflow not found

#### UI Layer — Kanban Board (Phase 2)
- **6 Kanban columns** — Backlog, Ready, In Progress, Blocked, Review, Done
- **Ticket cards** — Display ID, title, and priority with icons
- **Sorting options** — Sort by priority, ID, or title
- **Drag-and-drop ready** — Architecture supports future DnD implementation
- **Live counters** — Column headers show ticket counts

#### UI Layer — Pipeline Monitor (Phase 2)
- **Real-time status** — Current stage and progress indication
- **Start/Stop controls** — Direct pipeline execution control
- **Output viewer access** — Quick link to pipeline output
- **History management** — Clear execution history

#### UI Layer — StatusBar (Phase 2)
- **Status indicator** — Shows "WF: Idle" or "WF: Running"
- **Pipeline state** — Visual feedback for pipeline execution
- **Quick access** — Click to view pipeline status

#### UI Layer — CodeLens (Phase 2)
- **Inline actions** — Move ticket, view dependencies directly in editor
- **Ticket metadata** — Display status and priority inline
- **Context-aware** — Shows relevant actions based on ticket state

#### UI Layer — Hover Provider (Phase 2)
- **Ticket previews** — Show ticket details on hover over ID references
- **Quick navigation** — See status and priority without opening file
- **Cross-file support** — Works in tickets, plans, and reports

#### UI Layer — Completion Provider (Phase 2)
- **Ticket ID completions** — Autocomplete ticket references
- **Smart suggestions** — Context-aware completion items
- **Trigger characters** — Supports `-`, ` `, and `:` triggers

#### UI Layer — Diagnostic Provider (Phase 2)
- **Real-time validation** — Validate ticket frontmatter on edit
- **Error highlighting** — Inline squiggles for invalid fields
- **Problems panel integration** — Shows in VS Code Problems view
- **Dependency validation** — Detect broken dependency references

#### UI Layer — Document Link Provider (Phase 2)
- **Clickable references** — Click ticket IDs to open files
- **Pipeline config links** — Navigate stages and steps
- **Cross-file navigation** — Jump between related documents

#### UI Layer — Notifications (Phase 2)
- **Pipeline events** — Notify on pipeline start/complete/fail
- **Ticket changes** — Notify on ticket moves and updates
- **Configurable** — Control notification types

#### Commands (Phase 2)
- **workflow.installCli** — Install wf CLI globally
- **workflow.init** — Initialize workflow in workspace
- **workflow.newTicket** — Create new ticket with interactive prompts
- **workflow.createTicket** — Create ticket via icon action
- **workflow.openTicket** — Open ticket file in editor
- **workflow.moveTicket** — Move ticket to different status
- **workflow.moveTicketNext** — Move ticket to next status in workflow
- **workflow.moveTicketFromMenu** — Move via context menu
- **workflow.editTicket** — Open ticket for editing
- **workflow.showTicketDependencies** — Show dependencies view
- **workflow.showDependencies** — Show full dependency graph
- **workflow.copyTicketId** — Copy ticket ID to clipboard
- **workflow.refreshTickets** — Refresh tickets tree view
- **workflow.sortKanbanByPriority** — Sort Kanban by priority
- **workflow.sortKanbanById** — Sort Kanban by ID
- **workflow.sortKanbanByTitle** — Sort Kanban by title
- **workflow.runPipeline** — Start pipeline execution
- **workflow.stopPipeline** — Stop running pipeline
- **workflow.showPipelineOutput** — Show pipeline output
- **workflow.clearPipelineHistory** — Clear execution history
- **workflow.openPipelineConfig** — Open pipeline.yaml
- **workflow.openConfig** — Open extension settings
- **workflow.focusTicketsView** — Focus tickets sidebar
- **workflow.focusKanban** — Focus Kanban panel
- **workflow.refreshAll** — Refresh all workflow views
- **workflow.newPlan** — Create new plan document
- **workflow.showStatistics** — Show workflow statistics

#### Keyboard Shortcuts (Phase 2)
- **Ctrl+Shift+W R** — Run pipeline
- **Ctrl+Shift+W N** — New ticket
- **Ctrl+Shift+W M** — Move ticket

#### Configuration (Phase 2)
- **workflow.cliPath** — Custom CLI executable path
- **Context keys** — `workflow.cliInstalled`, `workflow.workflowFound`, `workflow.pipelineRunning`

#### Internationalization (Phase 3)
- **10 language packs** — Full i18n support for en, ru, zh-cn, zh-tw, ja, ko, de, fr, es, pt-br
- **package.nls.*.json** — Localized strings for all UI elements
- **Locale detection** — Automatic language selection based on VS Code locale
- **Externalized strings** — All user-facing messages in resource files

#### Testing (Phase 3)
- **E2E test framework** — Integration tests using @vscode/test-electron
- **Test scaffolding** — Base structure for extension testing
- **CI/CD ready** — Test execution pipeline configuration

#### Developer Experience
- **TypeScript** — Full type safety with strict mode
- **ESLint** — Code quality enforcement
- **esbuild** — Fast bundling for production
- **Debug configuration** — VS Code launch configurations for extension development

### Changed
- None (initial release)

### Fixed
- None (initial release)

### Removed
- None (initial release)

### Deprecated
- None (initial release)

### Security
- No API keys or secrets exposed in code
- File system access limited to workspace directory
- No external network calls

---

## Version History Summary

| Version | Date | Key Features |
|---------|------|--------------|
| 0.1.0 | 2026-03-05 | Initial release with full workflow management |

---

## Upcoming Releases

### 0.2.0 (Planned)
- Complete i18n for all 10 supported languages
- E2E test suite with @vscode/test-electron
- Enhanced pipeline visualization
- Improved dependency graph view
- Performance optimizations for large workflows

### Future Considerations
- Drag-and-drop ticket movement in Kanban
- Custom workflow definitions
- Integration with external project management tools
- AI-powered ticket suggestions
- Timeline/Gantt chart view

---

*For more information, see the [README.md](README.md) and [documentation](.workflow/).*

---

## Links

- [Unreleased]: https://github.com/your-org/workflow-ai-vscode/compare/v0.1.0...HEAD
- [0.1.0]: https://github.com/your-org/workflow-ai-vscode/releases/tag/v0.1.0
