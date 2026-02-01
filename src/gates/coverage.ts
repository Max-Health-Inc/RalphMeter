/**
 * Test Coverage Gate - checks test coverage threshold
 *
 * This quality gate ensures test coverage meets minimum thresholds.
 */

import { type Result, ok } from '../shared/result.js';
import {
  type Gate,
  type ProjectMeta,
  type GateArtifact,
  type GateResult,
  type GateFinding,
} from '../core/gate-plugin.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_MIN_COVERAGE = 80;

// ============================================================================
// Coverage Gate Implementation
// ============================================================================

/**
 * Gate that checks test coverage threshold
 */
export class CoverageGate implements Gate {
  id = 'coverage';
  name = 'Test Coverage Check';
  category = 'quality' as const;
  description = 'Ensures test coverage meets minimum threshold';

  /**
   * Applies to projects with tests
   */
  appliesWhen(projectMeta: ProjectMeta): boolean {
    return projectMeta.hasTests;
  }

  /**
   * Checks coverage against minimum threshold
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async check(
    artifact: GateArtifact,
    config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    const minCoverage =
      typeof config?.['minCoverage'] === 'number'
        ? config['minCoverage']
        : DEFAULT_MIN_COVERAGE;

    // Expects coverage data in artifact.data
    const coverageData = artifact.data?.['coverage'] as
      | { percentage: number; lines: { covered: number; total: number } }
      | undefined;

    if (coverageData === undefined) {
      // No coverage data provided - pass by default
      return ok({
        pass: true,
        score: 100,
        findings: [],
        metadata: {
          note: 'No coverage data provided',
        },
      });
    }

    const coverage = coverageData.percentage;
    const pass = coverage >= minCoverage;

    const findings: GateFinding[] = [];

    if (!pass && artifact.rootPath !== undefined) {
      findings.push({
        severity: 'error',
        filePath: artifact.rootPath,
        message: `Coverage ${coverage.toFixed(1)}% is below minimum ${String(minCoverage)}%`,
        ruleId: 'min-coverage',
      });
    }

    const score = Math.min(100, Math.round(coverage));

    return ok({
      pass,
      score,
      findings,
      metadata: {
        coverage,
        minCoverage,
        lines: coverageData.lines,
      },
    });
  }
}
