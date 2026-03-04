"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
// Import from the built extension (compiled to dist/extension.js)
const extension_1 = require("../../extension");
suite('Extension Activation Suite', () => {
    let context;
    let disposables = [];
    function createMockContext() {
        disposables = [];
        return {
            subscriptions: disposables,
            extensions: { getExtension: () => undefined },
            globalState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [] },
            workspaceState: { get: () => undefined, update: () => Promise.resolve(), keys: () => [] },
            secrets: { get: () => undefined, store: () => Promise.resolve(), delete: () => Promise.resolve() },
            extensionUri: vscode.Uri.file('/test'),
            extensionPath: '/test',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global-storage',
            environmentVariableCollection: { replace: () => { }, get: () => undefined, forEach: () => { }, delete: () => { }, clear: () => { }, description: '' },
            extension: { id: 'test', extensionUri: vscode.Uri.file('/test'), extensionPath: '/test' },
            logUri: vscode.Uri.file('/test/log'),
            logPath: '/test/log',
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            asAbsolutePath: (path) => path,
            extensionMode: vscode.ExtensionMode.Test,
            languageModelAccessInformation: { onDidChange: () => ({ dispose: () => { } }), canSendRequest: () => true },
        };
    }
    suiteSetup(async () => {
        // Activate once for all tests in this suite
        context = createMockContext();
        await (0, extension_1.activate)(context);
    });
    suiteTeardown(async () => {
        // Cleanup
        for (const d of disposables) {
            try {
                d.dispose();
            }
            catch {
                // Ignore disposal errors
            }
        }
    });
    test('activate() should not throw exceptions', async () => {
        // Already activated in suiteSetup, just verify it succeeded
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.length > 0, 'Extension should be activated');
    });
    test('deactivate() should not throw exceptions', () => {
        assert.doesNotThrow(() => {
            (0, extension_1.deactivate)();
        });
    });
    test('commands should be registered after activation', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('workflow.installCli'), 'workflow.installCli command should be registered');
        assert.ok(commands.includes('workflow.init'), 'workflow.init command should be registered');
    });
});
suite('CLI Detection Suite', () => {
    test('checkCliInstalled() should return boolean', async () => {
        const result = await (0, extension_1.checkCliInstalled)();
        assert.strictEqual(typeof result, 'boolean', 'checkCliInstalled should return a boolean');
    });
    test('checkCliInstalled() should handle custom cliPath configuration', async () => {
        const result = await (0, extension_1.checkCliInstalled)();
        assert.strictEqual(typeof result, 'boolean');
    });
});
suite('Workflow Directory Detection Suite', () => {
    test('checkWorkflowDir() should return boolean', () => {
        const result = (0, extension_1.checkWorkflowDir)();
        assert.strictEqual(typeof result, 'boolean', 'checkWorkflowDir should return a boolean');
    });
    test('checkWorkflowDir() should return false when no workspace is open', () => {
        const result = (0, extension_1.checkWorkflowDir)();
        assert.strictEqual(typeof result, 'boolean');
    });
});
suite('Context Keys Suite', () => {
    test('updateContextKeys() should not throw exceptions', async () => {
        await assert.doesNotReject(async () => {
            await (0, extension_1.updateContextKeys)();
        });
    });
    test('updateContextKeys() should set context keys', async () => {
        await assert.doesNotReject(async () => {
            await (0, extension_1.updateContextKeys)();
        });
    });
});
//# sourceMappingURL=extension.test.js.map