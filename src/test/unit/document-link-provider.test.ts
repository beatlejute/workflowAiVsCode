/**
 * Unit tests for DocumentLinkProvider
 *
 * Tests:
 * - TicketDocumentLinkProvider: context.files paths are clickable
 * - TicketDocumentLinkProvider: dependencies IDs are clickable
 * - PipelineDocumentLinkProvider: skill IDs are clickable
 * - PipelineDocumentLinkProvider: goto.stage IDs are clickable
 * - Non-existent files/IDs don't create links
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowStore } from '../../data/workflow-store';
import {
  TicketDocumentLinkProvider,
  PipelineDocumentLinkProvider,
  WorkflowDocumentLinkProvider
} from '../../ui/document-link-provider';
import { Ticket, TicketStatus } from '../../data/types';

suite('DocumentLinkProvider Tests', () => {
  let store: WorkflowStore;
  let tempWorkflowRoot: string;

  suiteSetup(async () => {
    // Create temporary workflow directory for testing
    const tempDir = path.join(__dirname, '../../../tmp/test-workflow-links');

    // Create directory structure
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'tickets', 'in-progress'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'config'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.workflow', 'src', 'skills', 'analyze-report'), { recursive: true });

    // Create a test file referenced by tickets
    fs.writeFileSync(
      path.join(tempDir, 'test-file.txt'),
      'Test file content'
    );

    // Create a skill file
    fs.writeFileSync(
      path.join(tempDir, '.workflow', 'src', 'skills', 'analyze-report', 'SKILL.md'),
      `---
name: analyze-report
description: Analyze report skill
---

# Analyze Report Skill

Skill content.
`
    );

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
  archive: ".workflow/plans/archive"
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
    planner:
      command: "echo"
      args: ["planning"]
      workdir: "."
      description: "Planning agent"
  stages:
    analyze:
      description: "Analyze task"
      agent: "planner"
      skill: "analyze-report"
      goto:
        success:
          stage: "done"
    done:
      description: "Done"
  entry_point: "analyze"
  execution:
    max_steps: 100
    delay_between_stages: 0
    timeout_per_stage: 300
    log_file: "pipeline.log"
`
    );

    tempWorkflowRoot = tempDir;
  });

  setup(async () => {
    // Initialize store
    store = new WorkflowStore();
    await store.refresh(path.join(tempWorkflowRoot, '.workflow'));
  });

  teardown(() => {
    store.clear();
  });

  suite('TicketDocumentLinkProvider', () => {
    test('context.files paths create clickable links', async () => {
      // Create ticket with context.files
      const ticketContent = `---
id: LINK-001
title: Test Ticket with File Links
status: ready
priority: 2
type: IMPL
dependencies: []
context:
  files:
    - test-file.txt
---

# Test Ticket

This ticket references a file.
`;

      const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'LINK-001.md');
      fs.writeFileSync(ticketPath, ticketContent);

      // Add ticket to store
      const ticket: Ticket = {
        id: 'LINK-001',
        title: 'Test Ticket with File Links',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: { files: ['test-file.txt'] },
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };
      store.addTicket(ticket);

      // Create provider and get links
      const provider = new TicketDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const links = provider.provideDocumentLinks(document);

      // Should have one link for test-file.txt
      assert.strictEqual(links.length, 1, 'Should have 1 link for context.files');

      const link = links[0];
      assert.ok(link.target, 'Link should have a target');
      assert.ok(
        link.target!.fsPath.includes('test-file.txt'),
        `Link target should point to test-file.txt, got ${link.target!.fsPath}`
      );
      assert.strictEqual(link.tooltip, 'Open file: test-file.txt');
    });

    test('dependencies IDs create clickable links', async () => {
      // Create parent ticket first
      const parentTicket: Ticket = {
        id: 'PARENT-001',
        title: 'Parent Ticket',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };
      store.addTicket(parentTicket);

      // Write parent ticket file
      const parentTicketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'PARENT-001.md');
      fs.writeFileSync(
        parentTicketPath,
        `---
id: PARENT-001
title: Parent Ticket
status: ready
priority: 2
type: IMPL
---

# Parent Ticket
`
      );

      // Create child ticket with dependency
      const childTicketContent = `---
id: CHILD-001
title: Child Ticket
status: ready
priority: 3
type: IMPL
dependencies:
  - PARENT-001
---

# Child Ticket

Depends on PARENT-001.
`;

      const childTicketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'CHILD-001.md');
      fs.writeFileSync(childTicketPath, childTicketContent);

      // Add child ticket to store
      const childTicket: Ticket = {
        id: 'CHILD-001',
        title: 'Child Ticket',
        status: TicketStatus.Ready,
        priority: 3,
        type: 'IMPL',
        dependencies: ['PARENT-001'],
        conditions: [],
        context: {},
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };
      store.addTicket(childTicket);

      // Create provider and get links
      const provider = new TicketDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(childTicketPath);
      const links = provider.provideDocumentLinks(document);

      // Should have one link for PARENT-001 dependency
      assert.strictEqual(links.length, 1, 'Should have 1 link for dependencies');

      const link = links[0];
      assert.ok(link.target, 'Link should have a target');
      assert.ok(
        link.target!.fsPath.includes('PARENT-001.md'),
        `Link target should point to PARENT-001.md, got ${link.target!.fsPath}`
      );
      assert.ok(link.tooltip!.includes('PARENT-001'), 'Tooltip should include ticket ID');
    });

    test('non-existent file paths do not create links', async () => {
      const ticketContent = `---
id: NOFILE-001
title: Ticket with non-existent file
status: ready
priority: 2
type: IMPL
context:
  files:
    - nonexistent-file.txt
---

# Ticket

References non-existent file.
`;

      const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'NOFILE-001.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const provider = new TicketDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const links = provider.provideDocumentLinks(document);

      // Should have no links for non-existent files
      assert.strictEqual(links.length, 0, 'Should have 0 links for non-existent files');
    });

    test('non-existent dependency IDs do not create links', async () => {
      const ticketContent = `---
id: NODEP-001
title: Ticket with non-existent dependency
status: ready
priority: 2
type: IMPL
dependencies:
  - NONEXISTENT-999
---

# Ticket

Depends on non-existent ticket.
`;

      const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'NODEP-001.md');
      fs.writeFileSync(ticketPath, ticketContent);

      const provider = new TicketDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(ticketPath);
      const links = provider.provideDocumentLinks(document);

      // Should have no links for non-existent dependencies
      assert.strictEqual(links.length, 0, 'Should have 0 links for non-existent dependencies');
    });
  });

  suite('PipelineDocumentLinkProvider', () => {
    test('skill IDs create clickable links', async () => {
      const pipelinePath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline.yaml');

      const provider = new PipelineDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(pipelinePath);
      const links = provider.provideDocumentLinks(document);

      // Should have at least one link for skill: "analyze-report"
      const skillLinks = links.filter(link =>
        link.tooltip?.includes('skill') || link.target?.fsPath.includes('SKILL.md')
      );

      assert.ok(
        skillLinks.length > 0,
        'Should have at least 1 link for skill ID'
      );

      const skillLink = skillLinks[0];
      assert.ok(
        skillLink.target!.fsPath.includes('analyze-report'),
        `Link target should point to analyze-report SKILL.md, got ${skillLink.target!.fsPath}`
      );
    });

    test('goto.stage IDs create clickable links', async () => {
      const pipelinePath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline.yaml');

      const provider = new PipelineDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(pipelinePath);
      const links = provider.provideDocumentLinks(document);

      // Should have at least one link for goto.stage: "done"
      const gotoLinks = links.filter(link =>
        link.tooltip?.includes('stage') || link.tooltip?.includes('goto')
      );

      assert.ok(
        gotoLinks.length > 0,
        'Should have at least 1 link for goto.stage ID'
      );

      const gotoLink = gotoLinks[0];
      // goto.stage links point to the same document with a fragment
      assert.strictEqual(
        gotoLink.target!.toString().includes('pipeline.yaml'),
        true,
        'Link target should be in pipeline.yaml'
      );
    });

    test('non-existent skill IDs do not create links', async () => {
      const invalidPipelineContent = `pipeline:
  name: "Invalid Pipeline"
  version: "1.0"
  agents:
    planner:
      command: "echo"
  stages:
    analyze:
      description: "Analyze"
      agent: "planner"
      skill: "nonexistent-skill"
  entry_point: "analyze"
`;

      const invalidPipelinePath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline-invalid.yaml');
      fs.writeFileSync(invalidPipelinePath, invalidPipelineContent);

      const provider = new PipelineDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(invalidPipelinePath);
      const links = provider.provideDocumentLinks(document);

      // Should have no links for non-existent skills
      const skillLinks = links.filter(link =>
        link.target?.fsPath.includes('SKILL.md')
      );

      assert.strictEqual(
        skillLinks.length,
        0,
        'Should have 0 links for non-existent skills'
      );
    });

    test('non-existent goto.stage IDs do not create links', async () => {
      const invalidPipelineContent = `pipeline:
  name: "Invalid Pipeline"
  version: "1.0"
  agents:
    planner:
      command: "echo"
  stages:
    analyze:
      description: "Analyze"
      agent: "planner"
      goto:
        success:
          stage: "NONEXISTENT_STAGE"
  entry_point: "analyze"
`;

      const invalidPipelinePath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline-goto-invalid.yaml');
      fs.writeFileSync(invalidPipelinePath, invalidPipelineContent);

      const provider = new PipelineDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      const document = await vscode.workspace.openTextDocument(invalidPipelinePath);
      const links = provider.provideDocumentLinks(document);

      // Should have no links for non-existent stages
      const gotoLinks = links.filter(link =>
        link.tooltip?.includes('stage')
      );

      assert.strictEqual(
        gotoLinks.length,
        0,
        'Should have 0 links for non-existent goto.stage'
      );
    });
  });

  suite('WorkflowDocumentLinkProvider', () => {
    test('delegates to correct provider based on file type', async () => {
      const provider = new WorkflowDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      // Test with ticket file
      const ticketContent = `---
id: DELEGATE-001
title: Delegate Test
status: ready
priority: 2
type: IMPL
context:
  files:
    - test-file.txt
---

# Delegate Test
`;

      const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'DELEGATE-001.md');
      fs.writeFileSync(ticketPath, ticketContent);

      // Add ticket to store
      const ticket: Ticket = {
        id: 'DELEGATE-001',
        title: 'Delegate Test',
        status: TicketStatus.Ready,
        priority: 2,
        type: 'IMPL',
        dependencies: [],
        conditions: [],
        context: { files: ['test-file.txt'] },
        tags: [],
        complexity: 'medium',
        parent_plan: '',
        parent_task: '',
        created_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
        completed_at: ''
      };
      store.addTicket(ticket);

      const ticketDocument = await vscode.workspace.openTextDocument(ticketPath);
      const ticketLinks = provider.provideDocumentLinks(ticketDocument);

      // Should have link for test-file.txt
      assert.strictEqual(ticketLinks.length, 1, 'Should have 1 link for ticket file');

      // Test with pipeline file
      const pipelinePath = path.join(tempWorkflowRoot, '.workflow', 'config', 'pipeline.yaml');
      const pipelineDocument = await vscode.workspace.openTextDocument(pipelinePath);
      const pipelineLinks = provider.provideDocumentLinks(pipelineDocument);

      // Should have links for skill and goto.stage
      assert.ok(pipelineLinks.length >= 2, 'Should have at least 2 links for pipeline');
    });

    test('returns empty array for non-workflow files', async () => {
      const provider = new WorkflowDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      // Create a non-workflow file
      const otherFilePath = path.join(tempWorkflowRoot, 'other-file.md');
      fs.writeFileSync(otherFilePath, '# Other File\n\nNot a workflow file.');

      const document = await vscode.workspace.openTextDocument(otherFilePath);
      const links = provider.provideDocumentLinks(document);

      assert.strictEqual(links.length, 0, 'Should have 0 links for non-workflow files');
    });
  });

  suite('Integration Tests', () => {
    test('provider is disposable (via WorkflowDocumentLinkProvider pattern)', () => {
      const provider = new WorkflowDocumentLinkProvider(store);
      // The provider doesn't have a dispose method itself, but it's registered with VS Code
      // which handles disposal. This test verifies the provider can be created and used.
      assert.ok(provider, 'Provider should be created successfully');
    });

    test('multiple tickets with links work correctly', async () => {
      // Create multiple tickets with different links
      const ticketsData = [
        {
          id: 'MULTI-001',
          title: 'Multi Test 1',
          files: ['test-file.txt'],
          deps: []
        },
        {
          id: 'MULTI-002',
          title: 'Multi Test 2',
          files: [],
          deps: ['MULTI-001']
        }
      ];

      for (const ticketData of ticketsData) {
        const ticket: Ticket = {
          id: ticketData.id,
          title: ticketData.title,
          status: TicketStatus.Ready,
          priority: 2,
          type: 'IMPL',
          dependencies: ticketData.deps,
          conditions: [],
          context: { files: ticketData.files },
          tags: [],
          complexity: 'medium',
          parent_plan: '',
          parent_task: '',
          created_at: '2026-03-05T00:00:00Z',
          updated_at: '2026-03-05T00:00:00Z',
          completed_at: ''
        };
        store.addTicket(ticket);

        const ticketContent = `---
id: ${ticketData.id}
title: ${ticketData.title}
status: ready
priority: 2
type: IMPL
dependencies:
${ticketData.deps.map(d => `  - ${d}`).join('\n')}
context:
  files:
${ticketData.files.map(f => `    - ${f}`).join('\n')}
---

# ${ticketData.title}
`;

        const ticketPath = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', `${ticketData.id}.md`);
        fs.writeFileSync(ticketPath, ticketContent);
      }

      const provider = new TicketDocumentLinkProvider(store);
      provider.setWorkflowRoot(tempWorkflowRoot);

      // Test first ticket (has file link)
      const ticket1Path = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'MULTI-001.md');
      const doc1 = await vscode.workspace.openTextDocument(ticket1Path);
      const links1 = provider.provideDocumentLinks(doc1);
      assert.strictEqual(links1.length, 1, 'MULTI-001 should have 1 file link');

      // Test second ticket (has dependency link)
      const ticket2Path = path.join(tempWorkflowRoot, '.workflow', 'tickets', 'ready', 'MULTI-002.md');
      const doc2 = await vscode.workspace.openTextDocument(ticket2Path);
      const links2 = provider.provideDocumentLinks(doc2);
      assert.strictEqual(links2.length, 1, 'MULTI-002 should have 1 dependency link');
    });
  });
});
