/**
 * IRecurringService - Interface for recurring definition management
 *
 * Provides CRUD operations for recurring definitions and instance creation.
 * Implements Dependency Inversion Principle (SOLID) for testability and DI.
 *
 * @see RecurringService - Implementation of this interface
 */

import { Ticket, Plan, RecurringDefinition } from '../data/types';

export interface IRecurringService {
  /**
   * Load all recurring definitions from storage
   */
  loadDefinitions(): Promise<RecurringDefinition[]>;

  /**
   * Save all recurring definitions to storage
   */
  saveDefinitions(definitions: RecurringDefinition[]): Promise<void>;

  /**
   * Create a new instance (Ticket or Plan) from a recurring definition
   *
   * @param defId - ID of the recurring definition
   * @returns Created Ticket or Plan
   */
  createInstance(defId: string): Promise<Ticket | Plan>;

  /**
   * Enable a recurring definition
   */
  enableDefinition(id: string): Promise<void>;

  /**
   * Disable a recurring definition
   */
  disableDefinition(id: string): Promise<void>;

  /**
   * Delete a recurring definition
   */
  deleteDefinition(id: string): Promise<void>;

  /**
   * Handle ticket completion - triggers on-completion recurring definitions
   *
   * @param ticket - Completed ticket
   */
  handleTicketCompletion(ticket: Ticket): Promise<void>;

  /**
   * Handle file/plan/report events - triggers event-based recurring definitions
   *
   * @param path - File path related to the event
   * @param eventType - Type of event: 'file_created', 'plan_completed', 'report_created'
   */
  handleFileEvent(path: string, eventType: string): Promise<void>;

  /**
   * Dispose of the service and clean up resources
   */
  dispose(): void;
}
