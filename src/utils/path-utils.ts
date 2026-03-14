import * as path from 'path';
import { sanitizeTicketId } from '../security/input-sanitizer';

export function getWorkflowRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.workflow');
}

export function getTicketPath(workflowRoot: string, status: string, ticketId: string): string {
  const sanitizedId = sanitizeTicketId(ticketId);
  return path.join(workflowRoot, 'tickets', status, `${sanitizedId}.md`);
}

export function getTicketsDir(workflowRoot: string, status: string): string {
  return path.join(workflowRoot, 'tickets', status);
}

export function getPlanPath(workflowRoot: string, planId: string, folder: 'current' | 'archive' = 'current'): string {
  const sanitizedId = sanitizeTicketId(planId);
  return path.join(workflowRoot, 'plans', folder, `${sanitizedId}.md`);
}

export function getPipelineConfigPath(workflowRoot: string): string {
  return path.join(workflowRoot, 'config', 'pipeline.yaml');
}

export function getReportsDir(workflowRoot: string): string {
  return path.join(workflowRoot, 'reports');
}
