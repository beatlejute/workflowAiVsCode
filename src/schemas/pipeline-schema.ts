export const PIPELINE_SCHEMA = {
  type: 'object',
  required: ['pipeline'],
  properties: {
    pipeline: {
      type: 'object',
      required: ['agents', 'stages'],
      properties: {
        name: { type: 'string' },
        version: { type: 'string' },
        agents: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['command', 'args'],
            properties: {
              command: { type: 'string' },
              args: { type: 'array', items: { type: 'string' } },
              workdir: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        stages: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['description'],
            properties: {
              description: { type: 'string' },
              agent: { type: 'string' },
              fallback_agent: { type: 'string' },
              skill: { type: 'string' },
              type: { type: 'string' },
              counter: { type: 'string' },
              max: { type: 'number' },
              timeout: { type: 'number' },
              goto: {
                type: 'object',
                additionalProperties: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      required: ['stage'],
                      properties: {
                        stage: { type: 'string' },
                        params: { type: 'object' }
                      }
                    }
                  ]
                }
              }
            }
          }
        },
        entry: { type: 'string' },
        entry_point: { type: 'string' },
        context: { type: 'object' },
        execution: {
          type: 'object',
          required: ['max_steps', 'delay_between_stages', 'timeout_per_stage', 'log_file'],
          properties: {
            max_steps: { type: 'number' },
            delay_between_stages: { type: 'number' },
            timeout_per_stage: { type: 'number' },
            log_file: { type: 'string' }
          }
        },
        protected_files: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};
