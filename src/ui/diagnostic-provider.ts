/**
 * DiagnosticProvider - Real-time validation for workflow artifacts
 *
 * Provides real-time validation of tickets, pipeline.yaml, and config.yaml
 * using VS Code Problems panel (DiagnosticCollection).
 *
 * Features:
 * - Ticket frontmatter validation (required fields, valid values)
 * - Dependency validation (non-existent IDs, cycles)
 * - Pipeline validation (stage/agent/skill IDs, goto cycles)
 * - Config validation
 * - Debounced updates on file changes (300ms)
 *
 * ADR-006: Hybrid validation using ValidationService
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../data/workflow-store';
import { ValidationService } from '../services/validation-service';
import { parse as parseFrontmatter } from '../data/frontmatter-parser';
import { Ticket, PipelineConfig, WorkflowConfig } from '../data/types';
import { load as loadYaml } from 'js-yaml';

/**
 * Debounce timer map
 */
class DebounceMap {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Debounce a function call by key
   */
  debounce(key: string, fn: () => void, delayMs: number): void {
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      fn();
      this.timers.delete(key);
    }, delayMs);

    this.timers.set(key, timer);
  }

  /**
   * Clear all timers
   */
  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

/**
 * DiagnosticProvider - Real-time validation for workflow artifacts
 *
 * Monitors ticket files, pipeline.yaml, and config.yaml for changes
 * and updates VS Code Problems panel with validation errors.
 */
export class DiagnosticProvider implements vscode.Disposable {
  readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly validationService: ValidationService;
  private readonly debounceMap: DebounceMap;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly workflowRoot: string | null;

  /**
   * Create DiagnosticProvider
   * @param store - WorkflowStore for data access
   */
  constructor(private readonly store: WorkflowStore) {
    this.workflowRoot = store.getWorkflowRoot();
    this.validationService = new ValidationService(store);
    this.debounceMap = new DebounceMap();
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('workflow');
    this.disposables.push(this.diagnosticCollection);

    // Register file watchers
    this.registerFileWatchers();

    // Subscribe to store changes
    const storeDisposable = store.onDidChange((event) => {
      // On store refresh, validate all files
      if (event.operation === 'refresh') {
        this.validateAll();
      }
    });
    this.disposables.push({ dispose: () => storeDisposable });

    // Initial validation
    this.validateAll();
  }

  /**
   * Register file watchers for tickets, pipeline.yaml, and config.yaml
   */
  private registerFileWatchers(): void {
    if (!this.workflowRoot) {
      return;
    }

    // Watch ticket files
    const ticketPattern = new vscode.RelativePattern(
      path.join(this.workflowRoot, '.workflow', 'tickets'),
      '**/*.md'
    );
    const ticketWatcher = vscode.workspace.createFileSystemWatcher(ticketPattern);

    this.disposables.push(
      ticketWatcher.onDidChange((uri) => this.onFileChanged(uri)),
      ticketWatcher.onDidCreate((uri) => this.onFileChanged(uri)),
      ticketWatcher.onDidDelete((uri) => this.onFileDeleted(uri)),
      ticketWatcher
    );

    // Watch pipeline.yaml
    const pipelineWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workflowRoot, '.workflow/config/pipeline.yaml')
    );

    this.disposables.push(
      pipelineWatcher.onDidChange((uri) => this.onFileChanged(uri)),
      pipelineWatcher.onDidCreate((uri) => this.onFileChanged(uri)),
      pipelineWatcher.onDidDelete((uri) => this.onFileDeleted(uri)),
      pipelineWatcher
    );

    // Watch config.yaml
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workflowRoot, '.workflow/config/config.yaml')
    );

    this.disposables.push(
      configWatcher.onDidChange((uri) => this.onFileChanged(uri)),
      configWatcher.onDidCreate((uri) => this.onFileChanged(uri)),
      configWatcher.onDidDelete((uri) => this.onFileDeleted(uri)),
      configWatcher
    );

    // Watch text document changes for all documents
    const textDocumentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      const uri = event.document.uri;
      // Only process workflow files
      if (this.isWorkflowFile(uri)) {
        this.onDocumentChanged(event.document);
      }
    });
    this.disposables.push(textDocumentChangeListener);

    // Watch text document open events
    const textDocumentOpenListener = vscode.workspace.onDidOpenTextDocument((doc) => {
      if (this.isWorkflowFile(doc.uri)) {
        this.validateDocument(doc);
      }
    });
    this.disposables.push(textDocumentOpenListener);

    // Watch text document save events
    const textDocumentSaveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (this.isWorkflowFile(doc.uri)) {
        this.validateDocument(doc);
      }
    });
    this.disposables.push(textDocumentSaveListener);
  }

  /**
   * Check if URI is a workflow file (ticket, pipeline, or config)
   */
  private isWorkflowFile(uri: vscode.Uri): boolean {
    const fsPath = uri.fsPath;
    if (!this.workflowRoot) {
      return false;
    }

    return (
      fsPath.includes(path.join('.workflow', 'tickets')) ||
      fsPath.endsWith(path.join('.workflow', 'config', 'pipeline.yaml')) ||
      fsPath.endsWith(path.join('.workflow', 'config', 'config.yaml'))
    );
  }

  /**
   * Handle file change event with debounce
   */
  private onFileChanged(uri: vscode.Uri): void {
    this.debounceMap.debounce(uri.toString(), () => {
      this.validateFile(uri);
    }, 300); // 300ms debounce
  }

  /**
   * Handle file save event
   */
  private onFileSaved(uri: vscode.Uri): void {
    // Clear any pending debounce and validate immediately
    this.debounceMap.debounce(uri.toString(), () => {
      this.validateFile(uri);
    }, 50); // Short debounce on save
  }

  /**
   * Handle document change event with debounce
   */
  private onDocumentChanged(doc: vscode.TextDocument): void {
    this.debounceMap.debounce(doc.uri.toString(), () => {
      this.validateDocument(doc);
    }, 300); // 300ms debounce
  }

  /**
   * Handle file deletion
   */
  private onFileDeleted(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  /**
   * Validate a file by URI
   */
  private validateFile(uri: vscode.Uri): void {
    const document = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.toString() === uri.toString()
    );

    if (document) {
      this.validateDocument(document);
    } else {
      // File may not be open, try to read and validate
      this.validateFileFromDisk(uri);
    }
  }

  /**
   * Validate a text document
   */
  validateDocument(doc: vscode.TextDocument): void {
    const uri = doc.uri;
    const fsPath = doc.uri.fsPath;

    if (!this.workflowRoot) {
      return;
    }

    // Determine file type and validate
    if (fsPath.endsWith('.md') && fsPath.includes(path.join('.workflow', 'tickets'))) {
      this.validateTicketDocument(uri, doc.getText());
    } else if (fsPath.endsWith(path.join('.workflow', 'config', 'pipeline.yaml'))) {
      this.validatePipelineDocument(uri, doc.getText());
    } else if (fsPath.endsWith(path.join('.workflow', 'config', 'config.yaml'))) {
      this.validateConfigDocument(uri, doc.getText());
    }
  }

  /**
   * Validate a file from disk (not open in editor)
   */
  private validateFileFromDisk(uri: vscode.Uri): void {
    try {
      const content = fs.readFileSync(uri.fsPath, 'utf-8');
      const fsPath = uri.fsPath;

      if (fsPath.endsWith('.md') && fsPath.includes(path.join('.workflow', 'tickets'))) {
        this.validateTicketDocument(uri, content);
      } else if (fsPath.endsWith(path.join('.workflow', 'config', 'pipeline.yaml'))) {
        this.validatePipelineDocument(uri, content);
      } else if (fsPath.endsWith(path.join('.workflow', 'config', 'config.yaml'))) {
        this.validateConfigDocument(uri, content);
      }
    } catch (error) {
      // File may have been deleted or inaccessible
      this.diagnosticCollection.delete(uri);
    }
  }

  /**
   * Validate a ticket document
   */
  private validateTicketDocument(uri: vscode.Uri, content: string): void {
    try {
      const { frontmatter } = parseFrontmatter<Ticket>(content);
      const diagnostics = this.validationService.validateTicket(uri, frontmatter);
      this.diagnosticCollection.set(uri, diagnostics);
    } catch (error) {
      // Frontmatter parsing failed
      const diagnostics: vscode.Diagnostic[] = [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          vscode.l10n.t('Failed to parse ticket frontmatter: {0}', (error as Error).message),
          vscode.DiagnosticSeverity.Error
        )
      ];
      diagnostics[0].source = 'workflow-ai';
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  /**
   * Validate a pipeline document
   */
  private validatePipelineDocument(uri: vscode.Uri, content: string): void {
    try {
      const config = loadYaml(content) as PipelineConfig;
      const diagnostics = this.validationService.validatePipeline(uri, config);
      this.diagnosticCollection.set(uri, diagnostics);
    } catch (error) {
      // YAML parsing failed
      const diagnostics: vscode.Diagnostic[] = [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          vscode.l10n.t('Failed to parse pipeline YAML: {0}', (error as Error).message),
          vscode.DiagnosticSeverity.Error
        )
      ];
      diagnostics[0].source = 'workflow-ai';
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  /**
   * Validate a config document
   */
  private validateConfigDocument(uri: vscode.Uri, content: string): void {
    try {
      const config = loadYaml(content) as WorkflowConfig;
      const diagnostics = this.validationService.validateConfig(uri, config);
      this.diagnosticCollection.set(uri, diagnostics);
    } catch (error) {
      // YAML parsing failed
      const diagnostics: vscode.Diagnostic[] = [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          vscode.l10n.t('Failed to parse config YAML: {0}', (error as Error).message),
          vscode.DiagnosticSeverity.Error
        )
      ];
      diagnostics[0].source = 'workflow-ai';
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  /**
   * Validate all workflow files
   */
  validateAll(): void {
    if (!this.workflowRoot) {
      return;
    }

    // Use ValidationService bulk validation
    const validationResults = this.validationService.validateAll();

    for (const [uriString, diagnostics] of validationResults.entries()) {
      const uri = vscode.Uri.parse(uriString);
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  /**
   * Clear all diagnostics
   */
  clearAll(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.debounceMap.clearAll();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}
