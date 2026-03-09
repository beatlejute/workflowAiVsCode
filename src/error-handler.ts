import * as vscode from 'vscode';
import { t } from './i18n';

/**
 * Log levels for the error handler.
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * Error context for additional information.
 */
export interface ErrorContext {
  /** Additional context about where the error occurred */
  location?: string;
  /** Additional data to log */
  data?: Record<string, unknown>;
  /** Whether to show error message to user */
  showMessage?: boolean;
  /** Custom user-friendly message */
  userMessage?: string;
}

/**
 * Centralized error handler for the Workflow AI extension.
 * Provides consistent error logging and user-friendly error messages.
 */
export class ErrorHandler {
  private outputChannel: vscode.OutputChannel;
  private logLevel: LogLevel;
  private errorCount = 0;
  private sessionStart: number;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Workflow AI');
    this.logLevel = LogLevel.INFO;
    this.sessionStart = Date.now();
  }

  /**
   * Get the output channel for manual logging if needed.
   */
  getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  /**
   * Set the minimum log level.
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get the current error count for this session.
   */
  getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * Get the session duration in milliseconds.
   */
  getSessionDuration(): number {
    return Date.now() - this.sessionStart;
  }

  /**
   * Log a message to the output channel.
   */
  log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(level)) {
      const timestamp = new Date().toISOString();
      const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
      this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}${dataStr}`);
    }
  }

  /**
   * Check if a message should be logged based on current log level.
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3
    };
    return levels[level] >= levels[this.logLevel];
  }

  /**
   * Handle an error with centralized error handling.
   * Logs the error and optionally shows a user-friendly message.
   * 
   * @param error - The error to handle
   * @param context - The context where the error occurred
   * @param errorContext - Additional error context
   */
  handleError(error: unknown, context: string, errorContext?: ErrorContext): void {
    this.errorCount++;
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Log error details
    this.log(LogLevel.ERROR, `Error in ${context}: ${errorMessage}`, {
      ...errorContext?.data,
      stack: stack ? 'available' : 'not available'
    });

    // Log stack trace if available
    if (stack) {
      this.outputChannel.appendLine(`Stack trace:\n${stack}`);
    }

    // Show user-friendly message if requested
    const shouldShowMessage = errorContext?.showMessage ?? true;
    if (shouldShowMessage) {
      const userMessage = this.getUserFriendlyMessage(error, context, errorContext?.userMessage);
      vscode.window.showErrorMessage(userMessage);
    }
  }

  /**
   * Get a user-friendly error message.
   */
  private getUserFriendlyMessage(error: unknown, context: string, customMessage?: string): string {
    // Use custom message if provided
    if (customMessage) {
      return customMessage;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Map technical errors to user-friendly messages
    const errorMappings: Array<{ pattern: RegExp; message: string }> = [
      { pattern: /CLI not found|ENOENT|command not found/i, message: t('Workflow CLI not installed. Click \'Install\' to fix.') },
      { pattern: /File not found|ENOENT|no such file/i, message: t('Ticket file not found. It may have been moved or deleted.') },
      { pattern: /Invalid YAML|YAML parsing|parse error/i, message: t('Ticket format error. Check frontmatter syntax.') },
      { pattern: /EACCES|permission denied/i, message: t('Permission denied. Check file permissions.') },
      { pattern: /ECONNREFUSED|network|connection refused/i, message: t('Network error. Check your connection.') },
      { pattern: /timeout|ETIMEDOUT/i, message: t('Request timed out. Please try again.') },
      { pattern: /already exists|EEXIST/i, message: t('Item already exists.') },
      { pattern: /not a directory|ENOTDIR/i, message: t('Invalid path. Expected a directory.') },
      { pattern: /is a directory|EISDIR/i, message: t('Invalid path. Expected a file.') }
    ];

    for (const { pattern, message } of errorMappings) {
      if (pattern.test(errorMessage)) {
        return message;
      }
    }

    // Default: show generic error message with context
    return t('Error in {0}: {1}', context, errorMessage);
  }

  /**
   * Wrap a function with error handling.
   * 
   * @param fn - The function to wrap
   * @param context - The context name for error reporting
   * @param options - Optional configuration
   * @returns The wrapped function
   */
  wrap<T extends (...args: unknown[]) => unknown>(
    fn: T,
    context: string,
    options?: {
      showMessage?: boolean;
      onError?: (error: unknown) => void;
    }
  ): T {
    return ((...args: Parameters<T>): ReturnType<T> | undefined => {
      try {
        return fn(...args) as ReturnType<T>;
      } catch (error) {
        this.handleError(error, context, {
          showMessage: options?.showMessage ?? true
        });

        if (options?.onError) {
          options.onError(error);
        }

        return undefined;
      }
    }) as T;
  }

  /**
   * Wrap an async function with error handling.
   * 
   * @param fn - The async function to wrap
   * @param context - The context name for error reporting
   * @param options - Optional configuration
   * @returns The wrapped async function
   */
  wrapAsync<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    context: string,
    options?: {
      showMessage?: boolean;
      onError?: (error: unknown) => void;
    }
  ): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
      try {
        return await fn(...args) as ReturnType<T>;
      } catch (error) {
        this.handleError(error, context, {
          showMessage: options?.showMessage ?? true
        });

        if (options?.onError) {
          options.onError(error);
        }

        return undefined;
      }
    }) as T;
  }

  /**
   * Log an info message.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log a debug message.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log command execution start.
   */
  logCommandStart(command: string, args?: Record<string, unknown>): void {
    this.info(`Command started: ${command}`, args);
  }

  /**
   * Log command execution end.
   */
  logCommandEnd(command: string, duration?: number): void {
    const durationStr = duration !== undefined ? ` in ${duration}ms` : '';
    this.info(`Command completed: ${command}${durationStr}`);
  }

  /**
   * Log command execution error.
   */
  logCommandError(command: string, error: unknown, duration?: number): void {
    const durationStr = duration !== undefined ? ` after ${duration}ms` : '';
    this.handleError(error, `Command: ${command}${durationStr}`, {
      showMessage: false // Command errors are handled separately
    });
  }

  /**
   * Log CLI execution result.
   */
  logCliResult(command: string, stdout?: string, stderr?: string, exitCode?: number): void {
    if (exitCode !== 0 && exitCode !== undefined) {
      this.warn(`CLI command "${command}" exited with code ${exitCode}`, {
        stderr: stderr?.substring(0, 500) // Truncate long errors
      });
    } else if (stderr) {
      this.warn(`CLI command "${command}" produced stderr: ${stderr.substring(0, 200)}`);
    } else {
      this.debug(`CLI command "${command}" completed successfully`, {
        stdoutLength: stdout?.length ?? 0
      });
    }
  }

  /**
   * Log validation result.
   */
  logValidationResult(type: string, isValid: boolean, errors?: string[]): void {
    if (isValid) {
      this.debug(`Validation passed: ${type}`);
    } else {
      this.warn(`Validation failed: ${type}`, { errors });
    }
  }

  /**
   * Log performance metrics.
   */
  logPerformance(operation: string, durationMs: number, threshold = 1000): void {
    if (durationMs > threshold) {
      this.warn(`Performance: ${operation} took ${durationMs}ms (threshold: ${threshold}ms)`);
    } else {
      this.debug(`Performance: ${operation} took ${durationMs}ms`);
    }
  }

  /**
   * Setup global unhandled error handlers.
   */
  setupGlobalHandlers(): void {
    // Note: Do NOT register process.on('uncaughtException') or
    // process.on('unhandledRejection') here. VSCode extensions share
    // a single Node.js process, so global handlers would catch errors
    // from other extensions (e.g. GitLens, npm-outdated) and incorrectly
    // show Workflow AI error popups for unrelated issues.
    // Instead, use try/catch and .catch() in our own code paths.
  }

  /**
   * Dispose the error handler and output channel.
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

/**
 * Global error handler instance.
 */
let globalErrorHandler: ErrorHandler | undefined;

/**
 * Get or create the global error handler instance.
 */
export function getErrorHandler(): ErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandler();
  }
  return globalErrorHandler;
}

/**
 * Initialize the global error handler with default settings.
 * Call this during extension activation.
 */
export function initializeErrorHandler(): ErrorHandler {
  const handler = getErrorHandler();
  handler.setupGlobalHandlers();
  handler.info('Workflow AI Error Handler initialized');
  return handler;
}
