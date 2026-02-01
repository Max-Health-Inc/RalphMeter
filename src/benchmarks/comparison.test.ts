/**
 * Tests for Benchmark Comparison Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BenchmarkComparison } from './comparison.js';
import { EventCollector } from '../core/collector.js';
import { createSessionId } from '../core/events.js';
import type { ComputedMetrics } from '../core/metrics.js';
import { isOk, isErr } from '../shared/result.js';

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Creates a test session with mock data
 */
function createTestSession(
  collector: EventCollector,
  iterations: number,
  tokensIn: number,
  tokensOut: number
): string {
  const sessionId = createSessionId();

  // Start session
  collector.emit({
    eventType: 'session_start',
    sessionId,
    timestamp: new Date().toISOString(),
    payload: {},
  });

  // Add iterations
  for (let i = 0; i < iterations; i++) {
    collector.emit({
      eventType: 'iteration_start',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: {
        iterationNumber: i + 1,
        storyId: `STORY-${String(i + 1).padStart(3, '0')}`,
      },
    });

    collector.emit({
      eventType: 'tokens_in',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: {
        count: Math.floor(tokensIn / iterations),
        model: 'test-model',
      },
    });

    collector.emit({
      eventType: 'tokens_out',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: {
        count: Math.floor(tokensOut / iterations),
        model: 'test-model',
      },
    });

    collector.emit({
      eventType: 'iteration_end',
      sessionId,
      timestamp: new Date().toISOString(),
      payload: {
        iterationNumber: i + 1,
        storyId: `STORY-${String(i + 1).padStart(3, '0')}`,
        success: true,
      },
    });
  }

  return sessionId;
}

/**
 * Creates mock computed metrics
 */
function createMockMetrics(
  totalLOC: number,
  tokensPerLOC: number
): ComputedMetrics {
  return {
    verifiedLOC: Math.floor(totalLOC * 0.9),
    totalLOC,
    verificationRate: 0.9,
    locPerMinute: 10,
    vlocPerMinute: 9,
    tokensPerLOC,
    poeLOC: 0.05,
    totalMinutes: totalLOC / 10,
    totalTokens: Math.floor(totalLOC * tokensPerLOC),
    codeLines: Math.floor(totalLOC * 0.7),
    commentLines: Math.floor(totalLOC * 0.2),
    blankLines: Math.floor(totalLOC * 0.1),
  };
}

// ============================================================================
// Compare Method Tests
// ============================================================================

describe('BenchmarkComparison.compare', () => {
  let collector: EventCollector;
  let comparison: BenchmarkComparison;

  beforeEach(() => {
    collector = new EventCollector();
    comparison = new BenchmarkComparison(collector);
  });

  it('compares session against hello-api benchmark successfully', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const report = result.value;
      expect(report.sessionId).toBe(sessionId);
      expect(report.benchmarkId).toBe('hello-api');
      expect(report.benchmarkName).toBe('HelloAPI');
      expect(report.benchmarkMetadata.complexityScore).toBe(1);
      expect(report.locComparison).toBeDefined();
      expect(report.iterationsComparison).toBeDefined();
      expect(report.efficiencyScore).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    }
  });

  it('compares session against todo-crud benchmark successfully', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(200, 37.5);

    const result = comparison.compare(sessionId, 'todo-crud', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const report = result.value;
      expect(report.benchmarkId).toBe('todo-crud');
      expect(report.benchmarkName).toBe('TodoCRUD');
      expect(report.benchmarkMetadata.complexityScore).toBe(5);
    }
  });

  it('compares session against auth-flow benchmark successfully', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(500, 45);

    const result = comparison.compare(sessionId, 'auth-flow', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const report = result.value;
      expect(report.benchmarkId).toBe('auth-flow');
      expect(report.benchmarkName).toBe('AuthFlow');
      expect(report.benchmarkMetadata.complexityScore).toBe(9);
    }
  });

  it('returns error for non-existent benchmark', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);

    const result = comparison.compare(sessionId, 'nonexistent', undefined);
    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe('BENCHMARK_NOT_FOUND');
      expect(result.error.message).toContain('Failed to load benchmark');
    }
  });

  it('returns error for non-existent session', () => {
    const result = comparison.compare(
      'nonexistent-session',
      'hello-api',
      undefined
    );
    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe('SESSION_NOT_FOUND');
    }
  });

  it('works without computed metrics (basic comparison)', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);

    const result = comparison.compare(sessionId, 'hello-api', undefined);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const report = result.value;
      expect(report.ralphComparison).toBeUndefined();
      expect(report.locComparison.actual).toBe(0); // No LOC data without metrics
    }
  });

  it('includes Ralph comparison when computed metrics provided', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const report = result.value;
      expect(report.ralphComparison).toBeDefined();
      expect(report.ralphComparison?.metric).toBe('Ralph');
      expect(report.ralphComparison?.actual).toBe(30);
    }
  });
});

// ============================================================================
// LOC Comparison Tests
// ============================================================================

describe('LOC comparison', () => {
  let collector: EventCollector;
  let comparison: BenchmarkComparison;

  beforeEach(() => {
    collector = new EventCollector();
    comparison = new BenchmarkComparison(collector);
  });

  it('marks LOC within range as passing', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30); // Within hello-api range: 30-70

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.locComparison.withinRange).toBe(true);
      expect(result.value.locComparison.actual).toBe(50);
    }
  });

  it('marks LOC over range as failing', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(100, 30); // Over hello-api max: 70

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.locComparison.withinRange).toBe(false);
      expect(result.value.locComparison.variance).toBeGreaterThan(0);
    }
  });

  it('marks LOC under range as failing', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(20, 30); // Under hello-api min: 30

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.locComparison.withinRange).toBe(false);
      expect(result.value.locComparison.variance).toBeLessThan(0);
    }
  });

  it('calculates variance correctly', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(80, 30); // hello-api range: 30-70, mid: 50

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.locComparison.variance).toBe(30); // 80 - 50
    }
  });
});

// ============================================================================
// Iterations Comparison Tests
// ============================================================================

describe('Iterations comparison', () => {
  let collector: EventCollector;
  let comparison: BenchmarkComparison;

  beforeEach(() => {
    collector = new EventCollector();
    comparison = new BenchmarkComparison(collector);
  });

  it('marks iterations within range as passing', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);

    const result = comparison.compare(sessionId, 'hello-api', undefined);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.iterationsComparison.withinRange).toBe(true);
      expect(result.value.iterationsComparison.actual).toBe(2);
    }
  });

  it('marks iterations over range as failing', () => {
    const sessionId = createTestSession(collector, 5, 1000, 500); // Over hello-api max: 3

    const result = comparison.compare(sessionId, 'hello-api', undefined);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.iterationsComparison.withinRange).toBe(false);
      expect(result.value.iterationsComparison.variance).toBeGreaterThan(0);
    }
  });

  it('marks iterations under range as passing (fewer is better)', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);

    const result = comparison.compare(sessionId, 'hello-api', undefined);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.iterationsComparison.withinRange).toBe(true);
    }
  });
});

// ============================================================================
// Efficiency Score Tests
// ============================================================================

describe('Efficiency score calculation', () => {
  let collector: EventCollector;
  let comparison: BenchmarkComparison;

  beforeEach(() => {
    collector = new EventCollector();
    comparison = new BenchmarkComparison(collector);
  });

  it('assigns A+ grade when all metrics within range', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.efficiencyScore.ratio).toBe(1.0);
      expect(result.value.efficiencyScore.grade).toBe('A+');
      expect(result.value.efficiencyScore.pass).toBe(true);
    }
  });

  it('assigns lower grade when some metrics out of range', () => {
    const sessionId = createTestSession(collector, 10, 1000, 500); // Too many iterations
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.efficiencyScore.ratio).toBeLessThan(1.0);
      expect(result.value.efficiencyScore.grade).not.toBe('A+');
    }
  });

  it('marks as passing when ratio >= 0.7', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      if (result.value.efficiencyScore.ratio >= 0.7) {
        expect(result.value.efficiencyScore.pass).toBe(true);
      }
    }
  });

  it('marks as failing when ratio < 0.7', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(200, 100); // Way too much LOC and Ralph

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.efficiencyScore.ratio).toBeLessThan(0.7);
      expect(result.value.efficiencyScore.pass).toBe(false);
    }
  });
});

// ============================================================================
// Recommendations Tests
// ============================================================================

describe('Recommendations generation', () => {
  let collector: EventCollector;
  let comparison: BenchmarkComparison;

  beforeEach(() => {
    collector = new EventCollector();
    comparison = new BenchmarkComparison(collector);
  });

  it('generates success recommendations when passing', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const successRecs = result.value.recommendations.filter(
        (r) => r.type === 'success'
      );
      expect(successRecs.length).toBeGreaterThan(0);
    }
  });

  it('generates warning for excessive LOC', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(150, 30); // Way over hello-api range

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const warningRecs = result.value.recommendations.filter(
        (r) => r.type === 'warning' && r.message.includes('over expected')
      );
      expect(warningRecs.length).toBeGreaterThan(0);
    }
  });

  it('generates warning for insufficient LOC', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(10, 30); // Way under hello-api range

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const warningRecs = result.value.recommendations.filter(
        (r) => r.type === 'warning' && r.message.includes('under expected')
      );
      expect(warningRecs.length).toBeGreaterThan(0);
    }
  });

  it('generates warning for excessive iterations', () => {
    const sessionId = createTestSession(collector, 20, 1000, 500); // Way over hello-api range
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const warningRecs = result.value.recommendations.filter(
        (r) => r.type === 'warning' && r.message.includes('more iterations')
      );
      expect(warningRecs.length).toBeGreaterThan(0);
    }
  });

  it('generates recommendations about Ralph when available', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 500); // Very high Ralph

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const ralphRecs = result.value.recommendations.filter((r) =>
        r.message.includes('Ralph')
      );
      expect(ralphRecs.length).toBeGreaterThan(0);
    }
  });

  it('always includes at least one recommendation', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.recommendations.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Format Report Tests
// ============================================================================

describe('BenchmarkComparison.formatReport', () => {
  let collector: EventCollector;
  let comparison: BenchmarkComparison;

  beforeEach(() => {
    collector = new EventCollector();
    comparison = new BenchmarkComparison(collector);
  });

  it('formats a complete report as string', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const formatted = comparison.formatReport(result.value);
      expect(formatted).toContain('BENCHMARK COMPARISON REPORT');
      expect(formatted).toContain('HelloAPI');
      expect(formatted).toContain('EFFICIENCY SCORE');
      expect(formatted).toContain('METRIC COMPARISONS');
      expect(formatted).toContain('RECOMMENDATIONS');
    }
  });

  it('includes all metric comparisons in formatted output', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const formatted = comparison.formatReport(result.value);
      expect(formatted).toContain('LOC');
      expect(formatted).toContain('Iterations');
      expect(formatted).toContain('Ralph');
    }
  });

  it('displays pass/fail status clearly', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const formatted = comparison.formatReport(result.value);
      if (result.value.efficiencyScore.pass) {
        expect(formatted).toContain('✓ PASS');
      } else {
        expect(formatted).toContain('✗ FAIL');
      }
    }
  });

  it('shows grade and ratio', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const formatted = comparison.formatReport(result.value);
      expect(formatted).toContain(result.value.efficiencyScore.grade);
      expect(formatted).toContain(
        result.value.efficiencyScore.ratio.toFixed(2)
      );
    }
  });

  it('includes benchmark complexity score', () => {
    const sessionId = createTestSession(collector, 2, 1000, 500);
    const metrics = createMockMetrics(50, 30);

    const result = comparison.compare(sessionId, 'hello-api', metrics);
    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      const formatted = comparison.formatReport(result.value);
      expect(formatted).toContain('Complexity');
      expect(formatted).toContain('/10');
    }
  });
});
