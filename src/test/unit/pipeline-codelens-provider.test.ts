/**
 * Unit tests for PipelineCodeLensProvider
 *
 * Tests:
 * - provideCodeLenses(): returns [] when workflowRoot not set
 * - provideCodeLenses(): returns [] for non-pipeline.yaml files
 * - provideCodeLenses(): returns [] for invalid YAML
 * - provideCodeLenses(): returns summary + entry + stage lenses for valid pipeline
 * - createSummaryLens(): title format
 * - createEntryLens(): title format and position
 * - createStageInfoLens(): Stage N/total | Agent | Skill format
 * - createGotoLenses(): Goto: transitions format
 * - extractTargetStage(): string vs object goto formats
 * - setWorkflowRoot() and refresh()
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PipelineCodeLensProvider } from '../../ui/pipeline-codelens-provider';

function makeDocument(fileName: string, content: string): vscode.TextDocument {
  return {
    fileName,
    getText: () => content,
    uri: vscode.Uri.file(fileName),
    languageId: 'yaml',
    version: 1,
    isDirty: false,
    isClosed: false,
    isUntitled: false,
    save: async () => true,
    lineCount: content.split('\n').length,
    lineAt: (line: number) => ({ text: content.split('\n')[line] }) as vscode.TextLine,
    offsetAt: (_pos: vscode.Position) => 0,
    positionAt: (_offset: number) => new vscode.Position(0, 0),
    validateRange: (range: vscode.Range) => range,
    validatePosition: (pos: vscode.Position) => pos,
    getWordRangeAtPosition: () => undefined,
    eol: vscode.EndOfLine.LF
  } as unknown as vscode.TextDocument;
}

const MINIMAL_PIPELINE_YAML = `pipeline:
  name: "test"
  version: "1.0"
  agents:
    agent1:
      command: "claude"
    agent2:
      command: "qwen"
  stages:
    execute-task:
      description: "Execute task"
      agent: agent1
      skill: execute-task
      goto:
        default:
          stage: review-result
        error: end
    review-result:
      description: "Review"
      agent: agent2
      skill: review-result
      goto:
        passed: done
        failed: execute-task
  entry: execute-task
  context:
    plan_id: ""
`;

suite('PipelineCodeLensProvider', () => {
  let provider: PipelineCodeLensProvider;

  setup(() => {
    provider = new PipelineCodeLensProvider();
  });

  suite('provideCodeLenses() - without workflowRoot', () => {
    test('should return [] if workflowRoot not set', () => {
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);
      assert.deepStrictEqual(lenses, []);
    });
  });

  suite('provideCodeLenses() - file name check', () => {
    test('should return [] for non-pipeline.yaml files', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/config.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);
      assert.deepStrictEqual(lenses, []);
    });

    test('should process pipeline.yaml files', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);
      assert.ok(lenses.length > 0);
    });
  });

  suite('provideCodeLenses() - invalid YAML', () => {
    test('should return [] for YAML without pipeline key', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', 'key: value\n');
      const lenses = provider.provideCodeLenses(doc);
      assert.deepStrictEqual(lenses, []);
    });

    test('should return [] for unparseable YAML', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', '{{ invalid: yaml: content');
      const lenses = provider.provideCodeLenses(doc);
      assert.deepStrictEqual(lenses, []);
    });
  });

  suite('provideCodeLenses() - summary lens', () => {
    test('should create summary lens at line 0', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);

      // First lens should be the summary at line 0
      assert.ok(lenses.length > 0);
      const summaryLens = lenses[0];
      assert.strictEqual(summaryLens.range.start.line, 0);
      assert.ok(summaryLens.command);
      const title = summaryLens.command!.title;
      assert.ok(title.includes('Pipeline: test'), `Expected "Pipeline: test" in "${title}"`);
      assert.ok(title.includes('v1.0'), `Expected "v1.0" in "${title}"`);
      assert.ok(title.includes('2 agents'), `Expected "2 agents" in "${title}"`);
      assert.ok(title.includes('2 stages'), `Expected "2 stages" in "${title}"`);
      assert.ok(title.includes('execute-task'), `Expected "execute-task" in "${title}"`);
    });

    test('summary lens should use openPipelineConfig command', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);
      assert.strictEqual(lenses[0].command!.command, 'workflow.openPipelineConfig');
    });
  });

  suite('provideCodeLenses() - entry lens', () => {
    test('should create entry lens pointing to entry stage', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);

      // Find entry lens (contains "Entry Point")
      const entryLens = lenses.find(l => l.command?.title.includes('Entry Point'));
      assert.ok(entryLens, 'Should have an entry lens');
      assert.ok(entryLens!.command!.title.includes('execute-task'));
    });

    test('should not create entry lens if no entry configured', () => {
      provider.setWorkflowRoot('/project');
      const yaml = `pipeline:
  name: "test"
  stages:
    execute-task:
      description: "Execute"
      agent: agent1
`;
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', yaml);
      const lenses = provider.provideCodeLenses(doc);

      const entryLens = lenses.find(l => l.command?.title.includes('Entry Point'));
      assert.strictEqual(entryLens, undefined);
    });
  });

  suite('provideCodeLenses() - stage info lenses', () => {
    test('should create stage info lens for each stage', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);

      const stageLenses = lenses.filter(l => l.command?.title.includes('Stage '));
      assert.strictEqual(stageLenses.length, 2, 'Should have 2 stage info lenses');
    });

    test('stage lens title format: Stage N/total | Agent: X | Skill: Y', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);

      const stageLens = lenses.find(l => l.command?.title.includes('Stage 1/2'));
      assert.ok(stageLens, 'Should find "Stage 1/2" lens');
      assert.ok(stageLens!.command!.title.includes('Agent: agent1'));
      assert.ok(stageLens!.command!.title.includes('Skill: execute-task'));
    });

    test('stage without skill shows N/A', () => {
      provider.setWorkflowRoot('/project');
      const yaml = `pipeline:
  name: "test"
  stages:
    simple-stage:
      description: "No skill"
      agent: agent1
`;
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', yaml);
      const lenses = provider.provideCodeLenses(doc);

      const stageLens = lenses.find(l => l.command?.title.includes('Stage 1/1'));
      assert.ok(stageLens);
      assert.ok(stageLens!.command!.title.includes('Skill: N/A'));
    });
  });

  suite('provideCodeLenses() - goto lenses', () => {
    test('should create goto lens with transitions', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);

      const gotoLenses = lenses.filter(l => l.command?.title.includes('Goto:'));
      assert.ok(gotoLenses.length > 0, 'Should have goto lenses');
    });

    test('goto lens should show status->stage transitions', () => {
      provider.setWorkflowRoot('/project');
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);
      const lenses = provider.provideCodeLenses(doc);

      // execute-task has goto: {default: {stage: review-result}, error: end}
      const gotoLens = lenses.find(l => l.command?.title.includes('Goto:') && l.command.title.includes('default->review-result'));
      assert.ok(gotoLens, 'Should find goto lens with default->review-result transition');
    });

    test('goto lens with string target', () => {
      provider.setWorkflowRoot('/project');
      const yaml = `pipeline:
  name: "test"
  stages:
    my-stage:
      description: "Stage"
      agent: agent1
      goto:
        passed: done-stage
        failed: retry-stage
`;
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', yaml);
      const lenses = provider.provideCodeLenses(doc);

      const gotoLens = lenses.find(l => l.command?.title.includes('Goto:'));
      assert.ok(gotoLens, 'Should have goto lens');
      assert.ok(gotoLens!.command!.title.includes('passed->done-stage'));
    });

    test('no goto lens if stage has no goto', () => {
      provider.setWorkflowRoot('/project');
      const yaml = `pipeline:
  name: "test"
  stages:
    no-goto-stage:
      description: "No goto"
      agent: agent1
`;
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', yaml);
      const lenses = provider.provideCodeLenses(doc);

      const gotoLens = lenses.find(l => l.command?.title.includes('Goto:'));
      assert.strictEqual(gotoLens, undefined);
    });
  });

  suite('setWorkflowRoot() and refresh()', () => {
    test('setWorkflowRoot should enable code lens generation', () => {
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', MINIMAL_PIPELINE_YAML);

      let lenses = provider.provideCodeLenses(doc);
      assert.deepStrictEqual(lenses, []);

      provider.setWorkflowRoot('/project');
      lenses = provider.provideCodeLenses(doc);
      assert.ok(lenses.length > 0);
    });

    test('refresh() should fire onDidChangeCodeLenses event', () => {
      let fired = false;
      provider.onDidChangeCodeLenses(() => { fired = true; });
      provider.refresh();
      assert.strictEqual(fired, true);
    });
  });

  suite('pipeline with no stages', () => {
    test('should return summary lens but no stage lenses for empty stages', () => {
      provider.setWorkflowRoot('/project');
      const yaml = `pipeline:
  name: "test"
  version: "1.0"
  agents:
    agent1:
      command: "cmd"
  stages: {}
  entry: ""
`;
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', yaml);
      const lenses = provider.provideCodeLenses(doc);

      // Should have summary lens
      assert.ok(lenses.length >= 1);
      const stageLenses = lenses.filter(l => l.command?.title.includes('Stage '));
      assert.strictEqual(stageLenses.length, 0);
    });
  });

  suite('pipeline with missing agent', () => {
    test('stage without agent should show N/A', () => {
      provider.setWorkflowRoot('/project');
      const yaml = `pipeline:
  name: "test"
  stages:
    no-agent-stage:
      description: "No agent"
      skill: my-skill
`;
      const doc = makeDocument('/project/.workflow/config/pipeline.yaml', yaml);
      const lenses = provider.provideCodeLenses(doc);

      const stageLens = lenses.find(l => l.command?.title.includes('Agent:'));
      if (stageLens) {
        assert.ok(stageLens.command!.title.includes('Agent: N/A'));
      }
    });
  });
});
