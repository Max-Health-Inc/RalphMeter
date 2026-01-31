/**
 * Tests for Export Module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { exportSession } from './exporter.js';
import { validateExport, safeValidateExport } from './format.js';
import { EventCollector } from '../core/collector.js';
import { GateTracker } from '../core/gates.js';
import { LOCCounter } from '../core/loc.js';
import { MetricsCalculator } from '../core/metrics.js';
import { createSessionId } from '../core/events.js';
import { isOk, isErr } from '../shared/result.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const validTimestamp = '2026-01-31T12:00:00.000Z';

function createSessionStartEvent(sessionId: string): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'session_start',
    payload: { tags: { test: 'true' } },
  };
}

function createSessionEndEvent(sessionId: string): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'session_end',
    payload: { success: true },
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

// ============================================================================
// Tests
// ============================================================================

describe('Export Module', () => {
  let collector: EventCollector;
  let gateTracker: GateTracker;
  let locCounter: LOCCounter;
  let metricsCalculator: MetricsCalculator;

  beforeEach(() => {
    collector = new EventCollector();
    gateTracker = new GateTracker();
    locCounter = new LOCCounter();
    metricsCalculator = new MetricsCalculator(
      collector,
      gateTracker,
      locCounter
    );
  });

  describe('exportSession', () => {
    it('should export session data without rootPath', () => {
      const sessionId = createSessionId();

      // Create a session with events
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 100));
      collector.emit(createTokensOutEvent(sessionId, 200));
      collector.emit(createSessionEndEvent(sessionId));

      const result = exportSession(
        sessionId,
        {
          collector,
          gateTracker,
          locCounter,
          metricsCalculator,
        },
        undefined
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const exportData = result.value;

      // Verify basic structure
      expect(exportData.version).toBe('v1');
      expect(exportData.exportedAt).toBeTruthy();
      expect(exportData.sessionMetadata.id).toBe(sessionId);
      expect(exportData.sessionMetadata.status).toBe('completed');
      expect(exportData.allEvents).toHaveLength(4);

      // Without rootPath, computed metrics should be null
      expect(exportData.computedMetrics).toBeNull();
      expect(exportData.locBreakdown).toBeNull();
      expect(exportData.synthTrend).toEqual([]);

      // Session metrics should be present
      expect(exportData.sessionMetrics).toBeTruthy();
      expect(exportData.sessionMetrics?.totalTokensIn).toBe(100);
      expect(exportData.sessionMetrics?.totalTokensOut).toBe(200);

      // Gate history should be null (no gate data recorded)
      expect(exportData.gateHistory).toBeNull();
    });

    it('should export session data with rootPath', () => {
      const sessionId = createSessionId();

      // Create a session with events
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createTokensInEvent(sessionId, 100));
      collector.emit(createTokensOutEvent(sessionId, 200));
      collector.emit(createSessionEndEvent(sessionId));

      const rootPath = process.cwd();
      const result = exportSession(
        sessionId,
        {
          collector,
          gateTracker,
          locCounter,
          metricsCalculator,
        },
        rootPath
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const exportData = result.value;

      // Verify basic structure
      expect(exportData.version).toBe('v1');
      expect(exportData.sessionMetadata.id).toBe(sessionId);

      // With rootPath, computed metrics should be present
      expect(exportData.computedMetrics).toBeTruthy();
      expect(exportData.locBreakdown).toBeTruthy();
      expect(exportData.computedMetrics?.totalLOC).toBeGreaterThan(0);
      expect(exportData.locBreakdown?.total).toBeGreaterThan(0);
    });

    it('should return error for non-existent session', () => {
      const nonExistentId = createSessionId();

      const result = exportSession(
        nonExistentId,
        {
          collector,
          gateTracker,
          locCounter,
          metricsCalculator,
        },
        undefined
      );

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;

      expect(result.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('should include gate history when gates are recorded', () => {
      const sessionId = createSessionId();

      // Create a session with events
      collector.emit(createSessionStartEvent(sessionId));

      // Record some gate results
      gateTracker.record(sessionId, {
        timestamp: validTimestamp,
        gate: 'G1_COMPILE',
        filePath: 'test.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: true },
          { lineNumber: 3, passed: false, errorMessage: 'Type error' },
        ],
      });

      collector.emit(createSessionEndEvent(sessionId));

      const result = exportSession(
        sessionId,
        {
          collector,
          gateTracker,
          locCounter,
          metricsCalculator,
        },
        undefined
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const exportData = result.value;

      // Gate history should be present
      expect(exportData.gateHistory).toBeTruthy();
      expect(exportData.gateHistory?.totalLinesChecked).toBe(3);
      expect(exportData.gateHistory?.verifiedLines).toBeGreaterThanOrEqual(0);
    });

    it('should include session tags in metadata', () => {
      const sessionId = createSessionId();
      const tags = { mode: 'test', methodology: 'TDD' };

      // Create a session with tags
      collector.emit({
        timestamp: validTimestamp,
        sessionId,
        eventType: 'session_start',
        payload: { tags },
      });
      collector.emit(createSessionEndEvent(sessionId));

      const result = exportSession(
        sessionId,
        {
          collector,
          gateTracker,
          locCounter,
          metricsCalculator,
        },
        undefined
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const exportData = result.value;
      expect(exportData.sessionMetadata.tags).toEqual(tags);
    });
  });

  describe('validateExport', () => {
    it('should validate a valid export object', () => {
      const sessionId = createSessionId();
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createSessionEndEvent(sessionId));

      const result = exportSession(
        sessionId,
        {
          collector,
          gateTracker,
          locCounter,
          metricsCalculator,
        },
        undefined
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      // Should not throw
      const validated = validateExport(result.value);
      expect(validated).toBeTruthy();
      expect(validated.version).toBe('v1');
    });

    it('should throw on invalid export object', () => {
      const invalid = {
        version: 'v2', // Invalid version
        exportedAt: validTimestamp,
      };

      expect(() => validateExport(invalid)).toThrow();
    });
  });

  describe('safeValidateExport', () => {
    it('should return success for valid export', () => {
      const sessionId = createSessionId();
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createSessionEndEvent(sessionId));

      const result = exportSession(
        sessionId,
        {
          collector,
          gateTracker,
          locCounter,
          metricsCalculator,
        },
        undefined
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      const validation = safeValidateExport(result.value);
      expect(validation.success).toBe(true);
    });

    it('should return error for invalid export', () => {
      const invalid = {
        version: 'v2', // Invalid version
        exportedAt: validTimestamp,
      };

      const validation = safeValidateExport(invalid);
      expect(validation.success).toBe(false);
    });

    it('should return error for missing required fields', () => {
      const invalid = {
        version: 'v1',
        // Missing other required fields
      };

      const validation = safeValidateExport(invalid);
      expect(validation.success).toBe(false);
    });
  });
});
