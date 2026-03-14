/**
 * Input Sanitizer Module
 * 
 * Provides whitelist-based sanitization functions for various input types.
 * Uses a whitelist approach (only allow safe characters) rather than blacklist.
 * Throws errors on invalid input instead of silently stripping characters.
 * 
 * @see ADR-013: Whitelist approach for input sanitization
 */

/**
 * Sanitize a ticket ID.
 * Allowed characters: alphanumeric, dash (-), underscore (_), dot (.)
 * 
 * @param id - The ticket ID to sanitize
 * @returns The validated ticket ID
 * @throws Error if the input contains invalid characters
 */
export function sanitizeTicketId(id: string): string {
  if (typeof id !== 'string') {
    throw new Error('Invalid input: ticket ID must be a string');
  }

  // Allow empty string
  if (id === '') {
    return id;
  }

  // Whitelist: only alphanumeric, dash, underscore, dot
  const ticketIdPattern = /^[a-zA-Z0-9\-_.]+$/;

  if (!ticketIdPattern.test(id)) {
    throw new Error(`Invalid input: ticket ID contains invalid characters. Only alphanumeric, dash, underscore, and dot are allowed. Got: "${id}"`);
  }

  return id;
}

/**
 * Sanitize a file path.
 * Allowed characters: alphanumeric, dash, underscore, dot, forward slash, backslash
 * Rejects path traversal attempts (../ or ..\)
 * 
 * @param p - The path to sanitize
 * @returns The validated path
 * @throws Error if the input contains invalid characters or path traversal attempts
 */
export function sanitizePath(p: string): string {
  if (typeof p !== 'string') {
    throw new Error('Invalid input: path must be a string');
  }

  // Allow empty string
  if (p === '') {
    return p;
  }

  // Check for path traversal attempts
  if (p.includes('..')) {
    throw new Error(`Invalid input: path traversal detected. Path traversal (../ or ..\\) is not allowed. Got: "${p}"`);
  }

  // Whitelist: safe path characters (alphanumeric, dash, underscore, dot, slash, backslash, colon for Windows drives, space)
  // Note: using explicit space character only, not \s (which matches unicode/newlines)
  const pathPattern = /^[a-zA-Z0-9\-_.\\/: ]+$/;

  if (!pathPattern.test(p)) {
    throw new Error(`Invalid input: path contains invalid characters. Only alphanumeric, dash, underscore, dot, slash, backslash, colon, and space are allowed. Got: "${p}"`);
  }

  return p;
}

/**
 * Sanitize an executable path.
 * Allowed characters: alphanumeric, dash, slash (/), backslash (\), space (for Windows paths)
 * 
 * @param p - The executable path to sanitize
 * @returns The validated executable path
 * @throws Error if the input contains invalid characters
 */
export function sanitizeExecutablePath(p: string): string {
  if (typeof p !== 'string') {
    throw new Error('Invalid input: executable path must be a string');
  }

  // Allow empty string
  if (p === '') {
    return p;
  }

  // Check for path traversal attempts
  if (p.includes('..')) {
    throw new Error(`Invalid input: path traversal detected. Path traversal (../ or ..\\) is not allowed. Got: "${p}"`);
  }

  // Whitelist: alphanumeric, dash, slash, backslash, dot (for extensions), underscore, space (for Windows paths), colon (for Windows drive letters)
  const executablePathPattern = /^[a-zA-Z0-9\-_./\\: ]+$/;

  if (!executablePathPattern.test(p)) {
    throw new Error(`Invalid input: executable path contains invalid characters. Only alphanumeric, dash, underscore, dot, slash, backslash, space, and colon are allowed. Got: "${p}"`);
  }

  return p;
}

/**
 * Sanitize a process ID.
 * Allowed characters: digits only (0-9)
 * 
 * @param id - The process ID to sanitize
 * @returns The validated process ID
 * @throws Error if the input contains non-digit characters
 */
export function sanitizeProcessId(id: string): string {
  if (typeof id !== 'string') {
    throw new Error('Invalid input: process ID must be a string');
  }

  // Allow empty string
  if (id === '') {
    return id;
  }

  // Whitelist: only digits
  const processIdPattern = /^[0-9]+$/;

  if (!processIdPattern.test(id)) {
    throw new Error(`Invalid input: process ID must contain only digits. Got: "${id}"`);
  }

  return id;
}
