/**
 * ReportService Unit Tests
 *
 * Tests for report management and statistics service including:
 * - Read operations (getAll, getById, getLatest)
 * - Summary parsing (parseSummary)
 * - Statistics aggregation (getStatistics)
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { ReportService } from '../../services/report-service';
import { Report, Ticket, TicketStatus } from '../../data/types';

suite('ReportService Suite', () => {

  let store: WorkflowStore;
  let reportService: ReportService;
  let testDir: string;

  setup(() => {
    store = new WorkflowStore();
    testDir = path.join(__dirname, '../../../../tmp/test-reportservice-' + Date.now());
    reportService = new ReportService(store, testDir);
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
    const reportsDir = path.join(workflowDir, 'reports');
    const ticketsDir = path.join(workflowDir, 'tickets');

    // Create reports folder
    fs.mkdirSync(reportsDir, { recursive: true });

    // Create ticket folders
    const statuses = ['backlog', 'ready', 'in-progress', 'blocked', 'review', 'done'];
    for (const status of statuses) {
      fs.mkdirSync(path.join(ticketsDir, status), { recursive: true });
    }

    return { workflowDir, reportsDir, ticketsDir };
  }

  /**
   * Helper to create a test report in store
   */
  function createReportInStore(id: string, title: string, createdAt: string, summary = ''): Report {
    const report: Report = {
      id,
      title,
      type: 'weekly',
      created_at: createdAt,
      summary
    };
    store.addReport(report);
    return report;
  }

  /**
   * Helper to create a test ticket in store
   */
  function createTicketInStore(
    id: string,
    title: string,
    status: TicketStatus,
    type: string = 'IMPL',
    priority: number = 2,
    createdAt: string = '2026-03-04T00:00:00Z',
    completedAt: string = ''
  ): Ticket {
    const ticket: Ticket = {
      id,
      title,
      status,
      priority,
      type,
      dependencies: [],
      conditions: [],
      context: {},
      tags: [],
      complexity: 'medium',
      parent_plan: '',
      parent_task: '',
      created_at: createdAt,
      updated_at: createdAt,
      completed_at: completedAt
    };
    store.addTicket(ticket);
    return ticket;
  }

  suite('getAll()', () => {

    test('should return all reports from store', () => {
      createReportInStore('REPORT-001', 'Report 1', '2026-03-04T00:00:00Z');
      createReportInStore('REPORT-002', 'Report 2', '2026-03-04T12:00:00Z');
      createReportInStore('REPORT-003', 'Report 3', '2026-03-04T18:00:00Z');

      const all = reportService.getAll();

      assert.strictEqual(all.length, 3, 'Should return all 3 reports');
    });

    test('should return empty array when no reports', () => {
      const all = reportService.getAll();

      assert.strictEqual(all.length, 0, 'Should return empty array');
    });
  });

  suite('getById()', () => {

    test('should return report by ID', () => {
      createReportInStore('REPORT-001', 'Test Report', '2026-03-04T00:00:00Z');

      const found = reportService.getById('REPORT-001');

      assert.ok(found, 'Should find report by ID');
      assert.strictEqual(found?.title, 'Test Report', 'Should return correct report');
    });

    test('should return undefined for non-existent report', () => {
      const found = reportService.getById('NONEXISTENT');

      assert.strictEqual(found, undefined, 'Should return undefined for non-existent report');
    });
  });

  suite('getLatest()', () => {

    test('should return report with most recent created_at', () => {
      createReportInStore('REPORT-001', 'Old Report', '2026-03-01T00:00:00Z');
      createReportInStore('REPORT-002', 'Latest Report', '2026-03-04T12:00:00Z');
      createReportInStore('REPORT-003', 'Middle Report', '2026-03-02T00:00:00Z');

      const latest = reportService.getLatest();

      assert.ok(latest, 'Should return a report');
      assert.strictEqual(latest?.id, 'REPORT-002', 'Should return the latest report');
    });

    test('should return undefined when no reports', () => {
      const latest = reportService.getLatest();

      assert.strictEqual(latest, undefined, 'Should return undefined for empty store');
    });

    test('should handle reports with same created_at', () => {
      createReportInStore('REPORT-001', 'Report 1', '2026-03-04T00:00:00Z');
      createReportInStore('REPORT-002', 'Report 2', '2026-03-04T00:00:00Z');

      const latest = reportService.getLatest();

      assert.ok(latest, 'Should return one of the reports');
      assert.ok(
        latest?.id === 'REPORT-001' || latest?.id === 'REPORT-002',
        'Should return one of the reports with same date'
      );
    });
  });

  suite('parseSummary()', () => {

    test('should parse complete summary with all fields', () => {
      const summaryYaml = `completed: 10
failed: 2
byType:
  IMPL: 5
  FIX: 3
  DOCS: 2
byPriority:
  1: 2
  2: 5
  3: 3`;

      const report = createReportInStore('REPORT-001', 'Test Report', '2026-03-04T00:00:00Z', summaryYaml);

      const parsed = reportService.parseSummary(report);

      assert.strictEqual(parsed.completed, 10, 'Should parse completed count');
      assert.strictEqual(parsed.failed, 2, 'Should parse failed count');
      assert.strictEqual(parsed.byType.IMPL, 5, 'Should parse IMPL type');
      assert.strictEqual(parsed.byType.FIX, 3, 'Should parse FIX type');
      assert.strictEqual(parsed.byType.DOCS, 2, 'Should parse DOCS type');
      assert.strictEqual(parsed.byPriority[1], 2, 'Should parse priority 1');
      assert.strictEqual(parsed.byPriority[2], 5, 'Should parse priority 2');
      assert.strictEqual(parsed.byPriority[3], 3, 'Should parse priority 3');
    });

    test('should return empty summary when no summary field', () => {
      const report = createReportInStore('REPORT-001', 'Test Report', '2026-03-04T00:00:00Z', '');

      const parsed = reportService.parseSummary(report);

      assert.strictEqual(parsed.completed, 0, 'Should have 0 completed');
      assert.strictEqual(parsed.failed, 0, 'Should have 0 failed');
      assert.strictEqual(Object.keys(parsed.byType).length, 0, 'Should have empty byType');
      assert.strictEqual(Object.keys(parsed.byPriority).length, 0, 'Should have empty byPriority');
    });

    test('should return empty summary when summary is invalid YAML', () => {
      const invalidYaml = 'invalid: yaml: content: [';
      const report = createReportInStore('REPORT-001', 'Test Report', '2026-03-04T00:00:00Z', invalidYaml);

      const parsed = reportService.parseSummary(report);

      assert.strictEqual(parsed.completed, 0, 'Should have 0 completed for invalid YAML');
      assert.strictEqual(parsed.failed, 0, 'Should have 0 failed for invalid YAML');
    });

    test('should parse partial summary with only completed and failed', () => {
      const summaryYaml = `completed: 5
failed: 1`;

      const report = createReportInStore('REPORT-001', 'Test Report', '2026-03-04T00:00:00Z', summaryYaml);

      const parsed = reportService.parseSummary(report);

      assert.strictEqual(parsed.completed, 5, 'Should parse completed count');
      assert.strictEqual(parsed.failed, 1, 'Should parse failed count');
      assert.strictEqual(Object.keys(parsed.byType).length, 0, 'Should have empty byType');
      assert.strictEqual(Object.keys(parsed.byPriority).length, 0, 'Should have empty byPriority');
    });
  });

  suite('getStatistics()', () => {

    test('should count tickets by status correctly', () => {
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Backlog);
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Ready);
      createTicketInStore('TKT-003', 'Ticket 3', TicketStatus.InProgress);
      createTicketInStore('TKT-004', 'Ticket 4', TicketStatus.Blocked);
      createTicketInStore('TKT-005', 'Ticket 5', TicketStatus.Review);
      createTicketInStore('TKT-006', 'Ticket 6', TicketStatus.Done);
      createTicketInStore('TKT-007', 'Ticket 7', TicketStatus.Done);

      const stats = reportService.getStatistics();

      assert.strictEqual(stats.byStatus[TicketStatus.Backlog], 1, 'Should count backlog');
      assert.strictEqual(stats.byStatus[TicketStatus.Ready], 1, 'Should count ready');
      assert.strictEqual(stats.byStatus[TicketStatus.InProgress], 1, 'Should count in-progress');
      assert.strictEqual(stats.byStatus[TicketStatus.Blocked], 1, 'Should count blocked');
      assert.strictEqual(stats.byStatus[TicketStatus.Review], 1, 'Should count review');
      assert.strictEqual(stats.byStatus[TicketStatus.Done], 2, 'Should count done');
    });

    test('should count tickets by type correctly', () => {
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Backlog, 'IMPL');
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Ready, 'IMPL');
      createTicketInStore('TKT-003', 'Ticket 3', TicketStatus.InProgress, 'FIX');
      createTicketInStore('TKT-004', 'Ticket 4', TicketStatus.Blocked, 'DOCS');
      createTicketInStore('TKT-005', 'Ticket 5', TicketStatus.Done, 'IMPL');

      const stats = reportService.getStatistics();

      assert.strictEqual(stats.byType.IMPL, 3, 'Should count IMPL type');
      assert.strictEqual(stats.byType.FIX, 1, 'Should count FIX type');
      assert.strictEqual(stats.byType.DOCS, 1, 'Should count DOCS type');
    });

    test('should count tickets by priority correctly', () => {
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Backlog, 'IMPL', 1);
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Ready, 'IMPL', 2);
      createTicketInStore('TKT-003', 'Ticket 3', TicketStatus.InProgress, 'FIX', 2);
      createTicketInStore('TKT-004', 'Ticket 4', TicketStatus.Blocked, 'DOCS', 3);
      createTicketInStore('TKT-005', 'Ticket 5', TicketStatus.Done, 'IMPL', 1);

      const stats = reportService.getStatistics();

      assert.strictEqual(stats.byPriority[1], 2, 'Should count priority 1');
      assert.strictEqual(stats.byPriority[2], 2, 'Should count priority 2');
      assert.strictEqual(stats.byPriority[3], 1, 'Should count priority 3');
    });

    test('should calculate avgCompletionDays for done tickets', () => {
      // Ticket completed in 2 days
      createTicketInStore(
        'TKT-001',
        'Ticket 1',
        TicketStatus.Done,
        'IMPL',
        2,
        '2026-03-01T00:00:00Z',
        '2026-03-03T00:00:00Z'
      );

      // Ticket completed in 4 days
      createTicketInStore(
        'TKT-002',
        'Ticket 2',
        TicketStatus.Done,
        'FIX',
        2,
        '2026-03-01T00:00:00Z',
        '2026-03-05T00:00:00Z'
      );

      // Not done - should not be counted
      createTicketInStore(
        'TKT-003',
        'Ticket 3',
        TicketStatus.InProgress,
        'IMPL',
        2,
        '2026-03-01T00:00:00Z',
        ''
      );

      const stats = reportService.getStatistics();

      // Average: (2 + 4) / 2 = 3 days
      assert.strictEqual(stats.avgCompletionDays, 3, 'Should calculate average completion days');
    });

    test('should return 0 for avgCompletionDays when no done tickets', () => {
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Backlog);
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.InProgress);
      createTicketInStore('TKT-003', 'Ticket 3', TicketStatus.Blocked);

      const stats = reportService.getStatistics();

      assert.strictEqual(stats.avgCompletionDays, 0, 'Should return 0 when no done tickets');
    });

    test('should return 0 for avgCompletionDays when done tickets have no completed_at', () => {
      createTicketInStore(
        'TKT-001',
        'Ticket 1',
        TicketStatus.Done,
        'IMPL',
        2,
        '2026-03-01T00:00:00Z',
        '' // No completed_at
      );

      const stats = reportService.getStatistics();

      assert.strictEqual(stats.avgCompletionDays, 0, 'Should return 0 when no completed_at');
    });

    test('should count blockedCount correctly', () => {
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Blocked);
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Blocked);
      createTicketInStore('TKT-003', 'Ticket 3', TicketStatus.InProgress);
      createTicketInStore('TKT-004', 'Ticket 4', TicketStatus.Done);

      const stats = reportService.getStatistics();

      assert.strictEqual(stats.blockedCount, 2, 'Should count 2 blocked tickets');
    });

    test('should return zeros when no tickets', () => {
      const stats = reportService.getStatistics();

      assert.strictEqual(stats.byStatus[TicketStatus.Backlog], 0, 'Should have 0 backlog');
      assert.strictEqual(stats.byStatus[TicketStatus.Done], 0, 'Should have 0 done');
      assert.strictEqual(Object.keys(stats.byType).length, 0, 'Should have empty byType');
      assert.strictEqual(Object.keys(stats.byPriority).length, 0, 'Should have empty byPriority');
      assert.strictEqual(stats.avgCompletionDays, 0, 'Should have 0 avgCompletionDays');
      assert.strictEqual(stats.blockedCount, 0, 'Should have 0 blockedCount');
    });
  });

  suite('Integration Tests', () => {

    test('full workflow: add tickets, get statistics, create report', () => {
      createTestStructure(testDir);

      // Add various tickets
      createTicketInStore('TKT-001', 'Feature 1', TicketStatus.Done, 'IMPL', 1, '2026-03-01T00:00:00Z', '2026-03-03T00:00:00Z');
      createTicketInStore('TKT-002', 'Bug Fix 1', TicketStatus.Done, 'FIX', 2, '2026-03-02T00:00:00Z', '2026-03-04T00:00:00Z');
      createTicketInStore('TKT-003', 'Feature 2', TicketStatus.InProgress, 'IMPL', 2, '2026-03-03T00:00:00Z');
      createTicketInStore('TKT-004', 'Docs 1', TicketStatus.Blocked, 'DOCS', 3, '2026-03-03T00:00:00Z');
      createTicketInStore('TKT-005', 'Feature 3', TicketStatus.Ready, 'IMPL', 1, '2026-03-04T00:00:00Z');

      // Get statistics
      const stats = reportService.getStatistics();

      assert.strictEqual(stats.byStatus[TicketStatus.Done], 2, 'Should have 2 done tickets');
      assert.strictEqual(stats.byStatus[TicketStatus.InProgress], 1, 'Should have 1 in-progress');
      assert.strictEqual(stats.byStatus[TicketStatus.Blocked], 1, 'Should have 1 blocked');
      assert.strictEqual(stats.byStatus[TicketStatus.Ready], 1, 'Should have 1 ready');
      assert.strictEqual(stats.byType.IMPL, 3, 'Should have 3 IMPL tickets');
      assert.strictEqual(stats.byType.FIX, 1, 'Should have 1 FIX ticket');
      assert.strictEqual(stats.byType.DOCS, 1, 'Should have 1 DOCS ticket');
      assert.strictEqual(stats.byPriority[1], 2, 'Should have 2 priority 1 tickets');
      assert.strictEqual(stats.byPriority[2], 2, 'Should have 2 priority 2 tickets');
      assert.strictEqual(stats.byPriority[3], 1, 'Should have 1 priority 3 ticket');
      assert.strictEqual(stats.blockedCount, 1, 'Should have 1 blocked ticket');

      // Average: (2 + 2) / 2 = 2 days
      assert.strictEqual(stats.avgCompletionDays, 2, 'Should calculate 2 days average');

      // Create a report with the statistics as summary
      const summaryYaml = `completed: ${stats.byStatus[TicketStatus.Done]}
failed: 0
byType:
  IMPL: ${stats.byType.IMPL}
  FIX: ${stats.byType.FIX}
  DOCS: ${stats.byType.DOCS}
byPriority:
  1: ${stats.byPriority[1]}
  2: ${stats.byPriority[2]}
  3: ${stats.byPriority[3]}`;

      createReportInStore('REPORT-001', 'Weekly Report', '2026-03-04T12:00:00Z', summaryYaml);

      // Verify report can be retrieved and parsed
      const report = reportService.getById('REPORT-001');
      assert.ok(report, 'Should retrieve created report');

      const parsed = reportService.parseSummary(report!);
      assert.strictEqual(parsed.completed, 2, 'Should parse completed from report');
      assert.strictEqual(parsed.byType.IMPL, 3, 'Should parse IMPL count from report');
    });
  });

  suite('parseSummary() - Edge Cases', () => {

    test('should handle summary with only byType', () => {
      const summaryYaml = `byType:
  IMPL: 5
  FIX: 3`;

      const report = createReportInStore('REPORT-001', 'Test Report', '2026-03-04T00:00:00Z', summaryYaml);
      const parsed = reportService.parseSummary(report);

      assert.strictEqual(parsed.completed, 0, 'Should have 0 completed');
      assert.strictEqual(parsed.failed, 0, 'Should have 0 failed');
      assert.strictEqual(parsed.byType.IMPL, 5, 'Should parse IMPL');
      assert.strictEqual(parsed.byType.FIX, 3, 'Should parse FIX');
    });

    test('should handle summary with only byPriority', () => {
      const summaryYaml = `byPriority:
  1: 2
  2: 5`;

      const report = createReportInStore('REPORT-001', 'Test Report', '2026-03-04T00:00:00Z', summaryYaml);
      const parsed = reportService.parseSummary(report);

      assert.strictEqual(parsed.byPriority[1], 2, 'Should parse priority 1');
      assert.strictEqual(parsed.byPriority[2], 5, 'Should parse priority 2');
    });

    test('should handle invalid dates in tickets gracefully', () => {
      const ticket: Ticket = {
        id: 'TKT-001',
        title: 'Ticket with invalid date',
        status: TicketStatus.Done,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: 'invalid-date',
        updated_at: 'invalid-date',
        completed_at: 'also-invalid'
      };
      store.addTicket(ticket);

      const stats = reportService.getStatistics();
      assert.strictEqual(stats.avgCompletionDays, 0, 'Should return 0 for invalid dates');
    });
  });

  suite('getStatistics() - Edge Cases', () => {

    test('should handle tickets with negative priority', () => {
      createTicketInStore('TKT-001', 'Ticket 1', TicketStatus.Done, 'IMPL', -1);
      createTicketInStore('TKT-002', 'Ticket 2', TicketStatus.Done, 'FIX', 0);

      const stats = reportService.getStatistics();
      assert.strictEqual(stats.byPriority[-1], 1, 'Should count negative priority');
      assert.strictEqual(stats.byPriority[0], 1, 'Should count zero priority');
    });

    test('should handle single done ticket for avgCompletionDays', () => {
      createTicketInStore(
        'TKT-001',
        'Ticket 1',
        TicketStatus.Done,
        'IMPL',
        2,
        '2026-03-01T00:00:00Z',
        '2026-03-05T00:00:00Z'
      );

      const stats = reportService.getStatistics();
      assert.strictEqual(stats.avgCompletionDays, 4, 'Should return 4 days for single ticket');
    });

    test('should initialize all status keys to 0', () => {
      const stats = reportService.getStatistics();

      assert.strictEqual(stats.byStatus[TicketStatus.Backlog], 0);
      assert.strictEqual(stats.byStatus[TicketStatus.Ready], 0);
      assert.strictEqual(stats.byStatus[TicketStatus.InProgress], 0);
      assert.strictEqual(stats.byStatus[TicketStatus.Blocked], 0);
      assert.strictEqual(stats.byStatus[TicketStatus.Review], 0);
      assert.strictEqual(stats.byStatus[TicketStatus.Done], 0);
    });
  });
});
