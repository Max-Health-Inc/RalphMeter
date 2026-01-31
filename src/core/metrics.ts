/**
 * Metrics Calculator for RalphMeter
 *
 * Computes the headline efficiency metrics for AI code synthesis.
 * The key insight: Synth (tokens per LOC) is the physical unit for AI energy.
 */

import { type Result, ok, err } from '../shared/result.js';
import { type EventCollector, type SessionMetrics } from './collector.js';
import { type GateTracker, type SessionGateStats } from './gates.js';
import { type LOCCounter, type CodebaseSnapshot, type LOCResult } from './loc.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Computed metrics for a session
 */
export interface ComputedMetrics {
  /** Total verified lines of code (passed all applicable gates) */
  verifiedLOC: number;
  /** Total lines of code in the codebase */
  totalLOC: number;
  /** Verification rate: verifiedLOC / totalLOC (0-1) */
  verificationRate: number;
  /** Lines of code per minute */
  locPerMinute: number;
  /** Verified lines of code per minute */
  vlocPerMinute: number;
  /** Tokens per LOC (Synth): Cumulative tokens / Current LOC */
  tokensPerLOC: number;
  /** PoE-LOC: Probability of error per line of code */
  poeLOC: number;
  /** Total session duration in minutes */
  totalMinutes: number;
  /** Total tokens consumed (in + out) */
  totalTokens: number;
  /** Code lines only (excludes comments and blanks) */
  codeLines: number;
  /** Comment lines */
  commentLines: number;
  /** Blank lines */
  blankLines: number;
}

/**
 * Synth trend data point
 */
export interface SynthTrendPoint {
  /** Story ID that triggered this measurement */
  storyId: string;
  /** Timestamp of measurement */
  timestamp: string;
  /** Cumulative tokens at this point */
  cumulativeTokens: number;
  /** LOC at this point */
  loc: number;
  /** Synth value at this point (tokens / LOC) */
  synth: number;
  /** Delta from previous measurement */
  synthDelta: number;
  /** Tokens spent on this story */
  tokensSpent: number;
  /** Lines added in this story */
  linesAdded: number;
  /** Lines deleted in this story */
  linesDeleted: number;
  /** Net delta (linesAdded - linesDeleted) */
  netDelta: number;
  /** Story-specific Synth (tokensSpent / linesAdded), undefined if no lines added */
  storySynth?: number;
}

/**
 * Full metrics report including trends
 */
export interface MetricsReport {
  /** Computed metrics */
  metrics: ComputedMetrics;
  /** Synth trend over time */
  synthTrend: SynthTrendPoint[];
  /** LOC breakdown by category */
  locBreakdown: LOCResult;
  /** Gate statistics */
  gateStats: SessionGateStats | null;
  /** Session basic metrics */
  sessionMetrics: SessionMetrics | null;
}

/**
 * Error types for metrics operations
 */
export interface MetricsError {
  code: 'SESSION_NOT_FOUND' | 'NO_LOC_DATA' | 'CALCULATION_ERROR';
  message: string;
  details?: unknown;
}

// ============================================================================
// MetricsCalculator Class
// ============================================================================

/**
 * Calculates efficiency metrics for AI code synthesis sessions.
 *
 * The key metric is Synth (tokens per LOC), which represents the
 * "energy cost" of synthesizing code.
 */
export class MetricsCalculator {
  /** Synth trend history per session */
  private synthTrends = new Map<string, SynthTrendPoint[]>();

  constructor(
    private readonly collector: EventCollector,
    private readonly gateTracker: GateTracker,
    private readonly locCounter: LOCCounter
  ) {}

  /**
   * Calculates metrics for a session using a codebase snapshot
   *
   * @param sessionId - The session to calculate metrics for
   * @param codebaseSnapshot - Current codebase LOC snapshot
   * @returns Computed metrics or error
   */
  calculate(
    sessionId: string,
    codebaseSnapshot: CodebaseSnapshot
  ): Result<ComputedMetrics, MetricsError> {
    // Get session metrics from collector
    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const session = sessionResult.value;
    const metricsResult = this.collector.getMetrics(sessionId);
    if (!metricsResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Cannot get metrics for session: ${sessionId}`,
      });
    }

    const sessionMetrics = metricsResult.value;

    // Get gate stats
    const gateStatsResult = this.gateTracker.getSessionStats(sessionId);
    let verifiedLOC = 0;
    let overallPoE = 0;

    if (gateStatsResult.ok) {
      verifiedLOC = gateStatsResult.value.verifiedLines;
      overallPoE = gateStatsResult.value.overallPoE;
    }

    // Calculate LOC metrics from snapshot
    const totalLOC = codebaseSnapshot.totals.total;
    const codeLines = codebaseSnapshot.totals.code;
    const commentLines = codebaseSnapshot.totals.comments;
    const blankLines = codebaseSnapshot.totals.blank;

    if (totalLOC === 0) {
      return err({
        code: 'NO_LOC_DATA',
        message: 'No lines of code in codebase snapshot',
      });
    }

    // Calculate verification rate
    const verificationRate = totalLOC > 0 ? verifiedLOC / totalLOC : 0;

    // Calculate time metrics
    const totalMinutes = this.calculateSessionDuration(
      session.metadata.startedAt,
      session.metadata.endedAt
    );

    // Calculate rates
    const locPerMinute = totalMinutes > 0 ? totalLOC / totalMinutes : 0;
    const vlocPerMinute = totalMinutes > 0 ? verifiedLOC / totalMinutes : 0;

    // Calculate token metrics
    const totalTokens =
      sessionMetrics.totalTokensIn + sessionMetrics.totalTokensOut;

    // Synth: Cumulative Tokens / Current LOC
    const tokensPerLOC = totalLOC > 0 ? totalTokens / totalLOC : 0;

    // PoE-LOC: overall probability of error
    const poeLOC = overallPoE;

    return ok({
      verifiedLOC,
      totalLOC,
      verificationRate,
      locPerMinute,
      vlocPerMinute,
      tokensPerLOC,
      poeLOC,
      totalMinutes,
      totalTokens,
      codeLines,
      commentLines,
      blankLines,
    });
  }

  /**
   * Records a Synth measurement after a story completes.
   * Call this after each story to track Synth trends.
   *
   * @param sessionId - The session ID
   * @param storyId - The completed story ID
   * @param codebaseSnapshot - Current codebase snapshot
   * @returns The recorded trend point or error
   */
  recordSynthMeasurement(
    sessionId: string,
    storyId: string,
    codebaseSnapshot: CodebaseSnapshot
  ): Result<SynthTrendPoint, MetricsError> {
    const metricsResult = this.collector.getMetrics(sessionId);
    if (!metricsResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const sessionMetrics = metricsResult.value;
    const totalTokens =
      sessionMetrics.totalTokensIn + sessionMetrics.totalTokensOut;
    const loc = codebaseSnapshot.totals.total;

    if (loc === 0) {
      return err({
        code: 'NO_LOC_DATA',
        message: 'No lines of code in codebase snapshot',
      });
    }

    const synth = totalTokens / loc;

    // Get previous measurements
    const existing = this.synthTrends.get(sessionId) ?? [];
    const previous = existing.length > 0 ? existing[existing.length - 1] : null;
    const previousSynth = previous?.synth ?? 0;
    const synthDelta = synth - previousSynth;

    // Calculate per-story deltas
    const previousTokens = previous?.cumulativeTokens ?? 0;
    const previousLoc = previous?.loc ?? 0;
    
    const tokensSpent = totalTokens - previousTokens;
    const linesAdded = loc > previousLoc ? loc - previousLoc : 0;
    const linesDeleted = loc < previousLoc ? previousLoc - loc : 0;
    const netDelta = linesAdded - linesDeleted;
    
    // Calculate storySynth only if lines were added
    const storySynth = linesAdded > 0 ? tokensSpent / linesAdded : undefined;

    const point: SynthTrendPoint = {
      storyId,
      timestamp: new Date().toISOString(),
      cumulativeTokens: totalTokens,
      loc,
      synth,
      synthDelta,
      tokensSpent,
      linesAdded,
      linesDeleted,
      netDelta,
      ...(storySynth !== undefined && { storySynth }),
    };

    // Store the measurement
    if (existing.length > 0) {
      existing.push(point);
    } else {
      this.synthTrends.set(sessionId, [point]);
    }

    return ok(point);
  }

  /**
   * Gets the Synth trend history for a session
   *
   * @param sessionId - The session ID
   * @returns Array of trend points or empty array if none
   */
  getSynthTrend(sessionId: string): SynthTrendPoint[] {
    return this.synthTrends.get(sessionId) ?? [];
  }

  /**
   * Generates a full metrics report for a session
   *
   * @param sessionId - The session ID
   * @param codebaseSnapshot - Current codebase snapshot
   * @returns Full metrics report or error
   */
  getReport(
    sessionId: string,
    codebaseSnapshot: CodebaseSnapshot
  ): Result<MetricsReport, MetricsError> {
    const metricsResult = this.calculate(sessionId, codebaseSnapshot);
    if (!metricsResult.ok) {
      return metricsResult;
    }

    const metrics = metricsResult.value;
    const synthTrend = this.getSynthTrend(sessionId);

    // Get gate stats (may not exist)
    const gateStatsResult = this.gateTracker.getSessionStats(sessionId);
    const gateStats = gateStatsResult.ok ? gateStatsResult.value : null;

    // Get session metrics (may not exist)
    const sessionMetricsResult = this.collector.getMetrics(sessionId);
    const sessionMetrics = sessionMetricsResult.ok
      ? sessionMetricsResult.value
      : null;

    return ok({
      metrics,
      synthTrend,
      locBreakdown: codebaseSnapshot.totals,
      gateStats,
      sessionMetrics,
    });
  }

  /**
   * Formats a human-readable metrics report
   *
   * @param sessionId - The session ID
   * @param codebaseSnapshot - Current codebase snapshot
   * @returns Formatted report string or error
   */
  formatReport(
    sessionId: string,
    codebaseSnapshot: CodebaseSnapshot
  ): Result<string, MetricsError> {
    const reportResult = this.getReport(sessionId, codebaseSnapshot);
    if (!reportResult.ok) {
      return reportResult;
    }

    const report = reportResult.value;
    const m = report.metrics;
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('                  RALPHMETER METRICS REPORT                  ');
    lines.push('═'.repeat(60));
    lines.push('');

    // Headline metrics
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ HEADLINE METRICS                                            │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push(
      `│ Synth (Tokens/LOC):     ${this.formatNumber(m.tokensPerLOC, 2).padStart(12)}                     │`
    );
    lines.push(
      `│ Verified LOC:           ${String(m.verifiedLOC).padStart(12)} / ${String(m.totalLOC).padEnd(12)}     │`
    );
    lines.push(
      `│ Verification Rate:      ${this.formatPercent(m.verificationRate).padStart(12)}                     │`
    );
    lines.push(
      `│ PoE-LOC:                ${this.formatPercent(m.poeLOC).padStart(12)}                     │`
    );
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Time metrics
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ EFFICIENCY METRICS                                          │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push(
      `│ Total Duration:         ${this.formatDuration(m.totalMinutes).padStart(12)}                     │`
    );
    lines.push(
      `│ LOC / Minute:           ${this.formatNumber(m.locPerMinute, 2).padStart(12)}                     │`
    );
    lines.push(
      `│ vLOC / Minute:          ${this.formatNumber(m.vlocPerMinute, 2).padStart(12)}                     │`
    );
    lines.push(
      `│ Total Tokens:           ${this.formatNumber(m.totalTokens, 0).padStart(12)}                     │`
    );
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // LOC breakdown
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ LOC BREAKDOWN                                               │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push(
      `│ Total Lines:            ${String(m.totalLOC).padStart(12)}                     │`
    );
    lines.push(
      `│ Code Lines:             ${String(m.codeLines).padStart(12)}                     │`
    );
    lines.push(
      `│ Comment Lines:          ${String(m.commentLines).padStart(12)}                     │`
    );
    lines.push(
      `│ Blank Lines:            ${String(m.blankLines).padStart(12)}                     │`
    );
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Gate stats if available
    if (report.gateStats !== null) {
      const gs = report.gateStats;
      lines.push('┌─────────────────────────────────────────────────────────────┐');
      lines.push('│ GATE VERIFICATION                                           │');
      lines.push('├─────────────────────────────────────────────────────────────┤');
      lines.push(
        `│ G1 (Compile):  ${String(gs.perGate.G1_COMPILE.linesPassed).padStart(6)}/${String(gs.perGate.G1_COMPILE.linesChecked).padEnd(6)} (${this.formatPercent(gs.perGate.G1_COMPILE.passRate).padStart(7)})          │`
      );
      lines.push(
        `│ G2 (Correct):  ${String(gs.perGate.G2_CORRECT.linesPassed).padStart(6)}/${String(gs.perGate.G2_CORRECT.linesChecked).padEnd(6)} (${this.formatPercent(gs.perGate.G2_CORRECT.passRate).padStart(7)})          │`
      );
      lines.push(
        `│ G3 (Reach):    ${String(gs.perGate.G3_REACHABLE.linesPassed).padStart(6)}/${String(gs.perGate.G3_REACHABLE.linesChecked).padEnd(6)} (${this.formatPercent(gs.perGate.G3_REACHABLE.passRate).padStart(7)})          │`
      );
      lines.push('├─────────────────────────────────────────────────────────────┤');
      lines.push(
        `│ Overall PoE:            ${this.formatPercent(gs.overallPoE).padStart(12)}                     │`
      );
      lines.push('└─────────────────────────────────────────────────────────────┘');
      lines.push('');
    }

    // Synth trend if available
    if (report.synthTrend.length > 0) {
      lines.push('┌─────────────────────────────────────────────────────────────┐');
      lines.push('│ SYNTH TREND                                                 │');
      lines.push('├─────────────────────────────────────────────────────────────┤');

      for (const point of report.synthTrend) {
        const delta =
          point.synthDelta >= 0
            ? `+${this.formatNumber(point.synthDelta, 2)}`
            : this.formatNumber(point.synthDelta, 2);
        lines.push(
          `│ ${point.storyId.padEnd(12)} Synth: ${this.formatNumber(point.synth, 2).padStart(8)} (${delta.padStart(8)})       │`
        );
        
        // Show per-story details
        const netSign = point.netDelta >= 0 ? '+' : '';
        const storySynthStr = point.storySynth !== undefined 
          ? this.formatNumber(point.storySynth, 1)
          : 'N/A';
        lines.push(
          `│   Tokens: ${String(point.tokensSpent).padStart(6)}  LOC: ${netSign}${String(point.netDelta).padStart(4)} (${String(point.linesAdded).padStart(3)}+/${String(point.linesDeleted).padStart(3)}-) S: ${storySynthStr.padStart(6)}  │`
        );
      }

      lines.push('└─────────────────────────────────────────────────────────────┘');
      lines.push('');
    }

    // Session metrics if available
    if (report.sessionMetrics !== null) {
      const sm = report.sessionMetrics;
      lines.push('┌─────────────────────────────────────────────────────────────┐');
      lines.push('│ SESSION METRICS                                             │');
      lines.push('├─────────────────────────────────────────────────────────────┤');
      lines.push(
        `│ Iterations:             ${String(sm.totalIterations).padStart(12)}                     │`
      );
      lines.push(
        `│ Compilations:           ${String(sm.compilationSuccesses).padStart(12)} / ${String(sm.compilationAttempts).padEnd(12)}   │`
      );
      lines.push(
        `│ Test Runs:              ${String(sm.testSuccesses).padStart(12)} / ${String(sm.testAttempts).padEnd(12)}   │`
      );
      lines.push(
        `│ Stories:                ${String(sm.storiesPassed).padStart(12)} / ${String(sm.storiesCompleted).padEnd(12)}   │`
      );
      lines.push('└─────────────────────────────────────────────────────────────┘');
    }

    lines.push('');
    lines.push('═'.repeat(60));

    return ok(lines.join('\n'));
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculates session duration in minutes
   */
  private calculateSessionDuration(
    startedAt: string,
    endedAt?: string
  ): number {
    const start = new Date(startedAt).getTime();
    const end = endedAt !== undefined ? new Date(endedAt).getTime() : Date.now();
    const durationMs = end - start;
    return durationMs / (1000 * 60);
  }

  /**
   * Formats a number with specified decimal places
   */
  private formatNumber(value: number, decimals: number): string {
    return value.toFixed(decimals);
  }

  /**
   * Formats a rate as a percentage string
   */
  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  /**
   * Formats duration in minutes as human-readable string
   */
  private formatDuration(minutes: number): string {
    if (minutes < 1) {
      return `${String(Math.round(minutes * 60))}s`;
    }
    if (minutes < 60) {
      return `${minutes.toFixed(1)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${String(hours)}h ${String(mins)}m`;
  }
}
