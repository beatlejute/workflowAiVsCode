import { IRecurringService } from './IRecurringService';
import { WorkflowStore, StoreChangeEvent } from '../data/workflow-store';
import { RecurringDefinition } from '../data/types';
import { parseCron, getNextDate, CronExpression } from '../utils/cron-parser';

const TICK_INTERVAL_MS = 60000;

export class RecurringScheduler {
  private readonly recurringService: IRecurringService;
  private readonly store?: WorkflowStore;
  private intervalId: NodeJS.Timeout | null = null;
  private definitions: RecurringDefinition[] = [];
  private isRunning: boolean = false;
  private eventListener: ((event: StoreChangeEvent) => void) | null = null;

  constructor(recurringService: IRecurringService, store?: WorkflowStore) {
    this.recurringService = recurringService;
    this.store = store;
    this.initEventListeners();
  }

  private initEventListeners(): void {
    if (!this.store) {
      return;
    }

    this.eventListener = (event: StoreChangeEvent) => {
      if (event.type === 'recurring' && event.operation === 'update') {
        void this.handleRecurringReload();
      }
    };

    this.store.onDidChange(this.eventListener);
  }

  async start(definitions: RecurringDefinition[]): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.definitions = definitions;
    await this.recovery();
    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  async reschedule(defId: string): Promise<void> {
    const definition = this.definitions.find(d => d.id === defId);
    if (!definition) {
      return;
    }

    await this.calculateAndSaveNextTrigger(definition);
  }

  private async handleRecurringReload(): Promise<void> {
    console.log('RecurringScheduler: Reloading definitions due to recurring.yaml change');

    // Stop the current interval
    this.stop();

    // Get fresh definitions from the store
    const newDefinitions = this.store?.getRecurringDefinitions() ?? [];

    if (newDefinitions.length > 0) {
      // Recalculate next_trigger_at for all cron definitions
      for (const definition of newDefinitions) {
        if (definition.trigger.type === 'cron') {
          await this.calculateAndSaveNextTrigger(definition);
        }
      }

      // Restart with new definitions
      await this.start(newDefinitions);
    } else {
      // No definitions - just stop
      this.definitions = [];
    }
  }

  dispose(): void {
    this.stop();
    this.definitions = [];
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    for (const definition of this.definitions) {
      if (!definition.enabled) {
        continue;
      }

      if (definition.trigger.type !== 'cron') {
        continue;
      }

      if (!definition.state.next_trigger_at) {
        await this.calculateAndSaveNextTrigger(definition);
        continue;
      }

      const nextTrigger = new Date(definition.state.next_trigger_at).getTime();

      if (nextTrigger <= now) {
        try {
          await this.recurringService.createInstance(definition.id);
        } catch (error) {
          console.error(`RecurringScheduler: Failed to create instance for ${definition.id}:`, error);
        }

        await this.calculateAndSaveNextTrigger(definition);
      }
    }
  }

  private async recovery(): Promise<void> {
    const now = Date.now();

    for (const definition of this.definitions) {
      if (!definition.enabled) {
        continue;
      }

      if (definition.trigger.type !== 'cron') {
        continue;
      }

      if (!definition.state.next_trigger_at) {
        await this.calculateAndSaveNextTrigger(definition);
        continue;
      }

      const nextTrigger = new Date(definition.state.next_trigger_at).getTime();

      if (nextTrigger <= now) {
        try {
          await this.recurringService.createInstance(definition.id);
        } catch (error) {
          console.error(`RecurringScheduler: Recovery failed for ${definition.id}:`, error);
        }

        await this.calculateAndSaveNextTrigger(definition);
      }
    }
  }

  private async calculateAndSaveNextTrigger(definition: RecurringDefinition): Promise<void> {
    if (definition.trigger.type !== 'cron') {
      return;
    }

    const cronTrigger = definition.trigger;
    const cronExpr = parseCron(cronTrigger.expression);

    if ('message' in cronExpr) {
      console.error(`RecurringScheduler: Invalid cron expression for ${definition.id}:`, cronExpr.message);
      return;
    }

    const now = new Date();
    const nextDate = getNextDate(cronExpr as CronExpression, now);

    definition.state.next_trigger_at = nextDate.toISOString();

    await this.recurringService.saveDefinitions(this.definitions);
  }
}
