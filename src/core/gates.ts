/**
 * Gate Tracker for RalphMeter
 *
 * Implements the 3-gate verification model with line-level granularity.
 * - G1 (Compile): Verification via compiler errors pointing to specific lines
 * - G2 (Correct): Verification via test coverage mapping to lines
 * - G3 (Reachable): Verification via runtime coverage showing executed lines
 */

import { type Result, ok, err } from '../shared/result.js';

// ============================================================================
// Types
// ============================================================================

/**
 * The three verification gates
 */
export type CoreGate = 'G1_COMPILE' | 'G2_CORRECT' | 'G3_REACHABLE';

/**
 * All gate types as an array for iteration
 */
export const ALL_GATES: CoreGate[] = [
  'G1_COMPILE',
  'G2_CORRECT',
  'G3_REACHABLE',
];

/**
 * Identifies a specific line in a file
 */
export interface LineLocation {
  /** Path to the file */
  filePath: string;
  /** Line number (1-based) */
  lineNumber: number;
}

/**
 * Result of a single line check for a specific gate
 */
export interface LineCheckResult {
  /** The line location */
  location: LineLocation;
  /** The gate being checked */
  gate: CoreGate;
  /** Whether the line passed this gate */
  passed: boolean;
  /** Optional error message if failed */
  errorMessage?: string;
}

/**
 * Configuration for a single gate
 */
export interface GateConfig {
  /** Whether this gate is required for verification */
  required: boolean;
  /** Threshold for pass rate (0-1), lines passing rate must meet or exceed this */
  threshold: number;
  /** Whether to skip this gate entirely */
  skip: boolean;
}

/**
 * Configuration for all gates
 */
export interface CoreGateConfiguration {
  G1_COMPILE: GateConfig;
  G2_CORRECT: GateConfig;
  G3_REACHABLE: GateConfig;
}

/**
 * Statistics for a single gate
 */
export interface GateStats {
  /** Number of lines checked by this gate */
  linesChecked: number;
  /** Number of lines that passed this gate */
  linesPassed: number;
  /** Pass rate (linesPassed / linesChecked), or 1 if no lines checked */
  passRate: number;
  /** Probability of error (1 - passRate) */
  poe: number;
}

/**
 * Aggregated verification status for a line
 */
export interface LineVerificationStatus {
  /** The line location */
  location: LineLocation;
  /** Whether the line passed G1 (undefined if not checked) */
  g1Passed?: boolean;
  /** Whether the line passed G2 (undefined if not checked) */
  g2Passed?: boolean;
  /** Whether the line passed G3 (undefined if not checked) */
  g3Passed?: boolean;
  /** Whether the line is fully verified (passes ALL applicable gates) */
  verified: boolean;
}

/**
 * Overall session statistics
 */
export interface SessionGateStats {
  /** Stats per gate */
  perGate: Record<CoreGate, GateStats>;
  /** Total unique lines checked across all gates */
  totalLinesChecked: number;
  /** Lines that passed ALL applicable gates */
  verifiedLines: number;
  /** Overall probability of error: 1 - product(1 - PoE_i) */
  overallPoE: number;
}

/**
 * Verification result recorded for a session
 */
export interface GateVerificationResult {
  /** Session ID */
  sessionId: string;
  /** Timestamp of the recording */
  timestamp: string;
  /** The gate this result is for */
  gate: CoreGate;
  /** File path */
  filePath: string;
  /** Line results */
  lineResults: {
    lineNumber: number;
    passed: boolean;
    errorMessage?: string;
  }[];
}

/**
 * Error types for gate tracker operations
 */
export interface GateTrackerError {
  code: 'SESSION_NOT_FOUND' | 'INVALID_GATE' | 'INVALID_THRESHOLD';
  message: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default gate configuration - all gates required with 100% threshold
 */
export const DEFAULT_GATE_CONFIG: CoreGateConfiguration = {
  G1_COMPILE: { required: true, threshold: 1.0, skip: false },
  G2_CORRECT: { required: true, threshold: 1.0, skip: false },
  G3_REACHABLE: { required: true, threshold: 1.0, skip: false },
};

// ============================================================================
// GateTracker Class
// ============================================================================

/**
 * Tracks verification results across the 3-gate model at line level.
 */
export class GateTracker {
  /** Gate configuration */
  private config: CoreGateConfiguration;

  /** Stored results by session */
  private results = new Map<string, GateVerificationResult[]>();

  /**
   * Creates a new GateTracker with optional custom configuration
   */
  constructor(config?: Partial<CoreGateConfiguration>) {
    this.config = {
      G1_COMPILE: { ...DEFAULT_GATE_CONFIG.G1_COMPILE, ...config?.G1_COMPILE },
      G2_CORRECT: { ...DEFAULT_GATE_CONFIG.G2_CORRECT, ...config?.G2_CORRECT },
      G3_REACHABLE: {
        ...DEFAULT_GATE_CONFIG.G3_REACHABLE,
        ...config?.G3_REACHABLE,
      },
    };
  }

  /**
   * Records a verification result for a session
   *
   * @param sessionId - The session ID
   * @param result - The verification result to record
   */
  record(
    sessionId: string,
    result: Omit<GateVerificationResult, 'sessionId'>
  ): Result<GateVerificationResult, GateTrackerError> {
    // Validate gate
    if (!ALL_GATES.includes(result.gate)) {
      return err({
        code: 'INVALID_GATE',
        message: `Invalid gate: ${result.gate}`,
      });
    }

    const fullResult: GateVerificationResult = {
      ...result,
      sessionId,
    };

    // Get or create session results array
    const sessionResults = this.results.get(sessionId);
    if (sessionResults !== undefined) {
      sessionResults.push(fullResult);
    } else {
      this.results.set(sessionId, [fullResult]);
    }

    return ok(fullResult);
  }

  /**
   * Gets all verification results for a session
   *
   * @param sessionId - The session ID
   * @returns All results for the session, or error if session not found
   */
  getResults(
    sessionId: string
  ): Result<GateVerificationResult[], GateTrackerError> {
    const results = this.results.get(sessionId);
    if (results === undefined) {
      return err({
        code: 'SESSION_NOT_FOUND',
        message: `No results found for session: ${sessionId}`,
      });
    }
    return ok(results);
  }

  /**
   * Gets statistics for a specific gate in a session
   *
   * @param sessionId - The session ID
   * @param gate - The gate to get stats for
   * @returns Gate statistics or error
   */
  getGateStats(
    sessionId: string,
    gate: CoreGate
  ): Result<GateStats, GateTrackerError> {
    const resultsResult = this.getResults(sessionId);
    if (!resultsResult.ok) {
      return resultsResult;
    }

    const results = resultsResult.value;
    const gateResults = results.filter((r) => r.gate === gate);

    // Collect all unique lines checked for this gate
    const lineMap = new Map<string, boolean>();

    for (const result of gateResults) {
      for (const lr of result.lineResults) {
        const key = `${result.filePath}:${String(lr.lineNumber)}`;
        // If already recorded, use AND logic - a line only passes if all checks pass
        const existing = lineMap.get(key);
        if (existing !== undefined) {
          lineMap.set(key, existing && lr.passed);
        } else {
          lineMap.set(key, lr.passed);
        }
      }
    }

    const linesChecked = lineMap.size;
    let linesPassed = 0;
    for (const passed of lineMap.values()) {
      if (passed) {
        linesPassed++;
      }
    }

    const passRate = linesChecked > 0 ? linesPassed / linesChecked : 1;
    const poe = 1 - passRate;

    return ok({ linesChecked, linesPassed, passRate, poe });
  }

  /**
   * Gets overall session statistics across all gates
   *
   * @param sessionId - The session ID
   * @returns Session-level statistics or error
   */
  getSessionStats(
    sessionId: string
  ): Result<SessionGateStats, GateTrackerError> {
    const resultsResult = this.getResults(sessionId);
    if (!resultsResult.ok) {
      return resultsResult;
    }

    // Calculate per-gate stats
    const perGate: Record<CoreGate, GateStats> = {
      G1_COMPILE: { linesChecked: 0, linesPassed: 0, passRate: 1, poe: 0 },
      G2_CORRECT: { linesChecked: 0, linesPassed: 0, passRate: 1, poe: 0 },
      G3_REACHABLE: { linesChecked: 0, linesPassed: 0, passRate: 1, poe: 0 },
    };

    for (const gate of ALL_GATES) {
      const statsResult = this.getGateStats(sessionId, gate);
      if (statsResult.ok) {
        perGate[gate] = statsResult.value;
      }
    }

    // Get line verification to calculate verified lines
    const lineVerification = this.buildLineVerificationMap(sessionId);
    const totalLinesChecked = lineVerification.size;

    let verifiedLines = 0;
    for (const status of lineVerification.values()) {
      if (this.isLineVerified(status)) {
        verifiedLines++;
      }
    }

    // Calculate overall PoE: 1 - product(1 - PoE_i) for non-skipped required gates
    const applicableGates = ALL_GATES.filter((g) => {
      const cfg = this.config[g];
      return !cfg.skip && cfg.required;
    });

    let overallPoE: number;
    if (applicableGates.length === 0) {
      overallPoE = 0;
    } else {
      // product(1 - PoE_i)
      let product = 1;
      for (const gate of applicableGates) {
        product *= 1 - perGate[gate].poe;
      }
      overallPoE = 1 - product;
    }

    return ok({
      perGate,
      totalLinesChecked,
      verifiedLines,
      overallPoE,
    });
  }

  /**
   * Gets line-level verification status for a specific file in a session
   *
   * @param sessionId - The session ID
   * @param filePath - The file path to get verification for
   * @returns Array of line verification statuses or error
   */
  getLineVerification(
    sessionId: string,
    filePath: string
  ): Result<LineVerificationStatus[], GateTrackerError> {
    const resultsResult = this.getResults(sessionId);
    if (!resultsResult.ok) {
      return resultsResult;
    }

    const allLineStatus = this.buildLineVerificationMap(sessionId);
    const fileLines: LineVerificationStatus[] = [];

    for (const [key, status] of allLineStatus) {
      if (key.startsWith(filePath + ':')) {
        fileLines.push({
          ...status,
          verified: this.isLineVerified(status),
        });
      }
    }

    // Sort by line number
    fileLines.sort((a, b) => a.location.lineNumber - b.location.lineNumber);

    return ok(fileLines);
  }

  /**
   * Gets the current gate configuration
   */
  getConfig(): CoreGateConfiguration {
    return { ...this.config };
  }

  /**
   * Updates gate configuration
   *
   * @param config - Partial configuration to merge
   */
  setConfig(
    config: Partial<CoreGateConfiguration>
  ): Result<CoreGateConfiguration, GateTrackerError> {
    // Validate thresholds
    for (const gate of ALL_GATES) {
      const gateConfig = config[gate];
      if (gateConfig?.threshold !== undefined) {
        if (gateConfig.threshold < 0 || gateConfig.threshold > 1) {
          return err({
            code: 'INVALID_THRESHOLD',
            message: `Invalid threshold for ${gate}: ${String(gateConfig.threshold)}. Must be between 0 and 1.`,
          });
        }
      }
    }

    this.config = {
      G1_COMPILE: { ...this.config.G1_COMPILE, ...config.G1_COMPILE },
      G2_CORRECT: { ...this.config.G2_CORRECT, ...config.G2_CORRECT },
      G3_REACHABLE: { ...this.config.G3_REACHABLE, ...config.G3_REACHABLE },
    };

    return ok(this.config);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Builds a map of all line verification statuses for a session
   */
  private buildLineVerificationMap(
    sessionId: string
  ): Map<string, LineVerificationStatus> {
    const lineMap = new Map<string, LineVerificationStatus>();
    const results = this.results.get(sessionId) ?? [];

    for (const result of results) {
      for (const lr of result.lineResults) {
        const key = `${result.filePath}:${String(lr.lineNumber)}`;
        let status = lineMap.get(key);

        if (status === undefined) {
          status = {
            location: {
              filePath: result.filePath,
              lineNumber: lr.lineNumber,
            },
            verified: false,
          };
          lineMap.set(key, status);
        }

        // Update gate-specific status
        // Use AND logic - if we see the same line multiple times for a gate,
        // it only passes if ALL checks pass
        switch (result.gate) {
          case 'G1_COMPILE':
            if (status.g1Passed === undefined) {
              status.g1Passed = lr.passed;
            } else {
              status.g1Passed = status.g1Passed && lr.passed;
            }
            break;
          case 'G2_CORRECT':
            if (status.g2Passed === undefined) {
              status.g2Passed = lr.passed;
            } else {
              status.g2Passed = status.g2Passed && lr.passed;
            }
            break;
          case 'G3_REACHABLE':
            if (status.g3Passed === undefined) {
              status.g3Passed = lr.passed;
            } else {
              status.g3Passed = status.g3Passed && lr.passed;
            }
            break;
        }
      }
    }

    return lineMap;
  }

  /**
   * Determines if a line is verified based on current configuration
   * A line is verified if it passes ALL applicable (non-skipped, required) gates
   * that have checked it
   */
  private isLineVerified(status: LineVerificationStatus): boolean {
    const g1Config = this.config.G1_COMPILE;
    const g2Config = this.config.G2_CORRECT;
    const g3Config = this.config.G3_REACHABLE;

    // Check G1 if required and not skipped
    if (!g1Config.skip && g1Config.required) {
      // If G1 was checked and failed, not verified
      if (status.g1Passed === false) {
        return false;
      }
    }

    // Check G2 if required and not skipped
    if (!g2Config.skip && g2Config.required) {
      // If G2 was checked and failed, not verified
      if (status.g2Passed === false) {
        return false;
      }
    }

    // Check G3 if required and not skipped
    if (!g3Config.skip && g3Config.required) {
      // If G3 was checked and failed, not verified
      if (status.g3Passed === false) {
        return false;
      }
    }

    // Line passes all applicable gates that checked it
    // A line is verified if at least one gate checked it AND all checks passed
    const wasChecked =
      status.g1Passed !== undefined ||
      status.g2Passed !== undefined ||
      status.g3Passed !== undefined;

    return wasChecked;
  }
}
