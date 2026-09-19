import * as vscode from 'vscode';

/**
 * Get theme icon based on ticket priority
 * @param priority - Ticket priority (1 = Critical, 5 = Low)
 * @returns ThemeIcon with appropriate color
 */
export function getTicketIcon(priority: number): vscode.ThemeIcon {
  return new vscode.ThemeIcon('circle-filled', getTicketIconColor(priority));
}

/**
 * Theme colour for a ticket priority, shared by the static and the animated icon
 * so that a ticket does not change colour when the pipeline picks it up.
 * @param priority - Ticket priority (1 = Critical, 5 = Low)
 */
export function getTicketIconColor(priority: number): vscode.ThemeColor {
  // Priority 1 = Critical, 5 = Low
  if (priority <= 1) {
    return new vscode.ThemeColor('notificationsErrorIcon.foreground');
  } else if (priority === 2) {
    return new vscode.ThemeColor('notificationsWarningIcon.foreground');
  } else if (priority === 3) {
    return new vscode.ThemeColor('notificationsInfoIcon.foreground');
  } else {
    return new vscode.ThemeColor('terminal.ansiGreen');
  }
}

/**
 * Icon for the ticket the pipeline is working on right now.
 *
 * `loading~spin` is animated by VS Code itself. The previous implementation
 * faked animation with a 1s timer that flipped the icon and fired
 * onDidChangeTreeData for the row; the TreeView API re-renders the whole row on
 * that event, so the result was a flashing row and lost hover, not a pulsing
 * dot. Letting the theme icon animate keeps the movement inside the icon.
 */
export function getTicketIconActive(priority: number): vscode.ThemeIcon {
  return new vscode.ThemeIcon('loading~spin', getTicketIconColor(priority));
}
