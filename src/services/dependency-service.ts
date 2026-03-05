/**
 * DependencyService - Graph dependency analysis for workflow tickets
 *
 * Provides dependency graph operations:
 * - Direct dependencies (getDependencies, getDependents)
 * - Transitive chains (getTransitiveChain, getBlockingChain)
 * - Cycle detection (detectCycles using DFS with coloring)
 * - Readiness validation (canMoveToReady)
 *
 * Used by ValidationService, UI components (TreeView, Hover, CodeLens),
 * and transition condition checking.
 */

import * as vscode from 'vscode';
import { WorkflowStore } from '../data/workflow-store';
import { Ticket, TicketStatus } from '../data/types';

/**
 * Result of cycle detection
 */
export interface CyclicDependency {
  cycle: string[];
}

/**
 * Result of readiness check
 */
export interface ReadinessResult {
  ok: boolean;
  blockers: string[];
}

/**
 * DFS node colors for cycle detection
 */
enum Color {
  White = 0, // Not visited
  Gray = 1,  // Currently visiting (in stack)
  Black = 2  // Completely visited
}

/**
 * DependencyService - Analyzes dependency graphs between tickets
 *
 * Provides graph traversal, cycle detection, and dependency validation.
 */
export class DependencyService {
  private readonly store: WorkflowStore;

  /**
   * Create DependencyService
   * @param store - WorkflowStore for data access
   */
  constructor(store: WorkflowStore) {
    this.store = store;
  }

  // ==================== Direct Dependencies ====================

  /**
   * Get tickets that a given ticket depends on
   * Reads from ticket.dependencies field
   *
   * @param id - Ticket ID
   * @returns Array of tickets that this ticket depends on
   */
  getDependencies(id: string): Ticket[] {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return [];
    }

    const dependencies: Ticket[] = [];
    for (const depId of ticket.dependencies) {
      const depTicket = this.store.getTicketById(depId);
      if (depTicket) {
        dependencies.push(depTicket);
      }
    }

    return dependencies;
  }

  /**
   * Get tickets that depend on a given ticket (block it)
   * Finds all tickets where the given id is in their dependencies
   *
   * @param id - Ticket ID
   * @returns Array of tickets that depend on this ticket
   */
  getDependents(id: string): Ticket[] {
    const allTickets = this.store.getTickets();
    return allTickets.filter(ticket =>
      ticket.dependencies.includes(id)
    );
  }

  // ==================== Transitive Dependencies ====================

  /**
   * Get full transitive chain of dependencies (BFS)
   * Returns all tickets that this ticket transitively depends on
   *
   * @param id - Ticket ID
   * @returns Array of all transitive dependencies (excludes starting ticket, no duplicates)
   */
  getTransitiveChain(id: string): Ticket[] {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return [];
    }

    const result: Ticket[] = [];
    const visited = new Set<string>();
    const queue: string[] = [...ticket.dependencies];

    // Mark starting ticket as visited to prevent cycles
    visited.add(id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const currentTicket = this.store.getTicketById(currentId);
      if (currentTicket) {
        result.push(currentTicket);

        // Add dependencies to queue for BFS traversal
        for (const depId of currentTicket.dependencies) {
          if (!visited.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get full transitive chain of tickets that are blocked by this ticket
   * Returns all tickets that transitively depend on this ticket
   *
   * @param id - Ticket ID
   * @returns Array of all tickets in blocking chain (excludes starting ticket, no duplicates)
   */
  getBlockingChain(id: string): Ticket[] {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return [];
    }

    const result: Ticket[] = [];
    const visited = new Set<string>();
    const queue: string[] = [];

    // Find all direct dependents first
    const directDependents = this.getDependents(id);
    for (const dep of directDependents) {
      queue.push(dep.id);
    }

    // Mark starting ticket as visited to prevent cycles
    visited.add(id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const currentTicket = this.store.getTicketById(currentId);
      if (currentTicket) {
        result.push(currentTicket);

        // Find all tickets that depend on this one
        const dependents = this.getDependents(currentId);
        for (const dep of dependents) {
          if (!visited.has(dep.id)) {
            queue.push(dep.id);
          }
        }
      }
    }

    return result;
  }

  // ==================== Cycle Detection ====================

  /**
   * Detect all cycles in the dependency graph
   * Uses DFS with coloring (white=0, gray=1, black=2)
   *
   * Algorithm:
   * 1. Start DFS from each unvisited (white) node
   * 2. Mark node as gray when entering (in current path)
   * 3. If we encounter a gray node, we found a cycle
   * 4. Mark node as black when leaving (completely visited)
   *
   * @returns Array of cyclic dependencies found
   */
  detectCycles(): CyclicDependency[] {
    const allTickets = this.store.getTickets();
    const colors = new Map<string, Color>();
    const cycles: CyclicDependency[] = [];
    const foundCycles = new Set<string>(); // To avoid duplicate cycles

    // Initialize all nodes as white (unvisited)
    for (const ticket of allTickets) {
      colors.set(ticket.id, Color.White);
    }

    // DFS from each unvisited node
    for (const ticket of allTickets) {
      if (colors.get(ticket.id) === Color.White) {
        this.dfsVisit(ticket.id, colors, cycles, foundCycles, []);
      }
    }

    return cycles;
  }

  /**
   * DFS visit helper for cycle detection
   *
   * @param id - Current ticket ID
   * @param colors - Map of node colors
   * @param cycles - Array to collect found cycles
   * @param foundCycles - Set of normalized cycle signatures to avoid duplicates
   * @param path - Current DFS path
   */
  private dfsVisit(
    id: string,
    colors: Map<string, Color>,
    cycles: CyclicDependency[],
    foundCycles: Set<string>,
    path: string[]
  ): void {
    // Mark as gray (currently visiting)
    colors.set(id, Color.Gray);
    path.push(id);

    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      // Node not found, mark as black and return
      colors.set(id, Color.Black);
      path.pop();
      return;
    }

    // Visit all dependencies
    for (const depId of ticket.dependencies) {
      const depColor = colors.get(depId) ?? Color.White;

      if (depColor === Color.Gray) {
        // Found a cycle! Extract it from the path
        const cycleStart = path.indexOf(depId);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);

          // Normalize cycle to avoid duplicates (start from smallest ID)
          const normalizedCycle = this.normalizeCycle(cycle);
          const cycleSignature = normalizedCycle.join('->');

          if (!foundCycles.has(cycleSignature)) {
            foundCycles.add(cycleSignature);
            cycles.push({ cycle: normalizedCycle });
          }
        }
      } else if (depColor === Color.White) {
        // Continue DFS
        this.dfsVisit(depId, colors, cycles, foundCycles, path);
      }
    }

    // Mark as black (completely visited)
    colors.set(id, Color.Black);
    path.pop();
  }

  /**
   * Normalize a cycle to start from the lexicographically smallest ID
   * This helps avoid detecting the same cycle multiple times
   *
   * @param cycle - Array of ticket IDs forming a cycle
   * @returns Normalized cycle array
   */
  private normalizeCycle(cycle: string[]): string[] {
    if (cycle.length === 0) {
      return cycle;
    }

    // Find index of minimum element
    let minIndex = 0;
    for (let i = 1; i < cycle.length; i++) {
      if (cycle[i] < cycle[minIndex]) {
        minIndex = i;
      }
    }

    // Rotate to start from minimum
    return [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
  }

  // ==================== Readiness Check ====================

  /**
   * Check if a ticket can move to ready status
   * All direct dependencies must have status='done'
   *
   * @param id - Ticket ID to check
   * @returns Readiness result with ok flag and list of blocker IDs
   */
  canMoveToReady(id: string): ReadinessResult {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return { ok: false, blockers: [vscode.l10n.t('Ticket {0} not found in dependency check', id)] };
    }

    const blockers: string[] = [];

    for (const depId of ticket.dependencies) {
      const depTicket = this.store.getTicketById(depId);
      if (!depTicket) {
        blockers.push(vscode.l10n.t('Dependency "{0}" does not exist', depId));
      } else if (depTicket.status !== TicketStatus.Done) {
        blockers.push(depId);
      }
    }

    return {
      ok: blockers.length === 0,
      blockers
    };
  }
}
