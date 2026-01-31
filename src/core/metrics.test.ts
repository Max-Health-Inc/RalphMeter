/**
 * Tests for Metrics Calculator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCalculator } from './metrics.js';
import { EventCollector } from './collector.js';
import { GateTracker } from './gates.js';
import { LOCCounter, type CodebaseSnapshot, type LOCResult } from './loc.js';
import { createSessionId } from './events.js';
import { isOk, isErr } from '../shared/result.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const validTimestamp = '2026-01-30T12:00:00.000Z';
const endTimestamp = '2026-01-30T12:30:00.000Z'; // 30 minutes later

function createSessionStartEvent(sessionId: string): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'session_start',
    payload: {},
  };
}

function createSessionEndEvent(
  sessionId: string,
  success: boolean
): Record<string, unknown> {
  return {
    timestamp: endTimestamp,
    sessionId,
    eventType: 'session_end',
    payload: { success },
  };
}

function createTokensInEvent(
  sessionId: string,
  count: number
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'tokens_in',
    payload: { count },
  };
}

function createTokensOutEvent(
  sessionId: string,
  count: number
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'tokens_out',
    payload: { count },
  };
}

function createIterationEndEvent(
  sessionId: string,
  iterationNumber: number,
  storyId: string,
  success: boolean
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'iteration_end',
    payload: { iterationNumber, storyId, success },
  };
}

function createStoryCompleteEvent(
  sessionId: string,
  storyId: string,
  passes: boolean
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'story_complete',
    payload: { storyId, passes },
  };
}

function createCompilationResultEvent(
  sessionId: string,
  success: boolean
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'compilation_result',
    payload: { success },
  };
}

function createTestResultEvent(
  sessionId: string,
  success: boolean,
  totalTests: number,
  passed: number,
  failed: number
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'test_result',
    payload: { success, totalTests, passed, failed },
  };
}

/**
 * Creates a mock codebase snapshot
 */
function createCodebaseSnapshot(
  totals: LOCResult,
  rootPath = '/test/project'
): CodebaseSnapshot {
  return {
    rootPath,
    timestamp: new Date().toISOString(),
    totals,
    files: [],
    byLanguage: {
      typescript: { total: 0, code: 0, comments: 0, blank: 0 },
      javascript: { total: 0, code: 0, comments: 0, blank: 0 },
      python: { total: 0, code: 0, comments: 0, blank: 0 },
      unknown: { total: 0, code: 0, comments: 0, blank: 0 },
    },
  };
}

// ============================================================================
// MetricsCalculator Tests
// ============================================================================

describe('MetricsCalculator', () => {
  let collector: EventCollector;
  let gateTracker: GateTracker;
  let locCounter: LOCCounter;
  let calculator: MetricsCalculator;
  let sessionId: string;

  beforeEach(() => {
    collector = new EventCollector();
    gateTracker = new GateTracker();
    locCounter = new LOCCounter();
    calculator = new MetricsCalculator(collector, gateTracker, locCounter);
    sessionId = createSessionId();
  });

  // ==========================================================================
  // Basic Calculation Tests
  // ==========================================================================

  describe('calculate', () => {
    it('returns error for non-existent session', () => {
      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });
      const result = calculator.calculate(sessionId, snapshot);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('returns error when codebase has zero LOC', () => {
      collector.emit(createSessionStartEvent(sessionId));
      const snapshot = createCodebaseSnapshot({
        total: 0,
        code: 0,
        comments: 0,
        blank: 0,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('NO_LOC_DATA');
      }
    });

    it('calculates basic metrics for a session', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 5000));
      collector.emit(createTokensOutEvent(sessionId, 2000));
      collector.emit(createSessionEndEvent(sessionId, true));

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const metrics = result.value;
        expect(metrics.totalLOC).toBe(100);
        expect(metrics.codeLines).toBe(80);
        expect(metrics.commentLines).toBe(10);
        expect(metrics.blankLines).toBe(10);
        expect(metrics.totalTokens).toBe(7000);
        expect(metrics.tokensPerLOC).toBe(70); // 7000 / 100
      }
    });

    it('calculates verification rate from gate tracker', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 1000));

      // Record some gate results
      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: '/test/file.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: false },
          { lineNumber: 4, passed: true },
        ],
      });

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // 3 lines verified out of 100 total
        expect(result.value.verifiedLOC).toBe(3);
        expect(result.value.verificationRate).toBe(0.03);
      }
    });

    it('calculates PoE-LOC from gate tracker', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // Record gate results with some failures
      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: '/test/file.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: false },
          { lineNumber: 4, passed: true },
          { lineNumber: 5, passed: false },
        ],
      });

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // G1 has 3/5 passed = 60% pass rate = 40% PoE
        // With only G1 required, overall PoE = 1 - (1 - 0.4) = 0.4
        expect(result.value.poeLOC).toBeCloseTo(0.4, 5);
      }
    });

    it('calculates session duration in minutes', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createSessionEndEvent(sessionId, true));

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // 30 minutes between start and end
        expect(result.value.totalMinutes).toBe(30);
      }
    });

    it('calculates LOC per minute', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createSessionEndEvent(sessionId, true));

      const snapshot = createCodebaseSnapshot({
        total: 150,
        code: 120,
        comments: 15,
        blank: 15,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // 150 LOC / 30 minutes = 5 LOC/min
        expect(result.value.locPerMinute).toBe(5);
      }
    });

    it('calculates vLOC per minute', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createSessionEndEvent(sessionId, true));

      // Record gate results
      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: '/test/file.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: true },
        ],
      });

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // 3 vLOC / 30 minutes = 0.1 vLOC/min
        expect(result.value.vlocPerMinute).toBe(0.1);
      }
    });

    it('handles zero duration gracefully', () => {
      // Create events with same timestamp
      collector.emit({
        timestamp: validTimestamp,
        sessionId,
        eventType: 'session_start',
        payload: {},
      });
      collector.emit({
        timestamp: validTimestamp, // Same timestamp = 0 duration
        sessionId,
        eventType: 'session_end',
        payload: { success: true },
      });

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.totalMinutes).toBe(0);
        expect(result.value.locPerMinute).toBe(0);
        expect(result.value.vlocPerMinute).toBe(0);
      }
    });

    it('calculates Synth (tokens per LOC)', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 10000));
      collector.emit(createTokensOutEvent(sessionId, 5000));

      const snapshot = createCodebaseSnapshot({
        total: 300,
        code: 240,
        comments: 30,
        blank: 30,
      });

      const result = calculator.calculate(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // 15000 tokens / 300 LOC = 50 tokens per LOC
        expect(result.value.tokensPerLOC).toBe(50);
      }
    });
  });

  // ==========================================================================
  // Synth Trend Tests
  // ==========================================================================

  describe('recordSynthMeasurement', () => {
    it('returns error for non-existent session', () => {
      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        snapshot
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('returns error when snapshot has zero LOC', () => {
      collector.emit(createSessionStartEvent(sessionId));
      const snapshot = createCodebaseSnapshot({
        total: 0,
        code: 0,
        comments: 0,
        blank: 0,
      });

      const result = calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        snapshot
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('NO_LOC_DATA');
      }
    });

    it('records initial synth measurement with zero delta', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 1000));
      collector.emit(createTokensOutEvent(sessionId, 500));

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        snapshot
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const point = result.value;
        expect(point.storyId).toBe('US-001');
        expect(point.cumulativeTokens).toBe(1500);
        expect(point.loc).toBe(100);
        expect(point.synth).toBe(15); // 1500 / 100
        expect(point.synthDelta).toBe(15); // First measurement = value itself
      }
    });

    it('records subsequent measurements with correct deltas', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // First story
      collector.emit(createTokensInEvent(sessionId, 1000));
      const snapshot1 = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });
      calculator.recordSynthMeasurement(sessionId, 'US-001', snapshot1);

      // Second story - more tokens, more LOC
      collector.emit(createTokensInEvent(sessionId, 2000));
      const snapshot2 = createCodebaseSnapshot({
        total: 200,
        code: 160,
        comments: 20,
        blank: 20,
      });
      const result = calculator.recordSynthMeasurement(
        sessionId,
        'US-002',
        snapshot2
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const point = result.value;
        expect(point.storyId).toBe('US-002');
        expect(point.cumulativeTokens).toBe(3000);
        expect(point.loc).toBe(200);
        expect(point.synth).toBe(15); // 3000 / 200
        // Delta = current synth - previous synth = 15 - 10 = 5
        expect(point.synthDelta).toBe(5);
      }
    });

    it('detects spike in synth indicating problem story', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // Normal story - 10 tokens per LOC
      collector.emit(createTokensInEvent(sessionId, 1000));
      const snapshot1 = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });
      calculator.recordSynthMeasurement(sessionId, 'US-001', snapshot1);

      // Problem story - lots of tokens, little progress
      collector.emit(createTokensInEvent(sessionId, 9000)); // Used 9000 more tokens!
      const snapshot2 = createCodebaseSnapshot({
        total: 110, // Only 10 more LOC
        code: 88,
        comments: 11,
        blank: 11,
      });
      const result = calculator.recordSynthMeasurement(
        sessionId,
        'US-002',
        snapshot2
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const point = result.value;
        // 10000 tokens / 110 LOC = ~90.9 tokens per LOC
        expect(point.synth).toBeCloseTo(90.909, 2);
        // Delta = 90.9 - 10 = 80.9 (big spike!)
        expect(point.synthDelta).toBeCloseTo(80.909, 2);
      }
    });
  });

  describe('getSynthTrend', () => {
    it('returns empty array for session with no measurements', () => {
      const trend = calculator.getSynthTrend(sessionId);
      expect(trend).toEqual([]);
    });

    it('returns all measurements in order', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // Record multiple measurements
      collector.emit(createTokensInEvent(sessionId, 1000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        createCodebaseSnapshot({ total: 100, code: 80, comments: 10, blank: 10 })
      );

      collector.emit(createTokensInEvent(sessionId, 1000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-002',
        createCodebaseSnapshot({ total: 150, code: 120, comments: 15, blank: 15 })
      );

      collector.emit(createTokensInEvent(sessionId, 1000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-003',
        createCodebaseSnapshot({ total: 200, code: 160, comments: 20, blank: 20 })
      );

      const trend = calculator.getSynthTrend(sessionId);

      expect(trend).toHaveLength(3);
      expect(trend[0]?.storyId).toBe('US-001');
      expect(trend[1]?.storyId).toBe('US-002');
      expect(trend[2]?.storyId).toBe('US-003');
    });

    it('tracks per-story deltas correctly', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // First story - 1000 tokens, 100 LOC added
      collector.emit(createTokensInEvent(sessionId, 1000));
      const result1 = calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        createCodebaseSnapshot({ total: 100, code: 80, comments: 10, blank: 10 })
      );

      expect(isOk(result1)).toBe(true);
      if (isOk(result1)) {
        const point = result1.value;
        expect(point.tokensSpent).toBe(1000); // All tokens for first story
        expect(point.linesAdded).toBe(100); // All lines added
        expect(point.linesDeleted).toBe(0); // No lines deleted
        expect(point.netDelta).toBe(100); // Net = added - deleted
        expect(point.storySynth).toBe(10); // 1000 / 100
      }

      // Second story - 2000 more tokens, 50 more LOC added
      collector.emit(createTokensInEvent(sessionId, 2000));
      const result2 = calculator.recordSynthMeasurement(
        sessionId,
        'US-002',
        createCodebaseSnapshot({ total: 150, code: 120, comments: 15, blank: 15 })
      );

      expect(isOk(result2)).toBe(true);
      if (isOk(result2)) {
        const point = result2.value;
        expect(point.tokensSpent).toBe(2000); // Tokens for this story only
        expect(point.linesAdded).toBe(50); // Lines added in this story
        expect(point.linesDeleted).toBe(0); // No lines deleted
        expect(point.netDelta).toBe(50); // Net = added - deleted
        expect(point.storySynth).toBe(40); // 2000 / 50
      }
    });

    it('tracks line deletions correctly', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // First story - 100 LOC
      collector.emit(createTokensInEvent(sessionId, 1000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        createCodebaseSnapshot({ total: 100, code: 80, comments: 10, blank: 10 })
      );

      // Second story - refactored to 80 LOC (deleted 20 lines)
      collector.emit(createTokensInEvent(sessionId, 500));
      const result = calculator.recordSynthMeasurement(
        sessionId,
        'US-002',
        createCodebaseSnapshot({ total: 80, code: 64, comments: 8, blank: 8 })
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const point = result.value;
        expect(point.linesAdded).toBe(0); // No lines added
        expect(point.linesDeleted).toBe(20); // 20 lines deleted
        expect(point.netDelta).toBe(-20); // Net = 0 - 20
        expect(point.storySynth).toBeUndefined(); // No storySynth when no lines added
      }
    });

    it('calculates storySynth only when lines are added', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // First story
      collector.emit(createTokensInEvent(sessionId, 1000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        createCodebaseSnapshot({ total: 100, code: 80, comments: 10, blank: 10 })
      );

      // Story with no net LOC change (same LOC but different files maybe)
      collector.emit(createTokensInEvent(sessionId, 500));
      const result = calculator.recordSynthMeasurement(
        sessionId,
        'US-002',
        createCodebaseSnapshot({ total: 100, code: 80, comments: 10, blank: 10 })
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const point = result.value;
        expect(point.linesAdded).toBe(0);
        expect(point.storySynth).toBeUndefined(); // Not calculated when linesAdded = 0
      }
    });
  });

  // ==========================================================================
  // Report Tests
  // ==========================================================================

  describe('getReport', () => {
    it('returns error for non-existent session', () => {
      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.getReport(sessionId, snapshot);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('returns complete report with all sections', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 5000));
      collector.emit(createTokensOutEvent(sessionId, 2000));
      collector.emit(createIterationEndEvent(sessionId, 1, 'US-001', true));
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createTestResultEvent(sessionId, true, 10, 10, 0));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-001', true));
      collector.emit(createSessionEndEvent(sessionId, true));

      // Record gate results
      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: '/test/file.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
        ],
      });

      // Record synth measurement
      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });
      calculator.recordSynthMeasurement(sessionId, 'US-001', snapshot);

      const result = calculator.getReport(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const report = result.value;

        // Check metrics
        expect(report.metrics.totalLOC).toBe(100);
        expect(report.metrics.totalTokens).toBe(7000);

        // Check LOC breakdown
        expect(report.locBreakdown.total).toBe(100);
        expect(report.locBreakdown.code).toBe(80);

        // Check gate stats
        expect(report.gateStats).not.toBeNull();
        expect(report.gateStats?.perGate.G1_COMPILE.linesChecked).toBe(2);

        // Check session metrics
        expect(report.sessionMetrics).not.toBeNull();
        expect(report.sessionMetrics?.totalIterations).toBe(1);
        expect(report.sessionMetrics?.storiesCompleted).toBe(1);

        // Check synth trend
        expect(report.synthTrend).toHaveLength(1);
        expect(report.synthTrend[0]?.storyId).toBe('US-001');
      }
    });

    it('handles missing gate stats gracefully', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createSessionEndEvent(sessionId, true));

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.getReport(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.gateStats).toBeNull();
      }
    });
  });

  describe('formatReport', () => {
    it('returns error for non-existent session', () => {
      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.formatReport(sessionId, snapshot);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('formats a readable report string', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 5000));
      collector.emit(createTokensOutEvent(sessionId, 2000));
      collector.emit(createSessionEndEvent(sessionId, true));

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.formatReport(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const report = result.value;

        // Check report contains key sections
        expect(report).toContain('RALPHMETER METRICS REPORT');
        expect(report).toContain('HEADLINE METRICS');
        expect(report).toContain('Synth (Tokens/LOC)');
        expect(report).toContain('Verified LOC');
        expect(report).toContain('EFFICIENCY METRICS');
        expect(report).toContain('LOC BREAKDOWN');
        expect(report).toContain('Total Lines');
        expect(report).toContain('Code Lines');
      }
    });

    it('includes gate verification section when gate stats exist', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createSessionEndEvent(sessionId, true));

      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: '/test/file.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: false },
        ],
      });

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.formatReport(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain('GATE VERIFICATION');
        expect(result.value).toContain('G1 (Compile)');
        expect(result.value).toContain('Overall PoE');
      }
    });

    it('includes synth trend section when measurements exist', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 1000));

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      calculator.recordSynthMeasurement(sessionId, 'US-001', snapshot);

      const result = calculator.formatReport(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain('SYNTH TREND');
        expect(result.value).toContain('US-001');
      }
    });

    it('includes session metrics section when available', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createIterationEndEvent(sessionId, 1, 'US-001', true));
      collector.emit(createIterationEndEvent(sessionId, 2, 'US-001', true));
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createCompilationResultEvent(sessionId, false));
      collector.emit(createTestResultEvent(sessionId, true, 10, 10, 0));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-001', true));
      collector.emit(createSessionEndEvent(sessionId, true));

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.formatReport(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain('SESSION METRICS');
        expect(result.value).toContain('Iterations');
        expect(result.value).toContain('Compilations');
        expect(result.value).toContain('Test Runs');
        expect(result.value).toContain('Stories');
      }
    });

    it('formats duration correctly for various time ranges', () => {
      // Test short duration (seconds)
      collector.emit({
        timestamp: '2026-01-30T12:00:00.000Z',
        sessionId,
        eventType: 'session_start',
        payload: {},
      });
      collector.emit({
        timestamp: '2026-01-30T12:00:30.000Z', // 30 seconds
        sessionId,
        eventType: 'session_end',
        payload: { success: true },
      });

      const snapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });

      const result = calculator.formatReport(sessionId, snapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toContain('Total Duration');
        // 30 seconds should be displayed as "30s"
        expect(result.value).toContain('30s');
      }
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('integration', () => {
    it('calculates metrics for a complete session with all components', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // Iteration 1 - US-001
      collector.emit(createTokensInEvent(sessionId, 5000));
      collector.emit(createTokensOutEvent(sessionId, 2000));
      collector.emit(createCompilationResultEvent(sessionId, false));
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createTestResultEvent(sessionId, true, 10, 10, 0));
      collector.emit(createIterationEndEvent(sessionId, 1, 'US-001', true));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-001', true));

      // Record gate results for US-001
      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: '/src/feature1.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: true },
          { lineNumber: 4, passed: true },
          { lineNumber: 5, passed: true },
        ],
      });

      // Record synth measurement after US-001
      const snapshot1 = createCodebaseSnapshot({
        total: 50,
        code: 40,
        comments: 5,
        blank: 5,
      });
      calculator.recordSynthMeasurement(sessionId, 'US-001', snapshot1);

      // Iteration 2 - US-002
      collector.emit(createTokensInEvent(sessionId, 3000));
      collector.emit(createTokensOutEvent(sessionId, 1500));
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createTestResultEvent(sessionId, true, 15, 15, 0));
      collector.emit(createIterationEndEvent(sessionId, 2, 'US-002', true));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-002', true));

      // Record gate results for US-002
      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: '/src/feature2.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: true },
        ],
      });

      // Final snapshot
      const finalSnapshot = createCodebaseSnapshot({
        total: 100,
        code: 80,
        comments: 10,
        blank: 10,
      });
      calculator.recordSynthMeasurement(sessionId, 'US-002', finalSnapshot);

      collector.emit(createSessionEndEvent(sessionId, true));

      // Calculate final metrics
      const result = calculator.calculate(sessionId, finalSnapshot);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const metrics = result.value;

        // Verify LOC metrics
        expect(metrics.totalLOC).toBe(100);
        expect(metrics.codeLines).toBe(80);

        // Verify token metrics
        expect(metrics.totalTokens).toBe(11500); // 5000+2000+3000+1500

        // Verify Synth
        expect(metrics.tokensPerLOC).toBe(115); // 11500 / 100

        // Verify verified LOC (8 lines from both gate recordings)
        expect(metrics.verifiedLOC).toBe(8);

        // Verify verification rate
        expect(metrics.verificationRate).toBe(0.08); // 8 / 100
      }

      // Verify synth trend
      const trend = calculator.getSynthTrend(sessionId);
      expect(trend).toHaveLength(2);

      // US-001: 7000 tokens / 50 LOC = 140
      expect(trend[0]?.synth).toBe(140);

      // US-002: 11500 tokens / 100 LOC = 115 (improved!)
      expect(trend[1]?.synth).toBe(115);
      expect(trend[1]?.synthDelta).toBe(-25); // Negative delta = improvement
    });

    it('tracks efficiency degradation in synth trend', () => {
      collector.emit(createSessionStartEvent(sessionId));

      // Good start - 10 tokens per LOC
      collector.emit(createTokensInEvent(sessionId, 1000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-001',
        createCodebaseSnapshot({ total: 100, code: 80, comments: 10, blank: 10 })
      );

      // Getting worse - 20 tokens per LOC
      collector.emit(createTokensInEvent(sessionId, 3000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-002',
        createCodebaseSnapshot({ total: 200, code: 160, comments: 20, blank: 20 })
      );

      // Very bad - 50 tokens per LOC (stuck on a problem)
      collector.emit(createTokensInEvent(sessionId, 6000));
      calculator.recordSynthMeasurement(
        sessionId,
        'US-003',
        createCodebaseSnapshot({ total: 200, code: 160, comments: 20, blank: 20 })
      );

      const trend = calculator.getSynthTrend(sessionId);

      expect(trend[0]?.synth).toBe(10); // 1000/100
      expect(trend[1]?.synth).toBe(20); // 4000/200
      expect(trend[2]?.synth).toBe(50); // 10000/200

      // Delta shows degradation
      expect(trend[1]?.synthDelta).toBe(10); // +10 from baseline
      expect(trend[2]?.synthDelta).toBe(30); // +30 - big spike!
    });
  });
});
