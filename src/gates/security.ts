/**
 * Security Gate - SAST integration stub
 *
 * This quality gate would integrate with security scanning tools
 * like Semgrep or Snyk to detect security vulnerabilities.
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
// Security Gate Implementation
// ============================================================================

/**
 * Gate that performs security scanning (stub implementation)
 */
export class SecurityGate implements Gate {
  id = 'security';
  name = 'Security SAST Check';
  category = 'quality' as const;
  description = 'Static application security testing integration';

  /**
   * Applies to all projects
   */
  appliesWhen(_projectMeta: ProjectMeta): boolean {
    return true;
  }

  /**
   * Performs security scanning
   * This is a stub - production would integrate with Semgrep, Snyk, etc.
   */
  async check(
    artifact: GateArtifact,
    config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    const enabled = config?.['enabled'] === true;

    if (!enabled) {
      return ok({
        pass: true,
        score: 100,
        findings: [],
        metadata: {
          note: 'Security scanning not enabled. Set config.enabled = true to enable.',
        },
      });
    }

    // Stub implementation - would call external SAST tool here
    // For now, we do simple pattern matching for common issues
    const findings: GateFinding[] = [];

    if (artifact.type === 'file' && artifact.content !== undefined) {
      const content = artifact.content;

      // Check for eval usage
      if (/\beval\s*\(/g.test(content)) {
        findings.push({
          severity: 'error',
          filePath: artifact.filePath ?? 'unknown',
          message: 'Dangerous use of eval() detected',
          ruleId: 'no-eval',
        });
      }

      // Check for hardcoded credentials (simple pattern)
      if (
        /password\s*=\s*['"][^'"]+['"]/gi.test(content) ||
        /api[_-]?key\s*=\s*['"][^'"]+['"]/gi.test(content)
      ) {
        findings.push({
          severity: 'error',
          filePath: artifact.filePath ?? 'unknown',
          message: 'Possible hardcoded credential detected',
          ruleId: 'no-hardcoded-credentials',
        });
      }
    }

    const pass = findings.length === 0;
    const score = pass ? 100 : Math.max(0, 100 - findings.length * 20);

    return ok({
      pass,
      score,
      findings,
      metadata: {
        note: 'This is a stub implementation. Production should integrate with Semgrep, Snyk, or similar SAST tools.',
        checked: artifact.type === 'file',
      },
    });
  }
}
