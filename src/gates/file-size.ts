/**
 * File Size Gate - checks maximum LOC per file
 *
 * This quality gate ensures files don't exceed a maximum line count,
 * promoting maintainability and readability.
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

const DEFAULT_MAX_LINES = 500;

// ============================================================================
// File Size Gate Implementation
// ============================================================================

/**
 * Gate that checks file size doesn't exceed maximum lines
 */
export class FileSizeGate implements Gate {
  id = 'file-size';
  name = 'File Size Check';
  category = 'quality' as const;
  description = 'Ensures files do not exceed maximum LOC threshold';

  /**
   * Applies to all projects
   */
  appliesWhen(_projectMeta: ProjectMeta): boolean {
    return true;
  }

  /**
   * Checks file size against maximum threshold
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async check(
    artifact: GateArtifact,
    config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    const maxLines =
      typeof config?.['maxLines'] === 'number'
        ? config['maxLines']
        : DEFAULT_MAX_LINES;

    // Only applies to file artifacts
    if (artifact.type !== 'file' || artifact.content === undefined) {
      return ok({
        pass: true,
        score: 100,
        findings: [],
      });
    }

    const lines = artifact.content.split('\n');
    const lineCount = lines.length;
    const pass = lineCount <= maxLines;

    const findings: GateFinding[] = [];

    if (!pass && artifact.filePath !== undefined) {
      findings.push({
        severity: 'warning',
        filePath: artifact.filePath,
        message: `File has ${String(lineCount)} lines, exceeds maximum of ${String(maxLines)} lines`,
        ruleId: 'max-lines',
      });
    }

    // Score based on how far over/under the limit
    const score = Math.min(100, Math.round((maxLines / lineCount) * 100));

    return ok({
      pass,
      score,
      findings,
      metadata: {
        lineCount,
        maxLines,
      },
    });
  }
}
