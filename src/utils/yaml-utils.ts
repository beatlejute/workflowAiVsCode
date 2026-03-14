/**
 * Safe YAML Utilities Module
 *
 * Provides secure YAML parsing and serialization using JSON_SCHEMA
 * to prevent arbitrary JavaScript execution via YAML tags like !!js/function.
 *
 * @see ADR-015: Safe YAML parsing for security
 */

import * as yaml from 'js-yaml';

/**
 * Safely load YAML content using JSON_SCHEMA (no JS types)
 *
 * @param content - YAML string to parse
 * @returns Parsed YAML as JavaScript object
 * @throws yaml.YAMLException if YAML is invalid or contains unsafe tags
 */
export function safeLoad(content: string): unknown {
  return yaml.load(content, { schema: yaml.JSON_SCHEMA });
}

/**
 * Safely dump JavaScript object to YAML using JSON_SCHEMA
 *
 * @param data - JavaScript object to serialize
 * @param options - Optional serialization options
 * @returns YAML string representation
 */
export function safeDump(
  data: unknown,
  options: yaml.DumpOptions = {}
): string {
  return yaml.dump(data, {
    schema: yaml.JSON_SCHEMA,
    indent: 2,
    lineWidth: -1, // No line width limit
    noRefs: true,  // Disable aliases
    ...options
  });
}
