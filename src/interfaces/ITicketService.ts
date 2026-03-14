/**
 * ITicketService - Interface for ticket management service
 *
 * Provides CRUD operations, state machine transitions, and workflow CLI integration.
 * Implements Dependency Inversion Principle (SOLID) for testability and DI.
 *
 * @see TicketService - Implementation of this interface
 */

import { Ticket, TicketStatus } from '../data/types';

/**
 * ITicketService - Service layer interface for ticket management
 *
 * Provides unified access to ticket CRUD operations and state machine transitions.
 * Designed for dependency injection and mock testing.
 */
export interface ITicketService {
  // ==================== Read Operations ====================

  /**
   * Get all tickets from the store
   */
  getAll(): Ticket[];

  /**
   * Get tickets filtered by status
   */
  getByStatus(status: TicketStatus): Ticket[];

  /**
   * Get ticket by ID
   */
  getById(id: string): Ticket | undefined;

  /**
   * Get tickets filtered by parent plan
   */
  getByPlan(planId: string): Ticket[];

  /**
   * Get tickets filtered by type
   */
  getByType(type: string): Ticket[];

  // ==================== State Machine ====================

  /**
   * Get valid transitions for a given status
   */
  getValidTransitions(currentStatus: TicketStatus): TicketStatus[];

  /**
   * Validate if a transition is allowed
   */
  isValidTransition(from: TicketStatus, to: TicketStatus): boolean;

  // ==================== Create Operation ====================

  /**
   * Create a new ticket
   *
   * @param type - Ticket type (e.g., 'IMPL', 'FIX', 'ARCH')
   * @param title - Ticket title
   * @param fields - Optional fields to override
   * @returns Created ticket
   */
  create(type: string, title: string, fields?: Partial<Ticket>): Promise<Ticket>;

  // ==================== Move Operation ====================

  /**
   * Move a ticket to a new status
   *
   * @param id - Ticket ID to move
   * @param targetStatus - Target status
   * @throws Error if transition is invalid or file operation fails
   */
  move(id: string, targetStatus: TicketStatus): Promise<void>;

  // ==================== Update Operation ====================

  /**
   * Update ticket fields
   *
   * @param id - Ticket ID to update
   * @param fields - Fields to update
   */
  update(id: string, fields: Partial<Ticket>): Promise<void>;

  // ==================== General Operations ====================

  /**
   * Get the workflow root directory
   */
  getWorkflowRoot(): string;
}
