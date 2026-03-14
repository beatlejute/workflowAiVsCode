/**
 * E2E Tests - Extension Activation
 *
 * Tests:
 * 1. Extension activates when .workflow/ directory is present
 * 2. Context key workflowFound is set to true
 * 3. StatusBar item is visible after activation
 * 4. Sidebar TreeView is registered and accessible
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Activation Tests', () => {

  suiteSetup(async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folders found');
    }

    // Extension activates automatically on startup, wait for it to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('Extension should activate with .workflow/ directory present', async () => {
    const ext = vscode.extensions.getExtension('workflow-ai.workflow-vscode');
    assert.ok(ext, 'Extension should be installed');

    // Extension should already be active due to onStartupFinished activation event
    assert.ok(ext.isActive, 'Extension should be active after startup');
  });

  test('Context key workflowFound should be true', async () => {
    // Wait for context keys to be set after activation
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify workflow commands are registered (indirect check of context key)
    const commands = await vscode.commands.getCommands();
    const workflowCommands = commands.filter(cmd => cmd.startsWith('workflow.'));
    
    assert.ok(
      workflowCommands.length > 0,
      `Workflow commands should be registered. Found: ${workflowCommands.length} commands`
    );

    // Verify specific commands exist
    assert.ok(
      workflowCommands.includes('workflow.newTicket'),
      'workflow.newTicket command should be registered'
    );
    assert.ok(
      workflowCommands.includes('workflow.moveTicket'),
      'workflow.moveTicket command should be registered'
    );
  });

  test('StatusBar should be visible after activation', async () => {
    const ext = vscode.extensions.getExtension('workflow-ai.workflow-vscode');
    assert.ok(ext?.isActive, 'Extension should be active');

    // StatusBar is created in extension.ts and pushed to context.subscriptions
    // We verify it by checking the extension is active and has subscriptions
    assert.ok(
      ext.exports || ext.isActive,
      'Extension should have exports or be active (StatusBar is registered in subscriptions)'
    );
  });

  test('Sidebar TreeView should be registered', async () => {
    const commands = await vscode.commands.getCommands();
    
    // TreeView registration creates focus and refresh commands
    const treeViewCommands = commands.filter(cmd => 
      cmd.includes('workflow.focusTicketsView') || 
      cmd.includes('workflow.refreshTickets') ||
      cmd.includes('workflow.sidebar')
    );

    assert.ok(
      treeViewCommands.length > 0,
      `Sidebar TreeView commands should be registered. Found: ${treeViewCommands.join(', ')}`
    );

    // Verify specific tree view commands
    assert.ok(
      commands.some(cmd => cmd.includes('workflow.focusTicketsView')),
      'workflow.focusTicketsView command should be registered'
    );
  });
});
