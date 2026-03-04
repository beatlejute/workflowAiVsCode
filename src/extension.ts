import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

/**
 * Check if workflow CLI is installed on the system.
 * Uses platform-specific commands: 'which' on Unix, 'where' on Windows.
 * Falls back to configured cliPath if available.
 */
export async function checkCliInstalled(): Promise<boolean> {
  try {
    const platform = process.platform;
    const config = vscode.workspace.getConfiguration('workflow');
    const customCliPath = config.get<string>('cliPath', '');

    // Check custom path first if configured
    if (customCliPath) {
      try {
        await execAsync(`"${customCliPath}" --version`);
        return true;
      } catch {
        // Fall through to standard detection
      }
    }

    // Platform-specific detection
    if (platform === 'win32') {
      await execAsync('where workflow');
    } else {
      await execAsync('which workflow');
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if .workflow/ directory exists with required config files.
 * Verifies presence of config.yaml and pipeline.yaml.
 */
export function checkWorkflowDir(): boolean {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return false;
  }

  const workflowDir = path.join(workspaceRoot, '.workflow');
  const configPath = path.join(workflowDir, 'config.yaml');
  const pipelinePath = path.join(workflowDir, 'pipeline.yaml');

  try {
    const dirExists = fs.existsSync(workflowDir);
    const configExists = fs.existsSync(configPath);
    const pipelineExists = fs.existsSync(pipelinePath);

    return dirExists && configExists && pipelineExists;
  } catch {
    return false;
  }
}

/**
 * Set context key for VS Code UI conditional rendering.
 */
async function setContextKey(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand('setContext', key, value);
}

/**
 * Update all context keys based on current state.
 */
export async function updateContextKeys(): Promise<void> {
  const cliInstalled = await checkCliInstalled();
  const workflowFound = checkWorkflowDir();

  await setContextKey('workflow.cliInstalled', cliInstalled);
  await setContextKey('workflow.workflowFound', workflowFound);
}

/**
 * Install workflow-ai CLI globally.
 */
async function installCli(): Promise<void> {
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
        await updateContextKeys();
        vscode.window.showInformationMessage('workflow-ai CLI installed successfully!');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to install workflow-ai CLI: ${message}`);
      }
    }
  );
}

/**
 * Initialize workflow in the current workspace.
 */
async function initWorkflow(): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Initializing Workflow...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          throw new Error('No workspace folder open');
        }

        await execAsync('workflow init', { cwd: workspaceRoot });
        progress.report({ increment: 100 });
        await updateContextKeys();
        vscode.window.showInformationMessage('Workflow initialized successfully!');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to initialize workflow: ${message}`);
      }
    }
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const startTime = Date.now();
  console.log('Workflow AI extension is activating...');

  // Initialize context keys on activation
  await updateContextKeys();

  // Register commands
  const installCliCmd = vscode.commands.registerCommand('workflow.installCli', installCli);
  const initCmd = vscode.commands.registerCommand('workflow.init', initWorkflow);

  context.subscriptions.push(installCliCmd, initCmd);

  const activationTime = Date.now() - startTime;
  console.log(`Workflow AI extension activated in ${activationTime}ms`);
}

export function deactivate(): void {
  // Cleanup resources
}
