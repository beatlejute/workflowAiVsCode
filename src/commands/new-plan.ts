/**
 * workflow.newPlan command handler
 *
 * Creates a new plan via InputBox (title) → create file → open in editor
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import { PlanService } from '../services/plan-service';
import { getPlanPath } from '../utils/path-utils';

/**
 * Execute workflow.newPlan command
 */
export async function executeNewPlan(planService: PlanService): Promise<void> {
  // Get plan title
  const title = await vscode.window.showInputBox({
    prompt: t('Enter plan title'),
    placeHolder: t('e.g., Refactor authentication module'),
    title: t('Create New Plan'),
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return t('Title is required');
      }
      return undefined;
    }
  });

  if (!title) {
    return; // User cancelled
  }

  try {
    const plan = await planService.create(title);
    vscode.window.showInformationMessage(t('Created plan {0}: {1}', plan.id, plan.title));

    // Open the created plan file
    const workflowRoot = planService.getWorkflowRoot();
    const planPath = vscode.Uri.file(
      getPlanPath(workflowRoot, plan.id)
    );
    await vscode.commands.executeCommand('vscode.open', planPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Failed to create plan: {0}', message));
  }
}
