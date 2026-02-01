/**
 * Tests for SessionTimeline
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventCollector } from '../core/collector.js';
import { SessionTimelineGenerator } from './timeline.js';
import { createSessionId } from '../core/events.js';
import type { SynthTrendPoint } from '../core/metrics.js';

describe('SessionTimelineGenerator', () => {
  let collector: EventCollector;
  let generator: SessionTimelineGenerator;
  let sessionId: string;

  beforeEach(() => {
    collector = new EventCollector();
    generator = new SessionTimelineGenerator(collector);
    sessionId = createSessionId();

    // Create a session
    collector.emit({
      timestamp: '2024-01-01T10:00:00.000Z',
      sessionId,
      eventType: 'session_start',
      payload: { tags: { mode: 'test' } },
    });
  });

  describe('generate', () => {
    it('should return error for non-existent session', () => {
      const result = generator.generate('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should return error for session with no iterations', () => {
      const result = generator.generate(sessionId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NO_ITERATIONS');
      }
    });

    it('should generate timeline for session with iterations', () => {
      // Add iterations
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

      const result = generator.generate(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const timeline = result.value;
        expect(timeline.sessionId).toBe(sessionId);
        expect(timeline.iterations).toHaveLength(1);
        expect(timeline.summary.totalIterations).toBe(1);
        expect(timeline.summary.totalTokens).toBe(1500);
        expect(timeline.spikes).toHaveLength(0);
      }
    });

    it('should track iteration details correctly', () => {
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
        payload: { count: 1200 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const result = generator.generate(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const iter = result.value.iterations[0];
        expect(iter).toBeDefined();
        if (iter !== undefined) {
          expect(iter.iterationNumber).toBe(1);
          expect(iter.storyId).toBe('US-001');
          expect(iter.tokensUsed).toBe(1200);
          expect(iter.cumulativeTokens).toBe(1200);
          expect(iter.success).toBe(true);
          expect(iter.durationSeconds).toBe(60);
        }
      }
    });

    it('should handle multiple iterations', () => {
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

      const result = generator.generate(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const timeline = result.value;
        expect(timeline.iterations).toHaveLength(2);
        expect(timeline.summary.totalIterations).toBe(2);
        expect(timeline.summary.totalTokens).toBe(1800);
      }
    });

    it('should integrate Ralph trend data', () => {
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

      // Ralph trend data
      const synthTrend: SynthTrendPoint[] = [
        {
          storyId: 'US-001',
          timestamp: '2024-01-01T10:02:00.000Z',
          cumulativeTokens: 1000,
          loc: 100,
          Ralph: 10,
          synthDelta: 10,
          tokensSpent: 1000,
          linesAdded: 100,
          linesDeleted: 0,
          netDelta: 100,
        },
      ];

      const result = generator.generate(sessionId, synthTrend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const iter = result.value.iterations[0];
        expect(iter).toBeDefined();
        if (iter !== undefined) {
          expect(iter.loc).toBe(100);
          expect(iter.Ralph).toBe(10);
        }
      }
    });

    it('should identify Ralph spikes', () => {
      // Two iterations for different stories with Ralph data
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:01:30.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 2, storyId: 'US-002' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 2, storyId: 'US-002', success: true },
      });

      const synthTrend: SynthTrendPoint[] = [
        {
          storyId: 'US-001',
          timestamp: '2024-01-01T10:01:30.000Z',
          cumulativeTokens: 1000,
          loc: 100,
          Ralph: 10,
          synthDelta: 10,
          tokensSpent: 1000,
          linesAdded: 100,
          linesDeleted: 0,
          netDelta: 100,
        },
        {
          storyId: 'US-002',
          timestamp: '2024-01-01T10:02:30.000Z',
          cumulativeTokens: 2500,
          loc: 120,
          Ralph: 20.83, // 108% increase - should be a spike
          synthDelta: 10.83,
          tokensSpent: 1500,
          linesAdded: 20,
          linesDeleted: 0,
          netDelta: 20,
        },
      ];

      const result = generator.generate(sessionId, synthTrend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const timeline = result.value;
        expect(timeline.spikes.length).toBeGreaterThan(0);
        const spike = timeline.spikes[0];
        expect(spike).toBeDefined();
        if (spike !== undefined) {
          expect(spike.iterationNumber).toBe(2);
          expect(spike.percentageIncrease).toBeGreaterThan(20);
        }
      }
    });

    it('should calculate summary statistics', () => {
      // Add iterations with Ralph data
      collector.emit({
        timestamp: '2024-01-01T10:01:00.000Z',
        sessionId,
        eventType: 'iteration_start',
        payload: { iterationNumber: 1, storyId: 'US-001' },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:00.000Z',
        sessionId,
        eventType: 'tokens_in',
        payload: { count: 1000 },
      });

      collector.emit({
        timestamp: '2024-01-01T10:02:30.000Z',
        sessionId,
        eventType: 'iteration_end',
        payload: { iterationNumber: 1, storyId: 'US-001', success: true },
      });

      const synthTrend: SynthTrendPoint[] = [
        {
          storyId: 'US-001',
          timestamp: '2024-01-01T10:02:30.000Z',
          cumulativeTokens: 1000,
          loc: 50,
          Ralph: 20,
          synthDelta: 20,
          tokensSpent: 1000,
          linesAdded: 50,
          linesDeleted: 0,
          netDelta: 50,
        },
      ];

      const result = generator.generate(sessionId, synthTrend);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const summary = result.value.summary;
        expect(summary.totalIterations).toBe(1);
        expect(summary.totalTokens).toBe(1000);
        expect(summary.finalLOC).toBe(50);
        expect(summary.finalRalph).toBe(20);
        expect(summary.averageRalph).toBe(20);
      }
    });
  });

  describe('formatTimeline', () => {
    it('should format timeline as string', () => {
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

      const result = generator.generate(sessionId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const formatted = generator.formatTimeline(result.value);
        expect(formatted).toContain('SESSION TIMELINE');
        expect(formatted).toContain('SUMMARY');
        expect(formatted).toContain('ITERATIONS');
        expect(formatted).toContain('US-001');
      }
    });
  });
});
