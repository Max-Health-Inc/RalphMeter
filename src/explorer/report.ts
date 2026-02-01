/**
 * Reachability Report for RalphMeter
 *
 * Generates comprehensive G3 reachability reports from AI exploration.
 * Combines coverage data with barrier detection to categorize code by reachability.
 * Provides actionable recommendations for improving verification coverage.
 */

import { type Line, type CoverageData } from './coverage.js';
import { type BarrierAnalysis } from './barriers.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Reachability category for a line of code
 */
export type ReachabilityCategory =
  | 'exercised' // G3 PASS - line was executed
  | 'authGated' // G3 UNKNOWN - behind 401 auth barrier
  | 'permissionGated' // G3 UNKNOWN - behind 403 permission barrier
  | 'paywallGated' // G3 UNKNOWN - behind 402 paywall
  | 'unreached'; // G3 FAIL - not executed and no barrier

/**
 * Categorized lines by reachability
 */
export interface CategorizedLines {
  /** Lines that were exercised during exploration (G3 PASS) */
  exercised: Line[];
  /** Lines behind authentication barriers (G3 UNKNOWN) */
  authGated: Line[];
  /** Lines behind permission barriers (G3 UNKNOWN) */
  permissionGated: Line[];
  /** Lines behind payment barriers (G3 UNKNOWN) */
  paywallGated: Line[];
  /** Lines that were not reached and have no barriers (G3 FAIL) */
  unreached: Line[];
}

/**
 * Statistics about reachability percentages
 */
export interface ReachabilityStats {
  /** Total lines analyzed */
  total: number;
  /** Number of exercised lines */
  exercisedCount: number;
  /** Percentage of lines exercised (0-100) */
  exercisedPercent: number;
  /** Number of auth-gated lines */
  authGatedCount: number;
  /** Percentage of lines behind auth barriers (0-100) */
  authGatedPercent: number;
  /** Number of permission-gated lines */
  permissionGatedCount: number;
  /** Percentage of lines behind permission barriers (0-100) */
  permissionGatedPercent: number;
  /** Number of paywall-gated lines */
  paywallGatedCount: number;
  /** Percentage of lines behind paywall barriers (0-100) */
  paywallGatedPercent: number;
  /** Number of unreached lines */
  unreachedCount: number;
  /** Percentage of lines not reached (0-100) */
  unreachedPercent: number;
}

/**
 * Recommendation types
 */
export type RecommendationType = 'success' | 'info' | 'warning' | 'action';

/**
 * An actionable recommendation
 */
export interface ReachabilityRecommendation {
  /** Type of recommendation */
  type: RecommendationType;
  /** Recommendation message */
  message: string;
  /** Optional additional details */
  details?: string;
}

/**
 * Complete reachability report
 */
export interface ReachabilityReportData {
  /** Categorized lines */
  categories: CategorizedLines;
  /** Reachability statistics */
  stats: ReachabilityStats;
  /** Actionable recommendations */
  recommendations: ReachabilityRecommendation[];
  /** Timestamp of report generation */
  generatedAt: string;
}

// ============================================================================
// ReachabilityReport
// ============================================================================

/**
 * Generates comprehensive reachability reports from coverage and barrier data
 */
export class ReachabilityReport {
  /**
   * Generate a reachability report from coverage and barrier data
   *
   * @param coverage - Coverage data from instrumented exploration
   * @param barriers - Barrier analysis from exploration
   * @returns Complete reachability report
   */
  generate(
    coverage: CoverageData,
    barriers: BarrierAnalysis
  ): ReachabilityReportData {
    // Categorize lines
    const categories = this.categorizeLines(coverage, barriers);

    // Calculate statistics
    const stats = this.calculateStats(categories);

    // Generate recommendations
    const recommendations = this.generateRecommendations(stats, categories);

    return {
      categories,
      stats,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Categorize lines by reachability status
   *
   * @param coverage - Coverage data
   * @param barriers - Barrier analysis
   * @returns Categorized lines
   */
  private categorizeLines(
    coverage: CoverageData,
    barriers: BarrierAnalysis
  ): CategorizedLines {
    // Lines that were exercised are G3 PASS
    const exercised = [...coverage.executed];

    // Create a set of file:line keys for barrier lookups
    const authGatedKeys = new Set(
      barriers.authGated.map((l) => `${l.filePath}:${l.lineNumber}`)
    );
    const permissionGatedKeys = new Set(
      barriers.permissionGated.map((l) => `${l.filePath}:${l.lineNumber}`)
    );
    const paywallGatedKeys = new Set(
      barriers.paywallGated.map((l) => `${l.filePath}:${l.lineNumber}`)
    );

    // Lines that were not executed need further categorization
    const authGated: Line[] = [];
    const permissionGated: Line[] = [];
    const paywallGated: Line[] = [];
    const unreached: Line[] = [];

    for (const line of coverage.notExecuted) {
      const key = `${line.filePath}:${line.lineNumber}`;

      if (authGatedKeys.has(key)) {
        authGated.push(line);
      } else if (permissionGatedKeys.has(key)) {
        permissionGated.push(line);
      } else if (paywallGatedKeys.has(key)) {
        paywallGated.push(line);
      } else {
        unreached.push(line);
      }
    }

    return {
      exercised,
      authGated,
      permissionGated,
      paywallGated,
      unreached,
    };
  }

  /**
   * Calculate reachability statistics
   *
   * @param categories - Categorized lines
   * @returns Statistics
   */
  private calculateStats(categories: CategorizedLines): ReachabilityStats {
    const total =
      categories.exercised.length +
      categories.authGated.length +
      categories.permissionGated.length +
      categories.paywallGated.length +
      categories.unreached.length;

    // Avoid division by zero
    const safePercent = (count: number): number => {
      return total === 0 ? 0 : (count / total) * 100;
    };

    return {
      total,
      exercisedCount: categories.exercised.length,
      exercisedPercent: safePercent(categories.exercised.length),
      authGatedCount: categories.authGated.length,
      authGatedPercent: safePercent(categories.authGated.length),
      permissionGatedCount: categories.permissionGated.length,
      permissionGatedPercent: safePercent(categories.permissionGated.length),
      paywallGatedCount: categories.paywallGated.length,
      paywallGatedPercent: safePercent(categories.paywallGated.length),
      unreachedCount: categories.unreached.length,
      unreachedPercent: safePercent(categories.unreached.length),
    };
  }

  /**
   * Generate actionable recommendations based on reachability analysis
   *
   * @param stats - Reachability statistics
   * @param categories - Categorized lines
   * @returns Array of recommendations
   */
  private generateRecommendations(
    stats: ReachabilityStats,
    categories: CategorizedLines
  ): ReachabilityRecommendation[] {
    const recommendations: ReachabilityRecommendation[] = [];

    // Success case: High reachability
    if (stats.exercisedPercent >= 80) {
      recommendations.push({
        type: 'success',
        message: `Excellent reachability: ${stats.exercisedPercent.toFixed(1)}% of code is verified as reachable.`,
      });
    } else if (stats.exercisedPercent >= 60) {
      recommendations.push({
        type: 'info',
        message: `Good reachability: ${stats.exercisedPercent.toFixed(1)}% of code is verified as reachable.`,
      });
    } else {
      recommendations.push({
        type: 'warning',
        message: `Low reachability: Only ${stats.exercisedPercent.toFixed(1)}% of code is verified as reachable.`,
      });
    }

    // Auth-gated code
    if (stats.authGatedCount > 0) {
      recommendations.push({
        type: 'action',
        message: `Provide authentication credentials to verify ${stats.authGatedCount} additional lines (${stats.authGatedPercent.toFixed(1)}%).`,
        details: `Use authenticated exploration mode to reach code behind 401 barriers.`,
      });
    }

    // Permission-gated code
    if (stats.permissionGatedCount > 0) {
      recommendations.push({
        type: 'action',
        message: `Provide privileged credentials to verify ${stats.permissionGatedCount} additional lines (${stats.permissionGatedPercent.toFixed(1)}%).`,
        details: `Use privileged exploration mode to reach code behind 403 barriers.`,
      });
    }

    // Paywall-gated code
    if (stats.paywallGatedCount > 0) {
      recommendations.push({
        type: 'info',
        message: `${stats.paywallGatedCount} lines (${stats.paywallGatedPercent.toFixed(1)}%) are behind payment barriers.`,
        details: `Code behind 402 barriers requires payment or subscription to verify.`,
      });
    }

    // Unreached code (potentially dead code)
    if (stats.unreachedCount > 0) {
      const unreachedPercent = stats.unreachedPercent;
      if (unreachedPercent >= 20) {
        recommendations.push({
          type: 'warning',
          message: `${stats.unreachedCount} lines (${unreachedPercent.toFixed(1)}%) are unreachable - potential dead code.`,
          details: `Review these lines: they may be dead code, untested edge cases, or require specific inputs to reach.`,
        });
      } else if (unreachedPercent >= 10) {
        recommendations.push({
          type: 'info',
          message: `${stats.unreachedCount} lines (${unreachedPercent.toFixed(1)}%) were not reached during exploration.`,
          details: `Consider adding test cases or exploration scenarios to verify these code paths.`,
        });
      }
    }

    // No unreached code is excellent
    if (stats.unreachedCount === 0 && stats.total > 0) {
      recommendations.push({
        type: 'success',
        message: 'All non-gated code is reachable - no dead code detected.',
      });
    }

    return recommendations;
  }

  /**
   * Format a reachability report as human-readable text
   *
   * @param report - The report to format
   * @returns Formatted report string
   */
  formatReport(report: ReachabilityReportData): string {
    const lines: string[] = [];

    lines.push('╔═══════════════════════════════════════════════════════════╗');
    lines.push('║           G3 REACHABILITY REPORT                          ║');
    lines.push('╚═══════════════════════════════════════════════════════════╝');
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('-------');
    lines.push(`Total Lines Analyzed: ${report.stats.total}`);
    lines.push('');

    // Categories
    lines.push('REACHABILITY BREAKDOWN');
    lines.push('----------------------');
    lines.push(
      `✓ Exercised:         ${String(report.stats.exercisedCount).padStart(6)} lines (${report.stats.exercisedPercent.toFixed(1).padStart(5)}%) - G3 PASS`
    );
    lines.push(
      `? Auth Gated:        ${String(report.stats.authGatedCount).padStart(6)} lines (${report.stats.authGatedPercent.toFixed(1).padStart(5)}%) - G3 UNKNOWN`
    );
    lines.push(
      `? Permission Gated:  ${String(report.stats.permissionGatedCount).padStart(6)} lines (${report.stats.permissionGatedPercent.toFixed(1).padStart(5)}%) - G3 UNKNOWN`
    );
    lines.push(
      `? Paywall Gated:     ${String(report.stats.paywallGatedCount).padStart(6)} lines (${report.stats.paywallGatedPercent.toFixed(1).padStart(5)}%) - G3 UNKNOWN`
    );
    lines.push(
      `✗ Unreached:         ${String(report.stats.unreachedCount).padStart(6)} lines (${report.stats.unreachedPercent.toFixed(1).padStart(5)}%) - G3 FAIL`
    );
    lines.push('');

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('RECOMMENDATIONS');
      lines.push('---------------');
      for (const rec of report.recommendations) {
        const icon =
          rec.type === 'success'
            ? '✓'
            : rec.type === 'warning'
              ? '⚠'
              : rec.type === 'action'
                ? '→'
                : 'ℹ';
        lines.push(`${icon} ${rec.message}`);
        if (rec.details !== undefined) {
          lines.push(`  ${rec.details}`);
        }
      }
      lines.push('');
    }

    lines.push(`Generated: ${report.generatedAt}`);

    return lines.join('\n');
  }
}
