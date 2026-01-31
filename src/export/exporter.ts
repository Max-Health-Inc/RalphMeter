/**
 * Session Exporter for RalphMeter
 *
 * Exports session data in the standardized RalphMeter format.
 */

import { type Result, ok, err } from '../shared/result.js';
import { type EventCollector } from '../core/collector.js';
import { type GateTracker } from '../core/gates.js';
import { type LOCCounter } from '../core/loc.js';
import { type MetricsCalculator } from '../core/metrics.js';
import { type RalphMeterExport } from './format.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Error types for export operations
 */
export interface ExportError {
  code: 'SESSION_NOT_FOUND' | 'EXPORT_FAILED';
  message: string;
  details?: unknown;
}

/**
 * Dependencies for the exporter
 */
export interface ExporterDependencies {
  collector: EventCollector;
  gateTracker: GateTracker;
  locCounter: LOCCounter;
  metricsCalculator: MetricsCalculator;
}

// ============================================================================
// Exporter Function
// ============================================================================

/**
 * Export a session in the standardized RalphMeter format
 *
 * @param sessionId - The session ID to export
 * @param deps - Dependencies (collector, gate tracker, etc.)
 * @param rootPath - Optional root path for LOC calculation
 * @returns Result with the export data or error
 */
export function exportSession(
  sessionId: string,
  deps: ExporterDependencies,
  rootPath?: string
): Result<RalphMeterExport, ExportError> {
  // Get session data
  const sessionResult = deps.collector.getSession(sessionId);
  if (!sessionResult.ok) {
    return err({
      code: 'SESSION_NOT_FOUND',
      message: `Session not found: ${sessionId}`,
      details: sessionResult.error,
    });
  }

  const session = sessionResult.value;

  // Get session metrics
  const metricsResult = deps.collector.getMetrics(sessionId);
  const sessionMetrics = metricsResult.ok ? metricsResult.value : null;

  // Get gate stats
  const gateStatsResult = deps.gateTracker.getSessionStats(sessionId);
  const gateStats = gateStatsResult.ok ? gateStatsResult.value : null;

  // Calculate computed metrics if rootPath provided
  let computedMetrics = null;
  let locBreakdown = null;
  let synthTrend: RalphMeterExport['synthTrend'] = [];

  if (rootPath !== undefined) {
    const snapshot = deps.locCounter.snapshotCodebase(rootPath);
    const reportResult = deps.metricsCalculator.getReport(sessionId, snapshot);
    if (reportResult.ok) {
      const report = reportResult.value;
      computedMetrics = report.metrics;
      locBreakdown = report.locBreakdown;
      synthTrend = report.synthTrend;
    }
  }

  // Build export object
  const exportData: RalphMeterExport = {
    version: 'v1',
    exportedAt: new Date().toISOString(),
    sessionMetadata: session.metadata,
    allEvents: session.events,
    computedMetrics,
    gateHistory: gateStats,
    locBreakdown,
    sessionMetrics,
    synthTrend,
  };

  return ok(exportData);
}
