"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  checkCliInstalled: () => checkCliInstalled,
  checkWorkflowDir: () => checkWorkflowDir,
  deactivate: () => deactivate,
  updateContextKeys: () => updateContextKeys
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var import_child_process = require("child_process");
var import_util = require("util");
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var execAsync = (0, import_util.promisify)(import_child_process.exec);
async function checkCliInstalled() {
  try {
    const platform = process.platform;
    const config = vscode.workspace.getConfiguration("workflow");
    const customCliPath = config.get("cliPath", "");
    if (customCliPath) {
      try {
        await execAsync(`"${customCliPath}" --version`);
        return true;
      } catch {
      }
    }
    if (platform === "win32") {
      await execAsync("where workflow");
    } else {
      await execAsync("which workflow");
    }
    return true;
  } catch {
    return false;
  }
}
function checkWorkflowDir() {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return false;
  }
  const workflowDir = path.join(workspaceRoot, ".workflow");
  const configPath = path.join(workflowDir, "config.yaml");
  const pipelinePath = path.join(workflowDir, "pipeline.yaml");
  try {
    const dirExists = fs.existsSync(workflowDir);
    const configExists = fs.existsSync(configPath);
    const pipelineExists = fs.existsSync(pipelinePath);
    return dirExists && configExists && pipelineExists;
  } catch {
    return false;
  }
}
async function setContextKey(key, value) {
  await vscode.commands.executeCommand("setContext", key, value);
}
async function updateContextKeys() {
  const cliInstalled = await checkCliInstalled();
  const workflowFound = checkWorkflowDir();
  await setContextKey("workflow.cliInstalled", cliInstalled);
  await setContextKey("workflow.workflowFound", workflowFound);
}
async function installCli() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing workflow-ai CLI...",
      cancellable: false
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        await execAsync("npm install -g workflow-ai");
        progress.report({ increment: 100 });
        await updateContextKeys();
        vscode.window.showInformationMessage("workflow-ai CLI installed successfully!");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(`Failed to install workflow-ai CLI: ${message}`);
      }
    }
  );
}
async function initWorkflow() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Initializing Workflow...",
      cancellable: false
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          throw new Error("No workspace folder open");
        }
        await execAsync("workflow init", { cwd: workspaceRoot });
        progress.report({ increment: 100 });
        await updateContextKeys();
        vscode.window.showInformationMessage("Workflow initialized successfully!");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(`Failed to initialize workflow: ${message}`);
      }
    }
  );
}
async function activate(context) {
  const startTime = Date.now();
  console.log("Workflow AI extension is activating...");
  await updateContextKeys();
  const installCliCmd = vscode.commands.registerCommand("workflow.installCli", installCli);
  const initCmd = vscode.commands.registerCommand("workflow.init", initWorkflow);
  context.subscriptions.push(installCliCmd, initCmd);
  const activationTime = Date.now() - startTime;
  console.log(`Workflow AI extension activated in ${activationTime}ms`);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  checkCliInstalled,
  checkWorkflowDir,
  deactivate,
  updateContextKeys
});
//# sourceMappingURL=extension.js.map
