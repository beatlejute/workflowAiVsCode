/**
 * Recurring Schema Unit Tests
 *
 * Tests for recurring definition validation schema.
 */

import * as assert from 'assert';
import { RECURRING_SCHEMA } from '../../schemas/recurring-schema';

function validateSchema(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const obj = data as Record<string, unknown>;

  if (!obj || typeof obj !== 'object') {
    errors.push('Data must be an object');
    return { valid: false, errors };
  }

  if (obj.definitions !== undefined) {
    if (!Array.isArray(obj.definitions)) {
      errors.push('definitions must be an array');
    } else {
      obj.definitions.forEach((def: any, index: number) => {
        if (!def.id) errors.push(`definitions[${index}].id is required`);
        if (!def.name) errors.push(`definitions[${index}].name is required`);
        if (typeof def.enabled !== 'boolean') errors.push(`definitions[${index}].enabled must be boolean`);
        if (!['ticket', 'plan'].includes(def.entity_type)) {
          errors.push(`definitions[${index}].entity_type must be 'ticket' or 'plan'`);
        }
        if (!def.trigger || !def.trigger.type) {
          errors.push(`definitions[${index}].trigger is required`);
        }
        if (!def.template || !def.template.type || !def.template.title_template) {
          errors.push(`definitions[${index}].template must have type and title_template`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

suite('RecurringSchema Suite', () => {

  test('should validate empty definitions array', () => {
    const data = { definitions: [] };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, true, 'Empty definitions should be valid');
  });

  test('should validate valid recurring definition with cron trigger', () => {
    const data = {
      definitions: [{
        id: 'rec-001',
        name: 'Test Cron',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        template: { type: 'task', title_template: 'Daily {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, true, 'Valid cron definition should pass');
  });

  test('should validate valid recurring definition with on-completion trigger', () => {
    const data = {
      definitions: [{
        id: 'rec-002',
        name: 'Test OnComplete',
        enabled: true,
        entity_type: 'plan',
        trigger: { type: 'on-completion', target_entity_id: 'PLAN-001' },
        template: { type: 'plan', title_template: 'Review {n}' },
        state: {
          last_triggered_at: '2024-01-01T00:00:00Z',
          next_trigger_at: null,
          instance_count: 5,
          last_instance_id: 'PLAN-005',
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, true, 'Valid on-completion definition should pass');
  });

  test('should validate valid recurring definition with event trigger', () => {
    const data = {
      definitions: [{
        id: 'rec-003',
        name: 'Test Event',
        enabled: false,
        entity_type: 'ticket',
        trigger: {
          type: 'event',
          event_name: 'ticket.created',
          filter: { status: 'done' }
        },
        template: { type: 'task', title_template: 'Follow-up {date}' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, true, 'Valid event definition should pass');
  });

  test('should reject definition without id', () => {
    const data = {
      definitions: [{
        name: 'Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        template: { type: 'task', title_template: 'Test' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, false, 'Should reject definition without id');
    assert.ok(result.errors.some(e => e.includes('id')), 'Should have id error');
  });

  test('should reject definition without name', () => {
    const data = {
      definitions: [{
        id: 'rec-001',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        template: { type: 'task', title_template: 'Test' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, false, 'Should reject definition without name');
    assert.ok(result.errors.some(e => e.includes('name')), 'Should have name error');
  });

  test('should reject definition with invalid entity_type', () => {
    const data = {
      definitions: [{
        id: 'rec-001',
        name: 'Test',
        enabled: true,
        entity_type: 'invalid',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        template: { type: 'task', title_template: 'Test' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, false, 'Should reject invalid entity_type');
  });

  test('should reject definition without template', () => {
    const data = {
      definitions: [{
        id: 'rec-001',
        name: 'Test',
        enabled: true,
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, false, 'Should reject definition without template');
  });

  test('should reject definition without trigger', () => {
    const data = {
      definitions: [{
        id: 'rec-001',
        name: 'Test',
        enabled: true,
        entity_type: 'ticket',
        template: { type: 'task', title_template: 'Test' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, false, 'Should reject definition without trigger');
  });

  test('should reject enabled that is not boolean', () => {
    const data = {
      definitions: [{
        id: 'rec-001',
        name: 'Test',
        enabled: 'yes',
        entity_type: 'ticket',
        trigger: { type: 'cron', expression: '0 0 * * *' },
        template: { type: 'task', title_template: 'Test' },
        state: {
          last_triggered_at: null,
          next_trigger_at: null,
          instance_count: 0,
          last_instance_id: null,
          is_active_instance: false
        }
      }]
    };
    const result = validateSchema(data);
    assert.strictEqual(result.valid, false, 'Should reject non-boolean enabled');
  });

  test('RECURRING_SCHEMA should be defined', () => {
    assert.ok(RECURRING_SCHEMA, 'Schema should be defined');
    assert.ok(RECURRING_SCHEMA.properties, 'Schema should have properties');
    assert.ok(RECURRING_SCHEMA.properties.definitions, 'Schema should have definitions property');
  });
});
