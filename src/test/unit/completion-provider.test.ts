/**
 * Unit tests for CompletionProvider
 *
 * Tests:
 * - TicketCompletionProvider: autocomplete ID тикетов в dependencies/conditions
 * - PipelineCompletionProvider: autocomplete stage/agent/skill в pipeline.yaml
 * - CompletionItem содержит корректный detail (title + status для тикетов)
 * - Несуществующие файлы/ID не создают ссылки
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import {
  TicketCompletionProvider,
  PipelineCompletionProvider,
  WorkflowCompletionProvider
} from '../../ui/completion-provider';
import { Ticket, TicketStatus } from '../../data/types';

// Module-level variable for helper function
let tempWorkflowRoot = '';

suite('CompletionProvider Tests', () => {
  let store: WorkflowStore;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../tmp/test-workflow-completion');

    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'in-progress'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'done'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'config'), { recursive: true });

    // Create minimal config.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'config.yaml'),
      `version: "1.0"
project:
  name: "Test Project"
  description: "Test"
task_types:
  IMPL:
    description: "Implementation"
    prefix: "IMPL"
priorities:
  1: "Critical"
  2: "High"
  3: "Medium"
  4: "Low"
  5: "Trivial"
statuses:
  backlog:
    description: "Backlog"
    color: "gray"
  ready:
    description: "Ready"
    color: "blue"
  in-progress:
    description: "In Progress"
    color: "yellow"
  blocked:
    description: "Blocked"
    color: "red"
  review:
    description: "Review"
    color: "purple"
  done:
    description: "Done"
    color: "green"
condition_types:
  tasks_completed:
    description: "Tasks completed"
paths:
  tickets: ".workflow/tickets"
  plans: ".workflow/plans"
  reports: ".workflow/reports"
  archive: ".workflow/archive"
reporting:
  enabled: true
  auto_generate: true
`
    );

    // Create minimal pipeline.yaml
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'config', 'pipeline.yaml'),
      `pipeline:
  name: "Test Pipeline"
  version: "1.0"
  agents:
    qwen-code:
      command: "qwen"
      args: []
      workdir: "."
      description: "Qwen Code agent"
    claude-code:
      command: "claude"
      args: []
      workdir: "."
      description: "Claude Code agent"
  stages:
    entry:
      description: "Entry point"
      agent: "qwen-code"
      skill: "analyze-report"
      goto:
        success:
          stage: "process"
        failure:
          stage: "report"
    process:
      description: "Process stage"
      agent: "claude-code"
      skill: "execute-task"
      goto:
        done:
          stage: "report"
    report:
      description: "Report stage"
      agent: "qwen-code"
      skill: "create-report"
  entry: "entry"
`
    );

    tempWorkflowRoot = tempDir;

    // Initialize store
    store = new WorkflowStore();
    await store.refresh(tempWorkflowRoot);
  });

  suiteTeardown(() => {
    // Cleanup test directory
    // Note: In real tests, you might want to delete the temp directory
    // For now, we leave it for inspection if needed
  });

  suite('TicketCompletionProvider', () => {
    let provider: TicketCompletionProvider;

    setup(() => {
      provider = new TicketCompletionProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);
    });

    test('Should provide completions in dependencies field', () => {
      const content = `---
id: IMPL-001
title: Test Ticket
status: ready
dependencies:
  - 
---

# Test Ticket
`;

      const document = createMockDocument(content, 'test.md');
      const position = new vscode.Position(4, 5); // After "- " in dependencies

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      assert.ok(Array.isArray(completions), 'Completions should be an array');
    });

    test('Should provide completions in conditions.value field', () => {
      const content = `---
id: IMPL-001
title: Test Ticket
status: ready
conditions:
  - type: tasks_completed
    value:
      - 
---

# Test Ticket
`;

      const document = createMockDocument(content, 'test.md');
      const position = new vscode.Position(6, 9); // After "- " in value

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
    });

    test('Should not provide completions outside dependencies/conditions', () => {
      const content = `---
id: IMPL-001
title: Test Ticket
status: ready
---

# Test Ticket

Some text here
`;

      const document = createMockDocument(content, 'test.md');
      const position = new vscode.Position(8, 5); // In body text

      const completions = provider.provideCompletionItems(document, position);

      assert.strictEqual(completions, undefined, 'Should not provide completions in body');
    });

    test('Should exclude current ticket from completions', () => {
      // First, add a test ticket to the store
      const testTicket: Ticket = {
        id: 'IMPL-TEST',
        title: 'Test Ticket',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(testTicket);

      const content = `---
id: IMPL-TEST
title: Test Ticket
status: ready
dependencies:
  - 
---

# Test Ticket
`;

      const document = createMockDocument(content, 'test.md');
      const position = new vscode.Position(5, 5);

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const hasSelfReference = completions.some(c => c.label === 'IMPL-TEST');
      assert.strictEqual(hasSelfReference, false, 'Should not include self-reference');
    });

    test('CompletionItem should have correct detail (title + status)', () => {
      const testTicket: Ticket = {
        id: 'IMPL-DETAIL',
        title: 'Detail Test Ticket',
        status: TicketStatus.InProgress,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: ['test'],
        complexity: 'low',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };

      store.addTicket(testTicket);

      const content = `---
id: IMPL-001
title: Test Ticket
status: ready
dependencies:
  - 
---

# Test Ticket
`;

      const document = createMockDocument(content, 'test.md');
      const position = new vscode.Position(5, 5);

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const detailItem = completions.find(c => c.label === 'IMPL-DETAIL');
      assert.ok(detailItem, 'Should find IMPL-DETAIL completion');
      assert.ok(detailItem.detail, 'Should have detail');
      assert.ok(detailItem.detail!.includes('Detail Test Ticket'), 'Detail should include title');
      assert.ok(detailItem.detail!.includes('in-progress'), 'Detail should include status');
    });

    test('CompletionItem should have Reference kind', () => {
      const content = `---
id: IMPL-001
title: Test Ticket
status: ready
dependencies:
  - 
---

# Test Ticket
`;

      const document = createMockDocument(content, 'test.md');
      const position = new vscode.Position(5, 5);

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      if (completions.length > 0) {
        assert.strictEqual(
          completions[0].kind,
          vscode.CompletionItemKind.Reference,
          'Should have Reference kind'
        );
      }
    });

    test('Should return undefined when workflow root is not set', () => {
      const providerWithoutRoot = new TicketCompletionProvider(store);
      const content = `---
id: IMPL-001
title: Test Ticket
status: ready
dependencies:
  - 
---
`;

      const document = createMockDocument(content, 'test.md');
      const position = new vscode.Position(5, 5);

      const completions = providerWithoutRoot.provideCompletionItems(document, position);

      assert.strictEqual(completions, undefined, 'Should return undefined without workflow root');
    });
  });

  suite('PipelineCompletionProvider', () => {
    let provider: PipelineCompletionProvider;

    setup(() => {
      provider = new PipelineCompletionProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);
    });

    test('Should provide stage completions in pipeline.yaml', () => {
      const content = `pipeline:
  stages:
    test:
      goto:
        success:
          stage: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(5, 15); // After "stage: "

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const hasEntry = completions.some(c => c.label === 'entry');
      const hasProcess = completions.some(c => c.label === 'process');
      const hasReport = completions.some(c => c.label === 'report');
      assert.ok(hasEntry, 'Should include entry stage');
      assert.ok(hasProcess, 'Should include process stage');
      assert.ok(hasReport, 'Should include report stage');
    });

    test('Should provide agent completions in pipeline.yaml', () => {
      const content = `pipeline:
  stages:
    test:
      agent: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(3, 12); // After "agent: "

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const hasQwen = completions.some(c => c.label === 'qwen-code');
      const hasClaude = completions.some(c => c.label === 'claude-code');
      assert.ok(hasQwen, 'Should include qwen-code agent');
      assert.ok(hasClaude, 'Should include claude-code agent');
    });

    test('Should provide fallback_agent completions in pipeline.yaml', () => {
      const content = `pipeline:
  stages:
    test:
      fallback_agent: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(3, 23); // After "fallback_agent: "

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const hasQwen = completions.some(c => c.label === 'qwen-code');
      assert.ok(hasQwen, 'Should include qwen-code agent');
    });

    test('Should provide skill completions in pipeline.yaml', () => {
      const content = `pipeline:
  stages:
    test:
      skill: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(3, 12); // After "skill: "

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const hasAnalyzeReport = completions.some(c => c.label === 'analyze-report');
      const hasExecuteTask = completions.some(c => c.label === 'execute-task');
      const hasCreateReport = completions.some(c => c.label === 'create-report');
      assert.ok(hasAnalyzeReport, 'Should include analyze-report skill');
      assert.ok(hasExecuteTask, 'Should include execute-task skill');
      assert.ok(hasCreateReport, 'Should include create-report skill');
    });

    test('Stage completion should have Class kind and description', () => {
      const content = `pipeline:
  stages:
    test:
      goto:
        success:
          stage: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(5, 15);

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const entryCompletion = completions.find(c => c.label === 'entry');
      assert.ok(entryCompletion, 'Should find entry completion');
      assert.strictEqual(
        entryCompletion.kind,
        vscode.CompletionItemKind.Class,
        'Stage should have Class kind'
      );
      assert.ok(entryCompletion.detail, 'Should have detail');
      assert.ok(entryCompletion.detail!.includes('Entry point'), 'Detail should include description');
    });

    test('Agent completion should have Module kind and command', () => {
      const content = `pipeline:
  stages:
    test:
      agent: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(3, 12);

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const qwenCompletion = completions.find(c => c.label === 'qwen-code');
      assert.ok(qwenCompletion, 'Should find qwen-code completion');
      assert.strictEqual(
        qwenCompletion.kind,
        vscode.CompletionItemKind.Module,
        'Agent should have Module kind'
      );
      assert.ok(qwenCompletion.detail, 'Should have detail');
      assert.ok(qwenCompletion.detail!.includes('qwen'), 'Detail should include command');
    });

    test('Skill completion should have Method kind', () => {
      const content = `pipeline:
  stages:
    test:
      skill: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(3, 12);

      const completions = provider.provideCompletionItems(document, position);

      assert.ok(completions, 'Should provide completions');
      const skillCompletion = completions.find(c => c.label === 'analyze-report');
      assert.ok(skillCompletion, 'Should find analyze-report completion');
      assert.strictEqual(
        skillCompletion.kind,
        vscode.CompletionItemKind.Method,
        'Skill should have Method kind'
      );
    });

    test('Should return undefined when pipeline is not loaded', () => {
      const emptyStore = new WorkflowStore();
      const providerWithoutPipeline = new PipelineCompletionProvider(emptyStore);
      providerWithoutPipeline.setWorkflowRoot(tempWorkflowRoot);

      const content = `pipeline:
  stages:
    test:
      skill: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(3, 12);

      const completions = providerWithoutPipeline.provideCompletionItems(document, position);

      assert.strictEqual(completions, undefined, 'Should return undefined without pipeline');
    });

    test('Should return undefined when workflow root is not set', () => {
      const providerWithoutRoot = new PipelineCompletionProvider(store);
      const content = `pipeline:
  stages:
    test:
      skill: 
`;

      const document = createMockDocument(content, 'pipeline.yaml');
      const position = new vscode.Position(3, 12);

      const completions = providerWithoutRoot.provideCompletionItems(document, position);

      assert.strictEqual(completions, undefined, 'Should return undefined without workflow root');
    });
  });

  suite('WorkflowCompletionProvider', () => {
    let provider: WorkflowCompletionProvider;

    setup(() => {
      provider = new WorkflowCompletionProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);
    });

    test('Should delegate to TicketCompletionProvider for .md files', () => {
      const content = `---
id: IMPL-001
title: Test Ticket
status: ready
dependencies:
  - 
---
`;

      const document = createMockDocument(content, '.workflow/tickets/test.md');
      const position = new vscode.Position(5, 5);

      const completions = provider.provideCompletionItems(document, position, new vscode.CancellationTokenSource().token, { triggerKind: vscode.CompletionTriggerKind.Invoked });

      assert.ok(completions, 'Should provide completions for .md files');
    });

    test('Should delegate to PipelineCompletionProvider for pipeline.yaml', () => {
      const content = `pipeline:
  stages:
    test:
      skill: 
`;

      const document = createMockDocument(content, '.workflow/config/pipeline.yaml');
      const position = new vscode.Position(3, 12);

      const completions = provider.provideCompletionItems(document, position, new vscode.CancellationTokenSource().token, { triggerKind: vscode.CompletionTriggerKind.Invoked });

      assert.ok(completions, 'Should provide completions for pipeline.yaml');
    });

    test('Should return undefined for other files', () => {
      const content = `Some text`;

      const document = createMockDocument(content, 'other.txt');
      const position = new vscode.Position(0, 5);

      const completions = provider.provideCompletionItems(document, position, new vscode.CancellationTokenSource().token, { triggerKind: vscode.CompletionTriggerKind.Invoked });

      assert.strictEqual(completions, undefined, 'Should return undefined for other files');
    });
  });
});

/**
 * Helper function to create a mock TextDocument
 */
function createMockDocument(content: string, fileName: string): vscode.TextDocument {
  const uri = vscode.Uri.file(path.join(tempWorkflowRoot, fileName));
  return {
    uri,
    fileName: uri.fsPath,
    isUntitled: false,
    languageId: fileName.endsWith('.md') ? 'markdown' : 'yaml',
    version: 1,
    isDirty: false,
    isClosed: false,
    save: () => Promise.resolve(true),
    eol: vscode.EndOfLine.LF,
    lineCount: content.split('\n').length,
    lineAt(position: vscode.Position | number): vscode.TextLine {
      const lineNum = typeof position === 'number' ? position : position.line;
      const lines = content.split('\n');
      const text = lines[lineNum] || '';
      return {
        lineNumber: lineNum,
        text,
        range: new vscode.Range(lineNum, 0, lineNum, text.length),
        rangeIncludingLineBreak: new vscode.Range(lineNum, 0, lineNum, text.length + 1),
        firstNonWhitespaceCharacterIndex: text.search(/\S/),
        isEmptyOrWhitespace: /^\s*$/.test(text)
      };
    },
    offsetAt(position: vscode.Position): number {
      const lines = content.split('\n');
      let offset = 0;
      for (let i = 0; i < position.line; i++) {
        offset += lines[i].length + 1; // +1 for newline
      }
      offset += position.character;
      return offset;
    },
    positionAt(offset: number): vscode.Position {
      let currentOffset = 0;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 for newline
        if (currentOffset + lineLength > offset) {
          return new vscode.Position(i, offset - currentOffset);
        }
        currentOffset += lineLength;
      }
      return new vscode.Position(lines.length - 1, 0);
    },
    getText(range?: vscode.Range): string {
      if (!range) {
        return content;
      }
      const startOffset = this.offsetAt(range.start);
      const endOffset = this.offsetAt(range.end);
      return content.substring(startOffset, endOffset);
    },
    getWordRangeAtPosition(position: vscode.Position, regex = /\w+/): vscode.Range | undefined {
      const line = this.lineAt(position);
      const match = regex.exec(line.text);
      if (match) {
        return new vscode.Range(position.line, match.index, position.line, match.index + match[0].length);
      }
      return undefined;
    },
    validateRange(range: vscode.Range): vscode.Range {
      return range;
    },
    validatePosition(position: vscode.Position): vscode.Position {
      return position;
    }
  } as vscode.TextDocument;
}
