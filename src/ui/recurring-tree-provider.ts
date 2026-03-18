import * as vscode from 'vscode';
import { t } from '../i18n';
import { RecurringDefinition, CronTrigger, EventTrigger } from '../data/types';
import { IRecurringService } from '../services/IRecurringService';

export class RecurringTreeItem extends vscode.TreeItem {
  constructor(
    public readonly definition: RecurringDefinition,
    public readonly workflowRoot: string
  ) {
    const statusLabel = definition.enabled ? t('Enabled') : t('Disabled');
    const triggerInfo = getTriggerInfo(definition);
    const instanceCountLabel = `↻ ${definition.state.instance_count}`;

    super(
      definition.name,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = `${statusLabel} ${triggerInfo} ${instanceCountLabel}`;
    this.iconPath = definition.enabled
      ? new vscode.ThemeIcon('sync')
      : new vscode.ThemeIcon('sync-ignored');
    this.contextValue = 'recurring-definition';
    this.tooltip = this.buildTooltip();
  }

  private buildTooltip(): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    const def = this.definition;

    tooltip.appendMarkdown(`**${def.name}**\n\n`);
    tooltip.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
    tooltip.appendMarkdown(`|-------|-------|\n`);
    tooltip.appendMarkdown(`| **ID** | ${def.id} |\n`);
    tooltip.appendMarkdown(`| **${t('Status')}** | ${def.enabled ? t('Enabled') : t('Disabled')} |\n`);
    tooltip.appendMarkdown(`| **${t('Entity Type')}** | ${def.entity_type} |\n`);
    tooltip.appendMarkdown(`| **${t('Trigger Type')}** | ${def.trigger.type} |\n`);

    if (def.trigger.type === 'cron') {
      const cronTrigger = def.trigger as CronTrigger;
      tooltip.appendMarkdown(`| **${t('Cron Expression')}** | ${cronTrigger.expression} |\n`);
    } else if (def.trigger.type === 'event') {
      const eventTrigger = def.trigger as EventTrigger;
      tooltip.appendMarkdown(`| **${t('Event Type')}** | ${eventTrigger.event} |\n`);
      if (eventTrigger.pattern) {
        tooltip.appendMarkdown(`| **${t('Pattern')}** | ${eventTrigger.pattern} |\n`);
      }
    }

    if (def.state.last_triggered_at) {
      tooltip.appendMarkdown(`| **${t('Last Triggered')}** | ${formatDate(def.state.last_triggered_at)} |\n`);
    }

    if (def.state.next_trigger_at && def.trigger.type === 'cron') {
      tooltip.appendMarkdown(`| **${t('Next Trigger')}** | ${formatDate(def.state.next_trigger_at)} |\n`);
    }

    tooltip.appendMarkdown(`| **${t('Instance Count')}** | ${def.state.instance_count} |\n`);

    if (def.state.last_instance_id) {
      tooltip.appendMarkdown(`| **${t('Last Instance')}** | ${def.state.last_instance_id} |\n`);
    }

    return tooltip;
  }
}

function getTriggerInfo(def: RecurringDefinition): string {
  const triggerType = def.trigger.type;
  if (triggerType === 'cron') {
    return (def.trigger as CronTrigger).expression;
  } else if (triggerType === 'on-completion') {
    return t('on-completion');
  } else if (triggerType === 'event') {
    return (def.trigger as EventTrigger).event;
  }
  return triggerType;
}

function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString();
  } catch {
    return isoDate;
  }
}

export class RecurringTreeProvider implements vscode.TreeDataProvider<RecurringTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<RecurringTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<RecurringTreeItem | undefined> = this._onDidChangeTreeData.event;

  private workflowRoot: string | null = null;
  private definitions: RecurringDefinition[] = [];
  private recurringService: IRecurringService | null = null;
  private reloadListener: vscode.Disposable | null = null;

  constructor() {}

  setRecurringService(service: IRecurringService): void {
    this.recurringService = service;
  }

  async loadDefinitions(): Promise<void> {
    if (!this.recurringService) {
      return;
    }

    try {
      this.definitions = await this.recurringService.loadDefinitions();
      this.refresh();
    } catch (error) {
      console.error('RecurringTreeProvider: Failed to load definitions:', error);
      this.definitions = [];
      this.refresh();
    }
  }

  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
    this.loadDefinitions();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    if (this.reloadListener) {
      this.reloadListener.dispose();
    }
  }

  getTreeItem(element: RecurringTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RecurringTreeItem): Promise<RecurringTreeItem[]> {
    if (!this.workflowRoot) {
      return [];
    }

    if (element) {
      return [];
    }

    await this.loadDefinitions();

    return this.definitions.map(
      def => new RecurringTreeItem(def, this.workflowRoot!)
    );
  }
}
