/**
 * PipelineTreeItemBuilder - Builder for creating TreeItems and tooltips
 *
 * Responsible for:
 * - Creating TreeItem instances for pipeline view
 * - Building tooltips with markdown formatting
 * - Managing theme icons for pipeline states
 *
 * This module follows SRP - only UI building logic.
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import { PipelineState } from '../services/pipeline-service';
import { ReportInfo, RunHistoryEntry } from './pipeline-types';

/**
 * Tree item types for pipeline view
 */
export type PipelineTreeItemType =
  | 'pipeline-run'
  | 'current-stage'
  | 'completed-stage'
  | 'statistics'
  | 'history'
  | 'history-item'
  | 'history-report';

/**
 * Base tree item for pipeline view
 */
export class PipelineTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: PipelineTreeItemType,
    public readonly id: string
  ) {
    super(label, collapsibleState);
    this.id = id;
  }
}

/**
 * Tree item representing the current pipeline run
 */
export class PipelineRunTreeItem extends PipelineTreeItem {
  constructor(
    public readonly state: PipelineState,
    public readonly elapsed?: string
  ) {
    const label = getPipelineRunLabel(state);
    super(
      label,
      vscode.TreeItemCollapsibleState.Expanded,
      'pipeline-run',
      'pipeline-run'
    );

    this.description = elapsed ? `Elapsed: ${elapsed}` : '';
    this.tooltip = createPipelineRunTooltip(state, elapsed);
    this.iconPath = getPipelineStateIcon(state);
    this.contextValue = 'pipeline-run';
  }
}

/**
 * Tree item representing the current stage being executed
 */
export class CurrentStageTreeItem extends PipelineTreeItem {
  constructor(
    public readonly stage: string,
    public readonly agent?: string,
    public readonly fallbackAgent?: string,
    public readonly skill?: string,
    public readonly ticket?: string,
    public readonly attempt?: number,
    public readonly maxAttempts?: number
  ) {
    super(
      stage,
      vscode.TreeItemCollapsibleState.None,
      'current-stage',
      'current-stage'
    );

    this.iconPath = new vscode.ThemeIcon('gear~spin');

    const agentInfo = agent ? `${t('Agent')}: ${agent}` : '';
    const ticketInfo = ticket ? `${t('Ticket')}: ${ticket}` : '';
    const attemptInfo = attempt && maxAttempts ? `${t('Attempt')}: ${attempt}/${maxAttempts}` : '';

    this.description = [agentInfo, ticketInfo, attemptInfo].filter(Boolean).join(' | ');
    this.tooltip = createCurrentStageTooltip(
      stage, agent, fallbackAgent, skill, ticket, attempt, maxAttempts
    );
    this.contextValue = 'current-stage';
  }
}

/**
 * Tree item representing a completed stage
 */
export class CompletedStageTreeItem extends PipelineTreeItem {
  private static counter = 0;
  public readonly reportPath?: string;
  public readonly logLineHint?: number;
  public readonly logFile?: string;
  constructor(
    public readonly stage: string,
    public readonly elapsed?: string,
    public readonly success?: boolean,
    public readonly ticket?: string,
    public readonly agent?: string,
    public readonly skill?: string,
    public readonly statusChange?: string,
    public readonly outputLines?: string[],
    public readonly reportInfo?: ReportInfo,
    logLineHint?: number,
    logFile?: string
  ) {
    const icon = success ? '✅' : '❌';
    const label = `${icon} ${stage}`;
    super(
      label,
      vscode.TreeItemCollapsibleState.None,
      'completed-stage',
      `completed-stage-${CompletedStageTreeItem.counter++}-${stage}`
    );

    // Build description: ticket | agent | status (graceful degradation)
    const parts = [ticket, agent, statusChange].filter(Boolean);
    this.description = parts.length > 0 ? parts.join(' | ') : (elapsed ? `${t('Elapsed')}: ${elapsed}` : '');
    this.tooltip = createCompletedStageTooltip(stage, elapsed, success, ticket, agent, skill, statusChange, outputLines);
    // Use contextValue to control context menu visibility:
    // - 'completed-stage-report' for report stages (has Open Report)
    // - 'completed-stage-ticket' for stages with a ticket (has Open Ticket)
    // - 'completed-stage' for stages without ticket/report
    if ((stage === 'create-report' || stage === 'analyze-report') && reportInfo) {
      this.contextValue = ticket ? 'completed-stage-report-ticket' : 'completed-stage-report';
    } else {
      this.contextValue = ticket ? 'completed-stage-ticket' : 'completed-stage';
    }
    // Store reportPath for later access
    this.reportPath = reportInfo?.path;
    this.logLineHint = logLineHint;
    this.logFile = logFile;
  }
}

/**
 * Tree item representing pipeline statistics
 */
export class StatisticsTreeItem extends PipelineTreeItem {
  constructor(
    public readonly stagesStarted: number,
    public readonly retries: number,
    public readonly gotos: number
  ) {
    super(
      'Statistics',
      vscode.TreeItemCollapsibleState.Collapsed,
      'statistics',
      'statistics'
    );
    this.iconPath = new vscode.ThemeIcon('graph');

    this.description = `${t('Stages Started')}: ${stagesStarted} | ${t('Retries')}: ${retries} | ${t('Goto Transitions')}: ${gotos}`;
    this.tooltip = createStatisticsTooltip(stagesStarted, retries, gotos);
    this.contextValue = 'statistics';
  }
}

/**
 * Tree item representing run history
 */
export class HistoryTreeItem extends PipelineTreeItem {
  constructor(
    public readonly history: RunHistoryEntry[]
  ) {
    super(
      'History',
      vscode.TreeItemCollapsibleState.Collapsed,
      'history',
      'history'
    );
    this.iconPath = new vscode.ThemeIcon('history');

    this.description = history.length > 0 ? `${history.length} ${t('runs')}` : t('No runs yet');
    this.tooltip = createHistoryTooltip(history);
    this.contextValue = 'history';
  }
}

/**
 * Tree item representing a single history entry
 */
export class HistoryItemTreeItem extends PipelineTreeItem {
  constructor(
    public readonly entry: RunHistoryEntry
  ) {
    const icon = entry.result === 'success' ? '✅' : entry.result === 'error' ? '❌' : '⏹️';
    const label = `${icon} #${entry.runNumber}`;
    const hasReports = entry.reports && entry.reports.length > 0;
    super(
      label,
      hasReports ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'history-item',
      `history-${entry.runNumber}`
    );

    // Show planId in description when available
    this.description = entry.planId ? `${entry.planId} | ${entry.date}` : entry.date;
    this.tooltip = createHistoryItemTooltip(entry);
    // Use contextValue based on planId presence
    this.contextValue = entry.planId ? 'history-item-plan' : 'history-item';
  }
}

/**
 * Tree item representing a report from pipeline run
 */
export class HistoryReportTreeItem extends PipelineTreeItem {
  constructor(
    public readonly reportId: string,
    public readonly reportPath: string,
    public readonly runNumber: number
  ) {
    const label = `📄 ${reportId}`;
    super(
      label,
      vscode.TreeItemCollapsibleState.None,
      'history-report',
      `history-report-${runNumber}-${reportId}`
    );

    this.description = reportPath;
    this.tooltip = createHistoryReportTooltip(reportId, reportPath);
    this.contextValue = 'history-report';
    this.command = {
      command: 'vscode.open',
      title: 'Open Report',
      arguments: [vscode.Uri.file(reportPath)]
    };
  }
}

/**
 * Get label for pipeline run based on state and mode
 */
function getPipelineRunLabel(state: PipelineState): string {
  const stateLabels: Record<PipelineState, string> = {
    [PipelineState.Idle]: 'Idle',
    [PipelineState.Running]: 'Running',
    [PipelineState.Error]: 'Error',
    [PipelineState.Completed]: 'Completed'
  };

  return stateLabels[state];
}

/**
 * Get theme icon for pipeline state
 */
function getPipelineStateIcon(state: PipelineState): vscode.ThemeIcon {
  switch (state) {
    case PipelineState.Idle:
      return new vscode.ThemeIcon('circle-outline');
    case PipelineState.Running:
      return new vscode.ThemeIcon('loading~spin');
    case PipelineState.Error:
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('notificationsErrorIcon.foreground'));
    case PipelineState.Completed:
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

/**
 * Create tooltip for pipeline run
 */
function createPipelineRunTooltip(
  state: PipelineState,
  elapsed?: string
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Pipeline Run')}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('State')}** | ${state} |\n`);
  if (elapsed) {
    markdown.appendMarkdown(`| **${t('Elapsed')}** | ${elapsed} |\n`);
  }
  return markdown;
}

/**
 * Create tooltip for current stage
 */
function createCurrentStageTooltip(
  stage: string,
  agent?: string,
  fallbackAgent?: string,
  skill?: string,
  ticket?: string,
  attempt?: number,
  maxAttempts?: number
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Current Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  if (agent) {
    markdown.appendMarkdown(`| **${t('Agent')}** | ${agent} |\n`);
  }
  if (fallbackAgent) {
    markdown.appendMarkdown(`| **${t('Fallback Agent')}** | ${fallbackAgent} |\n`);
  }
  if (skill) {
    markdown.appendMarkdown(`| **${t('Skill')}** | ${skill} |\n`);
  }
  if (ticket) {
    markdown.appendMarkdown(`| **${t('Ticket')}** | ${ticket} |\n`);
  }
  if (attempt !== undefined && maxAttempts !== undefined) {
    markdown.appendMarkdown(`| **${t('Attempt')}** | ${attempt}/${maxAttempts} |\n`);
  }
  return markdown;
}

/**
 * Create tooltip for completed stage
 */
function createCompletedStageTooltip(
  stage: string,
  elapsed?: string,
  success?: boolean,
  ticket?: string,
  agent?: string,
  skill?: string,
  statusChange?: string,
  outputLines?: string[]
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Completed Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Result')}** | ${success ? '✅ Success' : '❌ Failed'} |\n`);
  if (ticket) {
    markdown.appendMarkdown(`| **${t('Ticket')}** | ${ticket} |\n`);
  }
  if (agent) {
    markdown.appendMarkdown(`| **${t('Agent')}** | ${agent} |\n`);
  }
  if (skill) {
    markdown.appendMarkdown(`| **${t('Skill')}** | ${skill} |\n`);
  }
  if (statusChange) {
    markdown.appendMarkdown(`| **${t('Status Change')}** | ${statusChange} |\n`);
  }
  if (elapsed) {
    markdown.appendMarkdown(`| **${t('Elapsed')}** | ${elapsed} |\n`);
  }

  // Add output section if available
  if (outputLines && outputLines.length > 0) {
    markdown.appendMarkdown(`\n---\n**${t('Output')}**\n\n`);
    markdown.appendMarkdown('```\n');
    const maxLines = 20;
    const displayLines = outputLines.slice(0, maxLines);
    displayLines.forEach(line => {
      markdown.appendMarkdown(`${line}\n`);
    });
    if (outputLines.length > maxLines) {
      markdown.appendMarkdown(`... (${outputLines.length - maxLines} ${t('lines truncated')})\n`);
    }
    markdown.appendMarkdown('```\n');
  }

  return markdown;
}

/**
 * Create tooltip for statistics
 */
function createStatisticsTooltip(
  stagesStarted: number,
  retries: number,
  gotos: number
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Pipeline Statistics')}**\n\n`);
  markdown.appendMarkdown(`| ${t('Metric')} | ${t('Count')} |\n`);
  markdown.appendMarkdown(`|--------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Stages Started')}** | ${stagesStarted} |\n`);
  markdown.appendMarkdown(`| **${t('Retries')}** | ${retries} |\n`);
  markdown.appendMarkdown(`| **${t('Goto Transitions')}** | ${gotos} |\n`);
  return markdown;
}

/**
 * Create tooltip for history
 */
function createHistoryTooltip(history: RunHistoryEntry[]): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Run History')}**\n\n`);

  if (history.length === 0) {
    markdown.appendMarkdown(`_${t('No runs yet')}_`);
  } else {
    markdown.appendMarkdown(`| # | ${t('Date')} | ${t('Result')} |\n`);
    markdown.appendMarkdown(`|---|------|--------|\n`);
    history.slice(0, 10).forEach(entry => {
      const icon = entry.result === 'success' ? '✅' : entry.result === 'error' ? '❌' : '⏹️';
      markdown.appendMarkdown(`| ${entry.runNumber} | ${entry.date} | ${icon} |\n`);
    });
  }

  return markdown;
}

/**
 * Create tooltip for history item
 */
function createHistoryItemTooltip(entry: RunHistoryEntry): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Run')} ${entry.runNumber}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Date')}** | ${entry.date} |\n`);
  markdown.appendMarkdown(`| **${t('Result')}** | ${entry.result} |\n`);
  if (entry.reports && entry.reports.length > 0) {
    markdown.appendMarkdown(`| **${t('Reports')}** | ${entry.reports.length} |\n`);
  }
  return markdown;
}

/**
 * Create tooltip for history report
 */
function createHistoryReportTooltip(reportId: string, reportPath: string): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Report')}: ${reportId}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('ID')}** | ${reportId} |\n`);
  markdown.appendMarkdown(`| **${t('Path')}** | ${reportPath} |\n`);
  markdown.appendMarkdown(`\n[${t('Click to open')}](command:vscode.open)`);
  return markdown;
}
