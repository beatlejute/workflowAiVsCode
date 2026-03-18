export const RECURRING_SCHEMA = {
  type: 'object',
  properties: {
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'enabled', 'entity_type', 'trigger', 'template', 'state'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          enabled: { type: 'boolean' },
          entity_type: { type: 'string', enum: ['ticket', 'plan'] },
          trigger: {
            type: 'object',
            oneOf: [
              {
                type: 'object',
                required: ['type', 'expression'],
                properties: {
                  type: { type: 'string', const: 'cron' },
                  expression: { type: 'string' }
                }
              },
              {
                type: 'object',
                required: ['type'],
                properties: {
                  type: { type: 'string', const: 'on-completion' },
                  target_entity_id: { type: 'string' }
                }
              },
              {
                type: 'object',
                required: ['type', 'event_name'],
                properties: {
                  type: { type: 'string', const: 'event' },
                  event_name: { type: 'string' },
                  filter: { type: 'object' }
                }
              }
            ]
          },
          template: {
            type: 'object',
            required: ['type', 'title_template'],
            properties: {
              type: { type: 'string' },
              title_template: { type: 'string' },
              body_template: { type: 'string' },
              status: { type: 'string' },
              priority: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } }
            }
          },
          state: {
            type: 'object',
            properties: {
              last_triggered_at: { type: ['string', 'null'] },
              next_trigger_at: { type: ['string', 'null'] },
              instance_count: { type: 'number' },
              last_instance_id: { type: ['string', 'null'] },
              is_active_instance: { type: 'boolean' }
            }
          }
        }
      }
    }
  }
};
