import { TicketStatus } from '../data/types';

export const STATUS_ICONS: Record<TicketStatus, string> = {
  [TicketStatus.Backlog]: '📋',
  [TicketStatus.Ready]: '✅',
  [TicketStatus.InProgress]: '🔄',
  [TicketStatus.Review]: '👀',
  [TicketStatus.Blocked]: '🚫',
  [TicketStatus.Done]: '✨'
};

export const DEP_STATUS_ICONS: Record<TicketStatus, string> = {
  [TicketStatus.Backlog]: '⬜',
  [TicketStatus.Ready]: '🔵',
  [TicketStatus.InProgress]: '🔷',
  [TicketStatus.Review]: '👁️',
  [TicketStatus.Blocked]: '🔴',
  [TicketStatus.Done]: '✅'
};

export const PRIORITY_ICONS: Record<number, string> = {
  1: '🔥',
  2: '⚠️',
  3: '📌',
  4: 'ℹ️',
  5: '💡'
};

export const TYPE_ICONS: Record<string, string> = {
  IMPL: '🔨',
  FIX: '🐛',
  DOCS: '📄',
  REVIEW: '🔍',
  ADMIN: '⚙️',
  ARCH: '🏗️'
};

export const COMPLEXITY_ICONS: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🔴'
};
