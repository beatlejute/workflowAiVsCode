---
id: "PLAN-004"
title: "Фаза 1 — Data Layer + Core Services"
status: archived
author: architect

created_at: "2026-03-04"
updated_at: "2026-09-19T00:00:00.000Z"
completed_at: "2026-03-04T19:01:10.237Z"

previous_plan: "PLAN-003"
related_reports: []
---

# План: Фаза 1 — Data Layer + Core Services

## Цель

Создать полноценный Data Layer и Service Layer для VS Code расширения `wf-vscode`: парсинг frontmatter, конфигурация, реактивное хранилище, файловый мониторинг, CRUD-сервисы тикетов/планов/отчётов, граф зависимостей и валидация.

**SMART-формулировка:**
- **S:** Реализовать 9 модулей: FrontmatterParser, ConfigManager, WorkflowStore, FileWatcherService, TicketService, DependencyService, PlanService, ReportService, ValidationService — полный Data + Service layer расширения
- **M:** 9 модулей реализованы, unit-тесты ≥80% покрытия, Store реактивно обновляется при изменении файлов, все сервисы предоставляют API для UI-слоя
- **A:** Используются стандартные библиотеки (js-yaml, VS Code FileSystemWatcher, EventEmitter), архитектура определена в design-document.md
- **R:** Без Data + Service layer невозможно построить UI (TreeView, Kanban, CodeLens) — это слой между файлами и интерфейсом
- **T:** Фаза 1 завершается до начала Фазы 2 (UI Layer)

## Контекст

**Предыстория:**
- PLAN-001 определяет полную архитектуру VS Code расширения для workflow-ai (24 задачи, 4 фазы)
- PLAN-003 (Фаза 0) — scaffolding и активация расширения — должна быть завершена до начала этого плана
- Фаза 1 охватывает задачи 3–11 из PLAN-001: от парсинга YAML до валидации данных
- Результат — полный набор сервисов, готовых к подключению UI-компонентов в Фазе 2

**Ключевые решения из PLAN-001 (ADR):**
- ADR-002: Файлы = source of truth, in-memory кеш + FileSystemWatcher
- ADR-003: Мутации через `wf` CLI (`child_process.spawn`)
- ADR-004: Чтение через собственный парсер (`js-yaml`)
- ADR-005: Event-driven архитектура: FileWatcher → Store → EventEmitter → UI
- ADR-006: Гибридная валидация: JSON Schema + императивный код

**Связанные документы:**
- [PLAN-001](../archive/PLAN-001.md) — мастер-план (задачи 3–11)
- [PLAN-003](PLAN-003.md) — Фаза 0 (инфраструктура)
- [design-document.md](../../plans/design-document.md) — архитектура, C4, ADR, state machines
- [vscode-plugin-ui.md](../../plans/vscode-plugin-ui.md) — UI wireframes (контекст для API сервисов)

## Scope (Границы)

### Включено в scope

- FrontmatterParser: парсинг/сериализация YAML frontmatter из .md файлов
- ConfigManager: загрузка, валидация и кеширование config.yaml, pipeline.yaml
- WorkflowStore: центральное in-memory хранилище с EventEmitter
- FileWatcherService: FileSystemWatcher + debounce + smart diff
- TicketService: CRUD тикетов, move через wf CLI, валидация transitions
- DependencyService: граф зависимостей, обнаружение циклов
- PlanService: управление планами (current/archive), связь с тикетами
- ReportService: отчёты, парсинг summary, агрегация статистики
- ValidationService: JSON Schema + императивная валидация, Diagnostic[]
- TypeScript интерфейсы (Ticket, Plan, Report, Config, Pipeline)
- Unit-тесты для каждого модуля (≥80% покрытия)

### Исключено из scope

- UI-компоненты (TreeView, Kanban, StatusBar, CodeLens и др.) — Фаза 2
- Scaffolding и активация расширения — Фаза 0 (PLAN-003)
- i18n и E2E тесты — Фаза 3
- Модификация wf CLI
- CI/CD pipeline

## Высокоуровневые задачи

### 1. FrontmatterParser — парсинг YAML frontmatter из .md

**Приоритет:** Критический (1)
**Зависимости:** Фаза 0 (scaffolding)
**Описание:**

Модуль для парсинга и сериализации YAML frontmatter из markdown файлов.

**Подзадачи:**

1.1. **TypeScript интерфейсы**
   - `Ticket` (id, title, status, priority, type, dependencies, conditions, context, tags, complexity, parent_plan, parent_task, created_at, updated_at, completed_at)
   - `Plan` (id, title, status, author, created_at, updated_at, completed_at, previous_plan, related_reports)
   - `Report` (id, title, type, created_at, summary)
   - Разместить в `src/data/types.ts`

1.2. **Парсинг frontmatter**
   - Извлечение блока между `---` маркерами
   - Десериализация через `js-yaml` (yaml.load)
   - Типизированный результат: `parse<T>(content: string): { frontmatter: T; body: string }`

1.3. **Сериализация frontmatter**
   - Обновление отдельных полей без потери форматирования body
   - `serialize(frontmatter: object, body: string): string`
   - Использование `js-yaml` (yaml.dump) с сохранением стиля

1.4. **Unit-тесты**
   - Парсинг реальных примеров тикетов, планов, отчётов
   - Roundtrip: parse → serialize → parse = идентичный результат
   - Edge cases: пустой frontmatter, отсутствие `---`, спецсимволы в YAML

**Результат:** `src/data/frontmatter-parser.ts` — модуль для чтения/записи frontmatter, используется всеми сервисами.

### 2. ConfigManager — загрузка и валидация конфигов

**Приоритет:** Критический (1)
**Зависимости:** Задача 1
**Описание:**

Управление конфигурацией расширения: загрузка, валидация, кеширование, reload.

**Подзадачи:**

2.1. **TypeScript интерфейсы конфигурации**
   - `WorkflowConfig` (version, project, task_types, priorities, statuses, condition_types, paths, reporting)
   - `PipelineConfig` (agents, stages, goto, entry_point)
   - Разместить в `src/data/types.ts`

2.2. **Загрузка конфигов**
   - `loadConfig(workflowRoot: string): WorkflowConfig` — загрузка config.yaml
   - `loadPipeline(workflowRoot: string): PipelineConfig` — загрузка pipeline.yaml
   - Обработка ошибок: файл не найден, невалидный YAML

2.3. **Валидация структуры**
   - JSON Schema для config.yaml (обязательные поля, типы значений)
   - JSON Schema для pipeline.yaml (agents, stages, entry_point)
   - Возврат массива ошибок валидации

2.4. **Кеширование и reload**
   - In-memory кеш загруженных конфигов
   - `reload()` — перечитывание при изменении файлов
   - `onDidChange` event для уведомления зависимых компонентов

2.5. **Unit-тесты**
   - Загрузка валидного config.yaml
   - Загрузка валидного pipeline.yaml
   - Обработка невалидных файлов
   - Кеширование: повторный вызов не читает файл

**Результат:** `src/data/config-manager.ts` — единая точка доступа к конфигурации.

### 3. WorkflowStore — центральное хранилище (in-memory cache)

**Приоритет:** Критический (1)
**Зависимости:** Задачи 1, 2
**Описание:**

Центральное реактивное хранилище данных расширения. Единый источник данных для всех UI-компонентов.

**Подзадачи:**

3.1. **Структура хранилища**
   - `Map<string, Ticket>` — все тикеты (по ID)
   - `Map<string, Plan>` — все планы (по ID)
   - `Report[]` — все отчёты
   - `WorkflowConfig` — текущий конфиг
   - `PipelineConfig` — pipeline конфиг

3.2. **Метод refresh()**
   - Полное перечитывание `.workflow/` директории
   - Scan `tickets/{status}/` (6 директорий), `plans/current/`, `plans/archive/`, `reports/`
   - Парсинг каждого .md файла через FrontmatterParser
   - Загрузка конфигов через ConfigManager

3.3. **EventEmitter**
   - `onDidChange: Event<StoreChangeEvent>` — уведомление UI о любых изменениях
   - `StoreChangeEvent`: тип изменения (ticket/plan/report/config), ID, операция (add/update/delete)
   - Батчинг событий при массовом обновлении

3.4. **Инкрементальное обновление**
   - `updateTicket(id, ticket)`, `removeTicket(id)`, `addTicket(ticket)`
   - Аналогично для планов и отчётов
   - Каждое обновление генерирует event

3.5. **Query-методы**
   - `getTickets(): Ticket[]`, `getTicketById(id): Ticket | undefined`
   - `getTicketsByStatus(status): Ticket[]`
   - `getPlans(): Plan[]`, `getCurrentPlans(): Plan[]`, `getArchivedPlans(): Plan[]`
   - `getReports(): Report[]`

3.6. **Unit-тесты**
   - refresh() корректно загружает данные
   - Инкрементальное обновление работает
   - Events генерируются при изменениях
   - Query-методы возвращают корректные данные

**Результат:** `src/data/workflow-store.ts` — центральный Store, связывающий Data и UI layers.

### 4. FileWatcherService — реактивное обновление

**Приоритет:** Высокий (2)
**Зависимости:** Задача 3
**Описание:**

Мониторинг файловой системы для автоматического обновления Store при внешних изменениях (CLI, AI-агенты).

**Подзадачи:**

4.1. **FileSystemWatcher**
   - Паттерн: `.workflow/**/*.{md,yaml,yml}`
   - Подписка на `onDidCreate`, `onDidChange`, `onDidDelete`
   - Регистрация через `vscode.workspace.createFileSystemWatcher()`

4.2. **Debounce 100ms**
   - Группировка быстрых последовательных изменений
   - Один batch refresh вместо множества
   - Таймер сбрасывается при каждом новом событии

4.3. **Smart diff**
   - Определение типа изменения: ticket moved (delete + create), frontmatter updated, new file
   - Маппинг пути файла → тип сущности (ticket/plan/report/config)
   - Извлечение ID из имени файла

4.4. **Интеграция со Store**
   - Вызов `Store.updateTicket()` / `Store.removeTicket()` при точечных изменениях
   - Fallback на `Store.refresh()` при неопределённых изменениях
   - Пропуск событий при собственных мутациях (flag `isOwnWrite`)

4.5. **Unit-тесты**
   - Debounce корректно группирует события
   - Smart diff определяет тип изменения
   - Store обновляется при файловых событиях

**Результат:** `src/services/file-watcher-service.ts` — реактивный мост между файловой системой и Store.

### 5. TicketService — CRUD тикетов

**Приоритет:** Критический (1)
**Зависимости:** Задачи 3, 4
**Описание:**

Полный CRUD для тикетов: чтение из Store, создание через шаблоны, перемещение через wf CLI, обновление frontmatter.

**Подзадачи:**

5.1. **Чтение из Store**
   - `getAll(): Ticket[]`
   - `getByStatus(status: TicketStatus): Ticket[]`
   - `getById(id: string): Ticket | undefined`
   - `getByPlan(planId: string): Ticket[]`
   - `getByType(type: string): Ticket[]`

5.2. **Создание тикета**
   - `create(type: string, title: string, fields?: Partial<Ticket>): Promise<Ticket>`
   - Генерация ID: prefix из config.yaml task_types + автоинкремент counter
   - Создание .md из ticket-template.md
   - Заполнение frontmatter
   - Сохранение в `tickets/backlog/`
   - Обновление counter в config.yaml

5.3. **Перемещение тикета**
   - `move(id: string, targetStatus: TicketStatus): Promise<void>`
   - Валидация допустимого перехода (state machine из design-document.md)
   - Вызов `wf move <id> <status>` через `child_process.spawn`
   - Обработка ошибок CLI

5.4. **Обновление тикета**
   - `update(id: string, fields: Partial<Ticket>): Promise<void>`
   - Чтение файла → парсинг → обновление полей → сериализация → запись
   - Обновление `updated_at`

5.5. **State machine валидация**
   - Допустимые переходы статусов (из design-document.md):
     - backlog → ready
     - ready → in-progress
     - in-progress → review, blocked, done
     - review → done, in-progress
     - blocked → ready, backlog
     - done → (terminal)
   - `getValidTransitions(currentStatus): TicketStatus[]`

5.6. **Unit-тесты**
   - CRUD операции
   - State machine: допустимые и недопустимые переходы
   - Генерация ID с автоинкрементом
   - Обработка ошибок CLI

**Результат:** `src/services/ticket-service.ts` — полный API для работы с тикетами.

### 6. DependencyService — граф зависимостей

**Приоритет:** Высокий (2)
**Зависимости:** Задача 5
**Описание:**

Анализ графа зависимостей между тикетами. Используется в UI (TreeView, Hover, CodeLens) и валидации.

**Подзадачи:**

6.1. **Прямые зависимости**
   - `getDependencies(id: string): Ticket[]` — от кого зависит (depends on)
   - `getDependents(id: string): Ticket[]` — кого блокирует (blocks)

6.2. **Транзитивные зависимости**
   - `getTransitiveChain(id: string): Ticket[]` — полный путь зависимостей (BFS/DFS)
   - `getBlockingChain(id: string): Ticket[]` — полный путь блокирования

6.3. **Обнаружение циклов**
   - `detectCycles(): CyclicDependency[]` — поиск циклических зависимостей
   - Алгоритм: DFS с раскраской (white/gray/black)
   - `CyclicDependency: { cycle: string[] }` — список ID в цикле

6.4. **Проверка зависимостей для перемещения**
   - `canMoveToReady(id: string): { ok: boolean; blockers: string[] }` — все зависимости в done?
   - Используется при проверке условий перехода backlog → ready

6.5. **Unit-тесты**
   - Прямые зависимости
   - Транзитивная цепочка
   - Обнаружение циклов (простой цикл, сложный цикл, нет цикла)
   - canMoveToReady с разными состояниями зависимостей

**Результат:** `src/services/dependency-service.ts` — анализ графа зависимостей.

### 7. PlanService — управление планами

**Приоритет:** Высокий (2)
**Зависимости:** Задача 3
**Описание:**

CRUD для планов: список, создание, связь с тикетами, архивация.

**Подзадачи:**

7.1. **Чтение из Store**
   - `getAll(): Plan[]`
   - `getCurrent(): Plan[]` — планы из `plans/current/`
   - `getArchived(): Plan[]` — планы из `plans/archive/`
   - `getById(id: string): Plan | undefined`

7.2. **Создание плана**
   - `create(title: string, fields?: Partial<Plan>): Promise<Plan>`
   - Генерация ID: `PLAN-{NNN}` из counter в config.yaml
   - Создание .md из plan-template.md
   - Сохранение в `plans/current/`
   - Обновление counter

7.3. **Связь план → тикеты**
   - `getTicketsForPlan(planId: string): Ticket[]` — тикеты с `parent_plan == planId`
   - `getPlanProgress(planId: string): { total: number; done: number; percentage: number }`

7.4. **Архивация**
   - `archive(id: string): Promise<void>` — перемещение из `current/` в `archive/`
   - Обновление status → archived, completed_at

7.5. **Unit-тесты**
   - CRUD операции
   - Связь план → тикеты
   - Прогресс плана
   - Архивация

**Результат:** `src/services/plan-service.ts` — API для работы с планами.

### 8. ReportService — отчёты и агрегация

**Приоритет:** Средний (3)
**Зависимости:** Задача 3
**Описание:**

Работа с отчётами: чтение, парсинг summary, агрегация статистики по тикетам.

**Подзадачи:**

8.1. **Чтение из Store**
   - `getAll(): Report[]`
   - `getById(id: string): Report | undefined`
   - `getLatest(): Report | undefined`

8.2. **Парсинг summary**
   - Извлечение статистики из frontmatter отчёта
   - Структурирование: выполнено/провалено, по типам, по приоритетам

8.3. **Агрегация текущего состояния**
   - `getStatistics(): WorkflowStats`
   - Подсчёт тикетов по статусам, типам, приоритетам
   - Среднее время выполнения (created_at → completed_at)
   - Количество blocked тикетов

8.4. **Unit-тесты**
   - Чтение отчётов
   - Парсинг summary
   - Агрегация статистики

**Результат:** `src/services/report-service.ts` — API для отчётов и статистики.

### 9. ValidationService — валидация YAML

**Приоритет:** Высокий (2)
**Зависимости:** Задачи 3, 6
**Описание:**

Гибридная валидация: JSON Schema для структуры + императивные правила для бизнес-логики. Результат — `Diagnostic[]` для VS Code Problems panel.

**Подзадачи:**

9.1. **JSON Schema для frontmatter тикетов**
   - Обязательные поля: id, title, status, priority, type
   - Допустимые значения: status (6 значений), priority (1–5), type
   - Формат: id — regex `^[A-Z]+-\d+$`

9.2. **JSON Schema для pipeline.yaml**
   - Структура agents, stages, entry_point
   - Обязательные поля в каждом stage
   - Допустимые значения goto.type

9.3. **Императивные правила**
   - Существование dep ID: каждый ID в `dependencies` должен существовать в Store
   - Циклические зависимости: использование DependencyService.detectCycles()
   - goto-цепочки в pipeline: каждый stage.goto.stage должен существовать
   - Agent ID: каждый agent в stages должен существовать в agents

9.4. **Формирование Diagnostic[]**
   - `validateTicket(uri: Uri, ticket: Ticket): Diagnostic[]`
   - `validatePipeline(uri: Uri, config: PipelineConfig): Diagnostic[]`
   - `validateConfig(uri: Uri, config: WorkflowConfig): Diagnostic[]`
   - Severity: Error для критических, Warning для рекомендаций

9.5. **Unit-тесты**
   - Валидный тикет — 0 diagnostics
   - Отсутствие обязательного поля — Error
   - Несуществующий dep ID — Error
   - Циклическая зависимость — Error
   - Невалидный pipeline.yaml — Error

**Результат:** `src/services/validation-service.ts` — валидация для DiagnosticProvider (Фаза 2).

## Технические решения

**Архитектура:** 3-слойная (Data → Service → UI). Фаза 1 реализует первые два слоя:
- **Data Layer** (`src/data/`): FrontmatterParser, ConfigManager, WorkflowStore — чистые данные, парсинг, кеш
- **Service Layer** (`src/services/`): бизнес-логика поверх данных, API для UI

**EventEmitter pattern:** Store генерирует события при любом изменении данных. UI-компоненты (Фаза 2) подписываются на эти события для реактивного обновления. Это избавляет от polling и ручного refresh.

**Мутации через CLI:** Все операции записи (move, create) используют `wf` CLI через `child_process.spawn`. Это гарантирует консистентность с workflow-ai и избавляет от дублирования логики state machine.

**Валидация:** Гибридный подход — JSON Schema для структурной валидации (быстро, декларативно), императивный код для бизнес-правил (зависимости, циклы, ссылочная целостность).

**Debounce:** FileWatcher использует 100ms debounce для предотвращения каскадных обновлений при массовых операциях (например, pipeline move нескольких тикетов).

## Риски и зависимости

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Race condition: CLI и Extension пишут одновременно | Средняя | Высокое | Atomic writes (temp + rename), FileWatcher debounce 100ms, flag `isOwnWrite` |
| Формат frontmatter изменится в wf | Низкая | Высокое | Schema version в config.yaml, валидация при загрузке, graceful fallback |
| Большое кол-во тикетов замедляет refresh() | Низкая | Среднее | Инкрементальное обновление через FileWatcher, lazy parsing |
| js-yaml парсит YAML не идентично wf utils.mjs | Низкая | Среднее | Использовать идентичные настройки yaml.load/dump, roundtrip тесты |
| FileSystemWatcher пропускает события | Средняя | Среднее | Периодический full refresh как fallback (configurable interval) |

## Внешние зависимости

- VS Code Extension API `^1.96.0` (FileSystemWatcher, EventEmitter)
- `js-yaml` npm package — парсинг YAML
- `workflow-ai` CLI — мутации тикетов (move, create)
- Node.js `child_process` — вызов CLI
- Фаза 0 (PLAN-003) — scaffolding, структура проекта, activate/deactivate

## Критерии успеха

- [ ] FrontmatterParser: парсинг и roundtrip реальных .md файлов без потери данных
- [ ] ConfigManager: загрузка и валидация config.yaml, pipeline.yaml
- [ ] WorkflowStore: полное перечитывание .workflow/ и инкрементальные обновления
- [ ] WorkflowStore: EventEmitter генерирует события при любых изменениях
- [ ] FileWatcherService: реагирует на внешние изменения файлов < 200ms
- [ ] FileWatcherService: debounce предотвращает каскадные обновления
- [ ] TicketService: CRUD операции, move через wf CLI, валидация state machine
- [ ] DependencyService: граф зависимостей, обнаружение циклов
- [ ] PlanService: CRUD планов, связь с тикетами, архивация
- [ ] ReportService: чтение отчётов, агрегация статистики
- [ ] ValidationService: JSON Schema + императивная валидация, формирование Diagnostic[]
- [ ] Unit-тесты: ≥80% покрытие для всех модулей
- [ ] Все сервисы предоставляют API, достаточный для подключения UI в Фазе 2

## Метрики

| Метрика | Текущее значение | Целевое значение |
|---------|-----------------|------------------|
| Модули Data Layer | 0 | 3 (Parser, ConfigManager, Store) |
| Модули Service Layer | 0 | 6 (Ticket, Dependency, Plan, Report, Validation, FileWatcher) |
| Unit-тесты | 0 | ≥40 (≥80% покрытие) |
| Время refresh() для 50 тикетов | N/A | < 500ms |
| Время реакции FileWatcher | N/A | < 200ms |

---

## Тикеты

| Тикет | Задача | Приоритет | Зависимости |
|-------|--------|-----------|-------------|
| [IMPL-002](../../tickets/backlog/IMPL-002.md) | FrontmatterParser + TypeScript интерфейсы | 1 (Critical) | IMPL-001 |
| [IMPL-003](../../tickets/backlog/IMPL-003.md) | ConfigManager | 1 (Critical) | IMPL-002 |
| [IMPL-004](../../tickets/backlog/IMPL-004.md) | WorkflowStore | 1 (Critical) | IMPL-002, IMPL-003 |
| [IMPL-005](../../tickets/backlog/IMPL-005.md) | FileWatcherService | 2 (High) | IMPL-004 |
| [IMPL-006](../../tickets/backlog/IMPL-006.md) | TicketService | 1 (Critical) | IMPL-004, IMPL-005 |
| [IMPL-007](../../tickets/backlog/IMPL-007.md) | DependencyService | 2 (High) | IMPL-006 |
| [IMPL-008](../../tickets/backlog/IMPL-008.md) | PlanService | 2 (High) | IMPL-004 |
| [IMPL-009](../../tickets/backlog/IMPL-009.md) | ReportService | 3 (Medium) | IMPL-004 |
| [IMPL-010](../../tickets/backlog/IMPL-010.md) | ValidationService | 2 (High) | IMPL-004, IMPL-007 |

## История изменений

| Дата | Автор | Изменение |
|------|-------|-----------|
| 2026-03-04 | Architect | Создан план Фазы 1 на основе задач 3–11 из PLAN-001 |
| 2026-03-04 | Claude | Декомпозиция: создано 9 тикетов IMPL-002..IMPL-010 |
| 2026-09-19 | Stakeholder | Статус нормализован: `draft` → `archived` (план лежит в `plans/archive/`); `completed_at` проставлен по дате завершения последнего тикета плана (2026-03-04T19:01:10.237Z). |
