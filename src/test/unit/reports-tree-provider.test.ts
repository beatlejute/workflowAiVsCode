/**
 * Unit tests for ReportsTreeProvider sorting
 *
 * Tests:
 * - ReportsTreeProvider: Reports are sorted by created_at descending (newest first)
 * - ReportsTreeProvider: Multiple reports with different dates are in correct order
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import { ReportsTreeProvider, ReportTreeItem } from '../../ui/sidebar-tree-provider';
import { Report } from '../../data/types';

suite('ReportsTreeProvider Sorting Tests', () => {
  let store: WorkflowStore;
  let tempWorkflowRoot: string;
  let provider: ReportsTreeProvider;
  let tempReportsDir: string;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../../../tmp/test-workflow-reports');

    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'config'), { recursive: true });
    tempReportsDir = path.join(tempDir, '.workflow', 'reports');
    fs.mkdirSync(tempReportsDir, { recursive: true });

    // Create minimal config.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'config.yaml'),
      `version: "1.0"
project:
  name: "Test Project"
  description: "Test"
task_types:
  IMPL: Implementation
  FIX: Bug Fix
priorities:
  1: Critical
  2: High
  3: Medium
  4: Low
statuses:
  backlog:
    description: "Backlog"
  ready:
    description: "Ready"
  in-progress:
    description: "In Progress"
  blocked:
    description: "Blocked"
  review:
    description: "Review"
  done:
    description: "Done"
`
    );

    tempWorkflowRoot = path.join(tempDir, '.workflow');

    // Initialize store
    store = new WorkflowStore();
    await store.refresh(tempWorkflowRoot);
  });

  suiteTeardown(() => {
    // Clean up temporary directory
    try {
      fs.rmSync(path.join(__dirname, '../../../../../tmp/test-workflow-reports'), {
        recursive: true,
        force: true
      });
    } catch (error) {
      console.error('Failed to cleanup test directory:', error);
    }
  });

  setup(async () => {
    // Clear all report files before each test
    if (fs.existsSync(tempReportsDir)) {
      const files = fs.readdirSync(tempReportsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempReportsDir, file));
      }
    }

    // Refresh store to clear reports
    await store.refresh(tempWorkflowRoot);

    // Create fresh provider for each test
    provider = new ReportsTreeProvider(store);
    provider.setWorkflowRoot(tempWorkflowRoot);
  });

  function createReportFile(report: Report): void {
    const content = `---
id: ${report.id}
title: ${report.title}
type: ${report.type}
created_at: "${report.created_at}"
summary: ${report.summary}
---

## Report Content

${report.summary}
`;
    fs.writeFileSync(path.join(tempReportsDir, `${report.id}.md`), content);
  }

  test('Reports are sorted by created_at descending (newest first)', async () => {
    // Create reports with different dates (oldest to newest)
    const reports: Report[] = [
      {
        id: 'REPORT-001',
        title: 'Oldest Report',
        type: 'summary',
        created_at: '2026-03-01T10:00:00Z',
        summary: 'First report'
      },
      {
        id: 'REPORT-002',
        title: 'Middle Report',
        type: 'summary',
        created_at: '2026-03-05T10:00:00Z',
        summary: 'Second report'
      },
      {
        id: 'REPORT-003',
        title: 'Newest Report',
        type: 'summary',
        created_at: '2026-03-10T10:00:00Z',
        summary: 'Third report'
      }
    ];

    // Create report files
    for (const report of reports) {
      createReportFile(report);
    }

    // Refresh store to load reports
    await store.refresh(tempWorkflowRoot);

    // Get tree items
    const items = await provider.getChildren();

    // Verify we have 3 items
    assert.strictEqual(items.length, 3, 'Should have 3 report items');

    // Verify order: newest first (REPORT-003, REPORT-002, REPORT-001)
    assert.strictEqual((items[0] as ReportTreeItem).report.id, 'REPORT-003', 'First item should be newest report');
    assert.strictEqual((items[1] as ReportTreeItem).report.id, 'REPORT-002', 'Second item should be middle report');
    assert.strictEqual((items[2] as ReportTreeItem).report.id, 'REPORT-001', 'Third item should be oldest report');
  });

  test('Reports with mixed dates are sorted correctly', async () => {
    // Create reports with mixed dates (not in order)
    const reports: Report[] = [
      {
        id: 'REPORT-MIX-1',
        title: 'Report 1',
        type: 'summary',
        created_at: '2026-03-08T10:00:00Z',
        summary: 'Report 1'
      },
      {
        id: 'REPORT-MIX-2',
        title: 'Report 2',
        type: 'summary',
        created_at: '2026-03-01T10:00:00Z',
        summary: 'Report 2'
      },
      {
        id: 'REPORT-MIX-3',
        title: 'Report 3',
        type: 'summary',
        created_at: '2026-03-15T10:00:00Z',
        summary: 'Report 3'
      },
      {
        id: 'REPORT-MIX-4',
        title: 'Report 4',
        type: 'summary',
        created_at: '2026-03-10T10:00:00Z',
        summary: 'Report 4'
      }
    ];

    // Create report files
    for (const report of reports) {
      createReportFile(report);
    }

    // Refresh store to load reports
    await store.refresh(tempWorkflowRoot);

    // Get tree items
    const items = await provider.getChildren();

    // Verify we have 4 items
    assert.strictEqual(items.length, 4, 'Should have 4 report items');

    // Verify order: newest first
    // Expected order: REPORT-MIX-3 (03-15), REPORT-MIX-4 (03-10), REPORT-MIX-1 (03-08), REPORT-MIX-2 (03-01)
    assert.strictEqual((items[0] as ReportTreeItem).report.id, 'REPORT-MIX-3', 'First should be 2026-03-15');
    assert.strictEqual((items[1] as ReportTreeItem).report.id, 'REPORT-MIX-4', 'Second should be 2026-03-10');
    assert.strictEqual((items[2] as ReportTreeItem).report.id, 'REPORT-MIX-1', 'Third should be 2026-03-08');
    assert.strictEqual((items[3] as ReportTreeItem).report.id, 'REPORT-MIX-2', 'Fourth should be 2026-03-01');
  });

  test('Empty reports list returns empty array', async () => {
    // Get tree items without creating any report files
    const items = await provider.getChildren();

    // Verify empty result
    assert.strictEqual(items.length, 0, 'Should have 0 report items');
  });

  test('Single report returns single item', async () => {
    // Create single report
    const report: Report = {
      id: 'REPORT-SINGLE',
      title: 'Single Report',
      type: 'summary',
      created_at: '2026-03-05T10:00:00Z',
      summary: 'Single report'
    };

    createReportFile(report);

    // Refresh store to load reports
    await store.refresh(tempWorkflowRoot);

    // Get tree items
    const items = await provider.getChildren();

    // Verify single item
    assert.strictEqual(items.length, 1, 'Should have 1 report item');
    assert.strictEqual((items[0] as ReportTreeItem).report.id, 'REPORT-SINGLE', 'Should be the single report');
  });
});
