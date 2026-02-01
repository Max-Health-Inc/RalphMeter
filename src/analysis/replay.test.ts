/**
 * Tests for SessionReplay
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventCollector } from '../core/collector.js';
import { SessionReplayGenerator } from './replay.js';
import { createSessionId } from '../core/events.js';

describe('SessionReplayGenerator', () => {
  let collector: EventCollector;
  let generator: SessionReplayGenerator;
  let sessionId: string;

  beforeEach(() => {
    collector = new EventCollector();
    generator = new SessionReplayGenerator(collector);
    sessionId = createSessionId();

    // Create a session
    collector.emit({
      timestamp: '2024-01-01T10:00:00.000Z',
      sessionId,
      eventType: 'session_start',
      payload: { tags: { mode: 'test' } },
    });
  });

  describe('replay', () => {
    it('should return error for non-existent session', () => {
      const result = generator.replay('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should return error for session with no events', () => {
      // Create empty session (no events after session_start)
      const emptySessionId = createSessionId();
      collector.emit({
        timestamp: '2024-01-01T10:00:00.000Z',
        sessionId: emptySessionId,
        eventType: 'session_start',
        payload: {},
      });

      // Remove all events to simulate empty session
      const emptyCollector = new EventCollector();
      const emptyGenerator = new SessionReplayGenerator(emptyCollector);
      emptyCollector.emit({
        timestamp: '2024-01-01T10:00:00.000Z',
        sessionId: emptySessionId,
        eventType: 'session_start',
        payload: {},
      });

      const result = emptyGenerator.replay(emptySessionId);

      // Should succeed with at least one event
      expect(result.ok).toBe(true);
    });

    it('should replay single iteration', () => {
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
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const replay = result.value;
        expect(replay.sessionId).toBe(sessionId);
        expect(replay.iterations).toHaveLength(1);

        const iter = replay.iterations[0];
        expect(iter).toBeDefined();
        if (iter !== undefined) {
          expect(iter.iterationNumber).toBe(1);
          expect(iter.storyId).toBe('US-001');
          expect(iter.summary.tokensUsed).toBe(1000);
          expect(iter.summary.success).toBe(true);
        }
      }
    });

    it('should track compilation events in summary', () => {
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
        payload: { success: false, errorCount: 2 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'compilation_result',
        payload: { success: true },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const iter = result.value.iterations[0];
        expect(iter).toBeDefined();
        if (iter !== undefined) {
          expect(iter.summary.compilationAttempts).toBe(2);
          expect(iter.summary.compilationSuccesses).toBe(1);
          expect(
            iter.summary.keyEvents.some(e => e.includes('Compilation failed'))
          ).toBe(true);
          expect(
            iter.summary.keyEvents.some(e => e.includes('Compilation passed'))
          ).toBe(true);
        }
      }
    });

    it('should track test events in summary', () => {
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
        payload: { success: false, totalTests: 10, passed: 7, failed: 3 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'test_result',
        payload: { success: true, totalTests: 10, passed: 10, failed: 0 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const iter = result.value.iterations[0];
        expect(iter).toBeDefined();
        if (iter !== undefined) {
          expect(iter.summary.testAttempts).toBe(2);
          expect(iter.summary.testSuccesses).toBe(1);
          expect(
            iter.summary.keyEvents.some(e => e.includes('Tests failed'))
          ).toBe(true);
          expect(
            iter.summary.keyEvents.some(e => e.includes('Tests passed'))
          ).toBe(true);
        }
      }
    });

    it('should replay multiple iterations', () => {
      // First iteration
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
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      // Second iteration
      collector.emit({
        timestamp: '2024-01-01T10:03:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 2, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:03:30.000Z',
        sessionId,
        eventType: 'tokens_in',
        payload: { count: 800 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:04:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 2, storyId: 'US-001', success: false },
      });

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const replay = result.value;
        expect(replay.iterations).toHaveLength(2);
        expect(replay.finalState.cumulativeTokens).toBe(1800);
      }
    });

    it('should track state snapshots', () => {
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
        payload: { success: true },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'test_result',
        payload: { success: true, totalTests: 5, passed: 5, failed: 0 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const replay = result.value;
        expect(replay.finalState.lastCompilationSuccess).toBe(true);
        expect(replay.finalState.lastTestSuccess).toBe(true);

        const iter = replay.iterations[0];
        expect(iter).toBeDefined();
        if (iter !== undefined) {
          expect(iter.endState).toBeDefined();
          if (iter.endState !== undefined) {
            expect(iter.endState.lastCompilationSuccess).toBe(true);
            expect(iter.endState.lastTestSuccess).toBe(true);
          }
        }
      }
    });

    it('should track story completion in key events', () => {
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:01:30.000Z',
        sessionId,
        eventType: 'story_complete',
        payload: { storyId: 'US-001', passes: true },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const iter = result.value.iterations[0];
        expect(iter).toBeDefined();
        if (iter !== undefined) {
          expect(
            iter.summary.keyEvents.some(e => e.includes('Story passed'))
          ).toBe(true);
        }
      }
    });

    it('should build final state correctly', () => {
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
        eventType: 'compilation_result',
        payload: { success: true },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const finalState = result.value.finalState;
        expect(finalState.cumulativeTokens).toBe(1000);
        expect(finalState.lastCompilationSuccess).toBe(true);
        expect(finalState.currentIteration).toBeUndefined(); // Iteration ended
      }
    });
  });

  describe('formatReplay', () => {
    it('should format replay as string', () => {
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

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const formatted = generator.formatReplay(result.value);
        expect(formatted).toContain('SESSION REPLAY');
        expect(formatted).toContain('ITERATION #1');
        expect(formatted).toContain('US-001');
        expect(formatted).toContain('Summary');
        expect(formatted).toContain('FINAL STATE');
      }
    });

    it('should format replay with verbose output', () => {
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

      const result = generator.replay(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const formatted = generator.formatReplay(result.value, true);
        expect(formatted).toContain('All Events');
        expect(formatted).toContain('iteration_start');
      }
    });
  });
});
