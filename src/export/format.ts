/**
 * Open Metrics Export Format for RalphMeter
 *
 * Defines a standardized export format for metrics interchange.
 * This enables ecosystem tooling and cross-agent comparisons.
 */

import { z } from 'zod';
import { type MeterEvent } from '../core/events.js';
import {
  type SessionMetadata,
  type SessionMetrics,
} from '../core/collector.js';
import { type ComputedMetrics, type SynthTrendPoint } from '../core/metrics.js';
import { type SessionGateStats } from '../core/gates.js';
import { type LOCResult } from '../core/loc.js';

// ============================================================================
// Export Format Types
// ============================================================================

/**
 * Version of the export format
 */
export type ExportVersion = 'v1';

/**
 * Complete export of a RalphMeter session
 */
export interface RalphMeterExport {
  /** Format version for backward compatibility */
  version: ExportVersion;
  /** When this export was generated */
  exportedAt: string;
  /** Session metadata (status, timing, tags) */
  sessionMetadata: SessionMetadata;
  /** All events collected during the session */
  allEvents: MeterEvent[];
  /** Computed efficiency metrics */
  computedMetrics: ComputedMetrics | null;
  /** Gate verification history */
  gateHistory: SessionGateStats | null;
  /** LOC breakdown by category */
  locBreakdown: LOCResult | null;
  /** Basic session metrics */
  sessionMetrics: SessionMetrics | null;
  /** Ralph trend over time (if computed metrics available) */
  synthTrend: SynthTrendPoint[];
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

/**
 * Schema for SessionMetadata
 */
const SessionMetadataSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'completed', 'failed']),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  success: z.boolean().optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

/**
 * Schema for LOCResult
 */
const LOCResultSchema = z.object({
  total: z.number(),
  code: z.number(),
  comments: z.number(),
  blank: z.number(),
});

/**
 * Schema for ComputedMetrics
 */
const ComputedMetricsSchema = z.object({
  verifiedLOC: z.number(),
  totalLOC: z.number(),
  verificationRate: z.number(),
  locPerMinute: z.number(),
  vlocPerMinute: z.number(),
  tokensPerLOC: z.number(),
  poeLOC: z.number(),
  totalMinutes: z.number(),
  totalTokens: z.number(),
  codeLines: z.number(),
  commentLines: z.number(),
  blankLines: z.number(),
});

/**
 * Schema for SessionMetrics
 */
const SessionMetricsSchema = z.object({
  totalIterations: z.number(),
  totalTokensIn: z.number(),
  totalTokensOut: z.number(),
  compilationAttempts: z.number(),
  compilationSuccesses: z.number(),
  testAttempts: z.number(),
  testSuccesses: z.number(),
  storiesCompleted: z.number(),
  storiesPassed: z.number(),
});

/**
 * Schema for SynthTrendPoint
 */
const SynthTrendPointSchema = z.object({
  storyId: z.string(),
  timestamp: z.string(),
  cumulativeTokens: z.number(),
  loc: z.number(),
  Ralph: z.number(),
  synthDelta: z.number(),
  tokensSpent: z.number(),
  linesAdded: z.number(),
  linesDeleted: z.number(),
  netDelta: z.number(),
  storySynth: z.number().optional(),
});

/**
 * Schema for GateStats
 */
const GateStatsSchema = z.object({
  linesChecked: z.number(),
  linesPassed: z.number(),
  passRate: z.number(),
  poe: z.number(),
});

/**
 * Schema for SessionGateStats
 */
const SessionGateStatsSchema = z.object({
  perGate: z.record(
    z.enum(['G1_COMPILE', 'G2_CORRECT', 'G3_REACHABLE']),
    GateStatsSchema
  ),
  totalLinesChecked: z.number(),
  verifiedLines: z.number(),
  overallPoE: z.number(),
});

/**
 * Schema for RalphMeterExport
 */
export const RalphMeterExportSchema = z.object({
  version: z.literal('v1'),
  exportedAt: z.string(),
  sessionMetadata: SessionMetadataSchema,
  allEvents: z.array(z.unknown()), // Events will be validated by their own schemas
  computedMetrics: ComputedMetricsSchema.nullable(),
  gateHistory: SessionGateStatsSchema.nullable(),
  locBreakdown: LOCResultSchema.nullable(),
  sessionMetrics: SessionMetricsSchema.nullable(),
  synthTrend: z.array(SynthTrendPointSchema),
});

/**
 * Validate an export object
 */
export function validateExport(data: unknown): unknown {
  return RalphMeterExportSchema.parse(data);
}

/**
 * Safely validate an export object
 */
export function safeValidateExport(data: unknown): {
  success: boolean;
  data?: unknown;
  error?: unknown;
} {
  return RalphMeterExportSchema.safeParse(data);
}
