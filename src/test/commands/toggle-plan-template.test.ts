/**
 * Unit tests for togglePlanTemplate command handler
 *
 * Tests:
 * - executeTogglePlanTemplate: toggle enabled state of a plan template
 * - TC28: Toggle template changes enabled in file and updates Store
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { executeTogglePlanTemplate } from '../../commands/toggle-plan-template';
import { WorkflowStore } from '../../data/workflow-store';
import { PlansTreeProvider } from '../../ui/sidebar-tree-provider';
import { PlanTemplate } from '../../data/types';

suite('executeTogglePlanTemplate Command Tests', () => {
  let store: WorkflowStore;
  let plansProvider: PlansTreeProvider;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let updatePlanTemplateStub: sinon.SinonStub;
  let getWorkflowRootStub: sinon.SinonStub;
  let refreshStub: sinon.SinonStub;
  let tempDir: string;

  setup(() => {
    tempDir = path.join(__dirname, '../../../../../tmp/test-toggle-template');
    fs.mkdirSync(tempDir, { recursive: true });
    const wfRoot = path.join(tempDir, '.workflow');
    fs.mkdirSync(path.join(wfRoot, 'plans', 'templates'), { recursive: true });

    getWorkflowRootStub = sinon.stub().returns(wfRoot);
    updatePlanTemplateStub = sinon.stub();

    store = {
      getWorkflowRoot: getWorkflowRootStub,
      updatePlanTemplate: updatePlanTemplateStub
    } as unknown as WorkflowStore;

    refreshStub = sinon.stub();
    plansProvider = {
      refresh: refreshStub
    } as unknown as PlansTreeProvider;

    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
  });

  teardown(() => {
    sinon.restore();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('TC28: Toggle template changes enabled in file and updates Store', async () => {
    const templateContent = `---
id: "TMPL-TEST"
title: "Test Template"
type: template
trigger:
  type: daily
  params: {}
last_triggered: ""
enabled: false
---

# Test Template Content
`;
    const wfRoot = path.join(tempDir, '.workflow');
    const templatePath = path.join(wfRoot, 'plans', 'templates', 'TMPL-TEST.md');
    fs.writeFileSync(templatePath, templateContent, 'utf-8');

    const mockItem = {
      template: {
        id: 'TMPL-TEST',
        title: 'Test Template',
        trigger: { type: 'daily', params: {} },
        enabled: false
      } as PlanTemplate
    };

    await executeTogglePlanTemplate(store, plansProvider, mockItem);

    const updatedContent = fs.readFileSync(templatePath, 'utf-8');
    const yamlMatch = updatedContent.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(yamlMatch, 'Template should have frontmatter');
    const frontmatter = yamlMatch[1];
    assert.ok(frontmatter.includes('enabled: true'), 'Template should have enabled: true after toggle');

    assert.ok(updatePlanTemplateStub.calledOnce, 'updatePlanTemplate should be called');
    const updatedTemplate = updatePlanTemplateStub.firstCall.args[1];
    assert.strictEqual(updatedTemplate.enabled, true, 'Store should be updated with enabled: true');

    assert.ok(refreshStub.calledOnce, 'plansProvider.refresh should be called');
    assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called');
  });

  test('TC28: Toggle from enabled to disabled', async () => {
    const templateContent = `---
id: "TMPL-TEST"
title: "Test Template"
type: template
trigger:
  type: daily
  params: {}
last_triggered: ""
enabled: true
---

# Test Template Content
`;
    const wfRoot = path.join(tempDir, '.workflow');
    const templatePath = path.join(wfRoot, 'plans', 'templates', 'TMPL-TEST.md');
    fs.writeFileSync(templatePath, templateContent, 'utf-8');

    const mockItem = {
      template: {
        id: 'TMPL-TEST',
        title: 'Test Template',
        trigger: { type: 'daily', params: {} },
        enabled: true
      } as PlanTemplate
    };

    await executeTogglePlanTemplate(store, plansProvider, mockItem);

    const updatedContent = fs.readFileSync(templatePath, 'utf-8');
    const yamlMatch = updatedContent.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(yamlMatch, 'Template should have frontmatter');
    const frontmatter = yamlMatch[1];
    assert.ok(frontmatter.includes('enabled: false'), 'Template should have enabled: false after toggle');

    assert.ok(updatePlanTemplateStub.calledOnce, 'updatePlanTemplate should be called');
    const updatedTemplate = updatePlanTemplateStub.firstCall.args[1];
    assert.strictEqual(updatedTemplate.enabled, false, 'Store should be updated with enabled: false');
  });

  test('Should show error when template not provided', async () => {
    await executeTogglePlanTemplate(store, plansProvider, undefined);

    assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called');
    const errorMessage = showErrorMessageStub.firstCall.args[0];
    assert.ok(errorMessage.includes('No template provided'), 'Error should mention template not provided');
  });

  test('Should show error when workflow root not available', async () => {
    getWorkflowRootStub.returns(undefined);

    const mockItem = { template: { id: 'TMPL-TEST', title: 'Test', trigger: { type: 'daily', params: {} }, enabled: false } as PlanTemplate };

    await executeTogglePlanTemplate(store, plansProvider, mockItem);

    assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called');
  });
});
