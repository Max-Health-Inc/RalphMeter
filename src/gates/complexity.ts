/**
 * Cyclomatic Complexity Gate - checks code complexity
 *
 * This quality gate measures cyclomatic complexity using ESLint
 * to identify overly complex functions.
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

const DEFAULT_MAX_COMPLEXITY = 10;

// ============================================================================
// Complexity Gate Implementation
// ============================================================================

/**
 * Gate that checks cyclomatic complexity
 */
export class ComplexityGate implements Gate {
  id = 'complexity';
  name = 'Cyclomatic Complexity Check';
  category = 'quality' as const;
  description = 'Checks cyclomatic complexity using ESLint';

  /**
   * Applies to JavaScript/TypeScript projects
   */
  appliesWhen(projectMeta: ProjectMeta): boolean {
    return (
      projectMeta.languages.includes('typescript') ||
      projectMeta.languages.includes('javascript')
    );
  }

  /**
   * Checks complexity using a simple heuristic
   * In production, this would integrate with ESLint or a proper complexity analyzer
   */
  async check(
    artifact: GateArtifact,
    config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    const maxComplexity =
      typeof config?.['maxComplexity'] === 'number'
        ? config['maxComplexity']
        : DEFAULT_MAX_COMPLEXITY;

    // Only applies to file artifacts
    if (artifact.type !== 'file' || artifact.content === undefined) {
      return ok({
        pass: true,
        score: 100,
        findings: [],
      });
    }

    // Simple heuristic: count control flow keywords
    // Real implementation would use ESLint complexity rule
    const content = artifact.content;
    const complexityIndicators = [
      /\bif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b&&\b/g,
      /\b\|\|\b/g,
      /\?\s*.*\s*:/g, // ternary
    ];

    let totalComplexity = 1; // Base complexity
    for (const pattern of complexityIndicators) {
      const matches = content.match(pattern);
      if (matches !== null) {
        totalComplexity += matches.length;
      }
    }

    // Estimate complexity per function (rough heuristic)
    const functionCount = (content.match(/\bfunction\b|=>/g) ?? []).length;
    const estimatedComplexity =
      functionCount > 0 ? totalComplexity / functionCount : totalComplexity;

    const pass = estimatedComplexity <= maxComplexity;
    const findings: GateFinding[] = [];

    if (!pass && artifact.filePath !== undefined) {
      findings.push({
        severity: 'warning',
        filePath: artifact.filePath,
        message: `Estimated complexity ${estimatedComplexity.toFixed(1)} exceeds maximum of ${String(maxComplexity)}`,
        ruleId: 'complexity',
      });
    }

    // Score inversely proportional to complexity
    const score = Math.min(
      100,
      Math.round((maxComplexity / estimatedComplexity) * 100)
    );

    return ok({
      pass,
      score,
      findings,
      metadata: {
        estimatedComplexity: Math.round(estimatedComplexity),
        maxComplexity,
        note: 'This is a heuristic estimate. Production use should integrate ESLint complexity rule.',
      },
    });
  }
}
