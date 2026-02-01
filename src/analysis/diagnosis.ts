/**
 * Session Diagnosis for RalphMeter
 *
 * Provides detailed diagnosis for individual stories within a session.
 * Helps identify why a story took many iterations or failed gates.
 */

import { type Result, ok, err } from '../shared/result.js';
import {
  type EventCollector,
  type Session,
} from '../core/collector.js';
import {
  type GateTracker,
  type CoreGate,
} from '../core/gates.js';
import {
  type MeterEvent,
  type IterationStartEvent,
  type IterationEndEvent,
  type TokensInEvent,
  type TokensOutEvent,
  type CompilationResultEvent,
  type TestResultEvent,
} from '../core/events.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Gate failure information for diagnosis
 */
export interface GateFailureInfo {
  /** Gate that failed */
  gate: CoreGate;
  /** Lines that failed the gate */
  failedLines: { file: string; line: number }[];
  /** Error messages associated with failures */
  errorMessages: string[];
  /** Number of times this gate was attempted */
  attemptCount: number;
}

/**
 * Recommendation for improving story completion
 */
export interface DiagnosisRecommendation {
  /** Recommendation type */
  type: 'error' | 'warning' | 'info';
  /** Category of the issue */
  category:
    | 'compilation'
    | 'testing'
    | 'verification'
    | 'efficiency'
    | 'progress';
  /** Human-readable message */
  message: string;
  /** Optional details */
  details?: string;
}

/**
 * Diagnosis result for a story
 */
export interface StoryDiagnosis {
  /** Session ID */
  sessionId: string;
  /** Story ID */
  storyId: string;
  /** Number of tokens spent on this story */
  tokensSpent: number;
  /** Number of iterations for this story */
  iterationCount: number;
  /** Gate failures encountered */
  gateFailures: GateFailureInfo[];
  /** Actionable recommendations */
  recommendations: DiagnosisRecommendation[];
  /** Whether the story completed successfully */
  completed: boolean;
  /** Whether the story passed all gates */
  passed?: boolean;
  /** Time spent on story in seconds */
  timeSpent?: number;
}

/**
 * Error types for diagnosis operations
 */
export interface DiagnosisError {
  code:
    | 'SESSION_NOT_FOUND'
    | 'STORY_NOT_FOUND'
    | 'NO_ITERATIONS'
    | 'CALCULATION_ERROR';
  message: string;
  details?: unknown;
}

// ============================================================================
// SessionDiagnosis Class
// ============================================================================

/**
 * Diagnoses story-level issues in Ralph sessions
 */
export class SessionDiagnosis {
  constructor(
    private readonly collector: EventCollector,
    private readonly gateTracker: GateTracker
  ) {}

  /**
   * Diagnoses a specific story within a session
   *
   * @param sessionId - The session ID
   * @param storyId - The story ID to diagnose
   * @returns Story diagnosis or error
   */
  diagnose(
    sessionId: string,
    storyId: string
  ): Result<StoryDiagnosis, DiagnosisError> {
    // Get session from collector
    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const session = sessionResult.value;

    // Extract story-specific events
    const storyEvents = this.extractStoryEvents(session, storyId);

    if (storyEvents.length === 0) {
      return err({
        code: 'STORY_NOT_FOUND',
        message: `No events found for story: ${storyId}`,
      });
    }

    // Count iterations
    const iterationCount = this.countIterations(storyEvents);

    if (iterationCount === 0) {
      return err({
        code: 'NO_ITERATIONS',
        message: `No iterations found for story: ${storyId}`,
      });
    }

    // Calculate tokens spent
    const tokensSpent = this.calculateTokensSpent(storyEvents);

    // Calculate time spent
    const timeSpent = this.calculateTimeSpent(storyEvents);

    // Analyze gate failures
    const gateFailures = this.analyzeGateFailures(
      sessionId,
      storyId,
      storyEvents
    );

    // Check completion status
    const { completed, passed } = this.checkCompletionStatus(
      session,
      storyId
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      storyId,
      iterationCount,
      tokensSpent,
      gateFailures,
      completed,
      passed
    );

    return ok({
      sessionId,
      storyId,
      tokensSpent,
      iterationCount,
      gateFailures,
      recommendations,
      completed,
      ...(passed !== undefined && { passed }),
      ...(timeSpent !== undefined && { timeSpent }),
    });
  }

  /**
   * Formats diagnosis as human-readable string
   *
   * @param diagnosis - The diagnosis to format
   * @returns Formatted string
   */
  formatDiagnosis(diagnosis: StoryDiagnosis): string {
    const lines: string[] = [];

    lines.push('═'.repeat(80));
    lines.push(`STORY DIAGNOSIS: ${diagnosis.storyId}`);
    lines.push('═'.repeat(80));
    lines.push('');

    // Status
    const statusIcon = diagnosis.completed
      ? diagnosis.passed === true
        ? '✓'
        : '✗'
      : '⋯';
    const statusText = diagnosis.completed
      ? diagnosis.passed === true
        ? 'Completed & Passed'
        : 'Completed but Failed'
      : 'In Progress';

    lines.push(`Status: ${statusIcon} ${statusText}`);
    lines.push('');

    // Metrics
    lines.push('METRICS:');
    lines.push(`  Iterations: ${String(diagnosis.iterationCount)}`);
    lines.push(`  Tokens Spent: ${diagnosis.tokensSpent.toLocaleString()}`);
    if (diagnosis.timeSpent !== undefined) {
      lines.push(`  Time Spent: ${String(diagnosis.timeSpent)}s`);
    }
    lines.push('');

    // Gate failures
    if (diagnosis.gateFailures.length > 0) {
      lines.push('⚠️  GATE FAILURES:');
      for (const failure of diagnosis.gateFailures) {
        lines.push(`  ${failure.gate}: ${String(failure.attemptCount)} attempts`);
        lines.push(`    Failed lines: ${String(failure.failedLines.length)}`);
        if (failure.errorMessages.length > 0) {
          lines.push(
            `    Errors: ${failure.errorMessages.slice(0, 3).join('; ')}`
          );
          if (failure.errorMessages.length > 3) {
            lines.push(
              `    ... and ${String(failure.errorMessages.length - 3)} more`
            );
          }
        }
      }
      lines.push('');
    }

    // Recommendations
    if (diagnosis.recommendations.length > 0) {
      lines.push('💡 RECOMMENDATIONS:');
      for (const rec of diagnosis.recommendations) {
        const icon =
          rec.type === 'error' ? '❌' : rec.type === 'warning' ? '⚠️' : 'ℹ️';
        lines.push(`  ${icon} [${rec.category}] ${rec.message}`);
        if (rec.details !== undefined) {
          lines.push(`     ${rec.details}`);
        }
      }
      lines.push('');
    }

    lines.push('─'.repeat(80));

    return lines.join('\n');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extracts events related to a specific story
   */
  private extractStoryEvents(session: Session, storyId: string): MeterEvent[] {
    const events: MeterEvent[] = [];
    let inStory = false;

    for (const event of session.events) {
      // Track when we enter/exit the story
      if (event.eventType === 'iteration_start') {
        const e = event;
        inStory = e.payload.storyId === storyId;
      }

      if (inStory) {
        events.push(event);
      }

      if (event.eventType === 'iteration_end') {
        const e = event;
        if (e.payload.storyId === storyId) {
          inStory = false;
        }
      }
    }

    return events;
  }

  /**
   * Counts iterations for a story
   */
  private countIterations(events: MeterEvent[]): number {
    return events.filter(e => e.eventType === 'iteration_start').length;
  }

  /**
   * Calculates tokens spent on a story
   */
  private calculateTokensSpent(events: MeterEvent[]): number {
    let total = 0;

    for (const event of events) {
      if (event.eventType === 'tokens_in' || event.eventType === 'tokens_out') {
        const e = event;
        total += e.payload.count;
      }
    }

    return total;
  }

  /**
   * Calculates time spent on a story
   */
  private calculateTimeSpent(events: MeterEvent[]): number | undefined {
    const starts = events.filter(
      e => e.eventType === 'iteration_start'
    );
    const ends = events.filter(
      e => e.eventType === 'iteration_end'
    );

    if (starts.length === 0 || ends.length === 0) {
      return undefined;
    }

    const firstStart = starts[0];
    const lastEnd = ends[ends.length - 1];

    if (firstStart === undefined || lastEnd === undefined) {
      return undefined;
    }

    const startTime = new Date(firstStart.timestamp).getTime();
    const endTime = new Date(lastEnd.timestamp).getTime();

    return Math.floor((endTime - startTime) / 1000);
  }

  /**
   * Analyzes gate failures for a story
   */
  private analyzeGateFailures(
    sessionId: string,
    storyId: string,
    events: MeterEvent[]
  ): GateFailureInfo[] {
    const failures: GateFailureInfo[] = [];

    // Analyze G1 (compilation) failures
    const compilationEvents = events.filter(
      e => e.eventType === 'compilation_result'
    );

    const compilationFailures = compilationEvents.filter(
      e => !e.payload.success
    );

    if (compilationFailures.length > 0) {
      const errorMessages: string[] = [];
      const failedLines: { file: string; line: number }[] = [];

      for (const failure of compilationFailures) {
        if (failure.payload.errors !== undefined) {
          for (const error of failure.payload.errors) {
            errorMessages.push(error.message);
            failedLines.push({ file: error.file, line: error.line });
          }
        }
      }

      failures.push({
        gate: 'G1_COMPILE',
        failedLines,
        errorMessages,
        attemptCount: compilationEvents.length,
      });
    }

    // Analyze G2 (test) failures
    const testEvents = events.filter(
      e => e.eventType === 'test_result'
    );

    const testFailures = testEvents.filter(e => !e.payload.success);

    if (testFailures.length > 0) {
      const errorMessages: string[] = [];

      for (const failure of testFailures) {
        errorMessages.push(
          `${String(failure.payload.failed)} tests failed out of ${String(failure.payload.totalTests)}`
        );
      }

      failures.push({
        gate: 'G2_CORRECT',
        failedLines: [], // Test events don't include line-level data
        errorMessages,
        attemptCount: testEvents.length,
      });
    }

    // Analyze G3 (reachability) failures from gate tracker
    const gateResults = this.gateTracker.getResults(sessionId);
    if (gateResults.ok) {
      const g3Results = gateResults.value.filter(
        r => r.gate === 'G3_REACHABLE'
      );

      if (g3Results.length > 0) {
        // Count failed lines from line results
        const failedLines: { file: string; line: number }[] = [];
        
        for (const result of g3Results) {
          for (const lr of result.lineResults) {
            if (!lr.passed) {
              failedLines.push({
                file: result.filePath,
                line: lr.lineNumber,
              });
            }
          }
        }
        
        if (failedLines.length > 0) {
          failures.push({
            gate: 'G3_REACHABLE',
            failedLines,
            errorMessages: [`${String(failedLines.length)} lines not reachable`],
            attemptCount: g3Results.length,
          });
        }
      }
    }

    return failures;
  }

  /**
   * Checks if story is completed and passed
   */
  private checkCompletionStatus(
    session: Session,
    storyId: string
  ): { completed: boolean; passed?: boolean } {
    // Look for story_complete event
    const storyCompleteEvent = session.events.find(
      e =>
        e.eventType === 'story_complete' &&
        (e as { payload: { storyId: string } }).payload.storyId === storyId
    );

    if (storyCompleteEvent !== undefined) {
      const passes = (
        storyCompleteEvent as { payload: { passes: boolean } }
      ).payload.passes;
      return { completed: true, passed: passes };
    }

    return { completed: false };
  }

  /**
   * Generates actionable recommendations
   */
  private generateRecommendations(
    storyId: string,
    iterationCount: number,
    tokensSpent: number,
    gateFailures: GateFailureInfo[],
    completed: boolean,
    passed: boolean | undefined
  ): DiagnosisRecommendation[] {
    const recommendations: DiagnosisRecommendation[] = [];

    // Check for stuck on specific gate
    for (const failure of gateFailures) {
      if (failure.attemptCount > 3) {
        recommendations.push({
          type: 'error',
          category:
            failure.gate === 'G1_COMPILE'
              ? 'compilation'
              : failure.gate === 'G2_CORRECT'
                ? 'testing'
                : 'verification',
          message: `Story stuck on ${failure.gate} - ${String(failure.attemptCount)} attempts`,
          details:
            failure.failedLines.length > 0
              ? `Check errors in: ${failure.failedLines.slice(0, 3).map(l => `${l.file}:${String(l.line)}`).join(', ')}`
              : 'Review error messages for details',
        });
      }
    }

    // Check for high iteration count
    if (iterationCount > 10) {
      recommendations.push({
        type: 'warning',
        category: 'efficiency',
        message: `High iteration count (${String(iterationCount)}) - story may be too complex`,
        details:
          'Consider breaking this story into smaller, more focused stories',
      });
    }

    // Check for high token usage
    if (tokensSpent > 50000) {
      recommendations.push({
        type: 'warning',
        category: 'efficiency',
        message: `High token usage (${tokensSpent.toLocaleString()}) - expensive story`,
        details: 'Review if story scope can be reduced or approach simplified',
      });
    }

    // Check for incomplete story
    if (!completed) {
      recommendations.push({
        type: 'info',
        category: 'progress',
        message: 'Story is still in progress',
        details:
          gateFailures.length > 0
            ? `Currently blocked on: ${gateFailures.map(f => f.gate).join(', ')}`
            : 'Continue working through iterations',
      });
    }

    // Check for completed but failed
    if (completed && passed === false) {
      recommendations.push({
        type: 'error',
        category: 'verification',
        message: 'Story completed but did not pass all gates',
        details:
          gateFailures.length > 0
            ? `Failed gates: ${gateFailures.map(f => f.gate).join(', ')}`
            : 'Review gate thresholds and requirements',
      });
    }

    // Success case
    if (completed && passed === true) {
      if (iterationCount <= 3 && tokensSpent < 10000) {
        recommendations.push({
          type: 'info',
          category: 'efficiency',
          message: '✓ Efficient story completion',
          details: 'Low iterations and token usage - well-scoped story',
        });
      }
    }

    return recommendations;
  }
}
