/**
 * workflow.togglePlanTemplate command handler
 *
 * Toggles the enabled state of a plan template by modifying the frontmatter
 * in the template file, updating the Store, and refreshing the sidebar.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { safeLoad, safeDump } from '../utils/yaml-utils';
import { WorkflowStore } from '../data/workflow-store';
import { PlanTemplate } from '../data/types';
import { PlansTreeProvider } from '../ui/sidebar-tree-provider';
import { t } from '../i18n';

/**
 * Execute workflow.togglePlanTemplate command
 */
export async function executeTogglePlanTemplate(
  store: WorkflowStore,
  plansProvider: PlansTreeProvider,
  arg: unknown
): Promise<void> {
  const item = arg as { template?: PlanTemplate } | undefined;
  if (!item || !item.template) {
    vscode.window.showErrorMessage(t('No template provided'));
    return;
  }

  const template = item.template;
  const templateId = template.id;

  const wfRoot = store.getWorkflowRoot();
  if (!wfRoot) {
    vscode.window.showErrorMessage(t('Workflow root not available'));
    return;
  }

  const templatePath = path.join(wfRoot, 'plans', 'templates', `${templateId}.md`);
  if (!fs.existsSync(templatePath)) {
    vscode.window.showErrorMessage(t('Template file not found: {0}', templateId));
    return;
  }

  try {
    const content = fs.readFileSync(templatePath, 'utf-8');
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      vscode.window.showErrorMessage(t('Invalid template file format'));
      return;
    }

    const yamlContent = yamlMatch[1];
    const frontmatter = safeLoad(yamlContent) as Record<string, unknown>;
    const currentEnabled = frontmatter.enabled === true;
    frontmatter.enabled = !currentEnabled;

    const yamlUpdated = safeDump(frontmatter);
    const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yamlUpdated}---`);
    fs.writeFileSync(templatePath, newContent, 'utf-8');

    const updatedTemplate: PlanTemplate = {
      ...template,
      enabled: !currentEnabled
    };
    store.updatePlanTemplate(templateId, updatedTemplate);

    plansProvider.refresh();

    const status = !currentEnabled ? t('enabled') : t('disabled');
    vscode.window.showInformationMessage(t('Template {0} {1}', templateId, status));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Failed to toggle template: {0}', message));
    throw error;
  }
}
