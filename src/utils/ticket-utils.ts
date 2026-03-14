import * as vscode from 'vscode';

/**
 * Get theme icon based on ticket priority
 * @param priority - Ticket priority (1 = Critical, 5 = Low)
 * @returns ThemeIcon with appropriate color
 */
export function getTicketIcon(priority: number): vscode.ThemeIcon {
  // Priority 1 = Critical, 5 = Low
  if (priority <= 1) {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('notificationsErrorIcon.foreground'));
  } else if (priority === 2) {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
  } else if (priority === 3) {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('notificationsInfoIcon.foreground'));
  } else {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
  }
}
