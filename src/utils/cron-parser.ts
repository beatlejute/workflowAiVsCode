export interface CronExpression {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

export interface CronParseError {
  message: string;
  field?: string;
}

export type CronParseResult = CronExpression | CronParseError;

function parseField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    const result: number[] = [];
    for (let i = min; i <= max; i++) {
      result.push(i);
    }
    return result;
  }

  const values: number[] = [];
  const parts = field.split(',');

  for (const part of parts) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) {
        return [];
      }

      let start = min;
      let end = max;

      if (range !== '*') {
        if (range.includes('-')) {
          const [startStr, endStr] = range.split('-');
          start = parseInt(startStr, 10);
          end = parseInt(endStr, 10);
        } else {
          start = parseInt(range, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        values.push(i);
      }
    } else if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end)) {
        return [];
      }

      const wrapped = end < start;
      if (wrapped) {
        for (let i = start; i <= max; i++) {
          values.push(i);
        }
        for (let i = min; i <= end; i++) {
          values.push(i);
        }
      } else {
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      }
    } else {
      const value = parseInt(part, 10);
      if (isNaN(value) || value < min || value > max) {
        return [];
      }
      values.push(value);
    }
  }

  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function parseCron(expr: string): CronParseResult {
  const parts = expr.trim().split(/\s+/);

  if (parts.length !== 5) {
    return { message: `Expected 5 fields, got ${parts.length}`, field: 'overall' };
  }

  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;

  const minute = parseField(minuteStr, 0, 59);
  if (minute.length === 0) {
    return { message: 'Invalid minute field', field: 'minute' };
  }

  const hour = parseField(hourStr, 0, 23);
  if (hour.length === 0) {
    return { message: 'Invalid hour field', field: 'hour' };
  }

  const dayOfMonth = parseField(dayOfMonthStr, 1, 31);
  if (dayOfMonth.length === 0) {
    return { message: 'Invalid day-of-month field', field: 'dayOfMonth' };
  }

  const month = parseField(monthStr, 1, 12);
  if (month.length === 0) {
    return { message: 'Invalid month field', field: 'month' };
  }

  const dayOfWeekRaw = parseField(dayOfWeekStr, 0, 7);
  if (dayOfWeekRaw.length === 0) {
    return { message: 'Invalid day-of-week field', field: 'dayOfWeek' };
  }
  // Normalize Sunday: 0 and 7 both mean Sunday, unify to 7
  const dayOfWeek = Array.from(new Set(dayOfWeekRaw.map(d => d === 0 ? 7 : d))).sort((a, b) => a - b);

  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

export function isValidCron(expr: string): boolean {
  const result = parseCron(expr);
  return !('message' in result);
}

function matchesDayOfWeek(date: Date, dayOfWeek: number[]): boolean {
  let dow = date.getDay();
  if (dow === 0) {
    dow = 7;
  }
  return dayOfWeek.includes(dow);
}

function matchesDayOfMonth(date: Date, dayOfMonth: number[]): boolean {
  return dayOfMonth.includes(date.getDate());
}

function getTimezoneOffset(timezone?: string): number {
  if (!timezone) {
    return 0;
  }

  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = fmt.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
    const localTotal = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const tzTotal = hour * 3600 + minute * 60 + second;
    return tzTotal - localTotal;
  } catch {
    return 0;
  }
}

export function getNextDate(cronExpr: CronExpression, from: Date, timezone?: string): Date {
  const result = new Date(from);
  result.setSeconds(0);
  result.setMilliseconds(0);

  result.setMinutes(result.getMinutes() + 1);

  const maxIterations = 366 * 24 * 60;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const minute = result.getMinutes();
    const hour = result.getHours();
    const dayOfMonth = result.getDate();
    const month = result.getMonth() + 1;
    const dayOfWeek = result.getDay();

    let dowNormalized = dayOfWeek;
    if (dowNormalized === 0) {
      dowNormalized = 7;
    }

    const matchesMonth = cronExpr.month.includes(month);
    const dayOfMonthIsWildcard = cronExpr.dayOfMonth.length === 31;
    const dayOfWeekIsWildcard = cronExpr.dayOfWeek.length === 7;
    let matchesDay: boolean;
    if (dayOfMonthIsWildcard && dayOfWeekIsWildcard) {
      matchesDay = true;
    } else if (dayOfMonthIsWildcard) {
      matchesDay = cronExpr.dayOfWeek.includes(dowNormalized);
    } else if (dayOfWeekIsWildcard) {
      matchesDay = cronExpr.dayOfMonth.includes(dayOfMonth);
    } else {
      matchesDay = cronExpr.dayOfMonth.includes(dayOfMonth) || cronExpr.dayOfWeek.includes(dowNormalized);
    }
    const matchesTime = cronExpr.hour.includes(hour) && cronExpr.minute.includes(minute);

    if (matchesMonth && matchesDay && matchesTime) {
      return result;
    }

    if (!cronExpr.minute.includes(minute)) {
      const nextMinute = cronExpr.minute.find(m => m > minute);
      if (nextMinute !== undefined) {
        result.setMinutes(nextMinute);
      } else {
        result.setMinutes(cronExpr.minute[0]);
        result.setHours(result.getHours() + 1);
      }
    }

    if (!cronExpr.hour.includes(hour)) {
      const nextHour = cronExpr.hour.find(h => h > hour);
      if (nextHour !== undefined) {
        result.setHours(nextHour);
        result.setMinutes(cronExpr.minute[0]);
      } else {
        result.setHours(cronExpr.hour[0]);
        result.setDate(result.getDate() + 1);
        result.setMinutes(cronExpr.minute[0]);
      }
    }

    const currentMonth = result.getMonth() + 1;
    if (!cronExpr.month.includes(currentMonth)) {
      const nextMonth = cronExpr.month.find(m => m > currentMonth);
      if (nextMonth !== undefined) {
        result.setMonth(nextMonth - 1);
        result.setDate(1);
        result.setHours(cronExpr.hour[0]);
        result.setMinutes(cronExpr.minute[0]);
      } else {
        result.setMonth(cronExpr.month[0] - 1);
        result.setFullYear(result.getFullYear() + 1);
        result.setDate(1);
        result.setHours(cronExpr.hour[0]);
        result.setMinutes(cronExpr.minute[0]);
      }
    }

    if (!matchesDay) {
      result.setDate(result.getDate() + 1);
      result.setHours(cronExpr.hour[0]);
      result.setMinutes(cronExpr.minute[0]);
    }
  }

  return result;
}
