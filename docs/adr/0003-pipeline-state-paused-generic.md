# 0003: Pipeline State Paused — Generic vs Separate Enum

## Context

При обработке human-gate (пауза для подтверждения) необходимо выбрать способ хранения состояния "ожидающего gate". Есть два подхода: использовать общий `PipelineState.Paused` с дополнительными полями для детализации, или создать отдельный enum для каждого типа gate.

## Considered Options

### Option A: Generic `PipelineState.Paused` + fields `currentManualGate`/`currentTicket`

Использовать общее состояние `Paused`, а детализацию о типе gate хранить в дополнительных полях.

**Pros:**
- Проще: только одно состояние вместо нескольких
- Единый источник истины для всех пауз
- Легче добавлять новые типы gates (не нужно新しい enum)
- Меньше кода и меньше состояний для тестирования

**Cons:**
- Менее type-safe: поля могут быть не заполнены для некоторых типов
- Может потребоваться дополнительные валидации

### Option B: Separate enum for each gate type

Создать отдельный enum value для каждого типа gate (`PausedAwaitingApproval`, `PausedAwaitingReview`, и т.д.).

**Pros:**
- Type safety: каждое состояние имеет явный тип
- Чёткая семантика без дополнительных полей

**Cons:**
- Усложняет архитектуру: каждый новый тип gate требует изменения enum
- Больше кода, больше состояний для поддержки
- Сложнее обобщённая обработка (нужен pattern matching на все варианты)

## Decision

**Выбрано Option A: Generic `PipelineState.Paused` + fields.**

Используем общее состояние `PipelineState.Paused` с полями `currentManualGate` (или аналогичным) для хранения деталей о gate. Это проще, поддерживает единый источник истины и позволяет легко добавлять новые типы gates без изменения core enum.

Option B (отдельный enum для каждого типа) отвергнут из-за излишней сложности и усложнения расширения.

## Consequences

### Positive
- Упрощённая архитектура: одно состояние `Paused` вместо десятков specialised
- Гибкость: добавление нового типа gate не требует изменения enum
- Единый код обработки пауз (не нужно switch на все варианты)

### Negative
- Нужно следить за корректностью заполнения полей `currentManualGate`/`currentTicket`
- Возможны ошибки, если поля не установлены должным образом

### Risks
- Рискulationstate: если поля ignored, система может поппасть в inconsistent state
- Требуется additional validation at-critical-points

---

*Связано с PLAN-025, задача 9.4*
