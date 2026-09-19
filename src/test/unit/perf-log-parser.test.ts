/**
 * Performance test: Log parser latency on 1000 lines
 *
 * Tests the performance of the parseLine method when processing a large batch of log lines.
 * Simulates parsing 1000 diverse log entries with different formats.
 *
 * Requirement: p95 ≤ 5 ms per line (on 1000 lines: total p95 ≤ 5000ms, mean ≤ ~5ms/line)
 * Test measures time-per-line for each parsed entry and calculates p95.
 */

import * as assert from 'assert';
import { PipelineService } from '../../services/pipeline-service';

function generateTestLogLines(count: number = 1000): string[] {
  const lines: string[] = [];
  const timestamp = '2026-04-30T15:00:00';

  // Mix different log formats to simulate real usage
  const templates = [
    // START lines (various fields)
    `[${timestamp}] [INFO] [Runner] START stage="stage-1" agent="agent-1" skill="skill-1" ticket="TICKET-1"`,
    `[${timestamp}] [INFO] [Runner] START stage="stage-2" agent="agent-2"`,
    `[${timestamp}] [INFO] [Runner] START stage="stage-3"`,

    // GOTO lines (new format with arrow)
    `[${timestamp}] [INFO] [stage-1] GOTO stage-1 → stage-2 status="success" (elapsed: 1.2s)`,
    `[${timestamp}] [INFO] [stage-2] GOTO stage-2 → stage-3`,
    `[${timestamp}] [INFO] [stage-3] GOTO stage-3 → stage-4 status="success"`,

    // GOTO lines (legacy format)
    `[${timestamp}] [INFO] [stage] GOTO next-stage (elapsed: 0.5s)`,
    `[${timestamp}] [INFO] [stage] GOTO next-stage`,

    // RETRY lines
    `[${timestamp}] [WARN] [stage-1] RETRY stage="stage-1" attempt=1/3`,
    `[${timestamp}] [WARN] [stage-2] RETRY stage="stage-2" attempt=2/3`,

    // Fallback lines
    `[${timestamp}] [WARN] [stage-1] Primary agent failed, switching to fallback: agent-2`,

    // Info lines
    `[${timestamp}] [INFO] [stage-1] Processing ticket TICKET-123`,
    `[${timestamp}] [INFO] [stage-2] Completed successfully`,

    // Error lines
    `[${timestamp}] [ERROR] [stage-1] Stage failed`,
    `[${timestamp}] [WARN] [stage-2] COMPLETE stage="stage-2" status="error"`,

    // Stats lines (should NOT be detected as errors)
    `[${timestamp}] [INFO] [reporter] Total failed: 166, passed: 220`,

    // Unknown/raw format lines
    `Random log line without standard format`,
    `[LEGACY] agent: agent-1, ticket: TICKET-456`,
    `[CTX] stage-name: some-value`,
  ];

  for (let i = 0; i < count; i++) {
    lines.push(templates[i % templates.length]);
  }

  return lines;
}

suite('Performance: Log Parser', () => {
  test('parseLine: 1000 diverse log lines (p95 ≤ 5ms per line)', () => {
    // Create a PipelineService instance for access to parseLine (will use as any)
    const service = new PipelineService();

    const testLines = generateTestLogLines(1000);
    const lineTimes: number[] = [];

    // Warm up the parser (JIT compilation)
    for (let i = 0; i < 10; i++) {
      (service as any).parseLine(testLines[i % testLines.length]);
    }

    // Now measure the actual performance on all 1000 lines
    const totalStartTime = performance.now();

    for (const line of testLines) {
      const lineStartTime = performance.now();
      (service as any).parseLine(line);
      const lineEndTime = performance.now();
      lineTimes.push(lineEndTime - lineStartTime);
    }

    const totalEndTime = performance.now();
    const totalTime = totalEndTime - totalStartTime;

    // Calculate statistics
    lineTimes.sort((a, b) => a - b);
    const p95Index = Math.ceil(0.95 * lineTimes.length) - 1;
    const p95Time = lineTimes[p95Index];
    const meanTime = lineTimes.reduce((a, b) => a + b, 0) / lineTimes.length;
    const maxTime = Math.max(...lineTimes);
    const minTime = Math.min(...lineTimes);

    console.log(`Log parser performance (1000 lines):`);
    console.log(`  Total time: ${totalTime.toFixed(3)}ms`);
    console.log(`  Mean per line: ${meanTime.toFixed(3)}ms`);
    console.log(`  P95 per line: ${p95Time.toFixed(3)}ms`);
    console.log(`  Min per line: ${minTime.toFixed(3)}ms`);
    console.log(`  Max per line: ${maxTime.toFixed(3)}ms`);

    assert.ok(
      p95Time <= 5,
      `Expected p95 ≤ 5ms per line, but got ${p95Time.toFixed(3)}ms (mean: ${meanTime.toFixed(3)}ms)`
    );
  });

  test('parseLine: Various log formats are correctly parsed', () => {
    const service = new PipelineService();
    const testLines = generateTestLogLines(50);

    let successCount = 0;
    let errorCount = 0;

    for (const line of testLines) {
      try {
        const result = (service as any).parseLine(line);
        assert.ok(result, `Failed to parse line: ${line}`);
        assert.ok(result.type, `Parsed entry should have type: ${line}`);
        successCount++;
      } catch (_e) {
        errorCount++;
      }
    }

    console.log(`Parser correctness check: ${successCount} parsed successfully, ${errorCount} failed`);
    assert.strictEqual(errorCount, 0, `All lines should be parsed without errors`);
  });
});
