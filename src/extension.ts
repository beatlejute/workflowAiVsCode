import * as vscode from 'vscode';
import { PipelineState } from './services/pipeline-service';
import { initializeErrorHandler } from './error-handler';
import { createContainer, type Container } from './bootstrap';
import { CommandRegistry } from './command-registry';
import { registerCommands, setWorkspaceRoot } from './command-registration';
import { createProviders, setupTreeViews, registerLanguageProviders, setupWorkflowRoot } from './ui/extension-setup';
import { checkCliInstalled, checkWorkflowDir, updateContextKeys } from './utils/extension-helpers';

export { checkCliInstalled, checkWorkflowDir, updateContextKeys };

let container: Container | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const startTime = Date.now();
  console.log('Workflow AI extension is activating...');

  const errorHandler = initializeErrorHandler();
  context.subscriptions.push(errorHandler);

  const registry = new CommandRegistry();
  context.subscriptions.push(registry);

  await vscode.commands.executeCommand('setContext', 'workflow.cliInstalled', false);
  await vscode.commands.executeCommand('setContext', 'workflow.workflowFound', false);
  await vscode.commands.executeCommand('setContext', 'workflow.pipelineRunning', false);
  await vscode.commands.executeCommand('setContext', 'workflow.sortAscending', false);

  container = createContainer(context);
  context.subscriptions.push(container);

  const { store, ticketService, planService, dependencyService, pipelineService, workflowRoot } = container;

  setWorkspaceRoot(workflowRoot ?? undefined);

  const providers = createProviders(store, pipelineService);
  
  setupWorkflowRoot(providers, pipelineService, workflowRoot ?? null, context, store);
  setupTreeViews(context, providers, pipelineService, store);
  registerLanguageProviders(context, store, workflowRoot ?? null);

  await vscode.commands.executeCommand('setContext', 'workflow.pipelineRunning', pipelineService.getState() === PipelineState.Running);

  registerCommands(
    context,
    registry,
    store,
    ticketService,
    planService,
    dependencyService,
    pipelineService,
    providers.pipeline,
    providers.tickets,
    providers.plans,
    providers.skills,
    providers.logs,
    providers.kanban,
    errorHandler
  );

  await updateContextKeys(pipelineService, errorHandler);

  console.log(`Workflow AI extension activated in ${Date.now() - startTime}ms`);
}

export function deactivate(): void {
  if (container) {
    container.dispose();
    container = undefined;
  }
}
