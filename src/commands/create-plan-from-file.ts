/**
 * Command handler for workflow.createPlanFromFile
 *
 * Creates a workflow plan from a plan markdown file.
 * - If URI is provided (from CodeLens), uses it directly
 * - If URI is undefined (from Command Palette), shows QuickPick of plan files
 * - Opens terminal with agent command to create the plan
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { safeLoad } from '../utils/yaml-utils';
import { getPipelineConfigPath, getPlanPath } from '../utils/path-utils';
import { WorkflowStore } from '../data/workflow-store';
import { t } from '../i18n';

/**
 * Execute workflow.createPlanFromFile command
 * 
 * @param store - Workflow store instance
 * @param uri - Optional URI of the plan file (from CodeLens)
 * @param workspaceRoot - Workspace root path
 */
export async function executeCreatePlanFromFile(
  store: WorkflowStore,
  uri: vscode.Uri | undefined,
  workspaceRoot: string | null
): Promise<void> {
  try {
    let planUri = uri;

    // Если uri не передан (вызов из Command Palette), показать QuickPick файлов планов
    if (!planUri) {
      if (!workspaceRoot) {
        vscode.window.showErrorMessage(t('Workflow root not available'));
        return;
      }
      const plans = store.getPlans().filter(p => p.folder === 'current');
      if (plans.length === 0) {
        vscode.window.showInformationMessage(t('No current plans available'));
        return;
      }
      plans.sort((a, b) => a.id.localeCompare(b.id));
      const picked = await vscode.window.showQuickPick(
        plans.map(p => {
          const planPath = getPlanPath(workspaceRoot!, p.id);
          return {
            label: p.id,
            description: p.title,
            planId: p.id,
            uri: vscode.Uri.file(planPath)
          };
        }),
        { placeHolder: t('Select plan to create workflow plan from') }
      );
      if (!picked) {
        return;
      }
      planUri = picked.uri;
    }

    if (!workspaceRoot) {
      vscode.window.showErrorMessage(t('Workflow root not available'));
      return;
    }

    // Проверка существования файла плана
    const planPath = planUri.fsPath;
    if (!fs.existsSync(planPath)) {
      vscode.window.showErrorMessage(t('Plan file not found: {0}', planPath));
      return;
    }

    // Получить default_agent из pipeline.yaml
    const pipelinePath = getPipelineConfigPath(workspaceRoot);
    if (!fs.existsSync(pipelinePath)) {
      vscode.window.showErrorMessage(t('Pipeline config not found: {0}', pipelinePath));
      return;
    }
    const pipelineContent = fs.readFileSync(pipelinePath, 'utf-8');
    const pipelineData = safeLoad(pipelineContent) as { pipeline?: { default_agent?: string; agents?: Record<string, { command: string; args: string[]; workdir?: string }> } };
    const defaultAgentId = pipelineData?.pipeline?.default_agent;
    const agent = defaultAgentId ? pipelineData?.pipeline?.agents?.[defaultAgentId] : undefined;
    if (!agent) {
      vscode.window.showErrorMessage(t('Default agent not configured in pipeline.yaml'));
      return;
    }

    // Извлечь planId из URI
    const planId = path.basename(planPath, '.md');
    const prompt = `create-plan Context: plan_id=${planId}`;

    const agentArgs = agent.args.map((a: string) => `"${a}"`).join(' ');
    const agentCommand = `${agent.command} ${agentArgs} "${prompt}"`;

    const terminalEnv: Record<string, string | null> = { CLAUDECODE: null };

    const terminal = vscode.window.createTerminal({
      name: `Create Plan ${planId}`,
      cwd: workspaceRoot,
      env: terminalEnv
    });
    terminal.show();

    terminal.sendText(agentCommand);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Failed to create plan from file: {0}', message));
  }
}
