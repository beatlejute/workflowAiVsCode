/**
 * ConfigManager Unit Tests
 *
 * Tests for configuration loading, validation, caching and change events.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager, ConfigValidationError } from '../../data/config-manager';

suite('ConfigManager Suite', () => {

  let configManager: ConfigManager;

  setup(() => {
    configManager = new ConfigManager();
  });

  teardown(() => {
    configManager.clearCache();
  });

  suite('loadConfig() - Workflow Configuration', () => {

    test('should load valid config.yaml from real file', async () => {
      // workflowRoot is the .workflow directory (use cwd() to work regardless of compilation depth)
      const workflowRoot = path.join(process.cwd(), '.workflow');

      const config = await configManager.loadConfig(workflowRoot);

      assert.ok(config, 'Config should be loaded');
      assert.strictEqual(config.version, '1.0', 'Version should match');
      assert.ok(config.paths, 'Paths should exist');
      assert.strictEqual(typeof config.paths.tickets, 'string', 'Tickets path should be string');
    });

    test('should throw error when config.yaml not found', async () => {
      await assert.rejects(
        async () => await configManager.loadConfig('/tmp/nonexistent'),
        /Configuration file not found/
      );
    });

    test('should throw ConfigValidationError for missing required fields', async () => {
      // Create a temp file with invalid config
      const tempDir = path.join(process.cwd(), 'tmp/test-config-' + Date.now());
      const tempConfigDir = path.join(tempDir, '.workflow', 'config');
      const tempConfigPath = path.join(tempConfigDir, 'config.yaml');
      
      try {
        fs.mkdirSync(tempConfigDir, { recursive: true });
        fs.writeFileSync(tempConfigPath, 'version: "1.0"\n# Missing required paths field', 'utf-8');

        await assert.rejects(
          async () => await configManager.loadConfig(path.join(tempDir, '.workflow')),
          ConfigValidationError
        );
      } finally {
        // Cleanup
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    test('should throw error for invalid YAML syntax', async () => {
      const tempDir = path.join(process.cwd(), 'tmp/test-config-' + Date.now());
      const tempConfigDir = path.join(tempDir, '.workflow', 'config');
      const tempConfigPath = path.join(tempConfigDir, 'config.yaml');
      
      try {
        fs.mkdirSync(tempConfigDir, { recursive: true });
        fs.writeFileSync(tempConfigPath, 'version: "1.0\npaths:\n  tickets: tickets', 'utf-8');

        await assert.rejects(
          async () => await configManager.loadConfig(path.join(tempDir, '.workflow')),
          /Invalid YAML/
        );
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  suite('loadPipeline() - Pipeline Configuration', () => {

    test('should load valid pipeline.yaml from real file', async () => {
      const pipelinePath = path.join(process.cwd(), '.workflow/config/pipeline.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(pipelinePath));

      const pipeline = await configManager.loadPipeline(workflowRoot);

      assert.ok(pipeline, 'Pipeline should be loaded');
      assert.ok(pipeline.pipeline, 'Pipeline object should exist');
      assert.ok(pipeline.pipeline.agents, 'Agents should exist');
      assert.ok(pipeline.pipeline.stages, 'Stages should exist');
      assert.ok(pipeline.pipeline.entry || pipeline.pipeline.entry_point, 'Entry point should exist');
    });

    test('should throw error when pipeline.yaml not found', async () => {
      await assert.rejects(
        async () => await configManager.loadPipeline('/tmp/nonexistent'),
        /Configuration file not found/
      );
    });

    test('should throw ConfigValidationError for missing required fields', async () => {
      const tempDir = path.join(process.cwd(), 'tmp/test-pipeline-' + Date.now());
      const tempConfigDir = path.join(tempDir, '.workflow', 'config');
      const tempPipelinePath = path.join(tempConfigDir, 'pipeline.yaml');
      
      try {
        fs.mkdirSync(tempConfigDir, { recursive: true });
        fs.writeFileSync(tempPipelinePath, 'pipeline:\n  name: test\n# Missing required agents, stages, entry_point', 'utf-8');

        await assert.rejects(
          async () => await configManager.loadPipeline(path.join(tempDir, '.workflow')),
          ConfigValidationError
        );
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  suite('Caching', () => {

    test('should return cached config on subsequent calls', async () => {
      const configPath = path.join(process.cwd(), '.workflow/config/config.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(configPath));

      // First call - should read from file
      const config1 = await configManager.loadConfig(workflowRoot);

      // Second call - should return cached
      const config2 = await configManager.loadConfig(workflowRoot);

      assert.strictEqual(config1, config2, 'Should return same cached instance');
      assert.strictEqual(config1.version, config2.version, 'Cached config should have same values');
    });

    test('should return cached pipeline on subsequent calls', async () => {
      const pipelinePath = path.join(process.cwd(), '.workflow/config/pipeline.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(pipelinePath));

      const pipeline1 = await configManager.loadPipeline(workflowRoot);
      const pipeline2 = await configManager.loadPipeline(workflowRoot);

      assert.strictEqual(pipeline1, pipeline2, 'Should return same cached instance');
    });

    test('should clear cache when reload() is called', async () => {
      const configPath = path.join(process.cwd(), '.workflow/config/config.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(configPath));

      const config1 = await configManager.loadConfig(workflowRoot);
      
      // Modify the config file temporarily
      const originalContent = fs.readFileSync(configPath, 'utf-8');
      const updatedContent = originalContent.replace('version: "1.0"', 'version: "2.0"');
      
      try {
        fs.writeFileSync(configPath, updatedContent, 'utf-8');
        
        await configManager.reload();
        
        const config2 = await configManager.loadConfig(workflowRoot);

        assert.notStrictEqual(config1.version, config2.version, 'Config should be reloaded with new version');
      } finally {
        // Restore original content
        fs.writeFileSync(configPath, originalContent, 'utf-8');
      }
    });
  });

  suite('onDidChange Event', () => {

    test('should fire onDidChange event when reload() is called', async () => {
      const configPath = path.join(process.cwd(), '.workflow/config/config.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(configPath));

      await configManager.loadConfig(workflowRoot);
      
      let eventFired = false;
      configManager.onDidChange(() => {
        eventFired = true;
      });
      
      await configManager.reload();

      // Give event loop time to process
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.strictEqual(eventFired, true, 'onDidChange event should fire after reload');
    });

    test('should fire onDidChange event for each reload call', async () => {
      const configPath = path.join(process.cwd(), '.workflow/config/config.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(configPath));

      await configManager.loadConfig(workflowRoot);
      
      let eventCount = 0;
      configManager.onDidChange(() => {
        eventCount++;
      });
      
      await configManager.reload();
      await configManager.reload();
      
      // Give event loop time to process
      await new Promise(resolve => setTimeout(resolve, 10));
      
      assert.strictEqual(eventCount, 2, 'onDidChange should fire twice');
    });
  });

  suite('getConfig() and getPipeline() - Cached Access', () => {

    test('should return null when config not loaded', () => {
      const config = configManager.getConfig();
      assert.strictEqual(config, null, 'Should return null before loading');
    });

    test('should return null when pipeline not loaded', () => {
      const pipeline = configManager.getPipeline();
      assert.strictEqual(pipeline, null, 'Should return null before loading');
    });

    test('should return cached config after loadConfig', async () => {
      const configPath = path.join(process.cwd(), '.workflow/config/config.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(configPath));

      await configManager.loadConfig(workflowRoot);

      const cachedConfig = configManager.getConfig();

      assert.ok(cachedConfig, 'Should return cached config');
      assert.strictEqual(cachedConfig.version, '1.0', 'Cached config should have correct version');
    });

    test('should return cached pipeline after loadPipeline', async () => {
      const pipelinePath = path.join(process.cwd(), '.workflow/config/pipeline.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(pipelinePath));

      await configManager.loadPipeline(workflowRoot);

      const cachedPipeline = configManager.getPipeline();

      assert.ok(cachedPipeline, 'Should return cached pipeline');
      assert.ok(cachedPipeline.pipeline.entry || cachedPipeline.pipeline.entry_point, 'Cached pipeline should have entry_point');
    });
  });

  suite('clearCache()', () => {

    test('should clear cached config', async () => {
      const configPath = path.join(process.cwd(), '.workflow/config/config.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(configPath));

      await configManager.loadConfig(workflowRoot);

      configManager.clearCache();

      const cachedConfig = configManager.getConfig();
      assert.strictEqual(cachedConfig, null, 'Config should be cleared');
    });

    test('should clear cached pipeline', async () => {
      const pipelinePath = path.join(process.cwd(), '.workflow/config/pipeline.yaml');
      // workflowRoot is the .workflow directory
      const workflowRoot = path.dirname(path.dirname(pipelinePath));

      await configManager.loadPipeline(workflowRoot);

      configManager.clearCache();

      const cachedPipeline = configManager.getPipeline();
      assert.strictEqual(cachedPipeline, null, 'Pipeline should be cleared');
    });
  });

  suite('ConfigValidationError', () => {

    test('should have correct error message', () => {
      const errors = [
        { field: 'version', message: 'Required field "version" is missing' },
        { field: 'paths', message: 'Required field "paths" is missing' }
      ];
      
      const error = new ConfigValidationError(errors);
      
      assert.ok(error.message.includes('Configuration validation failed'), 'Message should contain prefix');
      assert.ok(error.message.includes('version'), 'Message should mention version field');
      assert.ok(error.message.includes('paths'), 'Message should mention paths field');
      assert.strictEqual(error.errors.length, 2, 'Should contain both errors');
    });

    test('should have correct error name', () => {
      const errors = [{ field: 'test', message: 'Test error' }];
      const error = new ConfigValidationError(errors);
      
      assert.strictEqual(error.name, 'ConfigValidationError', 'Error name should match');
    });
  });
});
