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
import * as path from 'path';
import { t } from '../i18n';
import { PipelineState } from '../services/pipeline-service';
import { StageResult } from './pipeline-tree-data-provider';
import { formatMsToElapsed } from '../services/pipeline-state-manager';
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
    public readonly elapsed?: string,
    public readonly currentManualGateTicket?: string,
    private workflowRoot?: string
  ) {
    const label = getPipelineRunLabel(state, currentManualGateTicket);
    super(
      label,
      // Не Expanded: у этого узла нет детей — getChildren обрабатывает только
      // `statistics`, `history` и `history-item`, а стейджи лежат соседями в
      // корне. Раскрывающая стрелка у бездетного узла и создавала впечатление,
      // что клик по chevron ничего не делает.
      vscode.TreeItemCollapsibleState.None,
      'pipeline-run',
      'pipeline-run'
    );

    this.description = elapsed ? `Elapsed: ${elapsed}` : '';
    if (state === PipelineState.Paused && currentManualGateTicket) {
      this.description = currentManualGateTicket;
    }

    this.tooltip = createPipelineRunTooltip(state, elapsed);
    this.iconPath = getPipelineStateIcon(state);
    this.contextValue = 'pipeline-run';

    // Add command to open ticket when paused with a manual gate ticket
    if (state === PipelineState.Paused && currentManualGateTicket && workflowRoot) {
       const ticketUri = vscode.Uri.file(
         path.join(workflowRoot, '.workflow', 'tickets', 'ready', `${currentManualGateTicket}.md`)
      );
      this.command = {
        command: 'vscode.open',
        title: t('Open ticket'),
        arguments: [ticketUri]
      };
    }
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
    public readonly maxAttempts?: number,
    public readonly stageElapsed?: string
  ) {
    super(
      stage,
      vscode.TreeItemCollapsibleState.None,
      'current-stage',
      'current-stage'
    );

    if (fallbackAgent) {
      this.iconPath = new vscode.ThemeIcon('arrow-swap~spin', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
    } else if (attempt && maxAttempts && attempt > 1) {
      this.iconPath = new vscode.ThemeIcon('debug-restart~spin', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
    } else {
      this.iconPath = new vscode.ThemeIcon('gear~spin');
    }

    const elapsedInfo = stageElapsed ? `⏱ ${stageElapsed}` : '';
    const agentInfo = agent ? `${t('Agent')}: ${agent}` : '';
    const fallbackAgentInfo = fallbackAgent ? `${t('Fallback')}: ${fallbackAgent}` : '';
    const ticketInfo = ticket ? `${t('Ticket')}: ${ticket}` : '';
    const attemptInfo = attempt && maxAttempts ? `${t('Attempt')}: ${attempt}/${maxAttempts}` : '';

    this.description = [elapsedInfo, agentInfo, fallbackAgentInfo, ticketInfo, attemptInfo].filter(Boolean).join(' | ');
    this.tooltip = createCurrentStageTooltip(
      stage, agent, fallbackAgent, skill, ticket, attempt, maxAttempts, stageElapsed
    );
    this.contextValue = 'current-stage';
  }
}

/**
 * Tree item representing a completed stage
 */
export class CompletedStageTreeItem extends PipelineTreeItem {
  public readonly reportPath?: string;
  public readonly logLineHint?: number;
  public readonly logFile?: string;
  constructor(
    public readonly stage: string,
    public readonly elapsed?: string,
    public readonly success?: boolean,
    public readonly ticket?: string,
    public readonly agent?: string,
    public readonly fallbackAgent?: string,
    public readonly skill?: string,
    public readonly statusChange?: string,
    public readonly outputLines?: string[],
    public readonly reportInfo?: ReportInfo,
    logLineHint?: number,
    logFile?: string,
    public readonly result: StageResult = success === false ? StageResult.Error : StageResult.Success
  ) {
    const icon = getStageResultIcon(result);
    const fallbackMarker = fallbackAgent ? '🎭' : '';
    const gotoMarker = (statusChange && result === StageResult.Success) ? getGotoStatusIcon(statusChange, stage, agent || '') : '';
    const label = `${icon}${fallbackMarker}${gotoMarker} ${stage}`;
    const stableIndex = typeof logLineHint === 'number' ? logLineHint : 0;
    super(
      label,
      vscode.TreeItemCollapsibleState.None,
      'completed-stage',
      `completed-stage-${stage}-${stableIndex}`
    );

    // Build description: elapsed | ticket | agent (fallback) | status
    const elapsedPart = elapsed ? `⏱ ${elapsed}` : '';
    const fallbackPart = fallbackAgent ? `${t('Fallback')}: ${fallbackAgent}` : '';
    const parts = [elapsedPart, ticket, agent, fallbackPart, statusChange].filter(Boolean);
    this.description = parts.join(' | ');
    this.tooltip = createCompletedStageTooltip(stage, elapsed, result, ticket, agent, fallbackAgent, skill, statusChange, outputLines);
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

    // Click on completed stage opens log at that stage's section
    this.command = {
      command: 'workflow.openStageLog',
      title: t('Open Stage Log'),
      arguments: [this]
    };
  }
}

/**
 * Tree item representing pipeline statistics
 */
export class StatisticsTreeItem extends PipelineTreeItem {
  constructor(
    public readonly stagesStarted: number,
    public readonly retries: number,
    public readonly gotos: number,
    public readonly timeouts: number = 0,
    public readonly totalElapsedMs: number = 0,
    public readonly averageElapsedMs: number = 0
  ) {
    super(
      'Statistics',
      vscode.TreeItemCollapsibleState.Collapsed,
      'statistics',
      'statistics'
    );
    this.iconPath = new vscode.ThemeIcon('graph');

    const totalStr = totalElapsedMs > 0 ? ` | ⏱ ${formatMsToElapsed(totalElapsedMs)}` : '';
    this.description = `${t('Stages Started')}: ${stagesStarted} | ${t('Retries')}: ${retries}${totalStr}`;
    this.tooltip = createStatisticsTooltip(stagesStarted, retries, gotos, timeouts, totalElapsedMs, averageElapsedMs);
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
    const planMarker = entry.planId ? '📋' : '';
    const reportMarker = (entry.reports && entry.reports.length > 0) ? '📄' : '';
    const label = `${icon}${planMarker}${reportMarker} #${entry.runNumber}`;
    const hasReports = entry.reports && entry.reports.length > 0;
    super(
      label,
      hasReports ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      'history-item',
      `history-${entry.runNumber}`
    );

    // Show planId in description when available. Runs this extension did not
    // start also name their origin — otherwise a CLI run is indistinguishable
    // from ours in the history list.
    const origin = entry.source && entry.source !== 'extension' ? `${entry.source} | ` : '';
    this.description = entry.planId
      ? `${origin}${entry.planId} | ${entry.date}`
      : `${origin}${entry.date}`;
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
function getPipelineRunLabel(state: PipelineState, currentManualGateTicket?: string): string {
  if (state === PipelineState.Paused && currentManualGateTicket) {
    return t('Waiting for manual intervention');
  }

  const stateLabels: Record<PipelineState, string> = {
    [PipelineState.Idle]: 'Idle',
    [PipelineState.Running]: 'Running',
    [PipelineState.Paused]: 'Paused',
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
    case PipelineState.Paused:
      return new vscode.ThemeIcon('debug-pause');
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
  maxAttempts?: number,
  stageElapsed?: string
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Current Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  if (stageElapsed) {
    markdown.appendMarkdown(`| **${t('Elapsed')}** | ${stageElapsed} |\n`);
  }
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
/**
 * Get icon for stage result
 */
function getStageResultIcon(result: StageResult): string {
  switch (result) {
    case StageResult.Success: return '✅';
    case StageResult.Error: return '❌';
    case StageResult.Timeout: return '⏱️';
    case StageResult.Skipped: return '⏭️';
    default: return '✅';
  }
}

/**
 * Get label for stage result
 */
function getStageResultLabel(result: StageResult): string {
  switch (result) {
    case StageResult.Success: return '✅ Success';
    case StageResult.Error: return '❌ Failed';
    case StageResult.Timeout: return '⏱️ Timeout';
    case StageResult.Skipped: return '⏭️ Skipped';
    default: return '✅ Success';
  }
}

function createCompletedStageTooltip(
  stage: string,
  elapsed?: string,
  result?: StageResult,
  ticket?: string,
  agent?: string,
  fallbackAgent?: string,
  skill?: string,
  statusChange?: string,
  outputLines?: string[]
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Completed Stage')}: ${stage}**\n\n`);
  markdown.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|-------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Result')}** | ${getStageResultLabel(result ?? StageResult.Success)} |\n`);
  if (ticket) {
    markdown.appendMarkdown(`| **${t('Ticket')}** | ${ticket} |\n`);
  }
  if (agent) {
    markdown.appendMarkdown(`| **${t('Agent')}** | ${agent} |\n`);
  }
  if (fallbackAgent) {
    markdown.appendMarkdown(`| **${t('Fallback Agent')}** | ${fallbackAgent} |\n`);
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
  gotos: number,
  timeouts: number = 0,
  totalElapsedMs: number = 0,
  averageElapsedMs: number = 0
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${t('Pipeline Statistics')}**\n\n`);
  markdown.appendMarkdown(`| ${t('Metric')} | ${t('Value')} |\n`);
  markdown.appendMarkdown(`|--------|-------|\n`);
  markdown.appendMarkdown(`| **${t('Stages Started')}** | ${stagesStarted} |\n`);
  markdown.appendMarkdown(`| **${t('Retries')}** | ${retries} |\n`);
  markdown.appendMarkdown(`| **${t('Goto Transitions')}** | ${gotos} |\n`);
  markdown.appendMarkdown(`| **${t('Timeouts')}** | ${timeouts} |\n`);
  if (totalElapsedMs > 0) {
    markdown.appendMarkdown(`| **${t('Total Time')}** | ${formatMsToElapsed(totalElapsedMs)} |\n`);
    markdown.appendMarkdown(`| **${t('Avg Time')}** | ${formatMsToElapsed(averageElapsedMs)} |\n`);
  }
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
  markdown.appendMarkdown(`| **${t('Started by')}** | ${entry.source ?? 'extension'} |\n`);
  if (entry.runId) {
    markdown.appendMarkdown(`| **Run ID** | ${entry.runId} |\n`);
  }
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

const GOTO_STATUS_ICONS: Record<string, string> = {
  found: '🔍',
  passed: '✔️',
  relevant: '✔️',
  completed: '🏁',
  has_ready: '📋',
  plan_created: '📝',
  decomposed: '✔️',
  completed_in_progress: '✔️',
  done: '✔️',
  failed: '✗',
  irrelevant: '🚫',
  error: '⚠️',
  max_reached: '🛑',
  blocked: '🛑',
  empty: '∅',
  no_triggers: '∅',
  no_plan: '∅',
  skipped: '⏭️',
  default: '↩️',
  in_progress: '▶️',
  'in-progress': '▶️',
  in_review: '👁️',
  review: '👁️',
  ready: '🔁',
  needs_decomposition: '🔀',
  has_gaps: '📉'
};

function getStageTypeIcon(stage: string, agent: string): string {
  if (agent.startsWith('script-')) return '⚙️';
  if (agent.startsWith('increment-')) return '🔄';
  if (stage.endsWith('-report')) return '📊';
  return '🤖';
}

function parseLastSegment(statusChange: string): string {
  if (!statusChange) return '';
  const segments = statusChange.split('→');
  return segments[segments.length - 1].trim();
}

export function getGotoStatusIcon(statusChange: string, stage: string, agent: string): string {
  const lastSegment = parseLastSegment(statusChange);
  const statusIcon = GOTO_STATUS_ICONS[lastSegment] || '↩️';

  const typeIcon = getStageTypeIcon(stage, agent);

  return typeIcon + statusIcon;
}
