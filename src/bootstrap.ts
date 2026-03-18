/**
 * Bootstrap - DI Container and application composition root
 *
 * Centralizes dependency graph construction and service initialization.
 * Implements manual DI without frameworks (ADR-010).
 *
 * ADR-010: Ручной DI без фреймворков. bootstrap.ts содержит граф зависимостей,
 * activate() делегирует конструирование. Порядок инициализации критичен.
 */

import * as vscode from 'vscode';
import { WorkflowStore } from './data/workflow-store';
import { TicketService } from './services/ticket-service';
import { FileWatcherService } from './services/file-watcher-service';
import { DependencyService } from './services/dependency-service';
import { PlanService } from './services/plan-service';
import { PipelineService } from './services/pipeline-service';
import { ReportService } from './services/report-service';
import { ValidationService } from './services/validation-service';
import { RecurringService } from './services/RecurringService';
import { RecurringScheduler } from './services/RecurringScheduler';
import { IRecurringService } from './services/IRecurringService';
import { ConfigManager } from './data/config-manager';
import { getWorkflowRoot } from './utils/path-utils';

/**
 * Container interface holding all application services
 */
export interface Container {
  store: WorkflowStore;
  ticketService: TicketService;
  fileWatcher?: FileWatcherService;
  dependencyService: DependencyService;
  planService: PlanService;
  pipelineService: PipelineService;
  reportService: ReportService;
  validationService: ValidationService;
  recurringService: IRecurringService;
  recurringScheduler: RecurringScheduler;
  workflowRoot: string | null;
  dispose(): void;
}

/**
 * Internal container state for disposal tracking
 */
interface ContainerState {
  store: WorkflowStore;
  ticketService: TicketService;
  fileWatcher?: FileWatcherService;
  dependencyService: DependencyService;
  planService: PlanService;
  pipelineService: PipelineService;
  reportService: ReportService;
  validationService: ValidationService;
  recurringService: IRecurringService;
  recurringScheduler: RecurringScheduler;
  workflowRoot: string | null;
  isDisposed: boolean;
}

/**
 * Create DI Container with all services
 *
 * Order of initialization is critical:
 * 1. WorkflowStore - base data layer
 * 2. Services depending on Store
 * 3. ConfigManager, RecurringService
 * 4. FileWatcherService - depends on Store and workflowRoot
 *
 * @param _context - VS Code extension context (not used directly, but passed for future extensions)
 * @returns Container with all initialized services
 */
export function createContainer(_context: vscode.ExtensionContext): Container {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let workflowRoot: string | null = null;

  if (workspaceRoot) {
    workflowRoot = getWorkflowRoot(workspaceRoot);
  }

  // 1. Create base store (no dependencies)
  const store = new WorkflowStore();

  // 2. Create services that depend only on Store
  const ticketService = new TicketService(store, workflowRoot || workspaceRoot || '');
  const dependencyService = new DependencyService(store);
  const planService = new PlanService(store, workflowRoot || workspaceRoot || '');
  const pipelineService = new PipelineService();
  const reportService = new ReportService(store, workflowRoot || workspaceRoot || '');
  const validationService = new ValidationService(store);

  // 3. Create ConfigManager and RecurringService
  const configManager = new ConfigManager();
  const recurringService = new RecurringService(
    store,
    ticketService,
    planService,
    configManager,
    workflowRoot || workspaceRoot || ''
  );

  // 4. Create RecurringScheduler
  const recurringScheduler = new RecurringScheduler(recurringService, store);

  // 5. Create FileWatcherService only if workflowRoot is available
  let fileWatcher: FileWatcherService | undefined;
  if (workflowRoot) {
    fileWatcher = new FileWatcherService(store, workflowRoot, recurringService);
  }

  // 5. Initialize store with workflow data
  if (workflowRoot) {
    store.refresh(workflowRoot).catch(err => {
      console.error('Bootstrap: Failed to refresh workflow store:', err);
    });
  }

  // Create container object with dispose method
  const containerState: ContainerState = {
    store,
    ticketService,
    fileWatcher,
    dependencyService,
    planService,
    pipelineService,
    reportService,
    validationService,
    recurringService,
    recurringScheduler,
    workflowRoot,
    isDisposed: false
  };

  return {
    store,
    ticketService,
    fileWatcher,
    dependencyService,
    planService,
    pipelineService,
    reportService,
    validationService,
    recurringService,
    recurringScheduler,
    workflowRoot,

    dispose(): void {
      if (containerState.isDisposed) {
        return;
      }

      containerState.isDisposed = true;

      // Dispose FileWatcherService first (it's a vscode.Disposable)
      if (containerState.fileWatcher) {
        containerState.fileWatcher.dispose();
      }

      // Dispose PipelineService (stops child processes, removes listeners)
      containerState.pipelineService.dispose();

      // Dispose RecurringService (removes event listeners)
      containerState.recurringService.dispose();

      // Dispose RecurringScheduler (stops interval)
      containerState.recurringScheduler.dispose();

      // Dispose Store (removes event listeners and disposes ConfigManager)
      containerState.store.dispose();
    }
  };
}
