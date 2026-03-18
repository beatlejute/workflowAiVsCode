/**
 * workflow.recurring.* command handlers
 *
 * Commands for managing recurring definitions:
 * - workflow.recurring.new: Create new recurring definition
 * - workflow.recurring.toggle: Enable/disable definition
 * - workflow.recurring.delete: Delete definition
 * - workflow.recurring.triggerNow: Manually trigger definition now
 * - workflow.recurring.openConfig: Open recurring.yaml in editor
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { t } from '../i18n';
import { IRecurringService } from '../services/IRecurringService';
import { RecurringDefinition } from '../data/types';

/**
 * Execute workflow.recurring.new command
 * Creates a new recurring definition via input boxes
 */
export async function executeRecurringNew(
  recurringService: IRecurringService,
  workflowRoot: string | null
): Promise<void> {
  if (!workflowRoot) {
    vscode.window.showErrorMessage(t('Workflow not found'));
    return;
  }

  // Get definition ID
  const id = await vscode.window.showInputBox({
    prompt: t('Enter recurring definition ID (e.g., REC-001)'),
    placeHolder: 'REC-001',
    title: t('Create Recurring Definition'),
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return t('ID is required');
      }
      if (!/^[A-Z0-9_-]+$/i.test(value)) {
        return t('ID can only contain letters, numbers, hyphens and underscores');
      }
      return undefined;
    }
  });

  if (!id) {
    return; // User cancelled
  }

  // Get definition name
  const name = await vscode.window.showInputBox({
    prompt: t('Enter definition name'),
    placeHolder: t('e.g., Daily Standup'),
    title: t('Create Recurring Definition'),
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return t('Name is required');
      }
      return undefined;
    }
  });

  if (!name) {
    return; // User cancelled
  }

  // Get entity type
  const entityType = await vscode.window.showQuickPick(
    [
      { label: 'ticket', description: t('Create tickets') },
      { label: 'plan', description: t('Create plans') }
    ],
    {
      placeHolder: t('Select entity type'),
      title: t('Create Recurring Definition')
    }
  );

  if (!entityType) {
    return; // User cancelled
  }

  // Get trigger type
  const triggerType = await vscode.window.showQuickPick(
    [
      { label: 'cron', description: t('Schedule-based trigger') },
      { label: 'on-completion', description: t('Trigger when previous instance completes') }
    ],
    {
      placeHolder: t('Select trigger type'),
      title: t('Create Recurring Definition')
    }
  );

  if (!triggerType) {
    return; // User cancelled
  }

  // Get trigger expression based on type
  let triggerExpression: string;
  if (triggerType.label === 'cron') {
    const expression = await vscode.window.showInputBox({
      prompt: t('Enter cron expression (e.g., 0 0 * * * for daily)'),
      placeHolder: '0 0 * * *',
      title: t('Create Recurring Definition'),
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return t('Cron expression is required');
        }
        return undefined;
      }
    });

    if (!expression) {
      return; // User cancelled
    }
    triggerExpression = expression;
  } else {
    triggerExpression = '';
  }

  // Get title template
  const titleTemplate = await vscode.window.showInputBox({
    prompt: t('Enter title template (use {date}, {n}, {trigger_value} as variables)'),
    placeHolder: entityType.label === 'ticket' ? t('Daily Task {date} #{n}') : t('Weekly Plan {n}'),
    title: t('Create Recurring Definition'),
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return t('Title template is required');
      }
      return undefined;
    }
  });

  if (!titleTemplate) {
    return; // User cancelled
  }

  // Create definition object
  const definition: RecurringDefinition = {
    id,
    name,
    enabled: true,
    entity_type: entityType.label as 'ticket' | 'plan',
    trigger: triggerType.label === 'cron'
      ? { type: 'cron', expression: triggerExpression }
      : { type: 'on-completion' },
    template: {
      type: entityType.label === 'ticket' ? 'task' : 'plan',
      title_template: titleTemplate
    },
    state: {
      last_triggered_at: null,
      next_trigger_at: null,
      instance_count: 0,
      last_instance_id: null,
      is_active_instance: false
    }
  };

  // Load existing definitions and add new one
  const definitions = await recurringService.loadDefinitions();
  definitions.push(definition);
  await recurringService.saveDefinitions(definitions);

  vscode.window.showInformationMessage(
    t('Created recurring definition {0}: {1}', id, name)
  );

  // Offer to open config file
  const openConfig = await vscode.window.showInformationMessage(
    t('Recurring definition created'),
    { modal: true },
    t('Open Config'),
    t('Cancel')
  );

  if (openConfig === t('Open Config')) {
    await executeRecurringOpenConfig(workflowRoot);
  }
}

/**
 * Execute workflow.recurring.toggle command
 * Enables or disables a recurring definition
 */
export async function executeRecurringToggle(
  recurringService: IRecurringService,
  definitionId?: string
): Promise<void> {
  const definitions = await recurringService.loadDefinitions();

  if (definitions.length === 0) {
    vscode.window.showWarningMessage(t('No recurring definitions found'));
    return;
  }

  // Get definition ID if not provided
  if (!definitionId) {
    const selected = await vscode.window.showQuickPick(
      definitions.map(def => ({
        label: def.id,
        description: def.name,
        detail: def.enabled ? t('Enabled') : t('Disabled')
      })),
      {
        placeHolder: t('Select recurring definition to toggle'),
        title: t('Toggle Recurring Definition')
      }
    );

    if (!selected) {
      return; // User cancelled
    }

    definitionId = selected.label;
  }

  const definition = definitions.find(d => d.id === definitionId);
  if (!definition) {
    vscode.window.showErrorMessage(t('Definition {0} not found', definitionId));
    return;
  }

  if (definition.enabled) {
    await recurringService.disableDefinition(definitionId);
    vscode.window.showInformationMessage(
      t('Disabled recurring definition {0}', definitionId)
    );
  } else {
    await recurringService.enableDefinition(definitionId);
    vscode.window.showInformationMessage(
      t('Enabled recurring definition {0}', definitionId)
    );
  }
}

/**
 * Execute workflow.recurring.delete command
 * Deletes a recurring definition
 */
export async function executeRecurringDelete(
  recurringService: IRecurringService,
  definitionId?: string
): Promise<void> {
  const definitions = await recurringService.loadDefinitions();

  if (definitions.length === 0) {
    vscode.window.showWarningMessage(t('No recurring definitions found'));
    return;
  }

  // Get definition ID if not provided
  if (!definitionId) {
    const selected = await vscode.window.showQuickPick(
      definitions.map(def => ({
        label: def.id,
        description: def.name,
        detail: def.enabled ? t('Enabled') : t('Disabled')
      })),
      {
        placeHolder: t('Select recurring definition to delete'),
        title: t('Delete Recurring Definition')
      }
    );

    if (!selected) {
      return; // User cancelled
    }

    definitionId = selected.label;
  }

  const definition = definitions.find(d => d.id === definitionId);
  if (!definition) {
    vscode.window.showErrorMessage(t('Definition {0} not found', definitionId));
    return;
  }

  // Confirm deletion
  const confirm = await vscode.window.showWarningMessage(
    t('Are you sure you want to delete recurring definition {0}?', definitionId),
    { modal: true },
    t('Delete'),
    t('Cancel')
  );

  if (confirm !== t('Delete')) {
    return; // User cancelled
  }

  await recurringService.deleteDefinition(definitionId);

  vscode.window.showInformationMessage(
    t('Deleted recurring definition {0}', definitionId)
  );
}

/**
 * Execute workflow.recurring.triggerNow command
 * Manually triggers a recurring definition immediately
 */
export async function executeRecurringTriggerNow(
  recurringService: IRecurringService,
  definitionId?: string
): Promise<void> {
  const definitions = await recurringService.loadDefinitions();

  if (definitions.length === 0) {
    vscode.window.showWarningMessage(t('No recurring definitions found'));
    return;
  }

  // Get definition ID if not provided
  if (!definitionId) {
    const selected = await vscode.window.showQuickPick(
      definitions
        .filter(def => def.enabled)
        .map(def => ({
          label: def.id,
          description: def.name,
          detail: def.trigger.type === 'cron' ? def.trigger.expression : t('On completion')
        })),
      {
        placeHolder: t('Select recurring definition to trigger'),
        title: t('Trigger Recurring Now')
      }
    );

    if (!selected) {
      return; // User cancelled
    }

    definitionId = selected.label;
  }

  const definition = definitions.find(d => d.id === definitionId);
  if (!definition) {
    vscode.window.showErrorMessage(t('Definition {0} not found', definitionId));
    return;
  }

  if (!definition.enabled) {
    vscode.window.showWarningMessage(
      t('Definition {0} is disabled. Enable it first.', definitionId)
    );
    return;
  }

  try {
    const instance = await recurringService.createInstance(definitionId);
    vscode.window.showInformationMessage(
      t('Created {0}: {1}', definition.entity_type, instance.title)
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(
      t('Failed to trigger definition {0}: {1}', definitionId, message)
    );
  }
}

/**
 * Execute workflow.recurring.openConfig command
 * Opens the recurring.yaml config file in the editor
 */
export async function executeRecurringOpenConfig(
  workflowRoot: string | null
): Promise<void> {
  if (!workflowRoot) {
    vscode.window.showErrorMessage(t('Workflow not found'));
    return;
  }

  const configPath = path.join(workflowRoot, '.workflow', 'config', 'recurring.yaml');
  const uri = vscode.Uri.file(configPath);

  try {
    // Check if file exists, create if not
    try {
      await fs.access(configPath);
    } catch {
      // File doesn't exist, create with template
      const template = `# Recurring Definitions Configuration
# See documentation for full details on triggers and templates

definitions:
  # Example: Daily standup ticket
  # - id: REC-001
  #   name: Daily Standup
  #   enabled: true
  #   entity_type: ticket
  #   trigger:
  #     type: cron
  #     expression: "0 9 * * 1-5"  # 9 AM on weekdays
  #   template:
  #     type: task
  #     title_template: "Standup {date}"
  #     priority: 2
  #     tags: [daily, standup]
  #   state:
  #     last_triggered_at: null
  #     next_trigger_at: null
  #     instance_count: 0
  #     last_instance_id: null
  #     is_active_instance: false

  # Example: Weekly review (on-completion trigger)
  # - id: REC-002
  #   name: Weekly Review
  #   enabled: false
  #   entity_type: ticket
  #   trigger:
  #     type: on-completion
  #   template:
  #     type: task
  #     title_template: "Weekly Review #{n}"
  #     body_template: "Review completed tasks and plan next week."
  #   state:
  #     last_triggered_at: null
  #     next_trigger_at: null
  #     instance_count: 0
  #     last_instance_id: null
  #     is_active_instance: false

  # Example: Monthly plan
  # - id: REC-003
  #   name: Monthly Plan
  #   enabled: false
  #   entity_type: plan
  #   trigger:
  #     type: cron
  #     expression: "0 0 1 * *"  # First day of month
  #   template:
  #     type: plan
  #     title_template: "Monthly Plan {date}"
  #     status: draft
  #   state:
  #     last_triggered_at: null
  #     next_trigger_at: null
  #     instance_count: 0
  #     last_instance_id: null
  #     is_active_instance: false
`;
      const dirPath = path.dirname(configPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(configPath, template, 'utf-8');
    }

    await vscode.commands.executeCommand('vscode.open', uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(t('Failed to open recurring config: {0}', message));
  }
}
