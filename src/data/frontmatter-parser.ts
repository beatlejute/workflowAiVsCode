/**
 * Frontmatter Parser Module
 *
 * Provides parsing and serialization of YAML frontmatter from markdown files.
 * Uses js-yaml for YAML operations with settings identical to wf CLI for roundtrip compatibility.
 */

import * as yaml from 'js-yaml';
import { safeLoad } from '../utils/yaml-utils';
import { FrontmatterResult } from './types';

/**
 * Regular expression to match YAML frontmatter block
 * Matches content between --- markers at the start of the file
 */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Parse YAML frontmatter from a markdown file content
 * 
 * @param content - The full markdown content including frontmatter and body
 * @returns Object containing parsed frontmatter and body string
 * @throws yaml.YAMLException if frontmatter is invalid YAML
 */
export function parse<T>(content: string): FrontmatterResult<T> {
  const match = FRONTMATTER_REGEX.exec(content);
  
  if (!match) {
    // No frontmatter found - return empty object and full content as body
    return {
      frontmatter: {} as T,
      body: content
    };
  }
  
  const frontmatterYaml = match[1];
  const body = content.slice(match[0].length);

  // Parse YAML using safeLoad with JSON_SCHEMA for security
  const frontmatter = safeLoad(frontmatterYaml) as T;

  return {
    frontmatter,
    body
  };
}

/**
 * Serialize frontmatter and body into a markdown file content
 * 
 * @param frontmatter - The frontmatter object to serialize
 * @param body - The markdown body content
 * @returns Full markdown content with YAML frontmatter
 */
export function serialize(frontmatter: Record<string, unknown>, body: string): string {
  // Serialize frontmatter using js-yaml with settings compatible with wf CLI
  const frontmatterYaml = yaml.dump(frontmatter, {
    schema: yaml.DEFAULT_SCHEMA,
    indent: 2,
    lineWidth: -1, // No line width limit
    noRefs: true,  // Disable aliases
    quotingType: '"',
    forceQuotes: false
  });
  
  return `---\n${frontmatterYaml}---\n${body}`;
}

/**
 * Update specific fields in frontmatter while preserving the rest
 * 
 * @param content - The full markdown content
 * @param updates - Fields to update in the frontmatter
 * @returns Updated markdown content with merged frontmatter
 */
export function updateFrontmatter<T extends Record<string, unknown>>(
  content: string,
  updates: Partial<T>
): string {
  const { frontmatter, body } = parse<T>(content);
  const updatedFrontmatter = { ...frontmatter, ...updates } as Record<string, unknown>;
  return serialize(updatedFrontmatter, body);
}

/**
 * Extract just the frontmatter from markdown content without parsing
 * 
 * @param content - The full markdown content
 * @returns The raw YAML frontmatter string (without --- markers) or null if not found
 */
export function extractFrontmatterRaw(content: string): string | null {
  const match = FRONTMATTER_REGEX.exec(content);
  if (!match) {
    return null;
  }
  return match[1];
}
