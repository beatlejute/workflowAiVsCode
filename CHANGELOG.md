# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Работа по PLAN-026. Раздел не выпущен: решением stakeholder'а от 2026-09-19 релиз
отложен, версия в `package.json` остаётся `0.2.0`.

### Added

- **Детекция пайплайнов, запущенных вне расширения.** `ExternalPipelineMonitor` следит за `.workflow/logs/.pipeline.lock` и показывает запуски из терминала и от MCP-сервера в pipeline-view, статус-баре и отдельном OutputChannel. Источник (`cli`/`mcp`) берётся из поля `started_by` в самом lock'е.
- Настройка `workflow.externalPipelineDetection` (по умолчанию `true`) — выключает детекцию.
- **Стадии внешнего запуска в pipeline-view.** Раньше под запуском из терминала или от MCP был один узел без стадий. Теперь `ExternalRunTracker` читает лог запуска с начала тем же разборщиком, что и stdout собственного запуска, и дерево то же: текущая стадия с агентом и временем, завершённые стадии (клик открывает лог на стадии), статистика. Время стадий берётся из меток лога (UTC), поэтому при подключении к идущему запуску у прочитанных стадий не выходит 0s. Лог читается кусками по 1 МБ с уступкой циклу событий: 15-мегабайтный лог реального запуска разбирается за ~0,3 с.
- **Stop, Pause и Resume для внешнего запуска** — в заголовке pipeline-view, inline на узле запуска и в палитре. Stop спрашивает подтверждение, проверяет, что lock по-прежнему описывает этот запуск и что pid не занят процессом, стартовавшим позже lock'а, убивает дерево процессов (`taskkill /T /F`; на POSIX — SIGTERM группе, через 10 с SIGKILL) и убирает то, что раннер после `/F` убрать не может: lock, запрос паузы, состояние паузы MCP. В истории такой запуск записывается как `stopped`, а не `error`. Pause кооперативная: расширение пишет `.workflow/state/pause-request.json`, раннер доигрывает текущую стадию и держит следующую, пока файл не удалён; до этого узел показывает «пауза после текущего этапа». Pause доступна только раннеру, который пишет в lock `capabilities: ["pause-request"]`. Resume снимает запрос паузы, а приостановку через MCP `pause_pipeline` — тем же способом, что MCP `resume_pipeline` (`pssuspend -r` / SIGCONT). Таймаута у паузы нет: закрытый VS Code оставляет раннер стоять, пока запрос не снимут — Resume после перезапуска окна, либо остановкой. Запрос, оставшийся от прошлого запуска, новый раннер с тем же pid не остановит: запрос должен быть моложе старта раннера (раннер из workflowAi a1dca2c и новее).
- **Пульс тикета в канбане для внешнего запуска** — тот же анимированный значок, что у собственного запуска, на тикете, над которым работает раннер; снимается на паузе, при остановке и по завершении.
- Статус-бар показывает внешний запуск, когда собственного нет, и дописывает `+N`, когда пайплайны идут в нескольких папках рабочей области. Состояния `Paused` и `Error` собственного пайплайна счётчиком не перекрываются.
- Внешние запуски попадают в историю с пометкой источника и `run_id` раннера; исход определяется по последнему маркеру в хвосте лога, а не предполагается успешным. Пометка видна в списке и в tooltip и переживает перезапуск. Выключение детекции и удаление папки из рабочей области историю не портят — пайплайн продолжает идти, и результат ему не приписывается.
- Линтер `npm run lint:l10n` дополнительно проверяет, что `category.workflow`, `views.activitybar.workflow.title` и `views.panel.kanban.title` **не переведены** ни в одной локали — иначе префиксы в палитре разъезжаются.

### Fixed

- **Chevron в pipeline-tree.** У узла запуска была раскрывающая стрелка, хотя детей у него нет — стейджи лежат соседями в корне дерева, а не под ним. Клик по такой стрелке ничего не делал. Узел больше не объявляет себя раскрываемым. Дополнительно состояние сворачивания узлов «Статистика» и «История» теперь переживает refresh (`CollapseStateStore`) — дерево перестраивается раз в секунду, пока идёт пайплайн.
- **Бейджи ревью перестали пропадать.** Две независимые причины. Первая: заголовок секции искался без привязки к началу строки, поэтому парсер цеплялся за упоминание `` `## Ревью` `` в тексте выше настоящей таблицы и не находил ни одной строки — так теряли все бейджи 14 тикетов. Вторая: колонки определялись по позиции, и таблицы с колонкой «Агент» (в том числе вторым столбцом, вопреки собственному заголовку) не читались вовсе, как и даты `2026-05-01T23:41` и `2026-04-21 14:53Z`, вердикты `✅ passed (attempt 2)`, `⏳ in review`, `✅ PASS`, `✓ resolved` и `fixed` без значка. Колонки теперь ищутся по содержимому; парсер также читает тикеты с несколькими секциями `## Ревью` (pipeline-fallback дописывает новую вместо строки). На 840 реальных тикетах распознаётся 1385 строк против 1307 до правок. Единственная нераспознанная — фраза «повторная проверка» в колонке статуса, вердиктом не являющаяся.
- **Строка тикета в работе больше не мигает.** Анимация делалась таймером в 1 с, который переключал иконку и дёргал `onDidChangeTreeData` для строки; VS Code перерисовывает на это всю строку, отсюда вспышка и потеря hover. Теперь используется самоанимирующийся codicon `loading~spin`, таймера нет, событие — только при смене активного тикета.

### Changed

- Требуется **workflow-ai ≥ 1.6.0**: расширение читает `started_by`, `run_id` и `pipeline_log` из lock-файла. Пайплайн, запущенный более старым раннером, не отслеживается — вместо этого показывается разовое предупреждение с просьбой обновиться.
- `engines.vscode` **не менялся** и остаётся `^1.109.0`. Требование PLAN-026 «поднять до 1.65» отменено: оно опиралось на устаревшее значение `^1.45.0`, а 1.65 к тому же ниже минимума, который диктует код — `vscode.l10n` требует 1.73, `TreeView.badge` — 1.72. Анимированные codicon на 1.109 поддерживаются заведомо.

## [1.0.0] - 2026-03-09

### Changed

- Version bump to 1.0.0 stable release

## [0.2.0] - 2026-04-29

### Added

- Context in blocked-нотификации: при наличии `auto_blocked_reason` в frontmatter показывается причина и счётчик попыток
- Нотификация о human-gate с action-кнопками «Open» и «Move to review» при активации стейджа `manual-gate-human`
- `PipelineState.Paused` и UI-индикация в pipeline tree-view (иконка паузы, «Ожидание ручного вмешательства»)
- Скрипт parity-check для l10n (`npm run lint:l10n`)
- Покрытие 12 локалей новыми строками нотификаций

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
