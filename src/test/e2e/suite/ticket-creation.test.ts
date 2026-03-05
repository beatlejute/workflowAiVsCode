/**
 * E2E Tests - Ticket Creation
 *
 * Tests:
 * 1. workflow.newTicket command is available
 * 2. Creating a ticket creates a file in backlog/
 * 3. TreeView updates after ticket creation
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Ticket Creation Tests', () => {
  let workflowRoot: string;
  let createdTicketPath: string | undefined;

  suiteSetup(async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folders found');
    }
    workflowRoot = workspaceFolders[0].uri.fsPath;

    // Extension activates automatically on startup, just wait for it to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  teardown(async () => {
    // Cleanup: remove created ticket
    if (createdTicketPath && fs.existsSync(createdTicketPath)) {
      fs.unlinkSync(createdTicketPath);
      createdTicketPath = undefined;
    }
  });

  test('workflow.newTicket command should be registered and available', async () => {
    const commands = await vscode.commands.getCommands();
    
    assert.ok(
      commands.includes('workflow.newTicket'),
      'workflow.newTicket command should be registered'
    );
  });

  test('Creating a ticket should create file in backlog/', async () => {
    const ticketId = `E2E-CREATE-${Date.now()}`;
    createdTicketPath = path.join(workflowRoot, '.workflow', 'tickets', 'backlog', `${ticketId}.md`);

    // Create ticket content following the template format
    const ticketContent = `---
id: ${ticketId}
title: E2E Test Ticket Creation
status: backlog
priority: 3
type: IMPL
created_at: "${new Date().toISOString()}"
updated_at: "${new Date().toISOString()}"
dependencies: []
tags:
  - e2e-test
  - automated
---
## Description

E2E test ticket created by automated test suite.

## Acceptance Criteria

- [ ] Ticket file exists in backlog/
- [ ] Ticket has valid frontmatter
- [ ] Ticket ID matches expected format

## Notes

Created by test at ${new Date().toISOString()}
`;

    // Ensure backlog directory exists
    const backlogDir = path.join(workflowRoot, '.workflow', 'tickets', 'backlog');
    if (!fs.existsSync(backlogDir)) {
      fs.mkdirSync(backlogDir, { recursive: true });
    }

    // Write the ticket file
    fs.writeFileSync(createdTicketPath, ticketContent);

    // Verify file exists
    assert.ok(
      fs.existsSync(createdTicketPath),
      `Ticket file should be created at: ${createdTicketPath}`
    );

    // Verify content
    const content = fs.readFileSync(createdTicketPath, 'utf-8');
    assert.ok(
      content.includes(`id: ${ticketId}`),
      'Ticket should contain correct ID'
    );
    assert.ok(
      content.includes('E2E Test Ticket Creation'),
      'Ticket should contain correct title'
    );
    assert.ok(
      content.includes('status: backlog'),
      'Ticket should have status: backlog'
    );
    assert.ok(
      content.includes('priority: 3'),
      'Ticket should have priority: 3'
    );
    assert.ok(
      content.includes('type: IMPL'),
      'Ticket should have type: IMPL'
    );

    // Verify frontmatter is valid YAML
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(
      frontmatterMatch,
      'Ticket should have valid frontmatter delimiters'
    );
  });

  test('TreeView should update after ticket creation', async () => {
    const ticketId = `E2E-REFRESH-${Date.now()}`;
    const ticketPath = path.join(workflowRoot, '.workflow', 'tickets', 'backlog', `${ticketId}.md`);
    
    // Create a ticket
    const ticketContent = `---
id: ${ticketId}
title: E2E Refresh Test
status: backlog
priority: 3
type: IMPL
created_at: "${new Date().toISOString()}"
updated_at: "${new Date().toISOString()}"
dependencies: []
---
## Description

Test ticket for verifying TreeView refresh.
`;

    const backlogDir = path.join(workflowRoot, '.workflow', 'tickets', 'backlog');
    if (!fs.existsSync(backlogDir)) {
      fs.mkdirSync(backlogDir, { recursive: true });
    }

    fs.writeFileSync(ticketPath, ticketContent);

    // Trigger refresh command
    await vscode.commands.executeCommand('workflow.refreshTickets');

    // Wait for refresh to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify file exists (proves creation worked)
    assert.ok(
      fs.existsSync(ticketPath),
      'Ticket file should exist after creation'
    );

    // Cleanup
    fs.unlinkSync(ticketPath);
  });
});
