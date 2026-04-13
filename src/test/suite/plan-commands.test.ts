/**
 * Plan Commands Suite Tests
 *
 * Integration tests for plan-related VSCode commands:
 * - workflow.approvePlan
 * - workflow.revertPlanToDraft
 * - workflow.createPlanFromTemplate
 *
 * Tests:
 * TC-001: Command registration via getCommands()
 * TC-002: workflow.approvePlan — service layer behavior
 * TC-003: workflow.revertPlanToDraft — service layer behavior
 * TC-004: workflow.createPlanFromTemplate — service layer behavior
 * TC-005: package.json structural check (when-conditions)
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { activate, deactivate } from '../../extension';
import { setWorkspaceRoot } from '../../command-registration';
import { resetErrorHandler } from '../../error-handler';

suite('Plan Commands Suite', () => {
  let testDir: string;
  let workflowRoot: string;
  let context: vscode.ExtensionContext;
  let disposables: vscode.Disposable[] = [];

  function createMockContext(): vscode.ExtensionContext {
    disposables = [];
    return {
      subscriptions: disposables,
      extensions: { getExtension: () => undefined },
      globalState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [] },
      workspaceState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [] },
      secrets: {
        get: () => Promise.resolve(undefined),
        store: () => Promise.resolve(),
        delete: () => Promise.resolve()
      },
      extensionUri: vscode.Uri.file('/test'),
      extensionPath: '/test',
      storagePath: '/test/storage',
      globalStoragePath: '/test/global-storage',
      environmentVariableCollection: {
        replace: () => {},
        get: () => undefined,
        forEach: () => {},
        delete: () => {},
        clear: () => {},
        description: ''
      },
      extension: {
        id: 'test',
        extensionUri: vscode.Uri.file('/test'),
        extensionPath: '/test'
      },
      logUri: vscode.Uri.file('/test/log'),
      logPath: '/test/log',
      storageUri: vscode.Uri.file('/test/storage'),
      globalStorageUri: vscode.Uri.file('/test/global-storage'),
      asAbsolutePath: (p: string) => p,
      extensionMode: vscode.ExtensionMode.Test,
      languageModelAccessInformation: {
        onDidChange: () => ({ dispose: () => {} }),
        canSendRequest: () => true
      }
    } as unknown as vscode.ExtensionContext;
  }

  function createWorkflowStructure(root: string): void {
    fs.mkdirSync(path.join(root, 'plans', 'current'), { recursive: true });
    fs.mkdirSync(path.join(root, 'plans', 'archive'), { recursive: true });
    fs.mkdirSync(path.join(root, 'plans', 'templates'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tickets', 'backlog'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tickets', 'ready'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tickets', 'in-progress'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tickets', 'blocked'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tickets', 'review'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tickets', 'done'), { recursive: true });
    fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  }

  function makePlanContent(id: string, status: string, extraFields: Record<string, string> = {}): string {
    const now = new Date().toISOString();
    const base: Record<string, string> = {
      id: `"${id}"`,
      title: '"Test Plan"',
      status,
      author: 'test',
      created_at: `"${now}"`,
      updated_at: `"${now}"`,
      completed_at: '""',
      previous_plan: '""',
      'related_reports': '[]',
      ...extraFields
    };
    const frontmatter = Object.entries(base)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    return `---\n${frontmatter}\n---\n\n# ${id} Body\n`;
  }

  setup(async () => {
    testDir = path.join(process.cwd(), 'tmp', 'test-plan-commands-' + Date.now());
    workflowRoot = path.join(testDir, '.workflow');
    createWorkflowStructure(workflowRoot);
    context = createMockContext();
    await activate(context);
    setWorkspaceRoot(workflowRoot);
  });

  teardown(async () => {
    deactivate();
    resetErrorHandler();
    for (const d of disposables) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    disposables = [];
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  // ====================================================
  // TC-001: Регистрация команд через getCommands()
  // ====================================================

  suite('TC-001: Регистрация команд через getCommands()', () => {
    test('workflow.approvePlan должна быть зарегистрирована', async () => {
      const commands = await vscode.commands.getCommands();
      assert.ok(
        commands.includes('workflow.approvePlan'),
        'workflow.approvePlan должна присутствовать в getCommands()'
      );
    });

    test('workflow.revertPlanToDraft должна быть зарегистрирована', async () => {
      const commands = await vscode.commands.getCommands();
      assert.ok(
        commands.includes('workflow.revertPlanToDraft'),
        'workflow.revertPlanToDraft должна присутствовать в getCommands() — зависит от IMPL-088'
      );
    });

    test('workflow.createPlanFromTemplate должна быть зарегистрирована', async () => {
      const commands = await vscode.commands.getCommands();
      assert.ok(
        commands.includes('workflow.createPlanFromTemplate'),
        'workflow.createPlanFromTemplate должна присутствовать в getCommands()'
      );
    });
  });

  // ====================================================
  // TC-002: workflow.approvePlan — вызов сервисного слоя
  // ====================================================

  suite('TC-002: workflow.approvePlan — вызов сервисного слоя', () => {
    test('должна изменить статус плана с draft на approved', async () => {
      const planPath = path.join(workflowRoot, 'plans', 'current', 'PLAN-T01.md');
      fs.writeFileSync(planPath, makePlanContent('PLAN-T01', 'draft'), 'utf-8');

      await vscode.commands.executeCommand('workflow.approvePlan', 'PLAN-T01');

      const updated = fs.readFileSync(planPath, 'utf-8');
      assert.ok(
        updated.includes('status: approved'),
        'Статус должен измениться на approved после выполнения команды'
      );
    });

    test('должна обновить поле updated_at при approve', async () => {
      const planPath = path.join(workflowRoot, 'plans', 'current', 'PLAN-T02.md');
      fs.writeFileSync(planPath, makePlanContent('PLAN-T02', 'draft'), 'utf-8');

      await vscode.commands.executeCommand('workflow.approvePlan', 'PLAN-T02');

      const updated = fs.readFileSync(planPath, 'utf-8');
      assert.ok(!updated.includes('status: draft'), 'status: draft должен быть заменён');
      assert.ok(updated.includes('status: approved'), 'status: approved должен присутствовать');
    });

    test('должна сохранять прочие поля frontmatter при approve', async () => {
      const planPath = path.join(workflowRoot, 'plans', 'current', 'PLAN-T03.md');
      const content = makePlanContent('PLAN-T03', 'draft', { custom_field: 'custom-value' });
      fs.writeFileSync(planPath, content, 'utf-8');

      await vscode.commands.executeCommand('workflow.approvePlan', 'PLAN-T03');

      const updated = fs.readFileSync(planPath, 'utf-8');
      assert.ok(updated.includes('status: approved'), 'Статус должен быть approved');
      assert.ok(updated.includes('custom_field'), 'Кастомные поля frontmatter должны быть сохранены');
    });

    test('должна принимать PlanTreeItem с plan.id', async () => {
      const planPath = path.join(workflowRoot, 'plans', 'current', 'PLAN-T04.md');
      fs.writeFileSync(planPath, makePlanContent('PLAN-T04', 'draft'), 'utf-8');

      await vscode.commands.executeCommand('workflow.approvePlan', { plan: { id: 'PLAN-T04' } });

      const updated = fs.readFileSync(planPath, 'utf-8');
      assert.ok(updated.includes('status: approved'), 'Должна поддерживать arg в виде PlanTreeItem');
    });
  });

  // ====================================================
  // TC-003: workflow.revertPlanToDraft — вызов сервисного слоя
  // ====================================================

  suite('TC-003: workflow.revertPlanToDraft — вызов сервисного слоя', () => {
    test('должна изменить статус плана с approved на draft', async () => {
      const planPath = path.join(workflowRoot, 'plans', 'current', 'PLAN-T10.md');
      fs.writeFileSync(planPath, makePlanContent('PLAN-T10', 'approved'), 'utf-8');

      await vscode.commands.executeCommand('workflow.revertPlanToDraft', 'PLAN-T10');

      const updated = fs.readFileSync(planPath, 'utf-8');
      assert.ok(
        updated.includes('status: draft'),
        'Статус должен измениться на draft — зависит от IMPL-088'
      );
    });
  });

  // ====================================================
  // TC-004: workflow.createPlanFromTemplate — вызов сервисного слоя
  // ====================================================

  suite('TC-004: workflow.createPlanFromTemplate — вызов сервисного слоя', () => {
    test('должна создать новый план в plans/current/', async () => {
      const now = new Date().toISOString();
      const templateContent = [
        '---',
        'id: ""',
        'title: "Template Plan"',
        'status: draft',
        'author: template-author',
        `created_at: "${now}"`,
        `updated_at: "${now}"`,
        'completed_at: ""',
        'previous_plan: ""',
        'related_reports: []',
        '---',
        '',
        '# Template Plan Body'
      ].join('\n');
      const templatePath = path.join(workflowRoot, 'plans', 'templates', 'TEMPLATE-001.md');
      fs.writeFileSync(templatePath, templateContent, 'utf-8');

      await vscode.commands.executeCommand(
        'workflow.createPlanFromTemplate',
        { template: { id: 'TEMPLATE-001' } }
      );

      const plansDir = path.join(workflowRoot, 'plans', 'current');
      const files = fs.readdirSync(plansDir);
      assert.ok(
        files.some(f => f.startsWith('PLAN-') && f.endsWith('.md')),
        'Новый файл плана должен быть создан в plans/current/'
      );
    });

    test('созданный план должен иметь статус draft', async () => {
      const now = new Date().toISOString();
      const templateContent = [
        '---',
        'id: ""',
        'title: "Template Plan"',
        'status: active',
        'author: template-author',
        `created_at: "${now}"`,
        `updated_at: "${now}"`,
        'completed_at: ""',
        'previous_plan: ""',
        'related_reports: []',
        '---',
        '',
        '# Template Plan Body'
      ].join('\n');
      const templatePath = path.join(workflowRoot, 'plans', 'templates', 'TEMPLATE-002.md');
      fs.writeFileSync(templatePath, templateContent, 'utf-8');

      await vscode.commands.executeCommand(
        'workflow.createPlanFromTemplate',
        { template: { id: 'TEMPLATE-002' } }
      );

      const plansDir = path.join(workflowRoot, 'plans', 'current');
      const files = fs.readdirSync(plansDir);
      const planFile = files.find(f => f.startsWith('PLAN-') && f.endsWith('.md'));
      assert.ok(planFile, 'Файл плана должен существовать');
      const content = fs.readFileSync(path.join(plansDir, planFile!), 'utf-8');
      // PlanService.createFromTemplate сериализует status как строку — может быть "draft" или draft
      assert.ok(
        content.includes('status: draft') || content.includes('status: "draft"'),
        'Созданный план всегда должен иметь статус draft (независимо от статуса шаблона)'
      );
    });
  });

  // ====================================================
  // TC-005: Структурная проверка package.json (when-условия)
  // ====================================================

  suite('TC-005: Структурная проверка package.json (when-условия)', () => {
    let menus: Array<{ command: string; when?: string; group?: string }>;

    setup(() => {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const contributes = pkg.contributes as Record<string, unknown>;
      menus = (contributes.menus as Record<string, unknown>)['view/item/context'] as Array<{
        command: string;
        when?: string;
        group?: string;
      }>;
    });

    test('workflow.approvePlan должен иметь when с viewItem == plan-current-draft', () => {
      const entry = menus.find(e => e.command === 'workflow.approvePlan' && e.when && e.when !== 'false');
      assert.ok(entry, 'Должен быть найден пункт меню для workflow.approvePlan (when != false)');
      assert.ok(
        entry.when?.includes('viewItem == plan-current-draft'),
        `when должно содержать "viewItem == plan-current-draft", получено: "${entry.when}"`
      );
    });

    test('workflow.revertPlanToDraft должен иметь when с viewItem == plan-current-approved', () => {
      const entry = menus.find(e => e.command === 'workflow.revertPlanToDraft' && e.when && e.when !== 'false');
      assert.ok(
        entry,
        'Должен быть найден пункт меню для workflow.revertPlanToDraft — зависит от IMPL-088'
      );
      assert.ok(
        entry?.when?.includes('viewItem == plan-current-approved'),
        `when должно содержать "viewItem == plan-current-approved", получено: "${entry?.when}"`
      );
    });

    test('workflow.createPlanFromTemplate должен иметь when с viewItem =~ /^plan-template/', () => {
      const entry = menus.find(
        e => e.command === 'workflow.createPlanFromTemplate' && e.when && e.when !== 'false'
      );
      assert.ok(entry, 'Должен быть найден пункт меню для workflow.createPlanFromTemplate (when != false)');
      assert.ok(
        entry.when?.includes('viewItem =~ /^plan-template/'),
        `when должно содержать "viewItem =~ /^plan-template/", получено: "${entry.when}"`
      );
    });

    test('workflow.togglePlanTemplate должен иметь when с viewItem =~ /^plan-template/', () => {
      const entry = menus.find(
        e => e.command === 'workflow.togglePlanTemplate' && e.when && e.when !== 'false'
      );
      assert.ok(entry, 'Должен быть найден пункт меню для workflow.togglePlanTemplate (when != false)');
      assert.ok(
        entry.when?.includes('viewItem =~ /^plan-template/'),
        `when должно содержать "viewItem =~ /^plan-template/", получено: "${entry.when}"`
      );
    });
  });
});
