/**
 * Gate Registry for RalphMeter
 *
 * Manages registration and execution of quality gates.
 * Supports different verification modes: core, strict, custom.
 */

import { type Result, ok, err } from '../shared/result.js';
import {
  type Gate,
  type ProjectMeta,
  type GateArtifact,
  type GateResult,
  type GateConfiguration,
} from './gate-plugin.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Verification mode determines which gates are required
 */
export type VerificationMode = 'core' | 'strict' | 'custom';

/**
 * Result of running multiple gates
 */
export interface GateRegistryResult {
  /** Verification mode used */
  mode: VerificationMode;
  /** Individual gate results */
  gateResults: {
    gateId: string;
    gateName: string;
    result: GateResult;
  }[];
  /** Overall pass/fail */
  overallPass: boolean;
  /** Total gates run */
  totalGates: number;
  /** Gates passed */
  gatesPassed: number;
}

/**
 * Error types for gate registry operations
 */
export interface GateRegistryError {
  code:
    | 'GATE_NOT_FOUND'
    | 'GATE_ALREADY_REGISTERED'
    | 'INVALID_MODE'
    | 'CHECK_FAILED';
  message: string;
  details?: unknown;
}

// ============================================================================
// GateRegistry Class
// ============================================================================

/**
 * Registry for managing quality gates
 */
export class GateRegistry {
  /** Registered gates by ID */
  private gates = new Map<string, Gate>();

  /** Gate configurations by ID */
  private configurations = new Map<string, GateConfiguration>();

  /** Current verification mode */
  private mode: VerificationMode = 'core';

  /** Custom gate IDs to run in custom mode */
  private customGateIds: string[] = [];

  /**
   * Registers a new gate
   *
   * @param gate - The gate to register
   * @returns Success or error if already registered
   */
  register(gate: Gate): Result<void, GateRegistryError> {
    if (this.gates.has(gate.id)) {
      return err({
        code: 'GATE_ALREADY_REGISTERED',
        message: `Gate already registered: ${gate.id}`,
      });
    }

    this.gates.set(gate.id, gate);

    // Default configuration: enabled
    this.configurations.set(gate.id, {
      id: gate.id,
      enabled: true,
    });

    return ok(undefined);
  }

  /**
   * Unregisters a gate by ID
   *
   * @param id - Gate ID to unregister
   * @returns Success or error if not found
   */
  unregister(id: string): Result<void, GateRegistryError> {
    if (!this.gates.has(id)) {
      return err({
        code: 'GATE_NOT_FOUND',
        message: `Gate not found: ${id}`,
      });
    }

    this.gates.delete(id);
    this.configurations.delete(id);

    return ok(undefined);
  }

  /**
   * Gets applicable gates for a project
   *
   * @param projectMeta - Project metadata
   * @returns List of applicable gates
   */
  getApplicable(projectMeta: ProjectMeta): Gate[] {
    const applicable: Gate[] = [];

    for (const gate of this.gates.values()) {
      const config = this.configurations.get(gate.id);
      if (config?.enabled === false) {
        continue;
      }

      if (gate.appliesWhen(projectMeta)) {
        applicable.push(gate);
      }
    }

    return applicable;
  }

  /**
   * Gets gates to run based on current verification mode
   *
   * @param projectMeta - Project metadata
   * @returns List of gates to run
   */
  private getGatesToRun(projectMeta: ProjectMeta): Gate[] {
    const applicable = this.getApplicable(projectMeta);

    switch (this.mode) {
      case 'core':
        // Only core gates (G1-G3) - quality gates are skipped
        return applicable.filter((g) => g.category === 'core');

      case 'strict':
        // Core + all quality gates
        return applicable;

      case 'custom':
        // Only user-selected gates
        return applicable.filter((g) => this.customGateIds.includes(g.id));

      default:
        return [];
    }
  }

  /**
   * Runs all applicable gates on an artifact
   *
   * @param artifact - The artifact to check
   * @param projectMeta - Project metadata
   * @returns Registry result with all gate results
   */
  async runAll(
    artifact: GateArtifact,
    projectMeta: ProjectMeta
  ): Promise<Result<GateRegistryResult, GateRegistryError>> {
    const gates = this.getGatesToRun(projectMeta);
    const gateResults: {
      gateId: string;
      gateName: string;
      result: GateResult;
    }[] = [];

    let overallPass = true;
    let gatesPassed = 0;

    for (const gate of gates) {
      const config = this.configurations.get(gate.id)?.config;

      try {
        const checkResult = await gate.check(artifact, config);

        if (!checkResult.ok) {
          return err({
            code: 'CHECK_FAILED',
            message: `Gate check failed: ${gate.id}`,
            details: checkResult.error,
          });
        }

        const result = checkResult.value;
        gateResults.push({
          gateId: gate.id,
          gateName: gate.name,
          result,
        });

        if (result.pass) {
          gatesPassed++;
        } else {
          overallPass = false;
        }
      } catch (error) {
        return err({
          code: 'CHECK_FAILED',
          message: `Gate check threw error: ${gate.id}`,
          details: error,
        });
      }
    }

    return ok({
      mode: this.mode,
      gateResults,
      overallPass,
      totalGates: gates.length,
      gatesPassed,
    });
  }

  /**
   * Configures a specific gate
   *
   * @param id - Gate ID
   * @param config - Gate configuration
   * @returns Success or error if gate not found
   */
  configure(
    id: string,
    config: GateConfiguration
  ): Result<void, GateRegistryError> {
    if (!this.gates.has(id)) {
      return err({
        code: 'GATE_NOT_FOUND',
        message: `Gate not found: ${id}`,
      });
    }

    this.configurations.set(id, config);
    return ok(undefined);
  }

  /**
   * Sets the verification mode
   *
   * @param mode - Verification mode
   * @param customGateIds - Gate IDs to use in custom mode
   * @returns Success or error
   */
  setMode(
    mode: VerificationMode,
    customGateIds?: string[]
  ): Result<void, GateRegistryError> {
    if (!['core', 'strict', 'custom'].includes(mode)) {
      return err({
        code: 'INVALID_MODE',
        message: `Invalid verification mode: ${mode}`,
      });
    }

    this.mode = mode;

    if (mode === 'custom') {
      if (customGateIds === undefined || customGateIds.length === 0) {
        return err({
          code: 'INVALID_MODE',
          message: 'Custom mode requires at least one gate ID',
        });
      }

      // Validate all gate IDs exist
      for (const id of customGateIds) {
        if (!this.gates.has(id)) {
          return err({
            code: 'GATE_NOT_FOUND',
            message: `Gate not found: ${id}`,
          });
        }
      }

      this.customGateIds = customGateIds;
    }

    return ok(undefined);
  }

  /**
   * Gets current verification mode
   */
  getMode(): VerificationMode {
    return this.mode;
  }

  /**
   * Gets all registered gates
   */
  getAllGates(): Gate[] {
    return Array.from(this.gates.values());
  }

  /**
   * Gets a specific gate by ID
   *
   * @param id - Gate ID
   * @returns Gate or undefined if not found
   */
  getGate(id: string): Gate | undefined {
    return this.gates.get(id);
  }

  /**
   * Gets configuration for a gate
   *
   * @param id - Gate ID
   * @returns Configuration or undefined if not found
   */
  getConfiguration(id: string): GateConfiguration | undefined {
    return this.configurations.get(id);
  }
}
