/**
 * DependencyService Unit Tests
 *
 * Tests for dependency graph operations:
 * - Direct dependencies (getDependencies, getDependents)
 * - Transitive chains (getTransitiveChain, getBlockingChain)
 * - Cycle detection (detectCycles)
 * - Readiness validation (canMoveToReady)
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { WorkflowStore } from '../../data/workflow-store';
import { DependencyService } from '../../services/dependency-service';
import { Ticket } from '../../data/types';

suite('DependencyService Suite', () => {

  let store: WorkflowStore;
  let dependencyService: DependencyService;
  let testDir: string;

  setup(() => {
    store = new WorkflowStore();
    dependencyService = new DependencyService(store);
    testDir = path.join(__dirname, '../../../../tmp/test-deps-' + Date.now());
  });

  teardown(() => {
    store.clear();
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper to create test directory structure
   */
  function createTestStructure(dir: string) {
    const workflowDir = path.join(dir, '.workflow');
    const ticketsDir = path.join(workflowDir, 'tickets');
    const configDir = path.join(workflowDir, 'config');

    // Create ticket status folders
    const statuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
    for (const status of statuses) {
      fs.mkdirSync(path.join(ticketsDir, status), { recursive: true });
    }

    // Create config folder
    fs.mkdirSync(configDir, { recursive: true });

    return { workflowDir, ticketsDir, configDir };
  }

  /**
   * Helper to create a test ticket file
   */
  function createTicketFile(dir: string, id: string, status: string, title: string, dependencies: string[] = [], extraFields: Partial<Ticket> = {}) {
    const frontmatter = {
      id,
      title,
      status,
      priority: 2,
      type: 'IMPL',
      dependencies,
      conditions: [],
      context: {},
      tags: [],
      complexity: 'medium',
      parent_plan: 'PLAN-001',
      parent_task: '',
      created_at: '2026-03-04T00:00:00Z',
      updated_at: '2026-03-04T00:00:00Z',
      completed_at: '',
      ...extraFields
    };

    const yamlContent = yaml.dump(frontmatter, { indent: 2 });
    const content = `---\n${yamlContent}---\n## Test content`;
    const filePath = path.join(dir, `${id}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Helper to create minimal config files
   */
  function createConfigFiles(configDir: string) {
    const configYaml = `version: "1.0"
project:
  name: Test Project
  description: Test Description
task_types:
  IMPL:
    description: Implementation
    prefix: IMPL
priorities:
  1: Critical
  2: High
statuses:
  backlog:
    description: Backlog
    color: gray
condition_types: {}
paths:
  tickets: .workflow/tickets
  plans: .workflow/plans
  reports: .workflow/reports
  archive: .workflow/archive
reporting:
  enabled: true
  auto_generate: true
`;

    const pipelineYaml = `pipeline:
  name: Test Pipeline
  version: "1.0"
  agents:
    default:
      command: node
      args: []
      workdir: .
  stages:
    entry:
      description: Entry stage
  entry: entry
  execution:
    max_steps: 100
`;

    fs.writeFileSync(path.join(configDir, 'config.yaml'), configYaml, 'utf-8');
    fs.writeFileSync(path.join(configDir, 'pipeline.yaml'), pipelineYaml, 'utf-8');
  }

  /**
   * Helper to load tickets into store from files
   */
  async function loadTickets(_dir: string) {
    createConfigFiles(path.join(testDir, '.workflow', 'config'));
    await store.refresh(path.join(testDir, '.workflow'));
  }

  // ==================== Direct Dependencies ====================

  suite('getDependencies()', () => {

    test('should return tickets that a given ticket depends on', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Create linear chain: A → B → C (A depends on B, B depends on C)
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', ['C-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001']);

      await loadTickets(testDir);

      const deps = dependencyService.getDependencies('A-001');
      assert.strictEqual(deps.length, 1, 'Should have 1 dependency');
      assert.strictEqual(deps[0].id, 'B-001', 'Should depend on B');
    });

    test('should return empty array for ticket with no dependencies', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', []);

      await loadTickets(testDir);

      const deps = dependencyService.getDependencies('A-001');
      assert.strictEqual(deps.length, 0, 'Should have no dependencies');
    });

    test('should return empty array for non-existent ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', []);

      await loadTickets(testDir);

      const deps = dependencyService.getDependencies('NONEXISTENT');
      assert.strictEqual(deps.length, 0, 'Should return empty for non-existent ticket');
    });

    test('should handle multiple dependencies', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001', 'C-001']);

      await loadTickets(testDir);

      const deps = dependencyService.getDependencies('A-001');
      assert.strictEqual(deps.length, 2, 'Should have 2 dependencies');
      const depIds = deps.map(d => d.id).sort();
      assert.deepStrictEqual(depIds, ['B-001', 'C-001'], 'Should have correct dependencies');
    });
  });

  suite('getDependents()', () => {

    test('should find all tickets that depend on a given ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // B and C both depend on A
      createTicketFile(path.join(ticketsDir, 'done'), 'A-001', 'done', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', ['A-001']);

      await loadTickets(testDir);

      const dependents = dependencyService.getDependents('A-001');
      assert.strictEqual(dependents.length, 2, 'Should have 2 dependents');
      const dependentIds = dependents.map(d => d.id).sort();
      assert.deepStrictEqual(dependentIds, ['B-001', 'C-001'], 'Should have correct dependents');
    });

    test('should return empty array when no tickets depend on given ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', []);

      await loadTickets(testDir);

      const dependents = dependencyService.getDependents('A-001');
      assert.strictEqual(dependents.length, 0, 'Should have no dependents');
    });

    test('should handle diamond dependency pattern', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Diamond: A → B,C → D (D depends on B and C, both depend on A)
      createTicketFile(path.join(ticketsDir, 'done'), 'A-001', 'done', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'D-001', 'ready', 'Ticket D', ['B-001', 'C-001']);

      await loadTickets(testDir);

      // A has B and C as direct dependents (not D, that's transitive)
      const dependentsOfA = dependencyService.getDependents('A-001');
      assert.strictEqual(dependentsOfA.length, 2, 'A should have 2 direct dependents');

      // B has D as dependent
      const dependentsOfB = dependencyService.getDependents('B-001');
      assert.strictEqual(dependentsOfB.length, 1, 'B should have 1 dependent');
      assert.strictEqual(dependentsOfB[0].id, 'D-001', 'D should depend on B');
    });
  });

  // ==================== Transitive Dependencies ====================

  suite('getTransitiveChain()', () => {

    test('should return full transitive dependency chain (linear)', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Linear chain: A → B → C → D
      createTicketFile(path.join(ticketsDir, 'done'), 'D-001', 'done', 'Ticket D', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', ['D-001']);
      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', ['C-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001']);

      await loadTickets(testDir);

      const chain = dependencyService.getTransitiveChain('A-001');
      assert.strictEqual(chain.length, 3, 'Should have 3 transitive dependencies');
      const chainIds = chain.map(t => t.id).sort();
      assert.deepStrictEqual(chainIds, ['B-001', 'C-001', 'D-001'], 'Should have full chain');
    });

    test('should exclude starting ticket from chain', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001']);

      await loadTickets(testDir);

      const chain = dependencyService.getTransitiveChain('A-001');
      assert.ok(!chain.some(t => t.id === 'A-001'), 'Should not include starting ticket');
    });

    test('should handle duplicates (diamond pattern)', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Diamond: A → B,C → D (D depends on B and C, both depend on A)
      createTicketFile(path.join(ticketsDir, 'done'), 'A-001', 'done', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'D-001', 'ready', 'Ticket D', ['B-001', 'C-001']);

      await loadTickets(testDir);

      const chain = dependencyService.getTransitiveChain('D-001');
      // Should have A, B, C (no duplicates even though A is reachable via B and C)
      assert.strictEqual(chain.length, 3, 'Should have 3 unique dependencies');
      const chainIds = chain.map(t => t.id).sort();
      assert.deepStrictEqual(chainIds, ['A-001', 'B-001', 'C-001'], 'Should have unique dependencies');
    });

    test('should handle cycle protection', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Create a cycle: A → B → C → A
      // Note: We manually create the dependencies even though it's a cycle
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['C-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', ['A-001']);

      await loadTickets(testDir);

      // Should not infinite loop, should handle cycle gracefully
      const chain = dependencyService.getTransitiveChain('A-001');
      // Should include B and C, but not loop back to A (starting ticket excluded)
      assert.ok(chain.length <= 2, 'Should handle cycle without infinite loop');
    });

    test('should return empty array for ticket with no dependencies', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', []);

      await loadTickets(testDir);

      const chain = dependencyService.getTransitiveChain('A-001');
      assert.strictEqual(chain.length, 0, 'Should have empty chain');
    });

    test('should return empty array for non-existent ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', []);

      await loadTickets(testDir);

      const chain = dependencyService.getTransitiveChain('NONEXISTENT');
      assert.strictEqual(chain.length, 0, 'Should return empty for non-existent ticket');
    });
  });

  suite('getBlockingChain()', () => {

    test('should return full blocking chain (linear)', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Linear chain: A → B → C → D (D depends on C, C on B, B on A)
      createTicketFile(path.join(ticketsDir, 'done'), 'A-001', 'done', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', ['B-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'D-001', 'ready', 'Ticket D', ['C-001']);

      await loadTickets(testDir);

      const chain = dependencyService.getBlockingChain('A-001');
      assert.strictEqual(chain.length, 3, 'Should have 3 blocked tickets');
      const chainIds = chain.map(t => t.id).sort();
      assert.deepStrictEqual(chainIds, ['B-001', 'C-001', 'D-001'], 'Should have full blocking chain');
    });

    test('should exclude starting ticket from blocking chain', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'done'), 'A-001', 'done', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);

      await loadTickets(testDir);

      const chain = dependencyService.getBlockingChain('A-001');
      assert.ok(!chain.some(t => t.id === 'A-001'), 'Should not include starting ticket');
    });

    test('should handle diamond pattern in blocking chain', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Diamond: A → B,C → D
      createTicketFile(path.join(ticketsDir, 'done'), 'A-001', 'done', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'D-001', 'ready', 'Ticket D', ['B-001', 'C-001']);

      await loadTickets(testDir);

      const chain = dependencyService.getBlockingChain('A-001');
      // Should have B, C, D (no duplicates)
      assert.strictEqual(chain.length, 3, 'Should have 3 unique blocked tickets');
      const chainIds = chain.map(t => t.id).sort();
      assert.deepStrictEqual(chainIds, ['B-001', 'C-001', 'D-001'], 'Should have unique blocked tickets');
    });
  });

  // ==================== Cycle Detection ====================

  suite('detectCycles()', () => {

    test('should return empty array when no cycles exist', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Linear chain: A → B → C
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', ['C-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001']);

      await loadTickets(testDir);

      const cycles = dependencyService.detectCycles();
      assert.strictEqual(cycles.length, 0, 'Should find no cycles');
    });

    test('should detect simple cycle (A → B → A)', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Simple cycle: A → B → A
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);

      await loadTickets(testDir);

      const cycles = dependencyService.detectCycles();
      assert.strictEqual(cycles.length, 1, 'Should find 1 cycle');
      const cycle = cycles[0].cycle;
      assert.strictEqual(cycle.length, 2, 'Cycle should have 2 nodes');
      assert.ok(cycle.includes('A-001'), 'Cycle should include A');
      assert.ok(cycle.includes('B-001'), 'Cycle should include B');
    });

    test('should detect complex cycle (A → B → C → A)', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Complex cycle: A → B → C → A
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['C-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', ['B-001']);

      await loadTickets(testDir);

      const cycles = dependencyService.detectCycles();
      assert.strictEqual(cycles.length, 1, 'Should find 1 cycle');
      const cycle = cycles[0].cycle;
      assert.strictEqual(cycle.length, 3, 'Cycle should have 3 nodes');
      assert.ok(cycle.includes('A-001'), 'Cycle should include A');
      assert.ok(cycle.includes('B-001'), 'Cycle should include B');
      assert.ok(cycle.includes('C-001'), 'Cycle should include C');
    });

    test('should detect multiple independent cycles', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Two independent cycles: A → B → A and C → D → C
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', ['D-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'D-001', 'ready', 'Ticket D', ['C-001']);

      await loadTickets(testDir);

      const cycles = dependencyService.detectCycles();
      assert.strictEqual(cycles.length, 2, 'Should find 2 cycles');
    });

    test('should handle tree structure (no cycles)', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Tree: A → B,C → D,E,F
      createTicketFile(path.join(ticketsDir, 'done'), 'A-001', 'done', 'Ticket A', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'D-001', 'ready', 'Ticket D', ['B-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'E-001', 'ready', 'Ticket E', ['B-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'F-001', 'ready', 'Ticket F', ['C-001']);

      await loadTickets(testDir);

      const cycles = dependencyService.detectCycles();
      assert.strictEqual(cycles.length, 0, 'Should find no cycles in tree');
    });

    test('should not report duplicate cycles', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Cycle: A → B → C → A
      // The same cycle can be detected starting from A, B, or C
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['C-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'B-001', 'ready', 'Ticket B', ['A-001']);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', ['B-001']);

      await loadTickets(testDir);

      const cycles = dependencyService.detectCycles();
      assert.strictEqual(cycles.length, 1, 'Should find only 1 unique cycle');
    });
  });

  // ==================== Readiness Check ====================

  suite('canMoveToReady()', () => {

    test('should return ok=true when all dependencies are done', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'done'), 'B-001', 'done', 'Ticket B', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'C-001', 'done', 'Ticket C', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001', 'C-001']);

      await loadTickets(testDir);

      const result = dependencyService.canMoveToReady('A-001');
      assert.strictEqual(result.ok, true, 'Should be ready to move');
      assert.strictEqual(result.blockers.length, 0, 'Should have no blockers');
    });

    test('should return ok=false when dependencies are not done', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'in-progress'), 'B-001', 'in-progress', 'Ticket B', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'C-001', 'ready', 'Ticket C', []);
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['B-001', 'C-001']);

      await loadTickets(testDir);

      const result = dependencyService.canMoveToReady('A-001');
      assert.strictEqual(result.ok, false, 'Should not be ready to move');
      assert.strictEqual(result.blockers.length, 2, 'Should have 2 blockers');
      assert.ok(result.blockers.includes('B-001'), 'Should block on B');
      assert.ok(result.blockers.includes('C-001'), 'Should block on C');
    });

    test('should return ok=true for ticket with no dependencies', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', []);

      await loadTickets(testDir);

      const result = dependencyService.canMoveToReady('A-001');
      assert.strictEqual(result.ok, true, 'Should be ready to move');
      assert.strictEqual(result.blockers.length, 0, 'Should have no blockers');
    });

    test('should return ok=false for non-existent ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', []);

      await loadTickets(testDir);

      const result = dependencyService.canMoveToReady('NONEXISTENT');
      assert.strictEqual(result.ok, false, 'Should not be ready');
      assert.ok(result.blockers.some(b => b.includes('not found')), 'Should indicate ticket not found');
    });

    test('should handle missing dependency ticket', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // A depends on non-existent ticket
      createTicketFile(path.join(ticketsDir, 'ready'), 'A-001', 'ready', 'Ticket A', ['NONEXISTENT-001']);

      await loadTickets(testDir);

      const result = dependencyService.canMoveToReady('A-001');
      assert.strictEqual(result.ok, false, 'Should not be ready');
      assert.ok(result.blockers.some(b => b.includes('not exist')), 'Should indicate dependency does not exist');
    });
  });

  // ==================== Integration Tests ====================

  suite('Integration Tests', () => {

    test('should handle complex real-world scenario', async () => {
      const { ticketsDir } = createTestStructure(testDir);

      // Complex scenario:
      // - EPIC-001 (done) - parent epic
      // - IMPL-001 (done) - depends on EPIC-001
      // - IMPL-002 (done) - depends on IMPL-001
      // - IMPL-003 (in-progress) - depends on IMPL-001, IMPL-002
      // - IMPL-004 (backlog) - depends on IMPL-003
      // - IMPL-005 (backlog) - depends on IMPL-003, IMPL-004

      createTicketFile(path.join(ticketsDir, 'done'), 'EPIC-001', 'done', 'Epic', []);
      createTicketFile(path.join(ticketsDir, 'done'), 'IMPL-001', 'done', 'Impl 1', ['EPIC-001']);
      createTicketFile(path.join(ticketsDir, 'done'), 'IMPL-002', 'done', 'Impl 2', ['IMPL-001']);
      createTicketFile(path.join(ticketsDir, 'in-progress'), 'IMPL-003', 'in-progress', 'Impl 3', ['IMPL-001', 'IMPL-002']);
      createTicketFile(path.join(ticketsDir, 'backlog'), 'IMPL-004', 'backlog', 'Impl 4', ['IMPL-003']);
      createTicketFile(path.join(ticketsDir, 'backlog'), 'IMPL-005', 'backlog', 'Impl 5', ['IMPL-003', 'IMPL-004']);

      await loadTickets(testDir);

      // Test direct dependencies
      const deps003 = dependencyService.getDependencies('IMPL-003');
      assert.strictEqual(deps003.length, 2, 'IMPL-003 should have 2 direct dependencies');

      // Test transitive chain
      const chain005 = dependencyService.getTransitiveChain('IMPL-005');
      // IMPL-005 -> [IMPL-003, IMPL-004] -> [IMPL-001, IMPL-002] -> [EPIC-001]
      // Total: IMPL-003, IMPL-004, IMPL-001, IMPL-002, EPIC-001 = 5 tickets
      assert.strictEqual(chain005.length, 5, 'IMPL-005 should have 5 transitive dependencies');

      // Test blocking chain
      const blocking001 = dependencyService.getBlockingChain('IMPL-001');
      assert.strictEqual(blocking001.length, 4, 'IMPL-001 should block 4 tickets');

      // Test canMoveToReady
      const readiness004 = dependencyService.canMoveToReady('IMPL-004');
      assert.strictEqual(readiness004.ok, false, 'IMPL-004 should not be ready');
      assert.ok(readiness004.blockers.includes('IMPL-003'), 'IMPL-003 should block IMPL-004');

      // Test no cycles
      const cycles = dependencyService.detectCycles();
      assert.strictEqual(cycles.length, 0, 'Should have no cycles');
    });
  });
});
