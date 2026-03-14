/**
 * Tooltip Utilities Module
 *
 * Provides shared tooltip builders for tickets, plans, and other workflow entities.
 * Uses vscode.MarkdownString for rich tooltip content.
 */

import * as vscode from 'vscode';
import { t } from '../i18n';
import { Ticket, Plan } from '../data/types';
import { parse as parseFrontmatter } from '../data/frontmatter-parser';

/**
 * Priority labels mapping
 */
const PRIORITY_LABELS: Record<number, string> = {
  1: t('Critical'),
  2: t('High'),
  3: t('Medium'),
  4: t('Low'),
  5: t('Trivial')
};

/**
 * Build a rich tooltip for a ticket tree item
 *
 * @param ticket - The ticket object
 * @returns vscode.MarkdownString with ticket details
 */
export function buildTicketTooltip(ticket: Ticket): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  // Header
  md.appendMarkdown(`**${ticket.id}: ${ticket.title}**\n\n`);
  md.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  md.appendMarkdown(`|-------|-------|\n`);

  // Basic fields
  md.appendMarkdown(`| **${t('Status')}** | ${ticket.status} |\n`);

  const priorityLabel = PRIORITY_LABELS[ticket.priority] || `${t('Priority')} ${ticket.priority}`;
  md.appendMarkdown(`| **${t('Priority')}** | ${priorityLabel} |\n`);

  md.appendMarkdown(`| **${t('Type')}** | ${ticket.type} |\n`);

  // Optional fields
  if (ticket.dependencies?.length) {
    const deps = ticket.dependencies.join(', ');
    md.appendMarkdown(`| **${t('Dependencies')}** | ${deps} |\n`);
  }

  if (ticket.parent_plan) {
    md.appendMarkdown(`| **${t('Parent Plan')}** | ${ticket.parent_plan} |\n`);
  }

  // Notes
  if (ticket.context?.notes) {
    md.appendMarkdown(`\n---\n\n**${t('Notes')}:**\n${ticket.context.notes}\n`);
  }

  // Reviews
  if (ticket.reviews?.length) {
    md.appendMarkdown(`\n**${t('Review')}:**\n\n`);
    md.appendMarkdown(`| ${t('Date')} | ${t('Status')} | ${t('Summary')} |\n|---|---|---|\n`);
    for (const r of ticket.reviews) {
      md.appendMarkdown(`| ${r.date} | ${r.icon} ${r.status} | ${r.summary} |\n`);
    }
  }

  return md;
}

/**
 * Build a rich tooltip for a plan tree item
 *
 * @param plan - The plan object
 * @returns vscode.MarkdownString with plan details
 */
export function buildPlanTooltip(plan: Plan): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;

  // Header
  md.appendMarkdown(`**${plan.id}: ${plan.title}**\n\n`);
  md.appendMarkdown(`| ${t('Field')} | ${t('Value')} |\n`);
  md.appendMarkdown(`|-------|-------|\n`);

  // Basic fields
  md.appendMarkdown(`| **${t('Status')}** | ${plan.status} |\n`);
  md.appendMarkdown(`| **${t('Author')}** | ${plan.author} |\n`);
  md.appendMarkdown(`| **${t('Created')}** | ${plan.created_at} |\n`);
  md.appendMarkdown(`| **${t('Updated')}** | ${plan.updated_at} |\n`);

  // Optional fields
  if (plan.previous_plan) {
    md.appendMarkdown(`| **${t('Previous Plan')}** | ${plan.previous_plan} |\n`);
  }

  if (plan.related_reports?.length) {
    md.appendMarkdown(`| **${t('Related Reports')}** | ${plan.related_reports.join(', ')} |\n`);
  }

  return md;
}

/**
 * Parse markdown frontmatter from content
 *
 * @param content - The full markdown content including frontmatter and body
 * @returns Object containing parsed frontmatter and body string
 */
export function parseMarkdownFrontmatter<T>(content: string): { frontmatter: T; body: string } {
  return parseFrontmatter<T>(content);
}
