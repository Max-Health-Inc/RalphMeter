/**
 * Gate Plugin System for RalphMeter
 *
 * Defines the plugin architecture for custom quality gates beyond core G1-G3.
 * Quality gates are optional but enable stricter verification modes.
 */

import { type Result } from '../shared/result.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Gate category - core gates (G1-G3) vs quality gates (plugins)
 */
export type GateCategory = 'core' | 'quality';

/**
 * Project metadata used to determine gate applicability
 */
export interface ProjectMeta {
  /** Root path of the project */
  rootPath: string;
  /** Programming languages detected */
  languages: string[];
  /** Whether project has tests */
  hasTests: boolean;
  /** Whether project has an explorable surface (web/API) */
  hasExplorableSurface: boolean;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Artifact being checked by a gate
 * Can be a single file, a codebase snapshot, or test results
 */
export interface GateArtifact {
  /** Type of artifact */
  type: 'file' | 'codebase' | 'test-results';
  /** File path (for file artifacts) */
  filePath?: string;
  /** File content (for file artifacts) */
  content?: string;
  /** Root path (for codebase artifacts) */
  rootPath?: string;
  /** Custom data specific to gate */
  data?: Record<string, unknown>;
}

/**
 * Finding from a gate check
 */
export interface GateFinding {
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** File path */
  filePath: string;
  /** Line number (optional) */
  lineNumber?: number;
  /** Finding message */
  message: string;
  /** Rule or check ID */
  ruleId?: string;
}

/**
 * Result of a gate check
 */
export interface GateResult {
  /** Whether the artifact passed the gate */
  pass: boolean;
  /** Optional score (0-100) */
  score?: number;
  /** Optional findings/issues */
  findings?: GateFinding[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Gate configuration
 */
export interface GateConfiguration {
  /** Gate ID */
  id: string;
  /** Whether the gate is enabled */
  enabled: boolean;
  /** Gate-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Plugin gate interface
 * All custom quality gates must implement this interface
 */
export interface Gate {
  /** Unique gate ID (e.g., 'file-size', 'complexity') */
  id: string;

  /** Human-readable gate name */
  name: string;

  /** Gate category */
  category: GateCategory;

  /** Gate description */
  description: string;

  /**
   * Determines if this gate applies to a given project
   * @param projectMeta - Project metadata
   * @returns True if gate should be applied
   */
  appliesWhen(projectMeta: ProjectMeta): boolean;

  /**
   * Checks an artifact against this gate
   * @param artifact - The artifact to check
   * @param config - Optional gate-specific configuration
   * @returns Result with pass/fail and optional details
   */
  check(
    artifact: GateArtifact,
    config?: Record<string, unknown>
  ): Promise<Result<GateResult>>;
}
