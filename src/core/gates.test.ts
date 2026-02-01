/**
 * Tests for Gate Tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GateTracker,
  ALL_GATES,
  DEFAULT_GATE_CONFIG,
  type CoreGate,
  type GateVerificationResult,
} from './gates.js';
import { isOk, isErr } from '../shared/result.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const validTimestamp = '2026-01-30T12:00:00.000Z';
const testSessionId = 'test-session-123';

function createCompileResult(
  filePath: string,
  lines: { lineNumber: number; passed: boolean; errorMessage?: string }[]
): Omit<GateVerificationResult, 'sessionId'> {
  return {
    timestamp: validTimestamp,
    gate: 'G1_COMPILE',
    filePath,
    lineResults: lines,
  };
}

function createTestCoverageResult(
  filePath: string,
  lines: { lineNumber: number; passed: boolean }[]
): Omit<GateVerificationResult, 'sessionId'> {
  return {
    timestamp: validTimestamp,
    gate: 'G2_CORRECT',
    filePath,
    lineResults: lines,
  };
}

function createRuntimeCoverageResult(
  filePath: string,
  lines: { lineNumber: number; passed: boolean }[]
): Omit<GateVerificationResult, 'sessionId'> {
  return {
    timestamp: validTimestamp,
    gate: 'G3_REACHABLE',
    filePath,
    lineResults: lines,
  };
}

// ============================================================================
// GateTracker Tests
// ============================================================================

describe('GateTracker', () => {
  let tracker: GateTracker;

  beforeEach(() => {
    tracker = new GateTracker();
  });

  // ==========================================================================
  // Constructor Tests
  // ==========================================================================

  describe('constructor', () => {
    it('initializes with default configuration', () => {
      const config = tracker.getConfig();
      expect(config).toEqual(DEFAULT_GATE_CONFIG);
    });

    it('accepts partial configuration override', () => {
      const customTracker = new GateTracker({
        G1_COMPILE: { required: false, threshold: 0.8, skip: false },
      });

      const config = customTracker.getConfig();
      expect(config.G1_COMPILE.required).toBe(false);
      expect(config.G1_COMPILE.threshold).toBe(0.8);
      expect(config.G2_CORRECT).toEqual(DEFAULT_GATE_CONFIG.G2_CORRECT);
      expect(config.G3_REACHABLE).toEqual(DEFAULT_GATE_CONFIG.G3_REACHABLE);
    });
  });

  // ==========================================================================
  // Gate Type Tests
  // ==========================================================================

  describe('ALL_GATES', () => {
    it('contains all three gates', () => {
      expect(ALL_GATES).toHaveLength(3);
      expect(ALL_GATES).toContain('G1_COMPILE');
      expect(ALL_GATES).toContain('G2_CORRECT');
      expect(ALL_GATES).toContain('G3_REACHABLE');
    });
  });

  // ==========================================================================
  // Record Tests
  // ==========================================================================

  describe('record', () => {
    it('records a G1 compile result', () => {
      const result = createCompileResult('src/index.ts', [
        { lineNumber: 1, passed: true },
        { lineNumber: 2, passed: true },
        { lineNumber: 3, passed: false, errorMessage: 'Type error' },
      ]);

      const recorded = tracker.record(testSessionId, result);
      expect(isOk(recorded)).toBe(true);
      if (isOk(recorded)) {
        expect(recorded.value.sessionId).toBe(testSessionId);
        expect(recorded.value.gate).toBe('G1_COMPILE');
        expect(recorded.value.lineResults).toHaveLength(3);
      }
    });

    it('records a G2 test coverage result', () => {
      const result = createTestCoverageResult('src/index.ts', [
        { lineNumber: 1, passed: true },
        { lineNumber: 2, passed: false },
      ]);

      const recorded = tracker.record(testSessionId, result);
      expect(isOk(recorded)).toBe(true);
    });

    it('records a G3 runtime coverage result', () => {
      const result = createRuntimeCoverageResult('src/index.ts', [
        { lineNumber: 1, passed: true },
      ]);

      const recorded = tracker.record(testSessionId, result);
      expect(isOk(recorded)).toBe(true);
    });

    it('records multiple results for same session', () => {
      tracker.record(
        testSessionId,
        createCompileResult('src/a.ts', [{ lineNumber: 1, passed: true }])
      );
      tracker.record(
        testSessionId,
        createCompileResult('src/b.ts', [{ lineNumber: 1, passed: true }])
      );

      const results = tracker.getResults(testSessionId);
      expect(isOk(results)).toBe(true);
      if (isOk(results)) {
        expect(results.value).toHaveLength(2);
      }
    });

    it('rejects invalid gate type', () => {
      const invalidResult = {
        timestamp: validTimestamp,
        gate: 'INVALID_GATE' as CoreGate,
        filePath: 'src/index.ts',
        lineResults: [],
      };

      const recorded = tracker.record(testSessionId, invalidResult);
      expect(isErr(recorded)).toBe(true);
      if (isErr(recorded)) {
        expect(recorded.error.code).toBe('INVALID_GATE');
      }
    });
  });

  // ==========================================================================
  // getResults Tests
  // ==========================================================================

  describe('getResults', () => {
    it('returns all results for a session', () => {
      tracker.record(
        testSessionId,
        createCompileResult('src/a.ts', [{ lineNumber: 1, passed: true }])
      );
      tracker.record(
        testSessionId,
        createTestCoverageResult('src/a.ts', [{ lineNumber: 1, passed: true }])
      );

      const results = tracker.getResults(testSessionId);
      expect(isOk(results)).toBe(true);
      if (isOk(results)) {
        expect(results.value).toHaveLength(2);
        expect(results.value[0]?.gate).toBe('G1_COMPILE');
        expect(results.value[1]?.gate).toBe('G2_CORRECT');
      }
    });

    it('returns error for non-existent session', () => {
      const results = tracker.getResults('non-existent');
      expect(isErr(results)).toBe(true);
      if (isErr(results)) {
        expect(results.error.code).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  // ==========================================================================
  // getGateStats Tests
  // ==========================================================================

  describe('getGateStats', () => {
    beforeEach(() => {
      // Record some G1 compile results
      tracker.record(
        testSessionId,
        createCompileResult('src/index.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: false },
          { lineNumber: 4, passed: true },
          { lineNumber: 5, passed: false },
        ])
      );
    });

    it('calculates correct linesChecked', () => {
      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.linesChecked).toBe(5);
      }
    });

    it('calculates correct linesPassed', () => {
      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.linesPassed).toBe(3);
      }
    });

    it('calculates correct passRate', () => {
      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.passRate).toBe(0.6);
      }
    });

    it('calculates correct poe (probability of error)', () => {
      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.poe).toBe(0.4);
      }
    });

    it('returns passRate of 1 for gate with no results', () => {
      const stats = tracker.getGateStats(testSessionId, 'G2_CORRECT');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.linesChecked).toBe(0);
        expect(stats.value.passRate).toBe(1);
        expect(stats.value.poe).toBe(0);
      }
    });

    it('returns error for non-existent session', () => {
      const stats = tracker.getGateStats('non-existent', 'G1_COMPILE');
      expect(isErr(stats)).toBe(true);
      if (isErr(stats)) {
        expect(stats.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('uses AND logic for duplicate line checks', () => {
      // Record another compile result for same file - line 1 now fails
      tracker.record(
        testSessionId,
        createCompileResult('src/index.ts', [
          { lineNumber: 1, passed: false }, // Was true, now fails
          { lineNumber: 2, passed: true }, // Still passes
        ])
      );

      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        // Line 1 should be failed (true AND false = false)
        // Lines 2,4 passed, lines 1,3,5 failed
        expect(stats.value.linesChecked).toBe(5);
        expect(stats.value.linesPassed).toBe(2);
      }
    });

    it('handles results from multiple files', () => {
      tracker.record(
        testSessionId,
        createCompileResult('src/other.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
        ])
      );

      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        // 5 from index.ts + 2 from other.ts = 7
        expect(stats.value.linesChecked).toBe(7);
        // 3 from index.ts + 2 from other.ts = 5
        expect(stats.value.linesPassed).toBe(5);
      }
    });
  });

  // ==========================================================================
  // getSessionStats Tests
  // ==========================================================================

  describe('getSessionStats', () => {
    it('calculates stats across all gates', () => {
      // G1: 10 lines, 8 passed (80%)
      tracker.record(
        testSessionId,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 8,
          }))
        )
      );

      // G2: 10 lines, 7 passed (70%)
      tracker.record(
        testSessionId,
        createTestCoverageResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 7,
          }))
        )
      );

      // G3: 10 lines, 9 passed (90%)
      tracker.record(
        testSessionId,
        createRuntimeCoverageResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 9,
          }))
        )
      );

      const stats = tracker.getSessionStats(testSessionId);
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.perGate.G1_COMPILE.passRate).toBe(0.8);
        expect(stats.value.perGate.G2_CORRECT.passRate).toBe(0.7);
        expect(stats.value.perGate.G3_REACHABLE.passRate).toBe(0.9);
        expect(stats.value.totalLinesChecked).toBe(10);
      }
    });

    it('calculates verifiedLines correctly', () => {
      // All 5 lines pass G1
      tracker.record(
        testSessionId,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 5 }, (_, i) => ({
            lineNumber: i + 1,
            passed: true,
          }))
        )
      );

      // Lines 1-3 pass G2, lines 4-5 fail
      tracker.record(
        testSessionId,
        createTestCoverageResult(
          'src/index.ts',
          Array.from({ length: 5 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 3,
          }))
        )
      );

      // Lines 1-4 pass G3, line 5 fails
      tracker.record(
        testSessionId,
        createRuntimeCoverageResult(
          'src/index.ts',
          Array.from({ length: 5 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 4,
          }))
        )
      );

      const stats = tracker.getSessionStats(testSessionId);
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        // Only lines 1-3 pass ALL gates
        expect(stats.value.verifiedLines).toBe(3);
        expect(stats.value.totalLinesChecked).toBe(5);
      }
    });

    it('calculates overallPoE using product formula', () => {
      // G1: poe = 0.2
      tracker.record(
        testSessionId,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 8,
          }))
        )
      );

      // G2: poe = 0.3
      tracker.record(
        testSessionId,
        createTestCoverageResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 7,
          }))
        )
      );

      // G3: poe = 0.1
      tracker.record(
        testSessionId,
        createRuntimeCoverageResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 9,
          }))
        )
      );

      const stats = tracker.getSessionStats(testSessionId);
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        // overallPoE = 1 - (1-0.2)(1-0.3)(1-0.1) = 1 - 0.8*0.7*0.9 = 1 - 0.504 = 0.496
        expect(stats.value.overallPoE).toBeCloseTo(0.496, 10);
      }
    });

    it('returns error for non-existent session', () => {
      const stats = tracker.getSessionStats('non-existent');
      expect(isErr(stats)).toBe(true);
      if (isErr(stats)) {
        expect(stats.error.code).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  // ==========================================================================
  // getLineVerification Tests
  // ==========================================================================

  describe('getLineVerification', () => {
    beforeEach(() => {
      // G1: lines 1-5 pass
      tracker.record(
        testSessionId,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 5 }, (_, i) => ({
            lineNumber: i + 1,
            passed: true,
          }))
        )
      );

      // G2: lines 1,2,4 pass, lines 3,5 fail
      tracker.record(
        testSessionId,
        createTestCoverageResult('src/index.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: false },
          { lineNumber: 4, passed: true },
          { lineNumber: 5, passed: false },
        ])
      );

      // G3: lines 1,2,3 pass, lines 4,5 fail
      tracker.record(
        testSessionId,
        createRuntimeCoverageResult('src/index.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: true },
          { lineNumber: 4, passed: false },
          { lineNumber: 5, passed: false },
        ])
      );
    });

    it('returns verification status for each line', () => {
      const verification = tracker.getLineVerification(
        testSessionId,
        'src/index.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        expect(verification.value).toHaveLength(5);
      }
    });

    it('reports correct gate status per line', () => {
      const verification = tracker.getLineVerification(
        testSessionId,
        'src/index.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        const line1 = verification.value.find(
          (v) => v.location.lineNumber === 1
        );
        expect(line1?.g1Passed).toBe(true);
        expect(line1?.g2Passed).toBe(true);
        expect(line1?.g3Passed).toBe(true);
        expect(line1?.verified).toBe(true);

        const line3 = verification.value.find(
          (v) => v.location.lineNumber === 3
        );
        expect(line3?.g1Passed).toBe(true);
        expect(line3?.g2Passed).toBe(false);
        expect(line3?.g3Passed).toBe(true);
        expect(line3?.verified).toBe(false);
      }
    });

    it('correctly determines verified status', () => {
      const verification = tracker.getLineVerification(
        testSessionId,
        'src/index.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        // Line 1: all pass = verified
        expect(
          verification.value.find((v) => v.location.lineNumber === 1)?.verified
        ).toBe(true);
        // Line 2: all pass = verified
        expect(
          verification.value.find((v) => v.location.lineNumber === 2)?.verified
        ).toBe(true);
        // Line 3: G2 fails = not verified
        expect(
          verification.value.find((v) => v.location.lineNumber === 3)?.verified
        ).toBe(false);
        // Line 4: G3 fails = not verified
        expect(
          verification.value.find((v) => v.location.lineNumber === 4)?.verified
        ).toBe(false);
        // Line 5: G2 and G3 fail = not verified
        expect(
          verification.value.find((v) => v.location.lineNumber === 5)?.verified
        ).toBe(false);
      }
    });

    it('returns sorted by line number', () => {
      const verification = tracker.getLineVerification(
        testSessionId,
        'src/index.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        const lineNumbers = verification.value.map(
          (v) => v.location.lineNumber
        );
        expect(lineNumbers).toEqual([1, 2, 3, 4, 5]);
      }
    });

    it('filters by file path', () => {
      // Add results for another file
      tracker.record(
        testSessionId,
        createCompileResult('src/other.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
        ])
      );

      const verification = tracker.getLineVerification(
        testSessionId,
        'src/index.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        expect(verification.value).toHaveLength(5);
        expect(
          verification.value.every(
            (v) => v.location.filePath === 'src/index.ts'
          )
        ).toBe(true);
      }
    });

    it('returns empty array for file with no results', () => {
      const verification = tracker.getLineVerification(
        testSessionId,
        'src/nonexistent.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        expect(verification.value).toHaveLength(0);
      }
    });

    it('returns error for non-existent session', () => {
      const verification = tracker.getLineVerification(
        'non-existent',
        'src/index.ts'
      );
      expect(isErr(verification)).toBe(true);
      if (isErr(verification)) {
        expect(verification.error.code).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('setConfig', () => {
    it('updates gate configuration', () => {
      const result = tracker.setConfig({
        G1_COMPILE: { required: false, threshold: 0.9, skip: false },
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.G1_COMPILE.required).toBe(false);
        expect(result.value.G1_COMPILE.threshold).toBe(0.9);
      }
    });

    it('rejects invalid threshold (negative)', () => {
      const result = tracker.setConfig({
        G1_COMPILE: { required: true, threshold: -0.1, skip: false },
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('INVALID_THRESHOLD');
      }
    });

    it('rejects invalid threshold (greater than 1)', () => {
      const result = tracker.setConfig({
        G2_CORRECT: { required: true, threshold: 1.5, skip: false },
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('INVALID_THRESHOLD');
      }
    });

    it('affects verification when gate is skipped', () => {
      // Skip G2
      tracker.setConfig({
        G2_CORRECT: { required: true, threshold: 1.0, skip: true },
      });

      // G1: all pass
      tracker.record(
        testSessionId,
        createCompileResult('src/index.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
        ])
      );

      // G2: all fail (but skipped)
      tracker.record(
        testSessionId,
        createTestCoverageResult('src/index.ts', [
          { lineNumber: 1, passed: false },
          { lineNumber: 2, passed: false },
        ])
      );

      // G3: all pass
      tracker.record(
        testSessionId,
        createRuntimeCoverageResult('src/index.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
        ])
      );

      const verification = tracker.getLineVerification(
        testSessionId,
        'src/index.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        // Both lines should be verified because G2 is skipped
        expect(
          verification.value.find((v) => v.location.lineNumber === 1)?.verified
        ).toBe(true);
        expect(
          verification.value.find((v) => v.location.lineNumber === 2)?.verified
        ).toBe(true);
      }
    });

    it('affects verification when gate is not required', () => {
      // Make G3 not required
      tracker.setConfig({
        G3_REACHABLE: { required: false, threshold: 1.0, skip: false },
      });

      // G1: all pass
      tracker.record(
        testSessionId,
        createCompileResult('src/index.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
        ])
      );

      // G2: all pass
      tracker.record(
        testSessionId,
        createTestCoverageResult('src/index.ts', [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
        ])
      );

      // G3: all fail (but not required)
      tracker.record(
        testSessionId,
        createRuntimeCoverageResult('src/index.ts', [
          { lineNumber: 1, passed: false },
          { lineNumber: 2, passed: false },
        ])
      );

      const verification = tracker.getLineVerification(
        testSessionId,
        'src/index.ts'
      );
      expect(isOk(verification)).toBe(true);
      if (isOk(verification)) {
        // Both lines should be verified because G3 is not required
        expect(
          verification.value.find((v) => v.location.lineNumber === 1)?.verified
        ).toBe(true);
        expect(
          verification.value.find((v) => v.location.lineNumber === 2)?.verified
        ).toBe(true);
      }
    });

    it('affects overallPoE calculation when gates are skipped', () => {
      // Skip G3
      tracker.setConfig({
        G3_REACHABLE: { required: true, threshold: 1.0, skip: true },
      });

      // G1: poe = 0.2
      tracker.record(
        testSessionId,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 8,
          }))
        )
      );

      // G2: poe = 0.3
      tracker.record(
        testSessionId,
        createTestCoverageResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 7,
          }))
        )
      );

      const stats = tracker.getSessionStats(testSessionId);
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        // overallPoE = 1 - (1-0.2)(1-0.3) = 1 - 0.8*0.7 = 1 - 0.56 = 0.44
        expect(stats.value.overallPoE).toBeCloseTo(0.44, 10);
      }
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('handles empty line results', () => {
      const result = tracker.record(testSessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: 'src/index.ts',
        lineResults: [],
      });

      expect(isOk(result)).toBe(true);

      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.linesChecked).toBe(0);
        expect(stats.value.passRate).toBe(1);
      }
    });

    it('handles same line checked multiple times in single result', () => {
      tracker.record(testSessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: 'src/index.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 1, passed: false }, // Same line, different result
          { lineNumber: 1, passed: true }, // Same line again
        ],
      });

      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        // Should count as 1 unique line, failed (AND logic)
        expect(stats.value.linesChecked).toBe(1);
        expect(stats.value.linesPassed).toBe(0);
      }
    });

    it('handles 100% pass rate', () => {
      tracker.record(
        testSessionId,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 100 }, (_, i) => ({
            lineNumber: i + 1,
            passed: true,
          }))
        )
      );

      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.passRate).toBe(1);
        expect(stats.value.poe).toBe(0);
      }
    });

    it('handles 0% pass rate', () => {
      tracker.record(
        testSessionId,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 100 }, (_, i) => ({
            lineNumber: i + 1,
            passed: false,
          }))
        )
      );

      const stats = tracker.getGateStats(testSessionId, 'G1_COMPILE');
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.passRate).toBe(0);
        expect(stats.value.poe).toBe(1);
      }
    });

    it('handles multiple sessions independently', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      // Session 1: 5 lines, 3 pass
      tracker.record(
        session1,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 5 }, (_, i) => ({
            lineNumber: i + 1,
            passed: i < 3,
          }))
        )
      );

      // Session 2: 10 lines, all pass
      tracker.record(
        session2,
        createCompileResult(
          'src/index.ts',
          Array.from({ length: 10 }, (_, i) => ({
            lineNumber: i + 1,
            passed: true,
          }))
        )
      );

      const stats1 = tracker.getGateStats(session1, 'G1_COMPILE');
      const stats2 = tracker.getGateStats(session2, 'G1_COMPILE');

      expect(isOk(stats1)).toBe(true);
      expect(isOk(stats2)).toBe(true);

      if (isOk(stats1) && isOk(stats2)) {
        expect(stats1.value.linesChecked).toBe(5);
        expect(stats1.value.passRate).toBe(0.6);
        expect(stats2.value.linesChecked).toBe(10);
        expect(stats2.value.passRate).toBe(1);
      }
    });

    it('handles all gates skipped (overallPoE should be 0)', () => {
      tracker.setConfig({
        G1_COMPILE: { required: true, threshold: 1.0, skip: true },
        G2_CORRECT: { required: true, threshold: 1.0, skip: true },
        G3_REACHABLE: { required: true, threshold: 1.0, skip: true },
      });

      tracker.record(
        testSessionId,
        createCompileResult('src/index.ts', [{ lineNumber: 1, passed: true }])
      );

      const stats = tracker.getSessionStats(testSessionId);
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.overallPoE).toBe(0);
      }
    });

    it('handles all gates not required (overallPoE should be 0)', () => {
      tracker.setConfig({
        G1_COMPILE: { required: false, threshold: 1.0, skip: false },
        G2_CORRECT: { required: false, threshold: 1.0, skip: false },
        G3_REACHABLE: { required: false, threshold: 1.0, skip: false },
      });

      tracker.record(
        testSessionId,
        createCompileResult('src/index.ts', [{ lineNumber: 1, passed: false }])
      );

      const stats = tracker.getSessionStats(testSessionId);
      expect(isOk(stats)).toBe(true);
      if (isOk(stats)) {
        expect(stats.value.overallPoE).toBe(0);
      }
    });
  });
});
