/**
 * Unit tests for interfaces with mock implementations
 *
 * Tests:
 * - Mock implementations satisfy interface contracts
 * - Dependency injection with mocks works correctly
 * - Type safety of interfaces
 */

import * as assert from 'assert';
import { IStore, type StoreChangeListener } from '../../interfaces/IStore';
import { ITicketService } from '../../interfaces/ITicketService';
import { IFileWatcher } from '../../interfaces/IFileWatcher';
import { Ticket, Plan, Report, TicketStatus, WorkflowConfig, PipelineConfig } from '../../data/types';
import { StoreChangeEvent } from '../../data/workflow-store';

/**
 * Mock implementation of IStore for testing
 */
class MockStore implements IStore {
  private tickets: Map<string, Ticket> = new Map();
  private plans: Map<string, Plan> = new Map();
  private reports: Report[] = [];
  private config: WorkflowConfig | undefined;
  private pipeline: PipelineConfig | undefined;
  private workflowRoot: string | null = null;
  private listeners: ((event: StoreChangeEvent) => void)[] = [];

  onDidChange(listener: StoreChangeListener): void {
    this.listeners.push(listener);
  }

  async refresh(workflowRoot: string): Promise<void> {
    this.workflowRoot = workflowRoot;
  }

  addTicket(ticket: Ticket): void {
    this.tickets.set(ticket.id, ticket);
    this.emitEvent({ type: 'ticket', id: ticket.id, operation: 'add' });
  }

  updateTicket(id: string, ticket: Ticket): void {
    if (!this.tickets.has(id)) {
      throw new Error(`Ticket ${id} not found`);
    }
    this.tickets.set(id, ticket);
    this.emitEvent({ type: 'ticket', id, operation: 'update' });
  }

  removeTicket(id: string): void {
    if (!this.tickets.has(id)) {
      throw new Error(`Ticket ${id} not found`);
    }
    this.tickets.delete(id);
    this.emitEvent({ type: 'ticket', id, operation: 'delete' });
  }

  getTickets(): Ticket[] {
    return Array.from(this.tickets.values());
  }

  getTicketById(id: string): Ticket | undefined {
    return this.tickets.get(id);
  }

  getTicketsByStatus(status: TicketStatus): Ticket[] {
    return Array.from(this.tickets.values()).filter(t => t.status === status);
  }

  getTicketsByPriority(priority: number): Ticket[] {
    return Array.from(this.tickets.values()).filter(t => t.priority === priority);
  }

  getTicketsWithDependency(dependencyId: string): Ticket[] {
    return Array.from(this.tickets.values()).filter(t =>
      t.dependencies.includes(dependencyId)
    );
  }

  addPlan(plan: Plan): void {
    this.plans.set(plan.id, plan);
    this.emitEvent({ type: 'plan', id: plan.id, operation: 'add' });
  }

  updatePlan(id: string, plan: Plan): void {
    if (!this.plans.has(id)) {
      throw new Error(`Plan ${id} not found`);
    }
    this.plans.set(id, plan);
    this.emitEvent({ type: 'plan', id, operation: 'update' });
  }

  removePlan(id: string): void {
    if (!this.plans.has(id)) {
      throw new Error(`Plan ${id} not found`);
    }
    this.plans.delete(id);
    this.emitEvent({ type: 'plan', id, operation: 'delete' });
  }

  getPlans(): Plan[] {
    return Array.from(this.plans.values());
  }

  getPlanById(id: string): Plan | undefined {
    return this.plans.get(id);
  }

  getCurrentPlans(): Plan[] {
    return Array.from(this.plans.values()).filter(p => p.folder === 'current');
  }

  getArchivedPlans(): Plan[] {
    return Array.from(this.plans.values()).filter(p => p.folder === 'archive');
  }

  addReport(report: Report): void {
    this.reports.push(report);
    this.emitEvent({ type: 'report', id: report.id, operation: 'add' });
  }

  updateReport(id: string, report: Report): void {
    const index = this.reports.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Report ${id} not found`);
    }
    this.reports[index] = report;
    this.emitEvent({ type: 'report', id, operation: 'update' });
  }

  removeReport(id: string): void {
    const index = this.reports.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Report ${id} not found`);
    }
    this.reports.splice(index, 1);
    this.emitEvent({ type: 'report', id, operation: 'delete' });
  }

  getReports(): Report[] {
    return this.reports;
  }

  getReportById(id: string): Report | undefined {
    return this.reports.find(r => r.id === id);
  }

  setConfig(config: WorkflowConfig | undefined): void {
    this.config = config;
    this.emitEvent({ type: 'config', operation: 'update' });
  }

  setPipeline(pipeline: PipelineConfig | undefined): void {
    this.pipeline = pipeline;
    this.emitEvent({ type: 'config', operation: 'update' });
  }

  getConfig(): WorkflowConfig | undefined {
    return this.config;
  }

  getPipeline(): PipelineConfig | undefined {
    return this.pipeline;
  }

  getWorkflowRoot(): string | null {
    return this.workflowRoot;
  }

  clear(): void {
    this.tickets.clear();
    this.plans.clear();
    this.reports = [];
    this.config = undefined;
    this.pipeline = undefined;
    this.workflowRoot = null;
  }

  getStats(): {
    ticketCount: number;
    planCount: number;
    reportCount: number;
    hasConfig: boolean;
    hasPipeline: boolean;
  } {
    return {
      ticketCount: this.tickets.size,
      planCount: this.plans.size,
      reportCount: this.reports.length,
      hasConfig: !!this.config,
      hasPipeline: !!this.pipeline
    };
  }

  private emitEvent(event: StoreChangeEvent): void {
    this.listeners.forEach(listener => listener(event));
  }
}

/**
 * Mock implementation of ITicketService for testing
 */
class MockTicketService implements ITicketService {
  private tickets: Map<string, Ticket> = new Map();
  private readonly workflowRoot: string;

  constructor(workflowRoot: string = '/mock/workflow') {
    this.workflowRoot = workflowRoot;
  }

  getAll(): Ticket[] {
    return Array.from(this.tickets.values());
  }

  getByStatus(status: TicketStatus): Ticket[] {
    return Array.from(this.tickets.values()).filter(t => t.status === status);
  }

  getById(id: string): Ticket | undefined {
    return this.tickets.get(id);
  }

  getByPlan(planId: string): Ticket[] {
    return Array.from(this.tickets.values()).filter(t => t.parent_plan === planId);
  }

  getByType(type: string): Ticket[] {
    return Array.from(this.tickets.values()).filter(t => t.type === type);
  }

  getValidTransitions(currentStatus: TicketStatus): TicketStatus[] {
    const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
      [TicketStatus.Backlog]: [TicketStatus.Ready],
      [TicketStatus.Ready]: [TicketStatus.InProgress, TicketStatus.Review, TicketStatus.Backlog],
      [TicketStatus.InProgress]: [TicketStatus.Review, TicketStatus.Blocked, TicketStatus.Done, TicketStatus.Backlog],
      [TicketStatus.Review]: [TicketStatus.Done, TicketStatus.InProgress, TicketStatus.Ready, TicketStatus.Blocked, TicketStatus.Backlog],
      [TicketStatus.Blocked]: [TicketStatus.Ready, TicketStatus.Backlog],
      [TicketStatus.Done]: [TicketStatus.Backlog]
    };
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  isValidTransition(from: TicketStatus, to: TicketStatus): boolean {
    return this.getValidTransitions(from).includes(to);
  }

  async create(type: string, title: string, fields?: Partial<Ticket>): Promise<Ticket> {
    const id = `${type.toUpperCase()}-${this.tickets.size + 1}`;
    const ticket: Ticket = {
      id,
      title,
      status: TicketStatus.Backlog,
      priority: 3,
      type: type.toLowerCase(),
      dependencies: [],
      conditions: [],
      context: {},
      tags: [],
      complexity: 'medium',
      parent_plan: '',
      parent_task: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: '',
      ...fields
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  async move(id: string, targetStatus: TicketStatus): Promise<void> {
    const ticket = this.tickets.get(id);
    if (!ticket) {
      throw new Error(`Ticket ${id} not found`);
    }
    if (!this.isValidTransition(ticket.status, targetStatus)) {
      throw new Error(`Invalid transition from ${ticket.status} to ${targetStatus}`);
    }
    ticket.status = targetStatus;
    ticket.updated_at = new Date().toISOString();
    if (targetStatus === TicketStatus.Done) {
      ticket.completed_at = new Date().toISOString();
    }
    this.tickets.set(id, ticket);
  }

  async update(id: string, fields: Partial<Ticket>): Promise<void> {
    const ticket = this.tickets.get(id);
    if (!ticket) {
      throw new Error(`Ticket ${id} not found`);
    }
    Object.assign(ticket, fields, { updated_at: new Date().toISOString() });
    this.tickets.set(id, ticket);
  }

  getWorkflowRoot(): string {
    return this.workflowRoot;
  }
}

/**
 * Mock implementation of IFileWatcher for testing
 */
class MockFileWatcher implements IFileWatcher {
  private disposed = false;

  async withOwnWrite<T>(operation: () => Promise<T>): Promise<T> {
    return await operation();
  }

  dispose(): void {
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}

suite('Interfaces Unit Tests', () => {
  suite('IStore Mock Implementation', () => {
    let store: MockStore;

    setup(() => {
      store = new MockStore();
    });

    test('should implement IStore interface', () => {
      const storeAsIStore: IStore = store;
      assert.strictEqual(storeAsIStore, store);
    });

    test('should create store with empty collections', () => {
      assert.strictEqual(store.getTickets().length, 0);
      assert.strictEqual(store.getPlans().length, 0);
      assert.strictEqual(store.getReports().length, 0);
    });

    test('should add and retrieve ticket', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.Backlog,
        priority: 3,
        type: 'impl',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: ''
      };

      store.addTicket(ticket);
      const retrieved = store.getTicketById('IMPL-001');

      assert.strictEqual(retrieved?.id, 'IMPL-001');
      assert.strictEqual(retrieved?.title, 'Test Ticket');
    });

    test('should update ticket and emit event', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.Backlog,
        priority: 3,
        type: 'impl',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: ''
      };

      store.addTicket(ticket);

      let eventEmitted = false;
      store.onDidChange(event => {
        if (event.type === 'ticket' && event.operation === 'update') {
          eventEmitted = true;
        }
      });

      ticket.title = 'Updated Title';
      store.updateTicket('IMPL-001', ticket);

      assert.strictEqual(store.getTicketById('IMPL-001')?.title, 'Updated Title');
      assert.strictEqual(eventEmitted, true);
    });

    test('should return stats', () => {
      const ticket: Ticket = {
        id: 'IMPL-001',
        title: 'Test Ticket',
        status: TicketStatus.Backlog,
        priority: 3,
        type: 'impl',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: ''
      };

      store.addTicket(ticket);
      const stats = store.getStats();

      assert.strictEqual(stats.ticketCount, 1);
      assert.strictEqual(stats.planCount, 0);
      assert.strictEqual(stats.reportCount, 0);
    });
  });

  suite('ITicketService Mock Implementation', () => {
    let ticketService: MockTicketService;

    setup(() => {
      ticketService = new MockTicketService();
    });

    test('should implement ITicketService interface', () => {
      const serviceAsITicketService: ITicketService = ticketService;
      assert.strictEqual(serviceAsITicketService, ticketService);
    });

    test('should create ticket with auto-generated ID', async () => {
      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      assert.strictEqual(ticket.id, 'IMPL-1');
      assert.strictEqual(ticket.title, 'Test Ticket');
      assert.strictEqual(ticket.status, TicketStatus.Backlog);
    });

    test('should validate state machine transitions', () => {
      assert.strictEqual(ticketService.isValidTransition(TicketStatus.Backlog, TicketStatus.Ready), true);
      assert.strictEqual(ticketService.isValidTransition(TicketStatus.Backlog, TicketStatus.Done), false);
      assert.strictEqual(ticketService.isValidTransition(TicketStatus.InProgress, TicketStatus.Done), true);
    });

    test('should move ticket to new status', async () => {
      const ticket = await ticketService.create('IMPL', 'Test Ticket');
      await ticketService.move(ticket.id, TicketStatus.Ready);

      const updated = ticketService.getById(ticket.id);
      assert.strictEqual(updated?.status, TicketStatus.Ready);
    });

    test('should throw on invalid transition', async () => {
      const ticket = await ticketService.create('IMPL', 'Test Ticket');

      await assert.rejects(
        async () => {
          await ticketService.move(ticket.id, TicketStatus.Done);
        },
        /Invalid transition/
      );
    });

    test('should update ticket fields', async () => {
      const ticket = await ticketService.create('IMPL', 'Test Ticket');
      await ticketService.update(ticket.id, { title: 'Updated Title', priority: 1 });

      const updated = ticketService.getById(ticket.id);
      assert.strictEqual(updated?.title, 'Updated Title');
      assert.strictEqual(updated?.priority, 1);
    });
  });

  suite('IFileWatcher Mock Implementation', () => {
    let fileWatcher: MockFileWatcher;

    setup(() => {
      fileWatcher = new MockFileWatcher();
    });

    test('should implement IFileWatcher interface', () => {
      const watcherAsIFileWatcher: IFileWatcher = fileWatcher;
      assert.strictEqual(watcherAsIFileWatcher, fileWatcher);
    });

    test('should execute withOwnWrite operation', async () => {
      const result = await fileWatcher.withOwnWrite(async () => {
        return 'test result';
      });

      assert.strictEqual(result, 'test result');
    });

    test('should dispose and mark as disposed', () => {
      assert.strictEqual(fileWatcher.isDisposed(), false);
      fileWatcher.dispose();
      assert.strictEqual(fileWatcher.isDisposed(), true);
    });
  });

  suite('Dependency Injection with Mocks', () => {
    test('should use MockStore as IStore dependency', () => {
      const store: IStore = new MockStore();
      store.addTicket({
        id: 'IMPL-001',
        title: 'DI Test',
        status: TicketStatus.Backlog,
        priority: 3,
        type: 'impl',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: ''
      });

      assert.strictEqual(store.getTicketById('IMPL-001')?.title, 'DI Test');
    });

    test('should use MockTicketService as ITicketService dependency', async () => {
      const ticketService: ITicketService = new MockTicketService();
      const ticket = await ticketService.create('FIX', 'DI Test Ticket');

      assert.strictEqual(ticket.title, 'DI Test Ticket');
      assert.strictEqual(ticketService.getById(ticket.id)?.type, 'fix');
    });
  });
});
