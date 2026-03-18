/**
 * Unit tests for Cron Parser
 *
 * Tests:
 * - parseCron: Parses 5-field cron expressions
 * - isValidCron: Validates cron expressions
 * - getNextDate: Calculates next trigger time
 * - Edge cases: ranges, lists, steps, wrapping
 */

import * as assert from 'assert';
import { parseCron, isValidCron, getNextDate, CronExpression } from '../../utils/cron-parser';

suite('Cron Parser Tests', () => {
  suite('parseCron', () => {
    test('parses * (any) for minute', () => {
      const result = parseCron('* * * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.strictEqual(expr.minute.length, 60);
      assert.strictEqual(expr.minute[0], 0);
      assert.strictEqual(expr.minute[59], 59);
    });

    test('parses specific minute value', () => {
      const result = parseCron('5 * * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.minute, [5]);
    });

    test('parses minute range', () => {
      const result = parseCron('1-5 * * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.minute, [1, 2, 3, 4, 5]);
    });

    test('parses minute list', () => {
      const result = parseCron('1,3,5 * * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.minute, [1, 3, 5]);
    });

    test('parses minute step', () => {
      const result = parseCron('*/5 * * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.strictEqual(expr.minute.length, 12);
      assert.deepStrictEqual(expr.minute, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    });

    test('parses range with step', () => {
      const result = parseCron('1-10/2 * * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.minute, [1, 3, 5, 7, 9]);
    });

    test('parses hour field', () => {
      const result = parseCron('* 0 * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.hour, [0]);
    });

    test('parses hour range', () => {
      const result = parseCron('0 9-17 * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.strictEqual(expr.hour.length, 9);
      assert.strictEqual(expr.hour[0], 9);
      assert.strictEqual(expr.hour[8], 17);
    });

    test('parses hour step', () => {
      const result = parseCron('0 */2 * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.strictEqual(expr.hour.length, 12);
      assert.deepStrictEqual(expr.hour, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
    });

    test('parses day-of-month field', () => {
      const result = parseCron('0 0 1 * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.dayOfMonth, [1]);
    });

    test('parses day-of-month range', () => {
      const result = parseCron('0 0 1-7 * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.strictEqual(expr.dayOfMonth.length, 7);
      assert.deepStrictEqual(expr.dayOfMonth, [1, 2, 3, 4, 5, 6, 7]);
    });

    test('parses month field', () => {
      const result = parseCron('0 0 1 1 *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.month, [1]);
    });

    test('parses month list', () => {
      const result = parseCron('0 0 1 1,4,7,10 *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.month, [1, 4, 7, 10]);
    });

    test('parses day-of-week field', () => {
      const result = parseCron('0 0 * * 1');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.dayOfWeek, [1]);
    });

    test('handles day-of-week 0 and 7 as Sunday', () => {
      const result0 = parseCron('0 0 * * 0');
      const result7 = parseCron('0 0 * * 7');
      assert.ok(!('message' in result0));
      assert.ok(!('message' in result7));
      assert.deepStrictEqual((result0 as CronExpression).dayOfWeek, (result7 as CronExpression).dayOfWeek);
    });

    test('rejects invalid field count', () => {
      const result = parseCron('* * * *');
      assert.ok('message' in result);
      assert.strictEqual((result as { message: string }).message, 'Expected 5 fields, got 4');
    });

    test('rejects invalid minute value', () => {
      const result = parseCron('60 * * * *');
      assert.ok('message' in result);
    });

    test('rejects invalid hour value', () => {
      const result = parseCron('* 24 * * *');
      assert.ok('message' in result);
    });

    test('rejects invalid day-of-month value', () => {
      const result = parseCron('* * 32 * *');
      assert.ok('message' in result);
    });

    test('rejects invalid month value', () => {
      const result = parseCron('* * * 13 *');
      assert.ok('message' in result);
    });

    test('rejects invalid day-of-week value', () => {
      const result = parseCron('* * * * 8');
      assert.ok('message' in result);
    });

    test('handles wrapped hour range (23-1)', () => {
      const result = parseCron('0 23-1 * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.ok(expr.hour.includes(23));
      assert.ok(expr.hour.includes(0));
      assert.ok(expr.hour.includes(1));
    });

    test('handles complex expression (every 15 minutes)', () => {
      const result = parseCron('*/15 * * * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.strictEqual(expr.minute.length, 4);
      assert.deepStrictEqual(expr.minute, [0, 15, 30, 45]);
    });

    test('handles complex expression (weekdays 9am)', () => {
      const result = parseCron('0 9 * * 1-5');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.hour, [9]);
      assert.deepStrictEqual(expr.minute, [0]);
      assert.deepStrictEqual(expr.dayOfWeek, [1, 2, 3, 4, 5]);
    });

    test('handles first day of month', () => {
      const result = parseCron('0 0 1 * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.dayOfMonth, [1]);
    });

    test('handles last day of month', () => {
      const result = parseCron('0 0 28-31 * *');
      assert.ok(!('message' in result));
      const expr = result as CronExpression;
      assert.deepStrictEqual(expr.dayOfMonth, [28, 29, 30, 31]);
    });
  });

  suite('isValidCron', () => {
    test('returns true for valid expressions', () => {
      assert.strictEqual(isValidCron('* * * * *'), true);
      assert.strictEqual(isValidCron('0 0 * * *'), true);
      assert.strictEqual(isValidCron('*/5 * * * *'), true);
    });

    test('returns false for invalid expressions', () => {
      assert.strictEqual(isValidCron('* * * *'), false);
      assert.strictEqual(isValidCron('60 * * * *'), false);
      assert.strictEqual(isValidCron('* 24 * * *'), false);
    });
  });

  suite('getNextDate', () => {
    test('returns next minute for every-minute cron', () => {
      const expr = parseCron('* * * * *') as CronExpression;
      const from = new Date('2026-03-14T10:30:45Z');
      const next = getNextDate(expr, from);
      assert.ok(next.getTime() > from.getTime());
      assert.strictEqual(next.getMinutes(), 31);
    });

    test('returns next hour for hourly cron', () => {
      const expr = parseCron('0 * * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 30, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getHours(), 11);
      assert.strictEqual(next.getMinutes(), 0);
    });

    test('returns next day for daily cron', () => {
      const expr = parseCron('0 0 * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 30, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getDate(), 15);
      assert.strictEqual(next.getHours(), 0);
      assert.strictEqual(next.getMinutes(), 0);
    });

    test('returns next month for monthly cron', () => {
      const expr = parseCron('0 0 1 * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 30, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getMonth(), 3);
      assert.strictEqual(next.getDate(), 1);
    });

    test('handles specific time', () => {
      const expr = parseCron('30 14 * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 30, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getHours(), 14);
      assert.strictEqual(next.getMinutes(), 30);
    });

    test('skips to next valid day for day-of-week', () => {
      const expr = parseCron('0 9 * * 6') as CronExpression;
      // Use a known Saturday (2026-03-21)
      const from = new Date(2026, 2, 21, 10, 0, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getDay(), 6);
      assert.strictEqual(next.getHours(), 9);
      assert.strictEqual(next.getMinutes(), 0);
    });

    test('handles step values correctly', () => {
      const expr = parseCron('*/15 * * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 7, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getMinutes(), 15);
    });

    test('returns future date when current time matches', () => {
      const expr = parseCron('30 10 * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 30, 0);
      const next = getNextDate(expr, from);
      assert.ok(next.getTime() > from.getTime());
    });

    test('handles timezone parameter', () => {
      const expr = parseCron('0 12 * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 30, 0);
      const next = getNextDate(expr, from, 'UTC');
      assert.ok(next instanceof Date);
    });

    test('handles invalid timezone gracefully', () => {
      const expr = parseCron('0 12 * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 10, 30, 0);
      const next = getNextDate(expr, from, 'Invalid/Timezone');
      assert.ok(next instanceof Date);
    });

    test('handles day-of-month wildcard', () => {
      const expr = parseCron('0 9 * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 8, 0, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getHours(), 9);
      assert.strictEqual(next.getMinutes(), 0);
    });

    test('handles day-of-week wildcard', () => {
      const expr = parseCron('0 9 * * *') as CronExpression;
      const from = new Date(2026, 2, 14, 8, 0, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getHours(), 9);
    });

    test('handles both day-of-month and day-of-week specified', () => {
      const expr = parseCron('0 9 15 * *') as CronExpression;
      const from = new Date(2026, 2, 14, 8, 0, 0);
      const next = getNextDate(expr, from);
      assert.strictEqual(next.getHours(), 9);
    });
  });
});
