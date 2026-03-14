import * as assert from 'assert';
import * as path from 'path';
import {
  getWorkflowRoot,
  getTicketPath,
  getTicketsDir,
  getPlanPath,
  getPipelineConfigPath,
  getReportsDir
} from '../../utils/path-utils';

suite('path-utils', () => {
  const root = '/workspace/project';

  suite('getWorkflowRoot', () => {
    test('returns .workflow subdirectory of workspace root', () => {
      assert.strictEqual(getWorkflowRoot(root), path.join(root, '.workflow'));
    });
  });

  suite('getTicketPath', () => {
    test('returns full path to a ticket file', () => {
      const result = getTicketPath('/wf', 'backlog', 'IMPL-001');
      assert.strictEqual(result, path.join('/wf', 'tickets', 'backlog', 'IMPL-001.md'));
    });

    test('works for different statuses', () => {
      assert.ok(getTicketPath('/wf', 'done', 'T-42').endsWith('done' + path.sep + 'T-42.md'));
    });

    test('rejects path traversal attempt in ticket ID', () => {
      assert.throws(
        () => getTicketPath('/wf', 'backlog', '../../../etc/passwd'),
        /Invalid input: ticket ID contains invalid characters/
      );
    });

    test('rejects path traversal with backslash', () => {
      assert.throws(
        () => getTicketPath('/wf', 'backlog', '..\\..\\etc\\passwd'),
        /Invalid input: ticket ID contains invalid characters/
      );
    });

    test('rejects command injection attempt', () => {
      assert.throws(
        () => getTicketPath('/wf', 'backlog', 'IMPL-001; rm -rf /'),
        /Invalid input: ticket ID contains invalid characters/
      );
    });
  });

  suite('getTicketsDir', () => {
    test('returns tickets subdirectory for a given status', () => {
      assert.strictEqual(getTicketsDir('/wf', 'in-progress'), path.join('/wf', 'tickets', 'in-progress'));
    });
  });

  suite('getPlanPath', () => {
    test('defaults to current folder', () => {
      assert.strictEqual(getPlanPath('/wf', 'PLAN-001'), path.join('/wf', 'plans', 'current', 'PLAN-001.md'));
    });

    test('supports archive folder', () => {
      assert.strictEqual(getPlanPath('/wf', 'PLAN-001', 'archive'), path.join('/wf', 'plans', 'archive', 'PLAN-001.md'));
    });

    test('supports explicit current folder', () => {
      assert.strictEqual(getPlanPath('/wf', 'PLAN-002', 'current'), path.join('/wf', 'plans', 'current', 'PLAN-002.md'));
    });

    test('rejects path traversal attempt in plan ID', () => {
      assert.throws(
        () => getPlanPath('/wf', '../../../etc/passwd'),
        /Invalid input: ticket ID contains invalid characters/
      );
    });

    test('rejects command injection attempt', () => {
      assert.throws(
        () => getPlanPath('/wf', 'PLAN-001; rm -rf /'),
        /Invalid input: ticket ID contains invalid characters/
      );
    });
  });

  suite('getPipelineConfigPath', () => {
    test('returns path to pipeline.yaml', () => {
      assert.strictEqual(getPipelineConfigPath('/wf'), path.join('/wf', 'config', 'pipeline.yaml'));
    });
  });

  suite('getReportsDir', () => {
    test('returns reports directory path', () => {
      assert.strictEqual(getReportsDir('/wf'), path.join('/wf', 'reports'));
    });
  });
});
