/**
 * Benchmark Comparison Engine
 *
 * Compares session metrics against benchmark expectations to evaluate efficiency.
 */

import { type Result, ok, err } from '../shared/result.js';
import { loadBenchmark } from './loader.js';
import type { BenchmarkPRD, BenchmarkMetadata } from './types.js';
import type {
  EventCollector,
  SessionMetrics,
  Session,
} from '../core/collector.js';
import type { ComputedMetrics } from '../core/metrics.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Comparison result for a specific metric
 */
export interface MetricComparison {
  /** Name of the metric */
  metric: string;
  /** Expected value or range */
  expected: string;
  /** Actual value */
  actual: number;
  /** Whether actual is within expected range */
  withinRange: boolean;
  /** Variance from expected (positive = over, negative = under) */
  variance: number;
}

/**
 * Efficiency calculation result
 */
export interface EfficiencyScore {
  /** Overall efficiency ratio (1.0 = perfect match, > 1 = better, < 1 = worse) */
  ratio: number;
  /** Letter grade (A+, A, B, C, D, F) */
  grade: string;
  /** Whether the session passes benchmark criteria */
  pass: boolean;
}

/**
 * Actionable recommendations for improvement
 */
export interface Recommendation {
  /** Type of recommendation */
  type: 'success' | 'warning' | 'error';
  /** Recommendation message */
  message: string;
}

/**
 * Full comparison report
 */
export interface ComparisonReport {
  /** Session ID being compared */
  sessionId: string;
  /** Benchmark ID used for comparison */
  benchmarkId: string;
  /** Benchmark name */
  benchmarkName: string;
  /** Benchmark metadata */
  benchmarkMetadata: BenchmarkMetadata;
  /** LOC comparison */
  locComparison: MetricComparison;
  /** Iterations comparison */
  iterationsComparison: MetricComparison;
  /** Ralph (tokens per LOC) comparison if available */
  ralphComparison?: MetricComparison;
  /** Overall efficiency score */
  efficiencyScore: EfficiencyScore;
  /** List of recommendations */
  recommendations: Recommendation[];
  /** Timestamp of comparison */
  timestamp: string;
}

/**
 * Error types for comparison operations
 */
export interface ComparisonError {
  code:
    | 'SESSION_NOT_FOUND'
    | 'BENCHMARK_NOT_FOUND'
    | 'INVALID_DATA'
    | 'COMPARISON_ERROR';
  message: string;
  details?: unknown;
}

// ============================================================================
// BenchmarkComparison Class
// ============================================================================

/**
 * Compares actual session metrics against benchmark expectations.
 *
 * Provides efficiency ratios, pass/fail determination, and actionable
 * recommendations for improvement.
 */
export class BenchmarkComparison {
  constructor(private readonly collector: EventCollector) {}

  /**
   * Compares a session against a benchmark
   *
   * @param sessionId - The session to compare
   * @param benchmarkId - The benchmark to compare against
   * @param computedMetrics - Optional pre-computed metrics (if not provided, basic comparison only)
   * @returns Comparison report or error
   */
  compare(
    sessionId: string,
    benchmarkId: string,
    computedMetrics?: ComputedMetrics
  ): Result<ComparisonReport, ComparisonError> {
    // Load the benchmark
    const benchmarkResult = loadBenchmark(`${benchmarkId}.json`);
    if (!benchmarkResult.ok) {
      return err({
        code: 'BENCHMARK_NOT_FOUND',
        message: `Failed to load benchmark: ${benchmarkResult.error}`,
      });
    }

    const benchmark = benchmarkResult.value;

    // Get session data
    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const session = sessionResult.value;

    // Get session metrics
    const metricsResult = this.collector.getMetrics(sessionId);
    if (!metricsResult.ok) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `Cannot get metrics for session: ${sessionId}`,
      });
    }

    const sessionMetrics = metricsResult.value;

    // Build comparison report
    const report = this.buildReport(
      sessionId,
      benchmarkId,
      benchmark,
      session,
      sessionMetrics,
      computedMetrics
    );

    return ok(report);
  }

  /**
   * Generates a formatted comparison report as a string
   *
   * @param report - The comparison report
   * @returns Formatted report string
   */
  formatReport(report: ComparisonReport): string {
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('             BENCHMARK COMPARISON REPORT                ');
    lines.push('═'.repeat(60));
    lines.push('');

    // Header
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ BENCHMARK INFORMATION                                       │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push(
      `│ Benchmark:   ${report.benchmarkName.padEnd(47)}│`
    );
    lines.push(
      `│ Session:     ${report.sessionId.padEnd(47)}│`
    );
    lines.push(
      `│ Complexity:  ${String(report.benchmarkMetadata.complexityScore).padEnd(1)}/10                                             │`
    );
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Efficiency Score
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ EFFICIENCY SCORE                                            │');
    lines.push('├─────────────────────────────────────────────────────────────┤');
    lines.push(
      `│ Grade:       ${report.efficiencyScore.grade.padEnd(47)}│`
    );
    lines.push(
      `│ Ratio:       ${report.efficiencyScore.ratio.toFixed(2).padEnd(47)}│`
    );
    lines.push(
      `│ Result:      ${(report.efficiencyScore.pass ? '✓ PASS' : '✗ FAIL').padEnd(47)}│`
    );
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Metric Comparisons
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│ METRIC COMPARISONS                                          │');
    lines.push('├─────────────────────────────────────────────────────────────┤');

    const metrics = [
      report.locComparison,
      report.iterationsComparison,
      ...(report.ralphComparison !== undefined ? [report.ralphComparison] : []),
    ];

    for (const metric of metrics) {
      const status = metric.withinRange ? '✓' : '✗';
      const varianceSign = metric.variance >= 0 ? '+' : '';
      lines.push(
        `│ ${status} ${metric.metric.padEnd(20)} ${metric.actual.toString().padStart(8)}  (Expected: ${metric.expected.padEnd(12)})│`
      );
      lines.push(
        `│   Variance: ${varianceSign}${metric.variance.toFixed(1)}${metric.withinRange ? '' : ' ⚠️'}                                      │`
      );
    }

    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('┌─────────────────────────────────────────────────────────────┐');
      lines.push('│ RECOMMENDATIONS                                             │');
      lines.push('├─────────────────────────────────────────────────────────────┤');

      for (const rec of report.recommendations) {
        const icon =
          rec.type === 'success' ? '✓' : rec.type === 'warning' ? '⚠' : '✗';
        // Split message into chunks that fit within the box
        const maxLen = 55;
        const words = rec.message.split(' ');
        let currentLine = '';

        for (const word of words) {
          if ((currentLine + ' ' + word).length > maxLen) {
            lines.push(`│ ${icon} ${currentLine.padEnd(56)}│`);
            currentLine = '  ' + word;
          } else {
            currentLine = currentLine === '' ? word : currentLine + ' ' + word;
          }
        }

        if (currentLine !== '') {
          lines.push(`│ ${icon} ${currentLine.padEnd(56)}│`);
        }
      }

      lines.push('└─────────────────────────────────────────────────────────────┘');
      lines.push('');
    }

    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Builds a complete comparison report
   */
  private buildReport(
    sessionId: string,
    benchmarkId: string,
    benchmark: BenchmarkPRD,
    session: Session,
    sessionMetrics: SessionMetrics,
    computedMetrics?: ComputedMetrics
  ): ComparisonReport {
    // Calculate LOC comparison (use computedMetrics if available)
    const actualLOC = computedMetrics?.totalLOC ?? 0;
    const locComparison = this.compareMetric(
      'LOC',
      actualLOC,
      benchmark.metadata.expectedLOC.min,
      benchmark.metadata.expectedLOC.max
    );

    // Calculate iterations comparison
    const actualIterations = sessionMetrics.totalIterations;
    const iterationsComparison = this.compareMetric(
      'Iterations',
      actualIterations,
      benchmark.metadata.expectedIterations.min,
      benchmark.metadata.expectedIterations.max
    );

    // Calculate Ralph comparison if computedMetrics available
    let ralphComparison: MetricComparison | undefined;
    if (computedMetrics !== undefined) {
      const actualRalph = computedMetrics.tokensPerLOC;
      // For Ralph, lower is better, so we use a heuristic expected range
      // based on complexity: higher complexity = higher expected Ralph
      const expectedRalphMin = benchmark.metadata.complexityScore * 10;
      const expectedRalphMax = benchmark.metadata.complexityScore * 50;
      ralphComparison = this.compareMetric(
        'Ralph',
        actualRalph,
        expectedRalphMin,
        expectedRalphMax
      );
    }

    // Calculate efficiency score
    const efficiencyScore = this.calculateEfficiency(
      locComparison,
      iterationsComparison,
      ralphComparison
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      locComparison,
      iterationsComparison,
      ralphComparison,
      efficiencyScore,
      benchmark.metadata
    );

    return {
      sessionId,
      benchmarkId,
      benchmarkName: benchmark.project,
      benchmarkMetadata: benchmark.metadata,
      locComparison,
      iterationsComparison,
      ...(ralphComparison !== undefined && { ralphComparison }),
      efficiencyScore,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compares a metric against expected range
   */
  private compareMetric(
    metricName: string,
    actual: number,
    expectedMin: number,
    expectedMax: number
  ): MetricComparison {
    const withinRange = actual >= expectedMin && actual <= expectedMax;
    const expectedMid = (expectedMin + expectedMax) / 2;
    const variance = actual - expectedMid;

    return {
      metric: metricName,
      expected: `${String(expectedMin)}-${String(expectedMax)}`,
      actual,
      withinRange,
      variance,
    };
  }

  /**
   * Calculates overall efficiency score
   */
  private calculateEfficiency(
    locComparison: MetricComparison,
    iterationsComparison: MetricComparison,
    ralphComparison?: MetricComparison
  ): EfficiencyScore {
    // Count metrics within range
    let inRangeCount = 0;
    let totalCount = 2; // LOC and iterations always counted

    if (locComparison.withinRange) inRangeCount++;
    if (iterationsComparison.withinRange) inRangeCount++;

    if (ralphComparison !== undefined) {
      totalCount++;
      if (ralphComparison.withinRange) inRangeCount++;
    }

    // Calculate ratio (1.0 = all metrics in range)
    const ratio = totalCount > 0 ? inRangeCount / totalCount : 0;

    // Determine grade
    let grade: string;
    if (ratio >= 1.0) {
      grade = 'A+';
    } else if (ratio >= 0.85) {
      grade = 'A';
    } else if (ratio >= 0.7) {
      grade = 'B';
    } else if (ratio >= 0.5) {
      grade = 'C';
    } else if (ratio >= 0.3) {
      grade = 'D';
    } else {
      grade = 'F';
    }

    // Pass if ratio >= 0.7 (at least B grade)
    const pass = ratio >= 0.7;

    return { ratio, grade, pass };
  }

  /**
   * Generates actionable recommendations
   */
  private generateRecommendations(
    locComparison: MetricComparison,
    iterationsComparison: MetricComparison,
    ralphComparison: MetricComparison | undefined,
    efficiencyScore: EfficiencyScore,
    metadata: BenchmarkMetadata
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Overall performance
    if (efficiencyScore.pass) {
      recommendations.push({
        type: 'success',
        message: `Session meets benchmark criteria with ${efficiencyScore.grade} grade.`,
      });
    } else {
      recommendations.push({
        type: 'error',
        message: `Session does not meet benchmark criteria (${efficiencyScore.grade} grade).`,
      });
    }

    // LOC analysis
    if (!locComparison.withinRange) {
      if (locComparison.variance > 0) {
        recommendations.push({
          type: 'warning',
          message: `Code size is ${Math.abs(locComparison.variance).toFixed(0)} lines over expected. Consider refactoring for brevity.`,
        });
      } else {
        recommendations.push({
          type: 'warning',
          message: `Code size is ${Math.abs(locComparison.variance).toFixed(0)} lines under expected. May be missing functionality.`,
        });
      }
    } else {
      recommendations.push({
        type: 'success',
        message: 'Code size is within expected range.',
      });
    }

    // Iterations analysis
    if (!iterationsComparison.withinRange) {
      if (iterationsComparison.variance > 0) {
        recommendations.push({
          type: 'warning',
          message: `Took ${Math.abs(iterationsComparison.variance).toFixed(0)} more iterations than expected. Agent may need better context or instructions.`,
        });
      } else {
        recommendations.push({
          type: 'success',
          message: `Completed in fewer iterations than expected. Efficient execution.`,
        });
      }
    } else {
      recommendations.push({
        type: 'success',
        message: 'Iteration count is within expected range.',
      });
    }

    // Ralph analysis (if available)
    if (ralphComparison !== undefined) {
      if (!ralphComparison.withinRange) {
        if (ralphComparison.variance > 0) {
          recommendations.push({
            type: 'error',
            message: `Ralph (${ralphComparison.actual.toFixed(1)}) is higher than expected. High token cost per LOC suggests inefficiency.`,
          });
        } else {
          recommendations.push({
            type: 'success',
            message: `Ralph (${ralphComparison.actual.toFixed(1)}) is better than expected. Excellent token efficiency.`,
          });
        }
      } else {
        recommendations.push({
          type: 'success',
          message: `Ralph (${ralphComparison.actual.toFixed(1)}) is within expected range for complexity ${String(metadata.complexityScore)}.`,
        });
      }
    }

    return recommendations;
  }
}
