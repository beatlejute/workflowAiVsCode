/**
 * ValidationService - Hybrid validation (JSON Schema + imperative code)
 *
 * Provides validation for workflow tickets, pipeline configuration, and workflow configuration.
 * Uses AJV for JSON Schema validation and custom imperative rules for business logic.
 * Returns vscode.Diagnostic[] for integration with VS Code Problems panel.
 *
 * ADR-006: Hybrid validation approach combining schema validation with custom business rules.
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import { join } from 'path';
import { Ticket, WorkflowConfig, PipelineConfig } from '../data/types';
import { WorkflowStore } from '../data/workflow-store';
import { DependencyService } from './dependency-service';
import { ConfigManager } from '../data/config-manager';
import { PIPELINE_SCHEMA } from '../schemas/index';

/**
 * Validation error with severity level
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  range?: vscode.Range;
}

/**
 * Ticket JSON Schema for AJV validation
 */
const TICKET_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'status', 'priority', 'type'],
  additionalProperties: true,
  properties: {
    id: {
      type: 'string',
      pattern: '^[A-Z]+-\\d+$'
    },
    title: {
      type: 'string',
      minLength: 1
    },
    status: {
      type: 'string',
      enum: ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done']
    },
    priority: {
      type: 'integer',
      minimum: 1,
      maximum: 5
    },
    type: {
      type: 'string'
    },
    dependencies: {
      type: 'array',
      items: { type: 'string' }
    },
    conditions: {
      type: 'array'
    },
    context: {
      type: 'object'
    },
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    complexity: {
      type: 'string'
    },
    parent_plan: {
      type: 'string'
    },
    parent_task: {
      type: 'string'
    },
    created_at: {
      type: 'string'
    },
    updated_at: {
      type: 'string'
    },
    completed_at: {
      type: 'string'
    }
  }
};

/**
 * ValidationService - Hybrid validation for workflow artifacts
 *
 * Combines JSON Schema validation (AJV) with imperative business rules.
 */
export class ValidationService {
  private readonly ajv: Ajv;
  private readonly store: WorkflowStore;
  private readonly dependencyService: DependencyService;
  private readonly configManager: ConfigManager;

  private ticketValidator: ValidateFunction | null = null;
  private pipelineValidator: ValidateFunction | null = null;

  /**
   * Create ValidationService
   * @param store - WorkflowStore for data access
   */
  constructor(store: WorkflowStore) {
    this.store = store;
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.dependencyService = new DependencyService(store);
    this.configManager = new ConfigManager();
  }

  /**
   * Initialize validators (load schemas)
   */
  private initializeValidators(): void {
    if (!this.ticketValidator) {
      this.ticketValidator = this.ajv.compile(TICKET_SCHEMA);
    }
    if (!this.pipelineValidator) {
      this.pipelineValidator = this.ajv.compile(PIPELINE_SCHEMA);
    }
  }

  // ==================== Ticket Validation ====================

  /**
   * Validate a ticket using JSON Schema + imperative rules
   *
   * @param uri - URI of the ticket file
   * @param ticket - Ticket object to validate
   * @returns Array of diagnostics
   */
  validateTicket(uri: vscode.Uri, ticket: Ticket): vscode.Diagnostic[] {
    this.initializeValidators();
    const diagnostics: vscode.Diagnostic[] = [];

    // Guard against undefined ticket
    if (!ticket) {
      diagnostics.push(this.createDiagnostic(
        uri,
        t('Ticket is undefined or could not be parsed'),
        vscode.DiagnosticSeverity.Error,
        'ticket'
      ));
      return diagnostics;
    }

    // JSON Schema validation
    if (this.ticketValidator) {
      const valid = this.ticketValidator(ticket);
      if (!valid && this.ticketValidator.errors) {
        const schemaErrors = this.formatAjvErrors(this.ticketValidator.errors, uri);
        diagnostics.push(...schemaErrors);
      }
    }

    // Validate type against config
    const config = this.store.getConfig();
    if (config && config.task_types && !(ticket.type in config.task_types)) {
      diagnostics.push(this.createDiagnostic(
        uri,
        t('Unknown task type "{0}". Valid types: {1}', ticket.type, Object.keys(config.task_types).join(', ')),
        vscode.DiagnosticSeverity.Warning,
        'type'
      ));
    }

    // Imperative validation rules
    const imperativeErrors = this.validateTicketImperative(ticket, uri);
    diagnostics.push(...imperativeErrors);

    return diagnostics;
  }

  /**
   * Imperative validation rules for tickets
   */
  private validateTicketImperative(ticket: Ticket, uri: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    // Check dependency refs exist
    const depErrors = this.validateDependencyRefs(ticket, uri);
    diagnostics.push(...depErrors);

    // Check for cycles (only if ticket has dependencies)
    if (ticket.dependencies && ticket.dependencies.length > 0) {
      const cycleErrors = this.validateNoCycles(uri);
      diagnostics.push(...cycleErrors);
    }

    return diagnostics;
  }

  /**
   * Validate that all dependency IDs reference existing tickets
   */
  private validateDependencyRefs(ticket: Ticket, uri: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const depId of (ticket.dependencies || [])) {
      const depTicket = this.store.getTicketById(depId);
      if (!depTicket) {
        diagnostics.push(this.createDiagnostic(
          uri,
          t('Dependency "{0}" does not exist', depId),
          vscode.DiagnosticSeverity.Error,
          'dependencies'
        ));
      }
    }

    return diagnostics;
  }

  /**
   * Validate no cycles in dependency graph
   */
  private validateNoCycles(uri: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const cycles = this.dependencyService.detectCycles();

    if (cycles.length > 0) {
      for (const cycle of cycles) {
        const cycleStr = cycle.cycle.join(' → ');
        diagnostics.push(this.createDiagnostic(
          uri,
          t('Cyclic dependency detected: {0}', cycleStr),
          vscode.DiagnosticSeverity.Error,
          'dependencies'
        ));
      }
    }

    return diagnostics;
  }

  // ==================== Pipeline Validation ====================

  /**
   * Validate pipeline configuration
   *
   * @param uri - URI of the pipeline file
   * @param config - PipelineConfig to validate
   * @returns Array of diagnostics
   */
  validatePipeline(uri: vscode.Uri, config: PipelineConfig): vscode.Diagnostic[] {
    this.initializeValidators();
    const diagnostics: vscode.Diagnostic[] = [];

    // JSON Schema validation
    if (this.pipelineValidator) {
      const valid = this.pipelineValidator(config);
      if (!valid && this.pipelineValidator.errors) {
        const schemaErrors = this.formatAjvErrors(this.pipelineValidator.errors, uri);
        diagnostics.push(...schemaErrors);
      }
    }

    // Imperative validation rules
    const imperativeErrors = this.validatePipelineRefs(config, uri);
    diagnostics.push(...imperativeErrors);

    return diagnostics;
  }

  /**
   * Imperative validation rules for pipeline
   */
  private validatePipelineRefs(config: PipelineConfig, uri: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const pipeline = config.pipeline;

    // Validate entry_point or entry is present and exists in stages
    const entryPoint = pipeline.entry_point || pipeline.entry;
    if (!entryPoint) {
      diagnostics.push(this.createDiagnostic(
        uri,
        t('Pipeline must have "entry_point" or "entry" field'),
        vscode.DiagnosticSeverity.Error,
        'entry_point'
      ));
    } else if (pipeline.stages) {
      if (!(entryPoint in pipeline.stages)) {
        diagnostics.push(this.createDiagnostic(
          uri,
          t('Entry point "{0}" does not exist in stages', entryPoint),
          vscode.DiagnosticSeverity.Error,
          'entry_point'
        ));
      }
    }

    // Validate stage goto references
    if (pipeline.stages) {
      for (const [stageName, stage] of Object.entries(pipeline.stages)) {
        if (stage.goto) {
          for (const [gotoName, goto] of Object.entries(stage.goto)) {
            const targetStage = typeof goto === 'string' ? goto : goto.stage;
            if (targetStage && targetStage !== 'end' && !(targetStage in pipeline.stages)) {
              diagnostics.push(this.createDiagnostic(
                uri,
                t('Stage "{0}" goto "{1}" references non-existent stage "{2}"', stageName, gotoName, targetStage),
                vscode.DiagnosticSeverity.Error,
                `stages.${stageName}.goto.${gotoName}`
              ));
            }
          }
        }

        // Validate agent references
        if (stage.agent && pipeline.agents && !(stage.agent in pipeline.agents)) {
          diagnostics.push(this.createDiagnostic(
            uri,
            t('Stage "{0}" references non-existent agent "{1}"', stageName, stage.agent),
            vscode.DiagnosticSeverity.Error,
            `stages.${stageName}.agent`
          ));
        }
      }
    }

    return diagnostics;
  }

  // ==================== Config Validation ====================

  /**
   * Validate workflow configuration
   *
   * @param uri - URI of the config file
   * @param config - WorkflowConfig to validate
   * @returns Array of diagnostics
   */
  validateConfig(uri: vscode.Uri, config: WorkflowConfig): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    // Basic schema validation (config-manager already validates on load)
    if (!config.version) {
      diagnostics.push(this.createDiagnostic(
        uri,
        t('Missing required field "{0}"', 'version'),
        vscode.DiagnosticSeverity.Error,
        'version'
      ));
    }

    if (!config.paths) {
      diagnostics.push(this.createDiagnostic(
        uri,
        t('Missing required field "{0}"', 'paths'),
        vscode.DiagnosticSeverity.Error,
        'paths'
      ));
    } else {
      const requiredPaths = ['tickets', 'plans', 'reports', 'archive'];
      for (const pathField of requiredPaths) {
        if (!(pathField in config.paths)) {
          diagnostics.push(this.createDiagnostic(
            uri,
            t('Missing required path "{0}"', pathField),
            vscode.DiagnosticSeverity.Error,
            `paths.${pathField}`
          ));
        }
      }
    }

    return diagnostics;
  }

  // ==================== Bulk Validation ====================

  /**
   * Validate all tickets and return diagnostics map
   *
   * @returns Map of file URI strings to diagnostics arrays
   */
  validateAll(): Map<string, vscode.Diagnostic[]> {
    const result = new Map<string, vscode.Diagnostic[]>();
    const workflowRoot = this.store.getWorkflowRoot();

    if (!workflowRoot) {
      return result;
    }

    // Validate all tickets
    const tickets = this.store.getTickets();
    for (const ticket of tickets) {
      const uri = vscode.Uri.file(
        join(workflowRoot, '.workflow', 'tickets', ticket.status, `${ticket.id}.md`)
      );
      const diagnostics = this.validateTicket(uri, ticket);
      if (diagnostics.length > 0) {
        result.set(uri.toString(), diagnostics);
      }
    }

    // Validate pipeline config
    try {
      const pipeline = this.store.getPipeline();
      if (pipeline) {
        const pipelinePath = join(workflowRoot, '.workflow', 'config', 'pipeline.yaml');
        const uri = vscode.Uri.file(pipelinePath);
        const diagnostics = this.validatePipeline(uri, pipeline);
        if (diagnostics.length > 0) {
          result.set(uri.toString(), diagnostics);
        }
      }
    } catch {
      // Pipeline may not exist or be invalid
    }

    // Validate workflow config
    try {
      const config = this.store.getConfig();
      if (config) {
        const configPath = join(workflowRoot, '.workflow', 'config', 'config.yaml');
        const uri = vscode.Uri.file(configPath);
        const diagnostics = this.validateConfig(uri, config);
        if (diagnostics.length > 0) {
          result.set(uri.toString(), diagnostics);
        }
      }
    } catch {
      // Config may not exist or be invalid
    }

    return result;
  }

  // ==================== Helper Methods ====================

  /**
   * Format AJV errors into vscode.Diagnostics
   */
  private formatAjvErrors(errors: ErrorObject[], uri: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const error of errors) {
      const message = this.formatAjvError(error);
      const field = error.instancePath.slice(1) || 'root';
      diagnostics.push(this.createDiagnostic(
        uri,
        message,
        vscode.DiagnosticSeverity.Error,
        field
      ));
    }

    return diagnostics;
  }

  /**
   * Format a single AJV error into human-readable message
   */
  private formatAjvError(error: ErrorObject): string {
    const { keyword, params } = error;
    const field = error.instancePath.slice(1) || 'root';
    const paramsRecord = params as Record<string, unknown>;

    switch (keyword) {
      case 'required':
        return t('Missing required field "{0}"', paramsRecord.missingProperty as string);
      case 'type':
        return t('Field "{0}" must be of type {1}', field, paramsRecord.type as string);
      case 'pattern':
        return t('Field "{0}" does not match required pattern', field);
      case 'enum':
        return t('Field "{0}" must be one of: {1}', field, (paramsRecord.allowedValues as string[])?.join(', '));
      case 'minimum':
        return t('Field "{0}" must be >= {1}', field, paramsRecord.limit as number);
      case 'maximum':
        return t('Field "{0}" must be <= {1}', field, paramsRecord.limit as number);
      case 'minLength':
        return t('Field "{0}" cannot be empty', field);
      default:
        return t('Validation error: {0}', keyword);
    }
  }

  /**
   * Create a vscode.Diagnostic with the given parameters
   */
  private createDiagnostic(
    uri: vscode.Uri,
    message: string,
    severity: vscode.DiagnosticSeverity,
    field?: string
  ): vscode.Diagnostic {
    // Use (0,0)-(0,0) range if exact position is not available
    const range = new vscode.Range(0, 0, 0, 0);
    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = 'workflow-ai';

    if (field) {
      diagnostic.code = field;
    }

    return diagnostic;
  }
}
