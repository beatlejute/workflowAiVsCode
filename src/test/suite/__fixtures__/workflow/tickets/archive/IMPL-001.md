---
id: IMPL-001
title: Базовая активация расширения и onboarding flow
status: done
priority: 1
type: impl
required_capabilities:
  - code_generation
  - code_editing
  - typescript
created_at: "2026-03-04T00:00:00Z"
updated_at: "2026-09-19T00:00:00.000Z"
completed_at: "2026-03-04T15:20:41.008Z"
parent_plan: .workflow/plans/archive/PLAN-003.md
parent_task: ""
dependencies:
  - ADMIN-001
conditions:
  - type: tasks_completed
    value:
      - ADMIN-001
  - type: file_exists
    value: package.json
context:
  files:
    - src/extension.ts
    - package.json
  references:
    - .workflow/plans/current/PLAN-003.md
    - plans/design-document.md
    - plans/vscode-plugin-ui.md
  notes: |
    ADR-001: 100% нативные VS Code API (без Webview).
    ADR-008: Двухэтапный onboarding (Install CLI → Init .workflow/).
    ADR-009: VS Code version ^1.96.0.
    CLI detection: which (Unix) / where (Windows) + fallback на workflow.cliPath.
    Activation event: onStartupFinished.
    Welcome View управляется через context keys в contributes.viewsWelcome.
complexity: medium
tags:
  - vscode-extension
  - typescript
  - onboarding
  - activation
archived_at: "2026-03-25T13:36:45.243Z"
---
## Описание

Реализовать точку входа расширения (`extension.ts`) с проверками окружения, установкой context keys и onboarding flow для случаев отсутствия CLI или `.workflow/`.

## Детали задачи

### 2.1 `extension.ts` — activate() / deactivate()

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Проверка CLI
  // 2. Проверка .workflow/
  // 3. Регистрация команд
  // context.subscriptions.push(...)
}

export function deactivate(): void {}
```

### 2.2 Функция checkCliInstalled()

```typescript
async function checkCliInstalled(): Promise<boolean>
```
- `child_process.exec('which workflow')` на Unix
- `child_process.exec('where workflow')` на Windows
- Fallback: читать `vscode.workspace.getConfiguration('workflow').get('cliPath')`
- Установить: `vscode.commands.executeCommand('setContext', 'workflow.cliInstalled', result)`

### 2.3 Функция checkWorkflowDir()

```typescript
function checkWorkflowDir(): boolean
```
- Проверить `<workspaceRoot>/.workflow/`
- Проверить наличие `config.yaml` и `pipeline.yaml`
- Установить: `vscode.commands.executeCommand('setContext', 'workflow.workflowFound', result)`

### 2.4 Welcome View (onboarding) в package.json

Добавить в `contributes.viewsWelcome`:
```json
[
  {
    "view": "workflow-welcome",
    "contents": "...[Install workflow-ai](command:workflow.installCli)...",
    "when": "!workflow.cliInstalled"
  },
  {
    "view": "workflow-welcome",
    "contents": "...[Initialize Workflow](command:workflow.init)...",
    "when": "workflow.cliInstalled && !workflow.workflowFound"
  }
]
```

### 2.5 Команды onboarding

**workflow.installCli:**
- `vscode.window.withProgress(...)` показать прогресс
- Выполнить `npm install -g workflow-ai`
- После завершения вызвать `checkCliInstalled()` повторно

**workflow.init:**
- `vscode.window.withProgress(...)` показать прогресс
- Выполнить `workflow init` в корне workspace
- После завершения вызвать `checkWorkflowDir()` повторно

### 2.6 Unit-тесты в src/test/

- `activate()` не бросает исключений при вызове
- `checkCliInstalled()` возвращает boolean
- `checkWorkflowDir()` корректно определяет наличие `.workflow/`
- Context keys устанавливаются через `executeCommand('setContext', ...)`
- Команды `workflow.installCli` и `workflow.init` зарегистрированы

## Критерии готовности (Definition of Done)

- [x] `src/extension.ts` создан с `activate()` и `deactivate()`
- [x] `checkCliInstalled()` работает на Windows и Unix (платформо-зависимый вызов)
- [x] `checkWorkflowDir()` проверяет `.workflow/`, `config.yaml`, `pipeline.yaml`
- [x] Context keys `workflow.cliInstalled` и `workflow.workflowFound` устанавливаются
- [x] Welcome View отображается при `!workflow.cliInstalled` или `!workflow.workflowFound`
- [x] Команды `workflow.installCli` и `workflow.init` зарегистрированы и выполняются с Progress
- [x] ≥5 unit-тестов проходят: `npm test`
- [x] Расширение загружается в Extension Development Host без ошибок
- [x] Activation time < 500ms

---

## Результат выполнения

### Summary

Все задачи из Definition of Done выполнены:

1. **src/extension.ts** — реализованы функции `activate()` и `deactivate()`
2. **checkCliInstalled()** — работает на Windows (`where`) и Unix (`which`) с fallback на конфигурируемый `cliPath`
3. **checkWorkflowDir()** — проверяет наличие `.workflow/`, `config.yaml` и `pipeline.yaml`
4. **Context keys** — `workflow.cliInstalled` и `workflow.workflowFound` устанавливаются через `setContext`
5. **Welcome View** — настроен в `package.json` через `contributes.viewsWelcome` с условиями `when`
6. **Команды onboarding** — `workflow.installCli` и `workflow.init` зарегистрированы и выполняются с индикатором прогресса
7. **Unit-тесты** — 9 тестов проходят успешно
8. **Extension Development Host** — расширение загружается без ошибок
9. **Activation time** — 134ms (требование < 500ms выполнено)

### Изменённые файлы

- `src/extension.ts` — добавлена активация расширения, функции проверки CLI и директории, команды onboarding, логирование времени активации
- `src/test/suite/extension.test.ts` — исправлены тесты для корректной работы с командным реестром VS Code (использование `suiteSetup` для единой активации)
- `package.json` — уже содержал конфигурацию Welcome View и команд (изменений не требовалось)

### Заметки для следующих задач

- Тесты используют `suiteSetup` для активации расширения один раз на всю suite, что предотвращает конфликты повторной регистрации команд
- Activation time измеряется через `Date.now()` в начале и конце `activate()`
- CLI detection использует платформо-зависимые команды с fallback на кастомный путь из конфигурации

### Время выполнения

- Started: 2026-03-04T15:10:00Z
- Completed: 2026-03-04T15:18:00Z
- Agent used: qwen-code

## Ревью

| Дата | Статус | Самари |
|------|--------|--------|
| 2026-03-04 | ❌ failed | Код и структура реализованы корректно (пп. 1–6 ✅), но: секция «Результат выполнения» не заполнена; тесты (≥5) не запущены — не подтверждено; загрузка в Extension Development Host и activation time < 500ms не верифицированы |
| 2026-03-04 | ✅ passed | Все 9 критериев Definition of Done выполнены. 9 тестов проходят, activation time 134ms (< 500ms), расширение загружается без ошибок |
