/**
 * Wires external pipeline detection into the extension.
 *
 * Creates one ExternalPipelineMonitor per workspace folder that has a
 * `.workflow/` directory, feeds them into PipelineRunSource, and connects the
 * result to the pieces that show it: output channels, the status bar, the
 * pipeline tree and the run history.
 *
 * Store and PipelineService stay single-root (bootstrap.ts uses
 * workspaceFolders[0]); only detection is per folder.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n';
import { PipelineService } from './pipeline-service';
import { ExternalPipelineMonitor, ExternalRun } from './external-pipeline-monitor';
import { PipelineRunSource, ActiveRun } from './pipeline-run-source';
import { ExternalRunOutput, readRunResult } from './external-run-output';
import { ExternalPipelineControl } from './external-pipeline-control';
import { PipelineTreeProvider } from '../ui/pipeline-tree-provider';
import { StatusBar } from '../ui/status-bar';

const SETTING_SECTION = 'workflow';
const SETTING_KEY = 'externalPipelineDetection';

/** Workspace folders that actually hold a `.workflow/` directory. */
function workflowFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .map(folder => folder.uri.fsPath)
    .filter(root => {
      try {
        return fs.statSync(path.join(root, '.workflow')).isDirectory();
      } catch {
        return false;
      }
    });
}

export interface ExternalPipelineWiring extends vscode.Disposable {
  runSource: PipelineRunSource;
}

/**
 * Sets up detection. Returns undefined when the user has switched it off.
 */
export function setupExternalPipelineDetection(
  context: vscode.ExtensionContext,
  pipelineService: PipelineService,
  pipelineProvider: PipelineTreeProvider,
  statusBar: StatusBar,
  primaryRoot: string | null
): ExternalPipelineWiring | undefined {
  const enabled = vscode.workspace
    .getConfiguration(SETTING_SECTION)
    .get<boolean>(SETTING_KEY, true);
  if (!enabled) {
    return undefined;
  }

  const runSource = new PipelineRunSource(pipelineService, primaryRoot);
  const output = new ExternalRunOutput();
  const control = new ExternalPipelineControl();
  const disposables: vscode.Disposable[] = [runSource, output];

  /** Runs already announced, so a re-read of the same lock does not re-notify. */
  const announced = new Set<string>();
  /** Last seen run per folder, to detect a finish and write history. */
  const lastRun = new Map<string, ActiveRun>();
  /** Output channel currently open per folder, so a new run can close the old one. */
  const channelByRoot = new Map<string, string>();
  /**
   * Folders we are deliberately letting go of — detection switched off, folder
   * removed from the workspace. Their runs vanish from our view but keep
   * running, so no result must be recorded for them.
   */
  const stopWatching = new Set<string>();

  /**
   * Identity of a run: pid plus start time, not `run_id`.
   *
   * A lock left behind by a dead process can be replaced by a new run at the
   * same second, and `run_id` is missing entirely from locks written by runners
   * older than 1.6.0. pid and start time are present in every version.
   */
  const runKey = (run: ActiveRun) => `${run.root}|${run.pid}|${run.startedAt}`;

  const addMonitor = (root: string) => {
    const monitor = new ExternalPipelineMonitor(root);
    disposables.push(
      monitor.onUnsupportedRunner(() => {
        void vscode.window.showWarningMessage(
          t('A pipeline is running, but workflow-ai is older than 1.6.0 — it cannot be tracked. Update workflow-ai to see external pipelines.')
        );
      })
    );
    runSource.addMonitor(monitor);
  };

  pipelineProvider.setBlockingRunProbe(() => runSource.getBlockingExternalRun());
  pipelineProvider.setExternalRunControl(control, root => runSource.refresh(root));

  // Мониторы создаются ПОСЛЕ подписки ниже: `start()` читает существующий lock
  // и публикует run синхронно, так что подписка, зарегистрированная позже,
  // пропустила бы пайплайн, который уже шёл к моменту открытия окна.
  const startMonitors = () => {
    for (const root of workflowFolders()) {
      addMonitor(root);
    }
  };

  // Switching the setting off must stop detection now, not at the next window
  // reload — otherwise the "Disable" button in the notification appears to do
  // nothing for the rest of the session.
  disposables.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration(`${SETTING_SECTION}.${SETTING_KEY}`)) { return; }
      const nowEnabled = vscode.workspace
        .getConfiguration(SETTING_SECTION)
        .get<boolean>(SETTING_KEY, true);
      if (nowEnabled) {
        for (const root of workflowFolders()) {
          if (!runSource.hasMonitor(root)) { addMonitor(root); }
        }
      } else {
        for (const root of runSource.getMonitoredRoots()) {
          forgetFolder(root);
        }
        statusBar.setActiveProjectCount(0);
        pipelineProvider.setExternalRun(undefined);
        void updateExternalContextKeys(undefined);
      }
    })
  );

  // Follow folders being added to or removed from the workspace.
  disposables.push(
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
      for (const removed of event.removed) {
        forgetFolder(removed.uri.fsPath);
      }
      for (const added of event.added) {
        try {
          if (fs.statSync(path.join(added.uri.fsPath, '.workflow')).isDirectory()
            && !runSource.hasMonitor(added.uri.fsPath)) {
            addMonitor(added.uri.fsPath);
          }
        } catch {
          // Фолдер без .workflow — следить не за чем.
        }
      }
    })
  );

  disposables.push(
    runSource.onDidChange(() => {
      const runs = runSource.getActiveRuns();
      const seen = new Set<string>();

      for (const run of runs) {
        seen.add(run.root);
        handleRunSeen(run);
      }

      for (const [root, previous] of [...lastRun]) {
        if (!seen.has(root)) {
          handleRunGone(root, previous);
        }
      }

      const active = runSource.getActiveRun();
      const externalTooltip = active && active.source !== 'extension'
        ? [
            `${t('External pipeline')} (${active.source})`,
            active.runId ? `run_id: ${active.runId}` : undefined,
            active.pid ? `PID: ${active.pid}` : undefined,
            active.startedAt ? `${t('Started')}: ${active.startedAt}` : undefined
          ].filter(Boolean).join('\n')
        : undefined;

      statusBar.setActiveProjectCount(runSource.getActiveProjectCount(), externalTooltip);
      pipelineProvider.setExternalRun(active);
      void updateExternalContextKeys(active);
    })
  );

  startMonitors();

  /**
   * Stops watching a folder without claiming its pipeline finished.
   * The pipeline is still going; we simply stop looking.
   */
  function forgetFolder(root: string): void {
    stopWatching.add(root);
    try {
      runSource.removeMonitor(root);
    } finally {
      stopWatching.delete(root);
    }
    const previous = lastRun.get(root);
    if (previous?.runId) {
      output.detach(previous.runId);
    }
    lastRun.delete(root);
    channelByRoot.delete(root);
  }

  function handleRunSeen(run: ActiveRun): void {
    // Тот же root, но другой запуск — старый закончился без события delete.
    // VS Code склеивает delete+create по одному пути в одно change, поэтому
    // быстрый перезапуск иначе потерял бы предыдущий run вместе с историей.
    const previous = lastRun.get(run.root);
    if (previous && runKey(previous) !== runKey(run)) {
      handleRunGone(run.root, previous);
    }

    lastRun.set(run.root, run);
    if (run.source === 'extension' || !run.runId) {
      return;
    }

    // Протухший lock — мусор от умершего процесса. Ни канала, ни нотификации:
    // иначе при каждом открытии окна мы бы здоровались с покойником.
    if (run.state === 'stale') {
      return;
    }

    if (run.logPath) {
      // Канал предыдущего запуска в этой же папке закрываем: иначе за день
      // работы их набирается десяток.
      const openChannel = channelByRoot.get(run.root);
      if (openChannel && openChannel !== run.runId) {
        output.close(openChannel);
      }
      channelByRoot.set(run.root, run.runId);
      void output.attach(run.runId, run.source, run.logPath);
    }

    const key = runKey(run);
    if (!announced.has(key)) {
      announced.add(key);
      void notifyDetected(run, output);
    }
  }

  /**
   * The run is over: the lock is gone (or was replaced by a newer run).
   *
   * Not called when we simply stop watching a folder — detection being turned
   * off or a folder leaving the workspace says nothing about the pipeline,
   * which keeps running. Recording a result there would be a lie.
   */
  function handleRunGone(root: string, previous: ActiveRun): void {
    if (stopWatching.has(root)) {
      // Мы сами перестали смотреть — о судьбе пайплайна это ничего не говорит.
      return;
    }
    lastRun.delete(root);
    if (previous.source === 'extension' || !previous.runId) {
      return;
    }
    // Дочитываем хвост до снятия tail: события лога и lock'а независимы, и
    // последние строки иначе не попали бы в канал.
    output.flush(previous.runId, previous.logPath);
    output.detach(previous.runId);
    // Lock снимается в `finally`, поэтому его исчезновение ничего не говорит об
    // исходе: и успех, и падение выглядят одинаково. Исход — только в логе.
    // Остановленный отсюда запуск финального блока в лог не пишет: на Windows
    // taskkill /F не даёт раннеру ничего дописать, и лог читался бы как падение.
    const result = finishedRunResult(previous, control.wasStoppedByUser(previous));
    control.forget(previous);
    pipelineProvider.addExternalRunToHistory(
      result,
      previous.source,
      previous.runId,
      previous.logPath
    );
  }

  return {
    runSource,
    dispose(): void {
      for (const d of disposables.reverse()) {
        d.dispose();
      }
    }
  };
}

/**
 * How a finished external run ended, for the history.
 *
 * A run stopped from here is `stopped`: on Windows `taskkill /F` gives the
 * runner no chance to write its final block, and the log would read as a
 * crash. A run whose process vanished without us is `error`. Otherwise the
 * runner's own verdict in the log decides.
 */
export function finishedRunResult(
  run: ActiveRun,
  stoppedByUser: boolean
): 'success' | 'error' | 'stopped' {
  if (stoppedByUser) { return 'stopped'; }
  if (run.state === 'stale') { return 'error'; }
  return readRunResult(run.logPath);
}

/**
 * Context keys for the view's Stop/Pause/Resume buttons on a run we did not
 * start. Separate from `workflow.pipelineRunning`: that one follows our own
 * PipelineService and is rewritten every five seconds by `updateContextKeys`.
 */
export async function updateExternalContextKeys(active: ActiveRun | undefined): Promise<void> {
  const external = active && active.source !== 'extension' && active.state !== 'stale'
    ? active
    : undefined;
  const canResume = Boolean(external && (external.pauseRequested || external.suspendedByMcp));
  const canPause = Boolean(external
    && external.supportsPause
    && !canResume
    && external.state !== 'paused');
  await vscode.commands.executeCommand('setContext', 'workflow.externalPipelineActive', Boolean(external));
  await vscode.commands.executeCommand('setContext', 'workflow.externalPipelineCanPause', canPause);
  await vscode.commands.executeCommand('setContext', 'workflow.externalPipelineCanResume', canResume);
}

/**
 * Tells the user once that an external pipeline showed up, with a way to open
 * its output or to switch detection off.
 */
async function notifyDetected(run: ActiveRun, output: ExternalRunOutput): Promise<void> {
  const openLabel = t('Open Output');
  const disableLabel = t('Disable');
  const choice = await vscode.window.showInformationMessage(
    t('External pipeline detected ({0}), tracking enabled', run.source),
    openLabel,
    disableLabel
  );

  if (choice === openLabel && run.runId) {
    output.show(run.runId);
  } else if (choice === disableLabel) {
    await vscode.workspace
      .getConfiguration(SETTING_SECTION)
      .update(SETTING_KEY, false, vscode.ConfigurationTarget.Workspace);
  }
}

export { ExternalRun };
