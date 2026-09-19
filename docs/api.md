# Workflow AI Extension - Public API Documentation

> **API Stability**: Stable starting from version 0.2.0
>
> **Versioning Policy**: All breaking changes to the public API will result in a major version bump (semver). The API is considered stable from 0.2.0 onwards. Internal APIs not explicitly documented here are marked as internal and may change without notice.

---

## Table of Contents

- [PipelineService](#pipelineservice)
  - [Events](#pipeline-service-events)
    - [onManualGateActivated](#onmanualgateactivated)
  - [Methods](#pipeline-service-methods)
- [PipelineState Enum](#pipelinestate-enum)
- [NotificationsManager](#notificationsmanager)
  - [Public Methods](#notificationsmanager-public-methods)
- [Type Exports](#type-exports)

---

## PipelineService

The `PipelineService` class manages workflow execution, providing lifecycle control, state tracking, and real-time event streaming for pipeline operations.

### Import

```typescript
import { PipelineService, PipelineState } from 'workflow-ai';
// or from the extension's TypeScript definitions:
import { PipelineService, PipelineState } from './services/pipeline-service';
```

### Construction

```typescript
const pipelineService = new PipelineService(spawnFn?);
```

**Parameters:**
- `spawnFn` (optional): A custom spawn function for dependency injection (primarily used in testing). Defaults to Node.js `child_process.spawn`.

### Pipeline Service Events

#### onManualGateActivated

Registers a listener that fires when a pipeline encounters a manual gate stage, allowing external systems to respond to human intervention requirements.

**Signature:**

```typescript
onManualGateActivated(listener: (data: { 
  stage: string | undefined; 
  ticketId: string | undefined 
}) => void): this
```

**Parameters:**
- `listener`: Callback function that receives an object containing:
  - `stage`: The stage name that triggered the manual gate (e.g., `'manual-gate-human'`, `'manual-gate-approval'`). May be `undefined`.
  - `ticketId`: The associated ticket ID requiring manual intervention. May be `undefined`.

**Returns:**
- Returns `this` (the PipelineService instance) for method chaining.

**Example Usage:**

```typescript
const pipelineService = new PipelineService();

// Subscribe to manual gate activation
const subscription = pipelineService.onManualGateActivated(({ stage, ticketId }) => {
  console.log(`Manual gate activated: ${stage}`);
  
  if (ticketId) {
    console.log(`Associated ticket: ${ticketId}`);
    // Open ticket for review, send notification, etc.
    vscode.commands.executeCommand('workflow.openTicket', ticketId);
  }
  
  if (stage === 'manual-gate-human') {
    // Show UI prompt for human intervention
    vscode.window.showInformationMessage(
      'Pipeline paused for manual review',
      'Open Ticket',
      'Resume'
    ).then(selection => {
      if (selection === 'Open Ticket' && ticketId) {
        // Handle ticket opening
      }
    });
  }
});

// Start pipeline execution
await pipelineService.start('PLAN-001');

// Clean up listener when done
subscription.removeAllListeners();
```

**Use Cases:**
- **Human-in-the-loop workflows**: Pause automation and request human review
- **Approval gates**: Require explicit approval before proceeding to production stages
- **Quality gates**: Manual QA verification points in CI/CD pipelines
- **Conditional execution**: Branch pipeline flow based on manual input

**Lifecycle Notes:**
- Listeners persist across pipeline runs unless explicitly removed
- Multiple listeners can be registered for the same event
- When a manual gate is exited (pipeline resumes), the pipeline state transitions from `Paused` back to `Running`
- Always clean up listeners in extension deactivation or component disposal to prevent memory leaks

**Unsubscribing:**

```typescript
// Remove specific listener
pipelineService.removeListener('manual-gate-activated', listenerFn);

// Remove all manual gate listeners
pipelineService.removeAllListeners('manual-gate-activated');
```

### Pipeline Service Methods

#### `setWorkflowRoot(root: string): void`

Sets the project root directory used as the working directory for spawned processes.

#### `getState(): PipelineState`

Returns the current pipeline execution state.

#### `getCurrentStage(): string | undefined`

Returns the name of the currently executing stage, or `undefined` if no stage is active.

#### `getCurrentAgent(): string | undefined`

Returns the ID of the currently executing agent, or `undefined`.

#### `getCurrentTicket(): string | undefined`

Returns the ID of the currently executing ticket, or `undefined`.

#### `getCurrentManualGateTicket(): string | undefined`

Returns the ticket ID associated with the current manual gate when the pipeline is paused, or `undefined`.

#### `getRetryCount(): number`

Returns the current retry count for the active stage.

#### `onStageChange(listener: StageChangeListener): this`

Registers a listener for stage transition events.

#### `onLog(listener: LogListener): this`

Registers a listener for pipeline log output.

#### `start(planId?: string): Promise<void>`

Starts pipeline execution. Optionally runs a specific plan by ID.

**Throws:**
- `Error` if pipeline is already running

#### `stop(): Promise<void>`

Stops pipeline execution gracefully (with force kill fallback on Windows).

#### `dispose(): void`

Disposes of all resources, stops the pipeline if running, and removes all listeners.

---

## PipelineState Enum

Represents the execution state of the pipeline. New in version 0.2.0: `Paused` state.

### Values

| Value | Description |
|-------|-------------|
| `Idle` | Pipeline is idle, not currently executing |
| `Running` | Pipeline is actively executing stages |
| `Paused` | Pipeline execution is paused at a manual gate, awaiting human intervention. **New in 0.2.0** |
| `Error` | Pipeline execution encountered an error and stopped |
| `Completed` | Pipeline execution completed successfully |

### Usage Example

```typescript
import { PipelineState } from 'workflow-ai';

// Monitor pipeline state
pipelineService.onStateChange((state) => {
  switch (state) {
    case PipelineState.Idle:
      console.log('Pipeline is idle');
      break;
      
    case PipelineState.Running:
      console.log('Pipeline started execution');
      break;
      
    case PipelineState.Paused:
      console.log('Pipeline paused at manual gate');
      // New in 0.2.0: Handle pause state
      showPauseUI();
      break;
      
    case PipelineState.Error:
      console.error('Pipeline execution failed');
      showErrorUI();
      break;
      
    case PipelineState.Completed:
      console.log('Pipeline completed successfully');
      showCompletionUI();
      break;
  }
});
```

### Manual Gate and Paused State Details

When the pipeline enters the `Paused` state:
1. A `manual-gate-activated` event is emitted with stage and ticket information
2. The `currentManualGate` property is set to the gate stage name
3. The `currentManualGateTicket` property is set to the associated ticket ID (if any)
4. Pipeline execution halts until resumed

To resume from a paused state:
- The pipeline automatically resumes when execution proceeds past a `manual-gate-*` stage (via `GOTO` transition)
- The state transitions back to `Running` automatically
- No manual intervention is required in code

---

## NotificationsManager

The `NotificationsManager` class provides VS Code user notifications for pipeline and ticket events. It shows toast notifications for important workflow events.

### Import

```typescript
import { NotificationsManager } from 'workflow-ai';
// or
import { NotificationsManager } from './ui/notifications';
```

### Construction

```typescript
const notificationsManager = new NotificationsManager(store, pipelineService);
notificationsManager.initialize();
```

**Parameters:**
- `store`: A `WorkflowStore` instance for tracking ticket state changes
- `pipelineService`: A `PipelineService` instance for monitoring pipeline events

### NotificationsManager Public Methods

#### `initialize(): void`

Subscribes to all events and initializes the ticket status cache. **Must be called after construction** to enable notifications.

#### `showHumanGatePendingNotification(ticketId?: string): void`

Shows a notification when a human gate requires manual intervention. Includes deduplication to prevent duplicate notifications within the same hour.

**Parameters:**
- `ticketId` (optional): The ID of the ticket requiring manual execution

**Example:**

```typescript
// This is typically called internally by PipelineService event handlers
notificationsManager.showHumanGatePendingNotification('QA-42');
// Shows: "Human-тикет QA-42 готов к ручному выполнению"
// Actions: [Open, Move to review]
```

#### `setWorkflowRoot(root: string | null): void`

Sets the workflow root directory for opening ticket and report files.

#### `dispose(): void`

Disposes of all notification resources and event listeners.

### Automatic Notifications

The `NotificationsManager` automatically shows notifications for:

1. **Ticket Completed** (transition to `Done`)
   - Type: Information message
   - Message: "Ticket {id} completed"
   - Action: "Open" - opens the ticket file

2. **Ticket Blocked** (transition to `Blocked`)
   - Type: Warning message
   - Message varies by block reason:
     - `max_review_attempts`: "Ticket {id} auto-blocked после {N} попыток review"
     - `human_gate_rejected`: "Human-тикет {id} отклонён (human_gate_rejected)"
     - `human_gate_timeout`: "Human-тикет {id} отклонён (human_gate_timeout)"
     - Default: "Ticket {id} is blocked"
   - Action: "Details" - opens the ticket file

3. **Pipeline Error**
   - Type: Error message
   - Message: "Pipeline error occurred"
   - Action: "View Log" - opens pipeline output

4. **Pipeline Completed**
   - Type: Information message
   - Message: "Pipeline completed successfully"
   - Action: "Report" - opens the latest report

### Internal Event Subscriptions

The `NotificationsManager` subscribes to the following events automatically when `initialize()` is called:

- `store.onDidChange` - Monitors ticket state transitions
- `pipelineService.onStateChange` - Monitors pipeline state changes
- `pipelineService.onManualGateActivated` - Monitors manual gate activations for `manual-gate-human` stages

### Cleanup

Always call `dispose()` when the `NotificationsManager` is no longer needed:

```typescript
notificationsManager.dispose();
```

---

## Versioning Policy

### Stability Guarantee

- **Public APIs** (documented in this file) are stable from version 0.2.0 onwards
- **Breaking changes** to public APIs will result in a major version bump (semver 1.0.0 → 2.0.0)
- **Minor version bumps** (1.0.0 → 1.1.0) may include:
  - New API additions (non-breaking)
  - New enum values (e.g., new `PipelineState` values)
  - New optional parameters
  - New events
- **Patch version bumps** (1.0.0 → 1.0.1) include:
  - Bug fixes
  - Internal implementation changes
  - No API changes

### Internal vs. Public API

**Public APIs** (stable):
- `PipelineService` class (documented methods and events)
- `PipelineState` enum
- `NotificationsManager` class (documented methods)
- Exported types explicitly documented in this file

**Internal APIs** (may change without notice):
- Any class, interface, or type not documented in this file
- Private methods on public classes (prefixed with `_` or not documented)
- Internal event names not explicitly documented
- Implementation details in `src/` not covered by this documentation

**Example of internal (unstable) usage:**

```typescript
//  ❌ INTERNAL - May change without notice
import { PipelineLogParser } from 'workflow-ai/src/services/pipeline-log-parser';
const parser = new PipelineLogParser(); // Not guaranteed stable

// ✅ PUBLIC - Stable API
import { PipelineService, PipelineState } from 'workflow-ai';
const service = new PipelineService();
service.onStateChange((state) => {
  if (state === PipelineState.Paused) {
    // Safe to use - part of public API
  }
});
```

### Migration Guide

**Upgrading to 0.2.0 from 0.1.x:**

1. **New `Paused` state**: The `PipelineState` enum now includes `Paused`. Update any state handling logic:

```typescript
// Before 0.2.0
if (state === PipelineState.Running || state === PipelineState.Idle) {
  // ...
}

// After 0.2.0 - handle Paused state
if (state === PipelineState.Running || state === PipelineState.Idle || state === PipelineState.Paused) {
  // ...
}
```

2. **New `onManualGateActivated` event**: A new event is emitted for manual gates. No breaking changes.

3. **Manual gate properties**: New `currentManualGate` and `currentManualGateTicket` properties on `PipelineService`.

---

## Type Exports

### ParsedLogEntry

```typescript
interface ParsedLogEntry {
  type: 'goto' | 'start' | 'info' | 'ctx' | 'raw';
  raw: string;
  stage?: string;
  fromStage?: string;
  agent?: string;
  ticket?: string;
  elapsed?: string;
  retry?: number;
  maxAttempts?: number;
  timestamp?: string;
  skill?: string;
}
```

### Event Listener Types

```typescript
type StateChangeListener = (state: PipelineState) => void;
type LogListener = (log: string) => void;
type StageChangeListener = (stage: string | undefined) => void;
```

### Ticket Types

See [Ticket Status](#ticketstatus-enum) for available status values.

---

## License

This documentation covers the public API of the Workflow AI VS Code Extension. The extension itself is licensed under the project's terms.

---

## Support

For issues, questions, or contributions:
- File issues on the project's issue tracker
- Review the CHANGELOG.md for recent changes
- See CONTRIBUTING.md for development guidelines