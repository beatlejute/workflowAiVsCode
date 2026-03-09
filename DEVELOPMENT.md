# Разработка Workflow AI для VS Code

Это руководство описывает архитектуру расширения и предоставляет инструкции для разработчиков.

## Содержание

- [Архитектура расширения](#архитектура-расширения)
- [Структура проекта](#структура-проекта)
- [Основные модули](#основные-модули)
- [Как добавить новую локаль](#как-добавить-новую-локаль)
- [Как добавить новую команду](#как-добавить-новую-команду)
- [Как добавить новое представление](#как-добавить-новое-представление)
- [Отладка расширения](#отладка-расширения)
- [Сборка и публикация](#сборка-и-публикация)

## Архитектура расширения

Расширение построено на основе **модульной архитектуры** с чётким разделением ответственности:

```
┌─────────────────────────────────────────────────────────┐
│                    Extension (Main)                      │
│  - Activation/Deactivation                               │
│  - Dependency Injection                                  │
│  - Command Registration                                  │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Services    │  │    Commands   │  │       UI      │
│  - Pipeline   │  │  - newTicket  │  │  - Sidebar    │
│  - Ticket     │  │  - moveTicket │  │  - Kanban     │
│  - FileWatch  │  │  - runPipeline│  │  - StatusBar  │
│  - Dependency │  │  - showStats  │  │  - CodeLens   │
└───────────────┘  └───────────────┘  └───────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Data Layer     │
                   │  - WorkflowStore│
                   │  - Types        │
                   └─────────────────┘
```

### Ключевые принципы

1. **Separation of Concerns** — каждый модуль отвечает за одну задачу
2. **Dependency Injection** — сервисы передаются через конструктор
3. **Event-Driven** — коммуникация через VS Code API events
4. **i18n-First** — все пользовательские строки через `t()` wrapper

## Структура проекта

```
workflow-vscode/
├── src/                          # Исходный код расширения
│   ├── commands/                 # Обработчики команд
│   │   ├── index.ts              # Экспорт всех команд
│   │   ├── new-ticket.ts         # Команда создания тикета
│   │   ├── move-ticket.ts        # Команда перемещения тикета
│   │   └── ...
│   ├── data/                     # Слой данных
│   │   ├── workflow-store.ts     # Работа с файловой системой
│   │   └── types.ts              # TypeScript типы
│   ├── services/                 # Бизнес-логика
│   │   ├── pipeline-service.ts   # Управление pipeline
│   │   ├── ticket-service.ts     # Операции с тикетами
│   │   ├── dependency-service.ts # Работа с зависимостями
│   │   ├── file-watcher-service.ts # Отслеживание файлов
│   │   ├── plan-service.ts       # Работа с планами
│   │   ├── report-service.ts     # Генерация отчётов
│   │   └── validation-service.ts # Валидация данных
│   ├── ui/                       # Пользовательский интерфейс
│   │   ├── sidebar-tree-provider.ts   # Sidebar TreeView
│   │   ├── kanban-tree-provider.ts    # Kanban Board
│   │   ├── pipeline-tree-provider.ts  # Pipeline Monitor
│   │   ├── status-bar.ts              # StatusBar
│   │   ├── notifications.ts           # Уведомления
│   │   ├── diagnostic-provider.ts     # Проблемы (Problems)
│   │   ├── document-link-provider.ts  # Клик-ссылки
│   │   ├── codelens-provider.ts       # CodeLens действия
│   │   ├── completion-provider.ts     # Авто-дополнение
│   │   └── hover-provider.ts          # Hover подсказки
│   ├── test/                     # Тесты
│   │   ├── unit/                 # Unit-тесты
│   │   └── e2e/                  # E2E-тесты
│   ├── extension.ts              # Точка входа
│   ├── extension.js.map          # Source maps
│   ├── i18n.ts                   # Интернационализация
│   └── error-handler.ts          # Обработка ошибок
├── l10n/                         # Локализация (bundle files)
│   ├── bundle.l10n.json          # English (base)
│   ├── bundle.l10n.ru.json       # Russian
│   ├── bundle.l10n.de.json       # German
│   └── ...
├── .workflow/                    # Workflow конфигурация проекта
│   ├── config/
│   │   ├── config.yaml           # Конфигурация проекта
│   │   └── pipeline.yaml         # Конфигурация pipeline
│   ├── plans/                    # Планы разработки
│   ├── tickets/                  # Тикеты (канбан-доска)
│   │   ├── backlog/
│   │   ├── ready/
│   │   ├── in-progress/
│   │   ├── blocked/
│   │   ├── review/
│   │   └── done/
│   ├── reports/                  # Отчёты
│   ├── src/skills/               # Инструкции для AI-агентов
│   └── templates/                # Шаблоны документов
├── package.json                  # Манифест расширения
├── package.nls.json              # Строки локализации (EN)
├── package.nls.ru.json           # Строки локализации (RU)
├── package.nls.de.json           # Строки локализации (DE)
├── ...
├── tsconfig.json                 # TypeScript конфигурация
├── esbuild.config.mjs            # Сборка через esbuild
└── eslint.config.mjs             # Линтер конфигурация
```

## Основные модули

### Extension (`src/extension.ts`)

Точка входа расширения. Отвечает за:

- Активацию расширения при старте VS Code
- Регистрацию всех провайдеров (TreeView, CodeLens, Diagnostics, etc.)
- Регистрацию команд
- Инициализацию сервисов (Pipeline, Ticket, FileWatcher, etc.)
- Инициализацию i18n и error handler

**Пример активации:**

```typescript
export function activate(context: vscode.ExtensionContext) {
  // Инициализация i18n
  onLocaleChanged();
  
  // Инициализация error handler
  initializeErrorHandler(context);
  
  // Создание сервисов
  const pipelineService = new PipelineService(context);
  const ticketService = new TicketService();
  
  // Регистрация провайдеров
  const ticketsProvider = new TicketsTreeProvider(context, ticketService);
  vscode.window.registerTreeDataProvider('workflow-sidebar.tickets', ticketsProvider);
  
  // Регистрация команд
  context.subscriptions.push(
    vscode.commands.registerCommand('workflow.newTicket', () => executeNewTicket(ticketService))
  );
}
```

### Services

#### PipelineService (`src/services/pipeline-service.ts`)

Управляет выполнением pipeline:

- Запуск/остановка pipeline
- Отслеживание состояния (Idle/Running)
- Парсинг вывода команд
- История выполнений (сохранение в `workspaceState`)

**Использование:**

```typescript
const pipelineService = new PipelineService(context);

// Запуск pipeline
await pipelineService.startPipeline();

// Остановка
await pipelineService.stopPipeline();

// Получение состояния
const state = pipelineService.getState(); // 'idle' | 'running'
```

#### TicketService (`src/services/ticket-service.ts`)

Операции с тикетами:

- Создание новых тикетов
- Перемещение между статусами
- Чтение/запись файлов тикетов
- Валидация frontmatter

**Использование:**

```typescript
const ticketService = new TicketService();

// Создание тикета
const ticket = await ticketService.createTicket({
  title: 'Новая задача',
  type: 'IMPL',
  priority: 2,
  status: 'backlog'
});

// Перемещение
await ticketService.moveTicket(ticket.id, 'in-progress');
```

### UI Providers

#### SidebarTreeProvider (`src/ui/sidebar-tree-provider.ts`)

Реализует 7 представлений в Sidebar:

- **Pipeline** — конфигурация и выполнение pipeline
- **Tickets** — дерево тикетов по статусам
- **Plans** — планы разработки
- **Reports** — отчёты
- **Skills** — AI skills
- **Logs** — логи pipeline
- **Welcome** — приветствие (если CLI не найден)

**Фильтрация по плану:**

```typescript
// Установка фильтра
ticketsProvider.setPlanFilter('PLAN-001');

// Очистка фильтра
ticketsProvider.clearPlanFilter();
```

#### KanbanTreeProvider (`src/ui/kanban-tree-provider.ts`)

Реализует 6 колонок Kanban-доски:

- Backlog, Ready, In Progress, Blocked, Review, Done

**Сортировка:**

```typescript
// Сортировка по приоритету
kanbanProvider.setSortMode('priority');

// Сортировка по ID
kanbanProvider.setSortMode('id');

// Сортировка по дате обновления
kanbanProvider.setSortMode('date');

// Направление сортировки
kanbanProvider.setSortAscending(true); // false для desc
```

## Как добавить новую локаль

### Шаг 1: Создать файлы локализации

1. **Создать `package.nls.<locale>.json`** в корне проекта:

```json
// package.nls.ru.json
{
  "extension.displayName": "Workflow AI",
  "extension.description": "Инструмент управления проектами",
  "command.newTicket.title": "Создать тикет",
  "command.moveTicket.title": "Переместить тикет"
}
```

2. **Создать `bundle.l10n.<locale>.json`** в папке `l10n/`:

```json
// l10n/bundle.l10n.ru.json
{
  "Create a new ticket": "Создать новый тикет",
  "Move ticket to next status": "Переместить тикет в следующий статус",
  "Pipeline started": "Pipeline запущен",
  "Ticket '{0}' created": "Тикет '{0}' создан"
}
```

### Шаг 2: Обновить `src/i18n.ts`

Добавить локаль в тип `Locale` и в маппинг файлов:

```typescript
export type Locale = 'auto' | 'en' | 'ru' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'zh' | 'ja' | 'ko' | 'pl';

// В функции loadBundle добавить:
const localeMap: Record<string, string> = {
  'ru': 'bundle.l10n.ru.json',
  'de': 'bundle.l10n.de.json',
  // ...
  'pl': 'bundle.l10n.pl.json',  // Новая локаль
};
```

### Шаг 3: Обновить `package.json`

Добавить локаль в `contributes.localizations`:

```json
"contributes": {
  "localizations": [
    {
      "languageId": "ru",
      "languageName": "Russian",
      "translations": [
        { "id": "package", "path": "package.nls.ru.json" }
      ]
    },
    {
      "languageId": "pl",
      "languageName": "Polish",
      "translations": [
        { "id": "package", "path": "package.nls.pl.json" }
      ]
    }
  ]
}
```

### Шаг 4: Запустить валидацию

```bash
npm run i18n:lint
```

Убедиться что все ключи синхронизированы, нет缺失ющих переводов.

## Как добавить новую команду

### Шаг 1: Объявить команду в `package.json`

```json
"contributes": {
  "commands": [
    {
      "command": "workflow.myNewCommand",
      "title": "%command.myNewCommand.title%",
      "icon": "$(plus)",
      "category": "Workflow"
    }
  ],
  "menus": {
    "view/title": [
      {
        "command": "workflow.myNewCommand",
        "when": "view == workflow-sidebar.tickets",
        "group": "navigation"
      }
    ]
  },
  "keybindings": [
    {
      "command": "workflow.myNewCommand",
      "key": "ctrl+shift+w x",
      "when": "workflow.cliInstalled && workflow.workflowFound"
    }
  ]
}
```

### Шаг 2: Добавить строки локализации

**package.nls.json:**

```json
{
  "command.myNewCommand.title": "My New Command",
  "command.myNewCommand.description": "Description of my new command"
}
```

**l10n/bundle.l10n.json:**

```json
{
  "My New Command": "My New Command",
  "Description of my new command": "Description of my new command"
}
```

### Шаг 3: Создать обработчик команды

**src/commands/my-command.ts:**

```typescript
import * as vscode from 'vscode';
import { t } from '../i18n';
import { TicketService } from '../services/ticket-service';

export async function executeMyCommand(ticketService: TicketService): Promise<void> {
  try {
    // Логика команды
    const result = await ticketService.doSomething();
    
    // Показать уведомление
    vscode.window.showInformationMessage(t('Command completed: {0}', result));
  } catch (error) {
    // Обработка ошибки
    vscode.window.showErrorMessage(t('Command failed: {0}', String(error)));
  }
}
```

### Шаг 4: Зарегистрировать команду в `src/extension.ts`

```typescript
import { executeMyCommand } from './commands/my-command';

export function activate(context: vscode.ExtensionContext) {
  // ...
  
  const ticketService = new TicketService();
  
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'workflow.myNewCommand',
      () => executeMyCommand(ticketService)
    )
  );
}
```

### Шаг 5: Экспортировать из `src/commands/index.ts`

```typescript
export { executeMyCommand } from './my-command';
```

## Как добавить новое представление

### Шаг 1: Создать TreeDataProvider

**src/ui/my-tree-provider.ts:**

```typescript
import * as vscode from 'vscode';

export class MyTreeProvider implements vscode.TreeDataProvider<MyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MyTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  async getChildren(element?: MyTreeItem): Promise<MyTreeItem[]> {
    if (!element) {
      // Корневые элементы
      return [
        new MyTreeItem('Item 1', vscode.TreeItemCollapsibleState.Collapsed),
        new MyTreeItem('Item 2', vscode.TreeItemCollapsibleState.None)
      ];
    }
    
    // Дочерние элементы
    return [
      new MyTreeItem('Child 1', vscode.TreeItemCollapsibleState.None)
    ];
  }

  getTreeItem(element: MyTreeItem): vscode.TreeItem {
    return element;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

class MyTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.tooltip = 'My tooltip';
    this.description = 'Description';
    this.iconPath = new vscode.ThemeIcon('file');
  }
}
```

### Шаг 2: Зарегистрировать представление в `package.json`

```json
"contributes": {
  "views": {
    "workflow-sidebar": [
      {
        "id": "workflow-sidebar.myview",
        "name": "%views.sidebar.myview.name%",
        "when": "workflow.cliInstalled && workflow.workflowFound",
        "icon": "$(file)",
        "contextualTitle": "My View"
      }
    ]
  },
  "viewsContainers": {
    "activitybar": [
      {
        "id": "workflow-sidebar",
        "title": "%views.activitybar.workflow.title%",
        "icon": "$(tasklist)"
      }
    ]
  }
}
```

### Шаг 3: Зарегистрировать провайдер в `src/extension.ts`

```typescript
import { MyTreeProvider } from './ui/my-tree-provider';

export function activate(context: vscode.ExtensionContext) {
  // ...
  
  const myProvider = new MyTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('workflow-sidebar.myview', myProvider)
  );
}
```

## Отладка расширения

### Запуск в режиме отладки

1. Откройте проект в VS Code
2. Перейдите на вкладку **Run and Debug** (`Ctrl+Shift+D`)
3. Выберите конфигурацию **Extension**
4. Нажмите `F5`

Откроется новое окно VS Code с загруженным расширением.

### Консоль отладки

Для просмотра логов:

1. В окне отладки откройте **View → Output**
2. Выберите канал **Workflow AI** в выпадающем списке

### Логирование

Используйте `OutputChannel` для логирования:

```typescript
const outputChannel = vscode.window.createOutputChannel('Workflow AI', 'log');

outputChannel.appendLine('[INFO] Starting pipeline...');
outputChannel.appendLine('[ERROR] ' + error.message);
```

### Отладка i18n

Для проверки что строки корректно локализуются:

1. Откройте `settings.json`
2. Установите `"workflow.locale": "ru"` (или другая локаль)
3. Перезагрузите окно (`Ctrl+Shift+P` → "Developer: Reload Window")

### Отладка TypeScript

Для просмотра source maps:

1. Убедитесь что `esbuild.config.mjs` генерирует `.map` файлы
2. В VS Code включите source maps в настройках отладки

## Сборка и публикация

### Сборка

```bash
# Development сборка
npm run build

# Production сборка (минификация)
npm run build:prod

# Watch mode (автоматическая пересборка)
npm run watch
```

### Тестирование

```bash
# Unit тесты
npm run test:unit

# E2E тесты
npm run test:e2e

# Все тесты
npm test

# Линтинг
npm run lint

# i18n валидация
npm run i18n:lint
```

### Упаковка

```bash
# Создать .vsix файл
npx vsce package

# Проверка перед публикацией
npx vsce ls
```

### Публикация

```bash
# Публикация
npx vsce publish

# Публикация конкретной версии
npx vsce publish 1.0.0

# Публикация как pre-release
npx vsce publish --pre-release
```

### Pre-release версия

Для тестирования новой версии:

1. Увеличьте версию в `package.json` (например, `0.1.1-alpha.1`)
2. Добавьте `"preRelease": true` в `package.json`
3. Запустите `npx vsce publish --pre-release`

---

## Дополнительные ресурсы

- [VS Code Extension API Documentation](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs)
- [Workflow CLI Documentation](https://github.com/workflow-ai/wf)
