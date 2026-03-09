# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-09

### Changed

- Version bump to 1.0.0 stable release

## [0.1.0] - 2026-03-08

### Added

- i18n wrapper `t()` with locale selection via `workflow.locale` setting (auto + 10 locales: en, ru, de, fr, es, ja, ko, zh-cn, zh-tw, pt-br)
- Config.yaml button (`$(tools)`) in Pipeline view title bar
- Review badges (✅/❌) on tickets in kanban and sidebar views (max 4 +N indicator)
- Date sort mode for tickets by `updated_at` in kanban and sidebar
- Sort direction toggle (asc/desc) with visual indication via `workflow.sortAscending` context key
- Plan filter sync between sidebar and kanban with visual indication (`workflow.ticketFilterActive`)
- Filter info element in sidebar (`🔍 PLAN-001: Title`) when filter is active
- Plan name prefix in kanban column headers when filtered
- Context menu for plans: Decompose, Run Pipeline, Archive/Unarchive
- Ticket, agent, skill, and status change display in completed pipeline steps
- Hover tooltip with output (max 20 lines) for pipeline steps
- Expandable reports in run history with `CREATE_REPORT` log parsing
- Run history persistence via `workspaceState` (limit: 50 entries, FIFO)
- i18n support for 10 locales with full translation coverage

### Changed

- All `vscode.l10n.t()` calls replaced with custom `t()` wrapper from `src/i18n.ts`
- `getReviewBadges()` extracted to shared utility module `src/ui/utils.ts` (DRY)
- TypeScript strict-mode: `shell` type corrected to `'cmd.exe' | undefined`

### Fixed

- TypeScript error TS2367 (redundant comparison) in `src/i18n.ts`
- Missing i18n keys in 9 locale files (`package.nls.*.json`) and 8 bundle files (`l10n/bundle.l10n.*.json`)
- Duplicate `getReviewBadges()` function in `kanban-tree-provider.ts` and `sidebar-tree-provider.ts`
- Pre-existing TypeScript strict-mode warning in `src/extension.ts`

[1.0.0]: https://github.com/workflow-ai/wf-vscode/releases/tag/v1.0.0
[0.1.0]: https://github.com/workflow-ai/wf-vscode/releases/tag/v0.1.0
