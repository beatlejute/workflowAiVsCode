import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

import { t } from '../i18n';
import { getWorkflowRoot, getPipelineConfigPath } from './path-utils';
import { PipelineService, PipelineState } from '../services/pipeline-service';
import { getErrorHandler } from '../error-handler';
import { sanitizeExecutablePath } from '../security/input-sanitizer';

const execAsync = promisify(exec);

export function resolveTicketId(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object') {
    const item = arg as Record<string, unknown>;
    if (item.ticket && typeof item.ticket === 'object') {
      const ticket = item.ticket as Record<string, unknown>;
      if (typeof ticket.id === 'string') {
        return ticket.id;
      }
    }
    if (typeof item.ticket === 'string') {
      return item.ticket;
    }
    if (typeof item.id === 'string') {
      return item.id;
    }
  }
  return undefined;
}

export function resolvePlanId(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object') {
    const item = arg as Record<string, unknown>;
    if (item.plan && typeof item.plan === 'object') {
      const plan = item.plan as Record<string, unknown>;
      if (typeof plan.id === 'string') {
        return plan.id;
      }
    }
    if (item.entry && typeof item.entry === 'object') {
      const entry = item.entry as Record<string, unknown>;
      if (typeof entry.planId === 'string') {
        return entry.planId;
      }
    }
    if (typeof item.id === 'string') {
      return item.id;
    }
  }
  return undefined;
}

export function resolveLogFile(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object') {
    const item = arg as Record<string, unknown>;
    if (item.entry && typeof item.entry === 'object') {
      const entry = item.entry as Record<string, unknown>;
      if (typeof entry.logFile === 'string') {
        return entry.logFile;
      }
    }
    if (typeof item.logFile === 'string') {
      return item.logFile;
    }
  }
  return undefined;
}

export function resolveReportPath(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object') {
    const item = arg as Record<string, unknown>;
    if (typeof item.reportPath === 'string') {
      return item.reportPath;
    }
    if (item.entry && typeof item.entry === 'object') {
      const entry = item.entry as Record<string, unknown>;
      if (entry.reports && Array.isArray(entry.reports) && entry.reports.length > 0) {
        const report = entry.reports[0] as Record<string, unknown>;
        if (typeof report.path === 'string') {
          return report.path;
        }
      }
    }
  }
  return undefined;
}

export async function checkCliInstalled(errorHandler?: ReturnType<typeof getErrorHandler>): Promise<boolean> {
  try {
    const platform = process.platform;
    const config = vscode.workspace.getConfiguration('workflow');
    const customCliPath = config.get<string>('cliPath', '');

    if (customCliPath) {
      try {
        const sanitizedPath = sanitizeExecutablePath(customCliPath);
        await execAsync(`"${sanitizedPath}" --version`);
        return true;
      } catch {
        // Fall through to standard detection
      }
    }

    if (platform === 'win32') {
      try {
        await execAsync('where workflow');
        return true;
      } catch {
        // fallthrough to workflow-ai
      }
      await execAsync('where workflow-ai');
    } else {
      try {
        await execAsync('which workflow');
        return true;
      } catch {
        // fallthrough to workflow-ai
      }
      await execAsync('which workflow-ai');
    }
    return true;
  } catch (error) {
    if (errorHandler) {
      errorHandler.debug('CLI installation check failed', { error: error instanceof Error ? error.message : String(error) });
    }
    return false;
  }
}

export function checkWorkflowDir(errorHandler?: ReturnType<typeof getErrorHandler>): boolean {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return false;
  }

  const workflowDir = getWorkflowRoot(workspaceRoot);
  const configPath = path.join(workflowDir, 'config', 'config.yaml');
  const pipelinePath = getPipelineConfigPath(workflowDir);

  try {
    const dirExists = fs.existsSync(workflowDir);
    const configExists = fs.existsSync(configPath);
    const pipelineExists = fs.existsSync(pipelinePath);

    return dirExists && configExists && pipelineExists;
  } catch (error) {
    if (errorHandler) {
      errorHandler.debug('Workflow directory check failed', { error: error instanceof Error ? error.message : String(error) });
    }
    return false;
  }
}

async function setContextKey(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', key, value);
}

export async function updateContextKeys(
  pipelineService?: PipelineService,
  errorHandler?: ReturnType<typeof getErrorHandler>
): Promise<void> {
  const cliInstalled = await checkCliInstalled(errorHandler);
  const workflowFound = checkWorkflowDir(errorHandler);
  const pipelineRunning = pipelineService?.getState() === PipelineState.Running;

  await setContextKey('workflow.cliInstalled', cliInstalled);
  await setContextKey('workflow.workflowFound', workflowFound);
  await setContextKey('workflow.pipelineRunning', pipelineRunning);
  await setContextKey('workflow.sortAscending', false);
}

export async function installCli(errorHandler?: ReturnType<typeof getErrorHandler>): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Installing workflow-ai CLI...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        await execAsync('npm install -g workflow-ai');
        progress.report({ increment: 100 });
        await updateContextKeys(undefined, errorHandler);
        vscode.window.showInformationMessage(t('workflow-ai CLI installed successfully!'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Install CLI', {
            userMessage: t('Failed to install workflow-ai CLI. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to install workflow-ai CLI: {0}', message));
        }
      }
    }
  );
}

export async function initWorkflow(errorHandler?: ReturnType<typeof getErrorHandler>): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('Initializing Workflow...'),
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          const open = t('Open Folder');
          const result = await vscode.window.showWarningMessage(
            t('Please open a folder first to initialize Workflow.'),
            open
          );
          if (result === open) {
            await vscode.commands.executeCommand('vscode.openFolder');
          }
          return;
        }

        try {
          await execAsync('workflow init', { cwd: workspaceRoot });
        } catch (err: unknown) {
          // Check if error has ENOENT code (command not found)
          const nodeErr = err as NodeJS.ErrnoException;
          if (nodeErr.code === 'ENOENT') {
            await execAsync('workflow-ai init', { cwd: workspaceRoot });
          } else {
            throw err;
          }
        }

        progress.report({ increment: 100 });
        await updateContextKeys(undefined, errorHandler);
        vscode.window.showInformationMessage(t('Workflow initialized successfully!'));
      } catch (error) {
        if (errorHandler) {
          errorHandler.handleError(error, 'Initialize Workflow', {
            userMessage: t('Failed to initialize workflow. Check Output channel for details.')
          });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          vscode.window.showErrorMessage(t('Failed to initialize workflow: {0}', message));
        }
      }
    }
  );
}
