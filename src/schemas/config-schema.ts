export const CONFIG_SCHEMA = {
  type: 'object',
  required: ['version', 'paths'],
  properties: {
    version: { type: 'string' },
    project: { type: 'object' },
    task_types: { type: 'object' },
    priorities: { type: 'object' },
    statuses: { type: 'object' },
    condition_types: { type: 'object' },
    paths: {
      type: 'object',
      required: ['tickets', 'plans', 'reports', 'archive'],
      properties: {
        tickets: { type: 'string' },
        plans: { type: 'string' },
        reports: { type: 'string' },
        archive: { type: 'string' },
        templates: { type: 'string' }
      }
    },
    reporting: { type: 'object' }
  }
};
