/**
 * RecurringService - Implementation of recurring definition management
 *
 * Provides CRUD operations for recurring definitions and instance creation.
 * Loads definitions from YAML, supports templates with variable substitution.
 *
 * ADR-002: Files are source of truth, in-memory cache for performance
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { safeLoad } from '../utils/yaml-utils';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { Ticket, Plan, RecurringDefinition, RecurringState, TicketStatus, OnCompletionTrigger } from '../data/types';
import { IRecurringService } from './IRecurringService';
import { ConfigManager } from '../data/config-manager';
import { TicketService } from './ticket-service';
import { PlanService } from './plan-service';

export class RecurringService implements IRecurringService {
  private readonly store: WorkflowStore;
  private readonly ticketService: TicketService;
  private readonly planService: PlanService;
  private readonly configManager: ConfigManager;
  private readonly workflowRoot: string;
  private definitions: RecurringDefinition[] = [];
  private eventListener: ((event: StoreChangeEvent) => void) | null = null;
  private currentTriggerValue: string = '';

  constructor(
    store: WorkflowStore,
    ticketService: TicketService,
    planService: PlanService,
    configManager: ConfigManager,
    workflowRoot: string
  ) {
    this.store = store;
    this.ticketService = ticketService;
    this.planService = planService;
    this.configManager = configManager;
    this.workflowRoot = workflowRoot;
    this.initEventListeners();
  }

  /**
   * Initialize event listeners for store changes
   * Subscribes to ticket update events to detect completion
   */
  private initEventListeners(): void {
    this.eventListener = (event: StoreChangeEvent) => {
      if (event.type === 'ticket' && event.operation === 'update' && event.id) {
        const ticket = this.store.getTicketById(event.id);
        if (ticket && ticket.status === TicketStatus.Done) {
          void this.handleTicketCompletion(ticket);
        }
      }

      if (event.type === 'report' && event.operation === 'add' && event.id) {
        const report = this.store.getReportById(event.id);
        if (report) {
          const reportPath = `.workflow/reports/${event.id}.md`;
          void this.handleFileEvent(reportPath, 'report_created');
        }
      }

      if (event.type === 'plan' && event.operation === 'update' && event.id) {
        const plan = this.store.getPlanById(event.id);
        if (plan && plan.status === 'completed') {
          const planPath = `plans/${plan.folder}/${event.id}.md`;
          void this.handleFileEvent(planPath, 'plan_completed');
        }
      }
    };

    this.store.onDidChange(this.eventListener);
  }

  async loadDefinitions(): Promise<RecurringDefinition[]> {
    const configPath = path.join(this.workflowRoot, '.workflow', 'config', 'recurring.yaml');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const data = safeLoad(content) as { definitions?: RecurringDefinition[] };

      if (data && data.definitions) {
        this.definitions = data.definitions.map(def => ({
          ...def,
          state: def.state || {
            last_triggered_at: null,
            next_trigger_at: null,
            instance_count: 0,
            last_instance_id: null,
            is_active_instance: false
          }
        }));
      } else {
        this.definitions = [];
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.definitions = [];
      } else {
        throw error;
      }
    }

    return this.definitions;
  }

  async saveDefinitions(definitions: RecurringDefinition[]): Promise<void> {
    const configPath = path.join(this.workflowRoot, '.workflow', 'config', 'recurring.yaml');
    const dirPath = path.dirname(configPath);

    await fs.mkdir(dirPath, { recursive: true });

    const data = { definitions };
    const content = yaml.dump(data, { indent: 2, lineWidth: -1 });

    await fs.writeFile(configPath, content, 'utf-8');
    this.definitions = definitions;
  }

  async createInstance(defId: string, triggerValue?: string): Promise<Ticket | Plan> {
    const definition = this.definitions.find(d => d.id === defId);
    if (!definition) {
      throw new Error(`Recurring definition ${defId} not found`);
    }

    if (!definition.enabled) {
      throw new Error(`Recurring definition ${defId} is disabled`);
    }

    const now = new Date();
    const instanceNumber = definition.state.instance_count + 1;
    const triggerVal = triggerValue ?? this.currentTriggerValue;
    const title = this.interpolateTemplate(definition.template.title_template, {
      date: now.toISOString().split('T')[0],
      n: String(instanceNumber),
      trigger_value: triggerVal
    });

    let instance: Ticket | Plan;

    if (definition.entity_type === 'ticket') {
      instance = await this.ticketService.create(definition.template.type || 'task', title, {
        status: (definition.template.status as TicketStatus) || TicketStatus.Backlog,
        priority: definition.template.priority || 3,
        tags: definition.template.tags || [],
        recurring_source: definition.id
      });

      if (definition.template.body_template) {
        await this.ticketService.update(instance.id, {
          context: {
            files: [],
            references: [],
            notes: this.interpolateTemplate(definition.template.body_template, {
              date: now.toISOString().split('T')[0],
              n: String(instanceNumber),
              trigger_value: triggerVal
            })
          }
        });
        instance = this.ticketService.getById(instance.id) as Ticket;
      }
    } else if (definition.entity_type === 'plan') {
      let bodyContent: string | undefined;
      if (definition.template.body_template) {
        bodyContent = this.interpolateTemplate(definition.template.body_template, {
          date: now.toISOString().split('T')[0],
          n: String(instanceNumber),
          trigger_value: triggerVal
        });
      }

      instance = await this.planService.create(title, {
        status: definition.template.status || 'draft',
        author: 'system'
      }, bodyContent);
    } else {
      throw new Error(`Unsupported entity_type: ${definition.entity_type}`);
    }

    definition.state.last_triggered_at = now.toISOString();
    definition.state.instance_count = instanceNumber;
    definition.state.last_instance_id = instance.id;
    definition.state.is_active_instance = true;

    await this.saveDefinitions(this.definitions);

    return instance;
  }

  private interpolateTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  private matchGlobPattern(path: string, pattern: string): boolean {
    if (!pattern) {
      return true;
    }

    const normalizedPath = path.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    if (normalizedPattern === '*') {
      return !normalizedPath.includes('/');
    }

    if (normalizedPattern === '**') {
      return true;
    }

    const regexPattern = normalizedPattern
      .replace(/\*\*/g, '{{GLOB_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOB_STAR}}/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
  }

  async enableDefinition(id: string): Promise<void> {
    const definition = this.definitions.find(d => d.id === id);
    if (!definition) {
      throw new Error(`Recurring definition ${id} not found`);
    }

    definition.enabled = true;
    await this.saveDefinitions(this.definitions);
  }

  async disableDefinition(id: string): Promise<void> {
    const definition = this.definitions.find(d => d.id === id);
    if (!definition) {
      throw new Error(`Recurring definition ${id} not found`);
    }

    definition.enabled = false;
    await this.saveDefinitions(this.definitions);
  }

  async deleteDefinition(id: string): Promise<void> {
    const index = this.definitions.findIndex(d => d.id === id);
    if (index === -1) {
      throw new Error(`Recurring definition ${id} not found`);
    }

    this.definitions.splice(index, 1);
    await this.saveDefinitions(this.definitions);
  }

  /**
   * Handle ticket completion - triggers on-completion recurring definitions
   *
   * When a ticket with recurring_source is completed (status === Done),
   * finds all enabled on-completion definitions and creates new instances.
   *
   * Guard: Prevents cyclic triggers via is_active_instance check.
   *
   * @param ticket - Completed ticket
   */
  async handleTicketCompletion(ticket: Ticket): Promise<void> {
    // Check if ticket has a recurring_source
    if (!ticket.recurring_source) {
      return; // Not a recurring ticket, skip
    }

    // Find all enabled on-completion definitions
    const onCompletionDefinitions = this.definitions.filter(def =>
      def.enabled &&
      def.trigger.type === 'on-completion' &&
      ticket.recurring_source === def.id
    );

    for (const definition of onCompletionDefinitions) {
      // Guard: Prevent cyclic triggers
      // If is_active_instance is true, the previous instance is still active
      // Don't create a new instance to avoid infinite loops
      if (definition.state.is_active_instance) {
        // Reset is_active_instance to allow future triggers
        definition.state.is_active_instance = false;
        await this.saveDefinitions(this.definitions);
        continue;
      }

      // Reset is_active_instance on the completed ticket's definition
      const defIndex = this.definitions.findIndex(d => d.id === definition.id);
      if (defIndex === -1) {
        continue;
      }

      const currentDef = this.definitions[defIndex];

      // Mark the completed instance as inactive
      currentDef.state.is_active_instance = false;

      // Create new instance
      await this.createInstance(definition.id);
    }
  }

  async handleFileEvent(filePath: string, eventType: string): Promise<void> {
    const eventDefinitions = this.definitions.filter(def =>
      def.enabled && def.trigger.type === 'event'
    );

    for (const definition of eventDefinitions) {
      const trigger = definition.trigger as { type: string; event?: string; pattern?: string };
      
      if (trigger.event !== eventType) {
        continue;
      }

      if (trigger.pattern && !this.matchGlobPattern(filePath, trigger.pattern)) {
        continue;
      }

      const triggerValue = this.extractTriggerValue(filePath, eventType);
      this.currentTriggerValue = triggerValue;

      try {
        await this.createInstance(definition.id, triggerValue);
      } finally {
        this.currentTriggerValue = '';
      }
    }
  }

  private extractTriggerValue(filePath: string, eventType: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    const fileName = parts[parts.length - 1];
    
    if (eventType === 'report_created') {
      return fileName.replace('.md', '');
    }
    
    if (eventType === 'plan_completed') {
      return fileName.replace('.md', '');
    }
    
    if (eventType === 'file_created') {
      return fileName;
    }
    
    return fileName;
  }

  dispose(): void {
    // Remove event listener
    if (this.eventListener) {
      // Note: WorkflowStore doesn't have offDidChange, so we just nullify
      this.eventListener = null;
    }
    this.definitions = [];
  }
}
