/**
 * Session Replay for RalphMeter
 *
 * Reconstructs what happened during each iteration of a Ralph session.
 * Provides a chronological view of all events for debugging purposes.
 */

import { type Result, ok, err } from '../shared/result.js';
import { type EventCollector, type Session } from '../core/collector.js';
import { type MeterEvent } from '../core/events.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Snapshot of state at a point in time
 */
export interface StateSnapshot {
  /** Timestamp of this snapshot */
  timestamp: string;
  /** Cumulative tokens at this point */
  cumulativeTokens: number;
  /** Current iteration number (if in iteration) */
  currentIteration?: number;
  /** Current story ID (if in iteration) */
  currentStory?: string;
  /** Recent compilation status */
  lastCompilationSuccess?: boolean;
  /** Recent test status */
  lastTestSuccess?: boolean;
}

/**
 * Detailed iteration replay
 */
export interface IterationReplay {
  /** Iteration number */
  iterationNumber: number;
  /** Story being worked on */
  storyId: string;
  /** When iteration started */
  startTime: string;
  /** When iteration ended (if completed) */
  endTime?: string;
  /** All events in this iteration */
  events: MeterEvent[];
  /** State snapshot at iteration start */
  startState: StateSnapshot;
  /** State snapshot at iteration end (if completed) */
  endState?: StateSnapshot;
  /** Summary of what happened */
  summary: {
    /** Whether iteration succeeded */
    success?: boolean;
    /** Tokens used in this iteration */
    tokensUsed: number;
    /** Number of compilation attempts */
    compilationAttempts: number;
    /** Number of successful compilations */
    compilationSuccesses: number;
    /** Number of test attempts */
    testAttempts: number;
    /** Number of successful test runs */
    testSuccesses: number;
    /** Key events in order */
    keyEvents: string[];
  };
}

/**
 * Full session replay
 */
export interface SessionReplay {
  /** Session ID */
  sessionId: string;
  /** Session start time */
  startTime: string;
  /** Session end time (if completed) */
  endTime?: string;
  /** Iteration-by-iteration replay */
  iterations: IterationReplay[];
  /** Final state snapshot */
  finalState: StateSnapshot;
}

/**
 * Error types for replay operations
 */
export interface ReplayError {
  code: 'SESSION_NOT_FOUND' | 'NO_EVENTS' | 'RECONSTRUCTION_ERROR';
  message: string;
  details?: unknown;
}

// ============================================================================
// SessionReplay Class
// ============================================================================

/**
 * Reconstructs session history for debugging
 */
export class SessionReplayGenerator {
  constructor(private readonly collector: EventCollector) {}

  /**
   * Generates a replay for a session
   *
   * @param sessionId - The session ID
   * @returns Session replay or error
   */
  replay(sessionId: string): Result<SessionReplay, ReplayError> {
    // Get session from collector
    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const session = sessionResult.value;

    if (session.events.length === 0) {
      return err({
        code: 'NO_EVENTS',
        message: 'No events found in session',
      });
    }

    // Build iteration replays
    const iterations = this.buildIterationReplays(session);

    // Build final state
    const finalState = this.buildFinalState(session);

    return ok({
      sessionId,
      startTime: session.metadata.startedAt,
      ...(session.metadata.endedAt !== undefined && {
        endTime: session.metadata.endedAt,
      }),
      iterations,
      finalState,
    });
  }

  /**
   * Formats replay as human-readable string
   *
   * @param replay - The replay to format
   * @param verbose - Include all events (default: false)
   * @returns Formatted string
   */
  formatReplay(replay: SessionReplay, verbose = false): string {
    const lines: string[] = [];

    lines.push('═'.repeat(80));
    lines.push(`SESSION REPLAY: ${replay.sessionId}`);
    lines.push('═'.repeat(80));
    lines.push('');

    lines.push(`Started: ${replay.startTime}`);
    if (replay.endTime !== undefined) {
      lines.push(`Ended: ${replay.endTime}`);
    }
    lines.push('');

    // Iterations
    for (const iter of replay.iterations) {
      lines.push('─'.repeat(80));
      lines.push(
        `ITERATION #${String(iter.iterationNumber)} - ${iter.storyId}`
      );
      lines.push(`Started: ${iter.startTime}`);
      if (iter.endTime !== undefined) {
        lines.push(`Ended: ${iter.endTime}`);
        const status = iter.summary.success === true ? '✓ Success' : '✗ Failed';
        lines.push(`Status: ${status}`);
      }
      lines.push('');

      // Summary
      lines.push('Summary:');
      lines.push(`  Tokens: ${String(iter.summary.tokensUsed)}`);
      lines.push(
        `  Compilations: ${String(iter.summary.compilationSuccesses)}/${String(iter.summary.compilationAttempts)}`
      );
      lines.push(
        `  Tests: ${String(iter.summary.testSuccesses)}/${String(iter.summary.testAttempts)}`
      );
      lines.push('');

      // Key events
      lines.push('Key Events:');
      for (const event of iter.summary.keyEvents) {
        lines.push(`  • ${event}`);
      }
      lines.push('');

      // Verbose: show all events
      if (verbose) {
        lines.push('All Events:');
        for (const event of iter.events) {
          lines.push(
            `  [${event.timestamp}] ${event.eventType}: ${JSON.stringify(event.payload)}`
          );
        }
        lines.push('');
      }
    }

    lines.push('─'.repeat(80));
    lines.push('FINAL STATE:');
    lines.push(
      `  Cumulative Tokens: ${String(replay.finalState.cumulativeTokens)}`
    );
    if (replay.finalState.lastCompilationSuccess !== undefined) {
      lines.push(
        `  Last Compilation: ${replay.finalState.lastCompilationSuccess ? '✓' : '✗'}`
      );
    }
    if (replay.finalState.lastTestSuccess !== undefined) {
      lines.push(
        `  Last Test: ${replay.finalState.lastTestSuccess ? '✓' : '✗'}`
      );
    }
    lines.push('─'.repeat(80));

    return lines.join('\n');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Builds iteration replays from session events
   */
  private buildIterationReplays(session: Session): IterationReplay[] {
    const iterations = new Map<number, IterationReplay>();
    let currentIteration: number | undefined;
    let cumulativeTokens = 0;
    let lastCompilationSuccess: boolean | undefined;
    let lastTestSuccess: boolean | undefined;

    for (const event of session.events) {
      // Track current iteration
      if (event.eventType === 'iteration_start') {
        const e = event;
        currentIteration = e.payload.iterationNumber;

        iterations.set(currentIteration, {
          iterationNumber: currentIteration,
          storyId: e.payload.storyId,
          startTime: e.timestamp,
          events: [event],
          startState: {
            timestamp: e.timestamp,
            cumulativeTokens,
            currentIteration,
            currentStory: e.payload.storyId,
            ...(lastCompilationSuccess !== undefined && {
              lastCompilationSuccess,
            }),
            ...(lastTestSuccess !== undefined && { lastTestSuccess }),
          },
          summary: {
            tokensUsed: 0,
            compilationAttempts: 0,
            compilationSuccesses: 0,
            testAttempts: 0,
            testSuccesses: 0,
            keyEvents: [],
          },
        });
      }

      // Add event to current iteration
      if (currentIteration !== undefined) {
        const iter = iterations.get(currentIteration);
        if (iter !== undefined) {
          iter.events.push(event);

          // Update summary based on event type
          switch (event.eventType) {
            case 'tokens_in':
            case 'tokens_out': {
              const e = event;
              iter.summary.tokensUsed += e.payload.count;
              cumulativeTokens += e.payload.count;
              break;
            }

            case 'compilation_result': {
              const e = event;
              iter.summary.compilationAttempts += 1;
              if (e.payload.success) {
                iter.summary.compilationSuccesses += 1;
                lastCompilationSuccess = true;
                iter.summary.keyEvents.push('✓ Compilation passed');
              } else {
                lastCompilationSuccess = false;
                iter.summary.keyEvents.push(
                  `✗ Compilation failed (${String(e.payload.errorCount ?? 0)} errors)`
                );
              }
              break;
            }

            case 'test_result': {
              const e = event;
              iter.summary.testAttempts += 1;
              if (e.payload.success) {
                iter.summary.testSuccesses += 1;
                lastTestSuccess = true;
                iter.summary.keyEvents.push(
                  `✓ Tests passed (${String(e.payload.passed)}/${String(e.payload.totalTests)})`
                );
              } else {
                lastTestSuccess = false;
                iter.summary.keyEvents.push(
                  `✗ Tests failed (${String(e.payload.passed)}/${String(e.payload.totalTests)})`
                );
              }
              break;
            }

            case 'story_complete': {
              const e = event;
              const status = e.payload.passes ? '✓' : '✗';
              iter.summary.keyEvents.push(
                `${status} Story ${e.payload.passes ? 'passed' : 'failed'}`
              );
              break;
            }

            case 'iteration_end': {
              const e = event;
              iter.endTime = e.timestamp;
              iter.summary.success = e.payload.success;
              iter.endState = {
                timestamp: e.timestamp,
                cumulativeTokens,
                ...(lastCompilationSuccess !== undefined && {
                  lastCompilationSuccess,
                }),
                ...(lastTestSuccess !== undefined && { lastTestSuccess }),
              };
              currentIteration = undefined;
              break;
            }
          }
        }
      }
    }

    return Array.from(iterations.values()).sort(
      (a, b) => a.iterationNumber - b.iterationNumber
    );
  }

  /**
   * Builds final state snapshot
   */
  private buildFinalState(session: Session): StateSnapshot {
    let cumulativeTokens = 0;
    let lastCompilationSuccess: boolean | undefined;
    let lastTestSuccess: boolean | undefined;
    let currentIteration: number | undefined;
    let currentStory: string | undefined;

    for (const event of session.events) {
      switch (event.eventType) {
        case 'tokens_in':
        case 'tokens_out': {
          const e = event;
          cumulativeTokens += e.payload.count;
          break;
        }

        case 'compilation_result': {
          const e = event;
          lastCompilationSuccess = e.payload.success;
          break;
        }

        case 'test_result': {
          const e = event;
          lastTestSuccess = e.payload.success;
          break;
        }

        case 'iteration_start': {
          const e = event;
          currentIteration = e.payload.iterationNumber;
          currentStory = e.payload.storyId;
          break;
        }

        case 'iteration_end': {
          currentIteration = undefined;
          currentStory = undefined;
          break;
        }
      }
    }

    const lastEvent = session.events[session.events.length - 1];
    const timestamp = lastEvent?.timestamp ?? new Date().toISOString();

    return {
      timestamp,
      cumulativeTokens,
      ...(currentIteration !== undefined && { currentIteration }),
      ...(currentStory !== undefined && { currentStory }),
      ...(lastCompilationSuccess !== undefined && { lastCompilationSuccess }),
      ...(lastTestSuccess !== undefined && { lastTestSuccess }),
    };
  }
}
