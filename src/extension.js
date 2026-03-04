"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCliInstalled = checkCliInstalled;
exports.checkWorkflowDir = checkWorkflowDir;
exports.updateContextKeys = updateContextKeys;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Check if workflow CLI is installed on the system.
 * Uses platform-specific commands: 'which' on Unix, 'where' on Windows.
 * Falls back to configured cliPath if available.
 */
async function checkCliInstalled() {
    try {
        const platform = process.platform;
        const config = vscode.workspace.getConfiguration('workflow');
        const customCliPath = config.get('cliPath', '');
        // Check custom path first if configured
        if (customCliPath) {
            try {
                await execAsync(`"${customCliPath}" --version`);
                return true;
            }
            catch {
                // Fall through to standard detection
            }
        }
        // Platform-specific detection
        if (platform === 'win32') {
            await execAsync('where workflow');
        }
        else {
            await execAsync('which workflow');
        }
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Check if .workflow/ directory exists with required config files.
 * Verifies presence of config.yaml and pipeline.yaml.
 */
function checkWorkflowDir() {
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
    }
    catch {
        return false;
    }
}
/**
 * Set context key for VS Code UI conditional rendering.
 */
async function setContextKey(key, value) {
    await vscode.commands.executeCommand('setContext', key, value);
}
/**
 * Update all context keys based on current state.
 */
async function updateContextKeys() {
    const cliInstalled = await checkCliInstalled();
    const workflowFound = checkWorkflowDir();
    await setContextKey('workflow.cliInstalled', cliInstalled);
    await setContextKey('workflow.workflowFound', workflowFound);
}
/**
 * Install workflow-ai CLI globally.
 */
async function installCli() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Installing workflow-ai CLI...',
        cancellable: false,
    }, async (progress) => {
        progress.report({ increment: 0 });
        try {
            await execAsync('npm install -g workflow-ai');
            progress.report({ increment: 100 });
            await updateContextKeys();
            vscode.window.showInformationMessage('workflow-ai CLI installed successfully!');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to install workflow-ai CLI: ${message}`);
        }
    });
}
/**
 * Initialize workflow in the current workspace.
 */
async function initWorkflow() {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Initializing Workflow...',
        cancellable: false,
    }, async (progress) => {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to initialize workflow: ${message}`);
        }
    });
}
async function activate(context) {
    console.log('Workflow AI extension is now active.');
    // Initialize context keys on activation
    await updateContextKeys();
    // Register commands
    const installCliCmd = vscode.commands.registerCommand('workflow.installCli', installCli);
    const initCmd = vscode.commands.registerCommand('workflow.init', initWorkflow);
    context.subscriptions.push(installCliCmd, initCmd);
}
function deactivate() {
    // Cleanup resources
}
//# sourceMappingURL=extension.js.map