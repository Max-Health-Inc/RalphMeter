/**
 * Tests for SessionDiagnosis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventCollector } from '../core/collector.js';
import { GateTracker } from '../core/gates.js';
import { SessionDiagnosis } from './diagnosis.js';
import { createSessionId } from '../core/events.js';

describe('SessionDiagnosis', () => {
  let collector: EventCollector;
  let gateTracker: GateTracker;
  let diagnosis: SessionDiagnosis;
  let sessionId: string;

  beforeEach(() => {
    collector = new EventCollector();
    gateTracker = new GateTracker();
    diagnosis = new SessionDiagnosis(collector, gateTracker);
    sessionId = createSessionId();

    // Create a session
    collector.emit({
      timestamp: '2024-01-01T10:00:00.000Z',
      sessionId,
      eventType: 'session_start',
      payload: { tags: { mode: 'test' } },
    });
  });

  describe('diagnose', () => {
    it('should return error for non-existent session', () => {
      const result = diagnosis.diagnose('non-existent', 'US-001');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should return error for story with no events', () => {
      const result = diagnosis.diagnose(sessionId, 'US-999');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORY_NOT_FOUND');
      }
    });

    it('should return error for story with no iterations', () => {
      // Add some events but no iterations
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'tokens_in',
        payload: { count: 100 },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORY_NOT_FOUND');
      }
    });

    it('should diagnose basic story metrics', () => {
      // Add iteration for US-001
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:01:30.000Z',
        sessionId,
        eventType: 'tokens_in',
        payload: { count: 1000 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'tokens_out',
        payload: { count: 500 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:03:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        expect(diag.storyId).toBe('US-001');
        expect(diag.iterationCount).toBe(1);
        expect(diag.tokensSpent).toBe(1500);
        expect(diag.timeSpent).toBe(120);
      }
    });

    it('should track compilation failures', () => {
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:01:30.000Z',
        sessionId,
        eventType: 'compilation_result',
        payload: {
          success: false,
          errorCount: 2,
          errors: [
            { file: 'src/app.ts', line: 10, message: 'Type error' },
            { file: 'src/app.ts', line: 20, message: 'Syntax error' },
          ],
        },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: false },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        expect(diag.gateFailures).toHaveLength(1);
        const failure = diag.gateFailures[0];
        expect(failure).toBeDefined();
        if (failure !== undefined) {
          expect(failure.gate).toBe('G1_COMPILE');
          expect(failure.attemptCount).toBe(1);
          expect(failure.failedLines).toHaveLength(2);
          expect(failure.errorMessages).toHaveLength(2);
        }
      }
    });

    it('should track test failures', () => {
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:01:30.000Z',
        sessionId,
        eventType: 'test_result',
        payload: {
          success: false,
          totalTests: 10,
          passed: 7,
          failed: 3,
        },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: false },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        expect(diag.gateFailures).toHaveLength(1);
        const failure = diag.gateFailures[0];
        expect(failure).toBeDefined();
        if (failure !== undefined) {
          expect(failure.gate).toBe('G2_CORRECT');
          expect(failure.attemptCount).toBe(1);
        }
      }
    });

    it('should check completion status', () => {
      // Add iteration
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      // Add story completion
      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'story_complete',
        payload: { storyId: 'US-001', passes: true },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        expect(diag.completed).toBe(true);
        expect(diag.passed).toBe(true);
      }
    });

    it('should generate recommendations for high iteration count', () => {
      // Add many iterations
      for (let i = 1; i <= 12; i++) {
        collector.emit({
          timestamp: `2024-01-01T10:${String(i).padStart(2, '0')}:00.000Z`,
          sessionId,
          eventType: 'iteration_start',
          payload: { iterationNumber: i, storyId: 'US-001' },
        });

        collector.emit({
          timestamp: `2024-01-01T10:${String(i).padStart(2, '0')}:30.000Z`,
          sessionId,
          eventType: 'iteration_end',
          payload: { iterationNumber: i, storyId: 'US-001', success: true },
        });
      }

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        const efficiencyRec = diag.recommendations.find(
          r => r.category === 'efficiency'
        );
        expect(efficiencyRec).toBeDefined();
        if (efficiencyRec !== undefined) {
          expect(efficiencyRec.message).toContain('High iteration count');
        }
      }
    });

    it('should generate recommendations for high token usage', () => {
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:01:30.000Z',
        sessionId,
        eventType: 'tokens_in',
        payload: { count: 60000 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        const efficiencyRec = diag.recommendations.find(
          r => r.category === 'efficiency' && r.message.includes('High token')
        );
        expect(efficiencyRec).toBeDefined();
      }
    });

    it('should generate recommendations for stuck on gate', () => {
      // Multiple failed compilation attempts
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      for (let i = 0; i < 5; i++) {
        collector.emit({
          timestamp: `2024-01-01T10:01:${String(10 + i * 10).padStart(2, '0')}.000Z`,
          sessionId,
          eventType: 'compilation_result',
          payload: {
            success: false,
            errorCount: 1,
            errors: [{ file: 'src/app.ts', line: 10, message: 'Type error' }],
          },
        });
      }

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: false },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        const compilationRec = diag.recommendations.find(
          r => r.category === 'compilation'
        );
        expect(compilationRec).toBeDefined();
        if (compilationRec !== undefined) {
          expect(compilationRec.message).toContain('Story stuck on G1_COMPILE');
        }
      }
    });

    it('should recommend for completed but failed story', () => {
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      // Story complete but failed gates
      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'story_complete',
        payload: { storyId: 'US-001', passes: false },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const diag = result.value;
        const verificationRec = diag.recommendations.find(
          r => r.category === 'verification'
        );
        expect(verificationRec).toBeDefined();
      }
    });
  });

  describe('formatDiagnosis', () => {
    it('should format diagnosis as string', () => {
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = diagnosis.diagnose(sessionId, 'US-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const formatted = diagnosis.formatDiagnosis(result.value);
        expect(formatted).toContain('STORY DIAGNOSIS');
        expect(formatted).toContain('US-001');
        expect(formatted).toContain('METRICS');
      }
    });
  });
});
