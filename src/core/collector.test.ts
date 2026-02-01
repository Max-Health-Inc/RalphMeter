/**
 * Tests for Event Collector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventCollector } from './collector.js';
import { createSessionId } from './events.js';
import { isOk, isErr } from '../shared/result.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const validTimestamp = '2026-01-30T12:00:00.000Z';

function createSessionStartEvent(
  sessionId: string,
  tags?: Record<string, string>
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'session_start',
    payload: { tags },
  };
}

function createSessionEndEvent(
  sessionId: string,
  success: boolean,
  reason?: string
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'session_end',
    payload: { success, reason },
  };
}

function createIterationStartEvent(
  sessionId: string,
  iterationNumber: number,
  storyId: string
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'iteration_start',
    payload: { iterationNumber, storyId },
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

function createTokensInEvent(
  sessionId: string,
  count: number,
  model?: string
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'tokens_in',
    payload: { count, model },
  };
}

function createTokensOutEvent(
  sessionId: string,
  count: number,
  model?: string
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'tokens_out',
    payload: { count, model },
  };
}

function createCompilationResultEvent(
  sessionId: string,
  success: boolean,
  errorCount?: number
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'compilation_result',
    payload: { success, errorCount },
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

function createStoryCompleteEvent(
  sessionId: string,
  storyId: string,
  passes: boolean,
  locCount?: number
): Record<string, unknown> {
  return {
    timestamp: validTimestamp,
    sessionId,
    eventType: 'story_complete',
    payload: { storyId, passes, locCount },
  };
}

// ============================================================================
// EventCollector Tests
// ============================================================================

describe('EventCollector', () => {
  let collector: EventCollector;
  let sessionId: string;

  beforeEach(() => {
    collector = new EventCollector();
    sessionId = createSessionId();
  });

  // ==========================================================================
  // Session Creation Tests
  // ==========================================================================

  describe('emit - session_start', () => {
    it('creates a new session on session_start event', () => {
      const event = createSessionStartEvent(sessionId);
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.eventType).toBe('session_start');
      }

      const sessionResult = collector.getSession(sessionId);
      expect(isOk(sessionResult)).toBe(true);
      if (isOk(sessionResult)) {
        expect(sessionResult.value.metadata.id).toBe(sessionId);
        expect(sessionResult.value.metadata.status).toBe('active');
      }
    });

    it('stores session tags from session_start', () => {
      const tags = { mode: 'development', test: 'integration' };
      const event = createSessionStartEvent(sessionId, tags);
      collector.emit(event);

      const sessionResult = collector.getSession(sessionId);
      expect(isOk(sessionResult)).toBe(true);
      if (isOk(sessionResult)) {
        expect(sessionResult.value.metadata.tags).toEqual(tags);
      }
    });

    it('stores startedAt timestamp', () => {
      const event = createSessionStartEvent(sessionId);
      collector.emit(event);

      const sessionResult = collector.getSession(sessionId);
      expect(isOk(sessionResult)).toBe(true);
      if (isOk(sessionResult)) {
        expect(sessionResult.value.metadata.startedAt).toBe(validTimestamp);
      }
    });

    it('rejects duplicate session_start for same session', () => {
      const event1 = createSessionStartEvent(sessionId);
      const event2 = createSessionStartEvent(sessionId);

      collector.emit(event1);
      const result = collector.emit(event2);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_ALREADY_EXISTS');
      }
    });
  });

  // ==========================================================================
  // Session End Tests
  // ==========================================================================

  describe('emit - session_end', () => {
    beforeEach(() => {
      collector.emit(createSessionStartEvent(sessionId));
    });

    it('closes session on session_end event (success)', () => {
      const event = createSessionEndEvent(
        sessionId,
        true,
        'All stories complete'
      );
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);

      const sessionResult = collector.getSession(sessionId);
      expect(isOk(sessionResult)).toBe(true);
      if (isOk(sessionResult)) {
        expect(sessionResult.value.metadata.status).toBe('completed');
        expect(sessionResult.value.metadata.success).toBe(true);
        expect(sessionResult.value.metadata.endedAt).toBe(validTimestamp);
      }
    });

    it('closes session on session_end event (failure)', () => {
      const event = createSessionEndEvent(sessionId, false, 'Error occurred');
      collector.emit(event);

      const sessionResult = collector.getSession(sessionId);
      expect(isOk(sessionResult)).toBe(true);
      if (isOk(sessionResult)) {
        expect(sessionResult.value.metadata.status).toBe('failed');
        expect(sessionResult.value.metadata.success).toBe(false);
      }
    });

    it('rejects session_end for non-existent session', () => {
      const fakeId = createSessionId();
      const event = createSessionEndEvent(fakeId, true);
      const result = collector.emit(event);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('rejects session_end for already closed session', () => {
      collector.emit(createSessionEndEvent(sessionId, true));
      const result = collector.emit(createSessionEndEvent(sessionId, true));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_ACTIVE');
      }
    });
  });

  // ==========================================================================
  // Event Emission Tests
  // ==========================================================================

  describe('emit - other events', () => {
    beforeEach(() => {
      collector.emit(createSessionStartEvent(sessionId));
    });

    it('appends iteration_start event to session', () => {
      const event = createIterationStartEvent(sessionId, 1, 'US-001');
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);

      const sessionResult = collector.getSession(sessionId);
      expect(isOk(sessionResult)).toBe(true);
      if (isOk(sessionResult)) {
        expect(sessionResult.value.events).toHaveLength(2);
        expect(sessionResult.value.events[1]?.eventType).toBe(
          'iteration_start'
        );
      }
    });

    it('appends iteration_end event to session', () => {
      collector.emit(createIterationStartEvent(sessionId, 1, 'US-001'));
      const event = createIterationEndEvent(sessionId, 1, 'US-001', true);
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);
    });

    it('appends tokens_in event to session', () => {
      const event = createTokensInEvent(
        sessionId,
        1000,
        'claude-opus-4-5-20251101'
      );
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);
    });

    it('appends tokens_out event to session', () => {
      const event = createTokensOutEvent(sessionId, 500);
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);
    });

    it('appends compilation_result event to session', () => {
      const event = createCompilationResultEvent(sessionId, true);
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);
    });

    it('appends test_result event to session', () => {
      const event = createTestResultEvent(sessionId, true, 10, 10, 0);
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);
    });

    it('appends story_complete event to session', () => {
      const event = createStoryCompleteEvent(sessionId, 'US-001', true, 150);
      const result = collector.emit(event);

      expect(isOk(result)).toBe(true);
    });

    it('rejects events for non-existent session', () => {
      const fakeId = createSessionId();
      const event = createTokensInEvent(fakeId, 100);
      const result = collector.emit(event);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('rejects events for closed session', () => {
      collector.emit(createSessionEndEvent(sessionId, true));
      const event = createTokensInEvent(sessionId, 100);
      const result = collector.emit(event);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_ACTIVE');
      }
    });
  });

  // ==========================================================================
  // Validation Tests
  // ==========================================================================

  describe('emit - validation', () => {
    it('rejects invalid event data', () => {
      const invalidEvent = { invalid: 'data' };
      const result = collector.emit(invalidEvent);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects event with invalid sessionId format', () => {
      const event = {
        timestamp: validTimestamp,
        sessionId: 'not-a-uuid',
        eventType: 'session_start',
        payload: {},
      };
      const result = collector.emit(event);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('rejects event with invalid timestamp format', () => {
      const event = {
        timestamp: 'not-a-timestamp',
        sessionId,
        eventType: 'session_start',
        payload: {},
      };
      const result = collector.emit(event);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  // ==========================================================================
  // Session Query Tests
  // ==========================================================================

  describe('getSession', () => {
    it('returns session by ID', () => {
      collector.emit(createSessionStartEvent(sessionId));

      const result = collector.getSession(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.metadata.id).toBe(sessionId);
      }
    });

    it('returns error for non-existent session', () => {
      const result = collector.getSession(createSessionId());

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });
  });

  describe('getAllSessions', () => {
    it('returns empty array when no sessions', () => {
      const sessions = collector.getAllSessions();
      expect(sessions).toHaveLength(0);
    });

    it('returns all sessions', () => {
      const id1 = createSessionId();
      const id2 = createSessionId();
      const id3 = createSessionId();

      collector.emit(createSessionStartEvent(id1));
      collector.emit(createSessionStartEvent(id2));
      collector.emit(createSessionStartEvent(id3));

      const sessions = collector.getAllSessions();
      expect(sessions).toHaveLength(3);

      const ids = sessions.map((s) => s.metadata.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(ids).toContain(id3);
    });
  });

  // ==========================================================================
  // Metrics Calculation Tests
  // ==========================================================================

  describe('getMetrics', () => {
    beforeEach(() => {
      collector.emit(createSessionStartEvent(sessionId));
    });

    it('returns error for non-existent session', () => {
      const result = collector.getMetrics(createSessionId());

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('returns zero metrics for session with only session_start', () => {
      const result = collector.getMetrics(sessionId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.totalIterations).toBe(0);
        expect(result.value.totalTokensIn).toBe(0);
        expect(result.value.totalTokensOut).toBe(0);
        expect(result.value.compilationAttempts).toBe(0);
        expect(result.value.compilationSuccesses).toBe(0);
        expect(result.value.testAttempts).toBe(0);
        expect(result.value.testSuccesses).toBe(0);
        expect(result.value.storiesCompleted).toBe(0);
        expect(result.value.storiesPassed).toBe(0);
      }
    });

    it('counts totalIterations from iteration_end events', () => {
      collector.emit(createIterationStartEvent(sessionId, 1, 'US-001'));
      collector.emit(createIterationEndEvent(sessionId, 1, 'US-001', true));
      collector.emit(createIterationStartEvent(sessionId, 2, 'US-001'));
      collector.emit(createIterationEndEvent(sessionId, 2, 'US-001', false));
      collector.emit(createIterationStartEvent(sessionId, 3, 'US-002'));
      collector.emit(createIterationEndEvent(sessionId, 3, 'US-002', true));

      const result = collector.getMetrics(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.totalIterations).toBe(3);
      }
    });

    it('sums totalTokensIn from tokens_in events', () => {
      collector.emit(createTokensInEvent(sessionId, 1000));
      collector.emit(createTokensInEvent(sessionId, 500));
      collector.emit(createTokensInEvent(sessionId, 250));

      const result = collector.getMetrics(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.totalTokensIn).toBe(1750);
      }
    });

    it('sums totalTokensOut from tokens_out events', () => {
      collector.emit(createTokensOutEvent(sessionId, 2000));
      collector.emit(createTokensOutEvent(sessionId, 1500));

      const result = collector.getMetrics(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.totalTokensOut).toBe(3500);
      }
    });

    it('counts compilationAttempts and compilationSuccesses', () => {
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createCompilationResultEvent(sessionId, false, 5));
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createCompilationResultEvent(sessionId, false, 2));
      collector.emit(createCompilationResultEvent(sessionId, true));

      const result = collector.getMetrics(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.compilationAttempts).toBe(5);
        expect(result.value.compilationSuccesses).toBe(3);
      }
    });

    it('counts testAttempts and testSuccesses', () => {
      collector.emit(createTestResultEvent(sessionId, true, 10, 10, 0));
      collector.emit(createTestResultEvent(sessionId, false, 10, 8, 2));
      collector.emit(createTestResultEvent(sessionId, true, 15, 15, 0));

      const result = collector.getMetrics(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.testAttempts).toBe(3);
        expect(result.value.testSuccesses).toBe(2);
      }
    });

    it('counts storiesCompleted and storiesPassed', () => {
      collector.emit(createStoryCompleteEvent(sessionId, 'US-001', true, 100));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-002', false));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-003', true, 200));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-004', true, 150));

      const result = collector.getMetrics(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.storiesCompleted).toBe(4);
        expect(result.value.storiesPassed).toBe(3);
      }
    });

    it('calculates comprehensive metrics from mixed events', () => {
      // Simulate a full session
      collector.emit(createIterationStartEvent(sessionId, 1, 'US-001'));
      collector.emit(createTokensInEvent(sessionId, 5000));
      collector.emit(createTokensOutEvent(sessionId, 2000));
      collector.emit(createCompilationResultEvent(sessionId, false, 3));
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createTestResultEvent(sessionId, false, 10, 8, 2));
      collector.emit(createTestResultEvent(sessionId, true, 10, 10, 0));
      collector.emit(createIterationEndEvent(sessionId, 1, 'US-001', true));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-001', true, 150));

      collector.emit(createIterationStartEvent(sessionId, 2, 'US-002'));
      collector.emit(createTokensInEvent(sessionId, 3000));
      collector.emit(createTokensOutEvent(sessionId, 1500));
      collector.emit(createCompilationResultEvent(sessionId, true));
      collector.emit(createTestResultEvent(sessionId, true, 5, 5, 0));
      collector.emit(createIterationEndEvent(sessionId, 2, 'US-002', true));
      collector.emit(createStoryCompleteEvent(sessionId, 'US-002', true, 75));

      const result = collector.getMetrics(sessionId);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.totalIterations).toBe(2);
        expect(result.value.totalTokensIn).toBe(8000);
        expect(result.value.totalTokensOut).toBe(3500);
        expect(result.value.compilationAttempts).toBe(3);
        expect(result.value.compilationSuccesses).toBe(2);
        expect(result.value.testAttempts).toBe(3);
        expect(result.value.testSuccesses).toBe(2);
        expect(result.value.storiesCompleted).toBe(2);
        expect(result.value.storiesPassed).toBe(2);
      }
    });
  });

  // ==========================================================================
  // Event Storage Tests
  // ==========================================================================

  describe('event storage', () => {
    it('preserves event order in session', () => {
      collector.emit(createSessionStartEvent(sessionId));
      collector.emit(createIterationStartEvent(sessionId, 1, 'US-001'));
      collector.emit(createTokensInEvent(sessionId, 100));
      collector.emit(createTokensOutEvent(sessionId, 50));
      collector.emit(createIterationEndEvent(sessionId, 1, 'US-001', true));

      const sessionResult = collector.getSession(sessionId);
      expect(isOk(sessionResult)).toBe(true);
      if (isOk(sessionResult)) {
        const events = sessionResult.value.events;
        expect(events).toHaveLength(5);
        expect(events[0]?.eventType).toBe('session_start');
        expect(events[1]?.eventType).toBe('iteration_start');
        expect(events[2]?.eventType).toBe('tokens_in');
        expect(events[3]?.eventType).toBe('tokens_out');
        expect(events[4]?.eventType).toBe('iteration_end');
      }
    });

    it('returns validated event from emit', () => {
      collector.emit(createSessionStartEvent(sessionId));
      const result = collector.emit(createTokensInEvent(sessionId, 999));

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const event = result.value;
        expect(event.eventType).toBe('tokens_in');
        if (event.eventType === 'tokens_in') {
          expect(event.payload.count).toBe(999);
        }
      }
    });
  });
});
