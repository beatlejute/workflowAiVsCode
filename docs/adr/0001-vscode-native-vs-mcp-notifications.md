# 0001: VS Code native vs MCP Notifications

## Context

В системе нотификации могут использоваться два подхода для доставки уведомлений пользователю:
- **VS Code native API** — встроенные уведомления VS Code с поддержкой action-кнопок
- **MCP PushNotification** — уведомления через workflow-mcp сервер (текст только)

Это architectural decision влияет на архитектуру extension и способ взаимодействия с пользователем.

## Considered Options

### Option A: VS Code native notifications + action buttons

**Pros:**
- Нативная интеграция с VS Code, looks and feels как обычные уведомления IDE
- Поддержка action-кнопок (кнопки действий прямо в нотификации)
- Прямой доступ к VS Code API без промежуточных слоёв
- Лучший UX для пользователей VS Code

**Cons:**
- Привязка к VS Code, нет кроссплатформенности
- Требует presence в extension process

### Option B: MCP notifications/message (text only)

**Pros:**
- Кроссплатформенный подход (работает через MCP)
- Уведомления могут приходить из любого MCP-совместимого источника
- Единый канал для всех AI-агентов

**Cons:**
- Только текст, нет action-кнопок
- Дополнительный слой (MCP) усложняет архитектуру
- Медленнее из-за MCP-коммуникации

## Decision

**Выбрано Option A: VS Code native notifications.**

Нотификации реализуются через VS Code native API с поддержкой action-кнопок. Extension напрямую читает `.workflow/` директорию через `WorkflowStore` и показывает нотификации, без необходимости отправлять их через MCP-слой.

## Consequences

### Positive
- Улучшенный UX: пользователи получают нативные VS Code уведомления с action-кнопками
- Упрощённая архитектура: extension работает с `.workflow/` напрямую через `WorkflowStore`
- Убран лишний MCP-слой для нотификаций, снижена сложность

### Negative
- Привязка к VS Code — нотификации не будут работать вне VS Code (что acceptable для этого проекта)
- Требуется, чтобы extension был active для показа нотификаций

### Risks
- Нужно корректно обрабатывать ошибки доступа к `.workflow/` при отсутствии extension
- Зависимость от стабильности VS Code API

---

*Связано с PLAN-025, задача 9.4*
