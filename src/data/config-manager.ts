/**
 * ConfigManager - Configuration management for Workflow AI extension
 * Provides unified access to configuration with caching and change events
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { safeLoad } from '../utils/yaml-utils';
import { WorkflowConfig, PipelineConfig, ValidationError, RecurringDefinition } from './types';
import { EventEmitter } from 'events';
import { CONFIG_SCHEMA, PIPELINE_SCHEMA, RECURRING_SCHEMA } from '../schemas/index';

/**
 * Validates data against a JSON schema
 * Returns array of validation errors
 */
function validateSchema(data: unknown, schema: Record<string, unknown>, fieldPrefix = ''): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    errors.push({ field: fieldPrefix || 'root', message: 'Configuration must be an object' });
    return errors;
  }

  const obj = data as Record<string, unknown>;
  const required = schema.required as string[] | undefined;

  // Check required fields
  if (required) {
    for (const field of required) {
      if (!(field in obj)) {
        errors.push({ field: fieldPrefix ? `${fieldPrefix}.${field}` : field, message: `Required field "${field}" is missing` });
      }
    }
  }

  // Check property types
  const properties = schema.properties as Record<string, { type?: string; additionalProperties?: Record<string, unknown>; properties?: Record<string, unknown>; required?: string[] }> | undefined;
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in obj && propSchema.type) {
        const value = obj[key];
        const expectedType = propSchema.type;

        if (expectedType === 'array' && !Array.isArray(value)) {
          errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}` : key, message: `Field "${key}" must be an array` });
        } else if (expectedType !== 'array' && typeof value !== expectedType) {
          errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}` : key, message: `Field "${key}" must be of type ${expectedType}` });
        }

        // Recursively validate nested objects with their own required fields
        if (expectedType === 'object' && typeof value === 'object' && value !== null) {
          const nestedRequired = propSchema.required as string[] | undefined;
          const nestedProperties = propSchema.properties as Record<string, unknown> | undefined;
          
          if (nestedRequired || nestedProperties) {
            const nestedSchema: Record<string, unknown> = {};
            if (nestedRequired) nestedSchema.required = nestedRequired;
            if (nestedProperties) nestedSchema.properties = nestedProperties;
            
            const nestedErrors = validateSchema(value, nestedSchema, fieldPrefix ? `${fieldPrefix}.${key}` : key);
            errors.push(...nestedErrors);
          }

          // Validate additionalProperties for object fields
          if (propSchema.additionalProperties) {
            const nestedSchema = propSchema.additionalProperties as Record<string, unknown>;
            const nestedReq = nestedSchema.required as string[] | undefined;
            const nestedProps = nestedSchema.properties as Record<string, { type?: string }> | undefined;

            // Check each nested object
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
              if (typeof nestedValue !== 'object' || nestedValue === null) {
                errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}` : `${key}.${nestedKey}`, message: `Field "${key}.${nestedKey}" must be an object` });
                continue;
              }

              const nestedObj = nestedValue as Record<string, unknown>;

              // Check required nested properties
              if (nestedReq) {
                for (const reqField of nestedReq) {
                  if (!(reqField in nestedObj)) {
                    errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${reqField}` : `${key}.${nestedKey}.${reqField}`, message: `Required field "${reqField}" is missing in "${key}.${nestedKey}"` });
                  }
                }
              }

              // Check nested property types
              if (nestedProps) {
                for (const [propKey, propSchema] of Object.entries(nestedProps)) {
                  if (propKey in nestedObj && propSchema.type) {
                    const propValue = nestedObj[propKey];
                    const _expectedPropType = propSchema.type;

                    if (_expectedPropType === 'array' && !Array.isArray(propValue)) {
                      errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${propKey}` : `${key}.${nestedKey}.${propKey}`, message: `Field "${key}.${nestedKey}.${propKey}" must be an array` });
                    } else if (_expectedPropType !== 'array' && typeof propValue !== _expectedPropType) {
                      errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${propKey}` : `${key}.${nestedKey}.${propKey}`, message: `Field "${key}.${nestedKey}.${propKey}" must be of type ${_expectedPropType}` });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Configuration manager class
 * Provides unified access to workflow configuration with caching
 */
export class ConfigManager {
  private workflowConfig: WorkflowConfig | null = null;
  private pipelineConfig: PipelineConfig | null = null;
  private recurringDefinitions: RecurringDefinition[] | null = null;
  private workflowRoot: string | null = null;
  private readonly eventEmitter: EventEmitter;

  /**
   * Event fired when configuration is reloaded
   */
  public readonly onDidChange: (listener: () => void) => void;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.onDidChange = (listener: () => void) => {
      this.eventEmitter.on('change', listener);
    };
  }

  /**
   * Reads and parses a YAML file
   */
  private async readYamlFile(filePath: string): Promise<unknown> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return safeLoad(content) as unknown;
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Configuration file not found: ${filePath}`);
        }
        if (error instanceof yaml.YAMLException) {
          throw new Error(`Invalid YAML in ${filePath}: ${error.message}`);
        }
      }
      throw new Error(`Failed to read ${filePath}: ${error}`);
    }
  }

  /**
   * Loads workflow configuration from config.yaml
   */
  async loadConfig(workflowRoot: string): Promise<WorkflowConfig> {
    // Return cached config if available and root hasn't changed
    if (this.workflowConfig && this.workflowRoot === workflowRoot) {
      return this.workflowConfig;
    }

    const configPath = path.join(workflowRoot, 'config', 'config.yaml');
    const data = await this.readYamlFile(configPath);
    
    // Validate against schema
    const errors = validateSchema(data, CONFIG_SCHEMA);
    if (errors.length > 0) {
      throw new ConfigValidationError(errors);
    }

    this.workflowConfig = data as WorkflowConfig;
    this.workflowRoot = workflowRoot;
    
    return this.workflowConfig;
  }

  /**
   * Loads pipeline configuration from pipeline.yaml
   */
  async loadPipeline(workflowRoot: string): Promise<PipelineConfig> {
    // Return cached config if available and root hasn't changed
    if (this.pipelineConfig && this.workflowRoot === workflowRoot) {
      return this.pipelineConfig;
    }

    const pipelinePath = path.join(workflowRoot, 'config', 'pipeline.yaml');
    const data = await this.readYamlFile(pipelinePath);
    
    // Validate against schema
    const errors = validateSchema(data, PIPELINE_SCHEMA);
    if (errors.length > 0) {
      throw new ConfigValidationError(errors);
    }

    this.pipelineConfig = data as PipelineConfig;
    this.workflowRoot = workflowRoot;
    
    return this.pipelineConfig;
  }

  /**
   * Loads recurring definitions from recurring.yaml
   */
  async loadRecurring(workflowRoot: string): Promise<RecurringDefinition[]> {
    if (this.recurringDefinitions && this.workflowRoot === workflowRoot) {
      return this.recurringDefinitions;
    }

    const recurringPath = path.join(workflowRoot, '.workflow', 'config', 'recurring.yaml');

    try {
      const content = await fs.readFile(recurringPath, 'utf-8');
      const data = safeLoad(content) as { definitions?: RecurringDefinition[] };

      if (data && data.definitions) {
        const errors = validateSchema(data, RECURRING_SCHEMA);
        if (errors.length > 0) {
          throw new ConfigValidationError(errors);
        }
        this.recurringDefinitions = data.definitions;
      } else {
        this.recurringDefinitions = [];
      }
    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        throw new Error(`Invalid YAML in ${recurringPath}: ${error.message}`);
      }
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      this.recurringDefinitions = [];
    }

    this.workflowRoot = workflowRoot;
    return this.recurringDefinitions;
  }

  /**
   * Reloads configuration from disk, clearing cache
   */
  async reload(): Promise<void> {
    const oldRoot = this.workflowRoot;
    const hadConfig = this.workflowConfig !== null;
    const hadPipeline = this.pipelineConfig !== null;
    const hadRecurring = this.recurringDefinitions !== null;

    this.workflowConfig = null;
    this.pipelineConfig = null;
    this.recurringDefinitions = null;

    if (oldRoot) {
      if (hadConfig) await this.loadConfig(oldRoot);
      if (hadPipeline) await this.loadPipeline(oldRoot);
      if (hadRecurring) await this.loadRecurring(oldRoot);
    }

    this.eventEmitter.emit('change');
  }

  /**
   * Gets cached workflow configuration
   * Returns null if not loaded
   */
  getConfig(): WorkflowConfig | null {
    return this.workflowConfig;
  }

  /**
   * Gets cached pipeline configuration
   * Returns null if not loaded
   */
  getPipeline(): PipelineConfig | null {
    return this.pipelineConfig;
  }

  /**
   * Gets cached recurring definitions
   * Returns null if not loaded
   */
  getRecurring(): RecurringDefinition[] | null {
    return this.recurringDefinitions;
  }

  /**
   * Clears configuration cache
   */
  clearCache(): void {
    this.workflowConfig = null;
    this.pipelineConfig = null;
    this.recurringDefinitions = null;
  }

  /**
   * Dispose of the config manager and clean up resources
   * Removes all event listeners to prevent memory leaks
   */
  dispose(): void {
    this.eventEmitter.removeAllListeners();
  }
}

/**
 * Error thrown when configuration validation fails
 */
export class ConfigValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super(`Configuration validation failed: ${errors.map(e => e.message).join(', ')}`);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }
}
