/**
 * Session Timeline for RalphMeter
 *
 * Generates iteration-by-iteration timeline views for debugging Ralph sessions.
 * Shows Ralph trends, token usage, and LOC changes over time.
 */

import { type Result, ok, err } from '../shared/result.js';
import { type EventCollector, type Session } from '../core/collector.js';
import {
  type MeterEvent,
  type IterationStartEvent,
  type IterationEndEvent,
  type TokensInEvent,
  type TokensOutEvent,
} from '../core/events.js';
import { type SynthTrendPoint } from '../core/metrics.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Timeline entry for a single iteration
 */
export interface IterationTimelineEntry {
  /** Iteration number */
  iterationNumber: number;
  /** Story ID being worked on */
  storyId: string;
  /** When the iteration started */
  startTime: string;
  /** When the iteration ended (if completed) */
  endTime?: string;
  /** Duration in seconds (if completed) */
  durationSeconds?: number;
  /** Whether the iteration succeeded */
  success?: boolean;
  /** Tokens consumed in this iteration (in + out) */
  tokensUsed: number;
  /** Cumulative tokens up to this point */
  cumulativeTokens: number;
  /** LOC at this point (if available) */
  loc?: number;
  /** Ralph at this point (cumulative tokens / LOC) */
  Ralph?: number;
  /** Change in Ralph from previous iteration */
  ralphDelta?: number;
}

/**
 * Spike point where Ralph increased significantly
 */
export interface SpikePoint {
  /** Iteration number where spike occurred */
  iterationNumber: number;
  /** Story ID being worked on */
  storyId: string;
  /** Ralph value at this point */
  Ralph: number;
  /** Change from previous iteration */
  ralphDelta: number;
  /** Percentage increase */
  percentageIncrease: number;
  /** When the spike occurred */
  timestamp: string;
}

/**
 * Full timeline for a session
 */
export interface SessionTimeline {
  /** Session ID */
  sessionId: string;
  /** Iteration-by-iteration entries */
  iterations: IterationTimelineEntry[];
  /** Identified spike points */
  spikes: SpikePoint[];
  /** Summary statistics */
  summary: {
    /** Total iterations */
    totalIterations: number;
    /** Total tokens used */
    totalTokens: number;
    /** Final LOC (if available) */
    finalLOC?: number;
    /** Final Ralph (if available) */
    finalRalph?: number;
    /** Average Ralph across iterations */
    averageRalph?: number;
    /** Max Ralph spike */
    maxRalphSpike?: number;
  };
}

/**
 * Error types for timeline operations
 */
export interface TimelineError {
  code: 'SESSION_NOT_FOUND' | 'NO_ITERATIONS' | 'CALCULATION_ERROR';
  message: string;
  details?: unknown;
}

// ============================================================================
// SessionTimeline Class
// ============================================================================

/**
 * Generates timeline views for Ralph sessions
 */
export class SessionTimelineGenerator {
  constructor(private readonly collector: EventCollector) {}

  /**
   * Generates a timeline for a session
   *
   * @param sessionId - The session ID
   * @param synthTrend - Optional Ralph trend data from MetricsCalculator
   * @returns Session timeline or error
   */
  generate(
    sessionId: string,
    synthTrend?: SynthTrendPoint[]
  ): Result<SessionTimeline, TimelineError> {
    // Get session from collector
    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const session = sessionResult.value;

    // Build iteration timeline
    const iterations = this.buildIterationTimeline(
      session,
      synthTrend ?? []
    );

    if (iterations.length === 0) {
      return err({
        code: 'NO_ITERATIONS',
        message: 'No iterations found in session',
      });
    }

    // Identify spike points
    const spikes = this.identifySpikes(iterations);

    // Calculate summary statistics
    const summary = this.calculateSummary(iterations);

    return ok({
      sessionId,
      iterations,
      spikes,
      summary,
    });
  }

  /**
   * Formats timeline as human-readable string
   *
   * @param timeline - The timeline to format
   * @returns Formatted string
   */
  formatTimeline(timeline: SessionTimeline): string {
    const lines: string[] = [];

    lines.push('═'.repeat(80));
    lines.push(`SESSION TIMELINE: ${timeline.sessionId}`);
    lines.push('═'.repeat(80));
    lines.push('');

    // Summary
    lines.push('SUMMARY:');
    lines.push(`  Total Iterations: ${String(timeline.summary.totalIterations)}`);
    lines.push(`  Total Tokens: ${timeline.summary.totalTokens.toLocaleString()}`);
    if (timeline.summary.finalLOC !== undefined) {
      lines.push(`  Final LOC: ${String(timeline.summary.finalLOC)}`);
    }
    if (timeline.summary.finalRalph !== undefined) {
      lines.push(`  Final Ralph: ${timeline.summary.finalRalph.toFixed(2)}`);
    }
    if (timeline.summary.averageRalph !== undefined) {
      lines.push(`  Average Ralph: ${timeline.summary.averageRalph.toFixed(2)}`);
    }
    if (timeline.summary.maxRalphSpike !== undefined) {
      lines.push(`  Max Ralph Spike: ${timeline.summary.maxRalphSpike.toFixed(2)}`);
    }
    lines.push('');

    // Spikes
    if (timeline.spikes.length > 0) {
      lines.push('⚠️  SPIKE POINTS:');
      for (const spike of timeline.spikes) {
        lines.push(
          `  Iteration ${String(spike.iterationNumber)} (${spike.storyId}): Ralph ${spike.Ralph.toFixed(2)} (+${spike.ralphDelta.toFixed(2)}, +${spike.percentageIncrease.toFixed(1)}%)`
        );
      }
      lines.push('');
    }

    // Iteration details
    lines.push('ITERATIONS:');
    lines.push('─'.repeat(80));
    for (const iter of timeline.iterations) {
      const status = iter.success === true ? '✓' : iter.success === false ? '✗' : '⋯';
      const duration = iter.durationSeconds !== undefined
        ? `${String(iter.durationSeconds)}s`
        : 'ongoing';
      const ralphStr = iter.Ralph !== undefined
        ? `Ralph: ${iter.Ralph.toFixed(2)}`
        : '';
      const deltaStr = iter.ralphDelta !== undefined
        ? ` (Δ${iter.ralphDelta >= 0 ? '+' : ''}${iter.ralphDelta.toFixed(2)})`
        : '';

      lines.push(
        `${status} #${String(iter.iterationNumber)} ${iter.storyId} | ${duration} | ${String(iter.tokensUsed)} tokens | ${ralphStr}${deltaStr}`
      );
    }

    lines.push('─'.repeat(80));

    return lines.join('\n');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Builds iteration timeline from session events
   */
  private buildIterationTimeline(
    session: Session,
    synthTrend: SynthTrendPoint[]
  ): IterationTimelineEntry[] {
    const iterations = new Map<number, IterationTimelineEntry>();
    let cumulativeTokens = 0;

    // Process events in order
    for (const event of session.events) {
      switch (event.eventType) {
        case 'iteration_start': {
          const e = event;
          iterations.set(e.payload.iterationNumber, {
            iterationNumber: e.payload.iterationNumber,
            storyId: e.payload.storyId,
            startTime: e.timestamp,
            tokensUsed: 0,
            cumulativeTokens,
          });
          break;
        }

        case 'iteration_end': {
          const e = event;
          const iter = iterations.get(e.payload.iterationNumber);
          if (iter !== undefined) {
            iter.endTime = e.timestamp;
            iter.success = e.payload.success;
            iter.durationSeconds = this.calculateDuration(
              iter.startTime,
              e.timestamp
            );
            iter.cumulativeTokens = cumulativeTokens;
          }
          break;
        }

        case 'tokens_in':
        case 'tokens_out': {
          const e = event;
          const count = e.payload.count;
          cumulativeTokens += count;

          // Find the active iteration (most recent without endTime)
          const activeIter = Array.from(iterations.values())
            .reverse()
            .find(i => i.endTime === undefined);

          if (activeIter !== undefined) {
            activeIter.tokensUsed += count;
          }
          break;
        }
      }
    }

    // Enrich with Ralph data from synthTrend
    const iterArray = Array.from(iterations.values()).sort(
      (a, b) => a.iterationNumber - b.iterationNumber
    );

    // Map story completions to iterations
    for (let i = 0; i < iterArray.length; i++) {
      const iter = iterArray[i];
      if (iter === undefined) continue;
      
      const trend = synthTrend.find(t => t.storyId === iter.storyId);

      if (trend !== undefined) {
        iter.loc = trend.loc;
        iter.Ralph = trend.Ralph;

        // Calculate delta from previous
        if (i > 0 && iterArray[i - 1]?.Ralph !== undefined) {
          iter.ralphDelta = iter.Ralph - (iterArray[i - 1]?.Ralph ?? 0);
        }
      }
    }

    return iterArray;
  }

  /**
   * Identifies spike points in Ralph
   *
   * A spike is defined as a Ralph increase > 20% from previous iteration
   */
  private identifySpikes(
    iterations: IterationTimelineEntry[]
  ): SpikePoint[] {
    const spikes: SpikePoint[] = [];

    for (const iter of iterations) {
      if (
        iter.Ralph !== undefined &&
        iter.ralphDelta !== undefined &&
        iter.ralphDelta > 0
      ) {
        const previousRalph = iter.Ralph - iter.ralphDelta;
        if (previousRalph > 0) {
          const percentageIncrease = (iter.ralphDelta / previousRalph) * 100;

          // Spike threshold: 20% increase
          if (percentageIncrease > 20) {
            spikes.push({
              iterationNumber: iter.iterationNumber,
              storyId: iter.storyId,
              Ralph: iter.Ralph,
              ralphDelta: iter.ralphDelta,
              percentageIncrease,
              timestamp: iter.endTime ?? iter.startTime,
            });
          }
        }
      }
    }

    return spikes;
  }

  /**
   * Calculates summary statistics
   */
  private calculateSummary(
    iterations: IterationTimelineEntry[]
  ): SessionTimeline['summary'] {
    const totalIterations = iterations.length;
    const totalTokens =
      iterations[iterations.length - 1]?.cumulativeTokens ?? 0;

    // Get final values
    const lastIter = iterations[iterations.length - 1];
    const finalLOC = lastIter?.loc;
    const finalRalph = lastIter?.Ralph;

    // Calculate average Ralph (from iterations with Ralph data)
    const ralphValues = iterations
      .map(i => i.Ralph)
      .filter((r): r is number => r !== undefined);

    const averageRalph =
      ralphValues.length > 0
        ? ralphValues.reduce((sum, r) => sum + r, 0) / ralphValues.length
        : undefined;

    // Find max spike
    const ralphDeltas = iterations
      .map(i => i.ralphDelta)
      .filter((d): d is number => d !== undefined);

    const maxRalphSpike =
      ralphDeltas.length > 0 ? Math.max(...ralphDeltas) : undefined;

    return {
      totalIterations,
      totalTokens,
      ...(finalLOC !== undefined && { finalLOC }),
      ...(finalRalph !== undefined && { finalRalph }),
      ...(averageRalph !== undefined && { averageRalph }),
      ...(maxRalphSpike !== undefined && { maxRalphSpike }),
    };
  }

  /**
   * Calculates duration between two timestamps in seconds
   */
  private calculateDuration(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
  }
}
