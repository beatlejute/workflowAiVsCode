/**
 * ConfigManager - Configuration management for Workflow AI extension
 * Provides unified access to configuration with caching and change events
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { WorkflowConfig, PipelineConfig, ValidationError } from './types';
import { EventEmitter } from 'events';

/**
 * JSON Schema for config.yaml validation
 */
const CONFIG_SCHEMA = {
  type: 'object',
  required: ['version', 'paths'],
  properties: {
    version: { type: 'string' },
    project: { type: 'object' },
    task_types: { type: 'object' },
    priorities: { type: 'object' },
    statuses: { type: 'object' },
    condition_types: { type: 'object' },
    paths: {
      type: 'object',
      required: ['tickets', 'plans', 'reports', 'archive'],
      properties: {
        tickets: { type: 'string' },
        plans: { type: 'string' },
        reports: { type: 'string' },
        archive: { type: 'string' },
        templates: { type: 'string' }
      }
    },
    reporting: { type: 'object' }
  }
};

/**
 * JSON Schema for pipeline.yaml validation
 */
const PIPELINE_SCHEMA = {
  type: 'object',
  required: ['pipeline'],
  properties: {
    pipeline: {
      type: 'object',
      required: ['agents', 'stages', 'entry'],
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
        agents: { 
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['command', 'args'],
            properties: {
              command: { type: 'string' },
              args: { type: 'array', items: { type: 'string' } },
              workdir: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        stages: { 
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['description'],
            properties: {
              description: { type: 'string' },
              agent: { type: 'string' },
              fallback_agent: { type: 'string' },
              skill: { type: 'string' },
              type: { type: 'string' },
              counter: { type: 'string' },
              max: { type: 'number' },
              timeout: { type: 'number' },
              goto: { type: 'object' }
            }
          }
        },
        entry: { type: 'string' },
        entry_point: { type: 'string' },
        context: { type: 'object' },
        execution: { 
          type: 'object',
          properties: {
            max_steps: { type: 'number' },
            delay_between_stages: { type: 'number' },
            timeout_per_stage: { type: 'number' },
            log_file: { type: 'string' }
          }
        },
        protected_files: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};

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
        const actualType = Array.isArray(value) ? 'array' : typeof value;

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
                    const expectedPropType = propSchema.type;
                    const actualPropType = Array.isArray(propValue) ? 'array' : typeof propValue;

                    if (expectedPropType === 'array' && !Array.isArray(propValue)) {
                      errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${propKey}` : `${key}.${nestedKey}.${propKey}`, message: `Field "${key}.${nestedKey}.${propKey}" must be an array` });
                    } else if (expectedPropType !== 'array' && typeof propValue !== expectedPropType) {
                      errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${propKey}` : `${key}.${nestedKey}.${propKey}`, message: `Field "${key}.${nestedKey}.${propKey}" must be of type ${expectedPropType}` });
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
      return yaml.load(content) as unknown;
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
   * Reloads configuration from disk, clearing cache
   */
  async reload(): Promise<void> {
    const oldRoot = this.workflowRoot;

    // Clear cache
    this.workflowConfig = null;
    this.pipelineConfig = null;

    // Reload if we had a previous root
    if (oldRoot) {
      await this.loadConfig(oldRoot);
      await this.loadPipeline(oldRoot);
    }

    // Fire change event
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
   * Clears configuration cache
   */
  clearCache(): void {
    this.workflowConfig = null;
    this.pipelineConfig = null;
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
