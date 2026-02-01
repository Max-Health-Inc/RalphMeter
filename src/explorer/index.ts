/**
 * AI Explorer - G3 Reachability Module
 *
 * This module provides runtime coverage collection and AI-driven surface exploration
 * for verifying G3 (Reachable) gate in the 3-gate verification model.
 */

export type { Line, CoverageData, InstrumentedOptions } from './coverage.js';
export { CoverageCollector } from './coverage.js';

export type {
  ExploreOptions,
  ExplorationAction,
  CapturedResponse,
  ExplorationLog,
} from './surface.js';
export { SurfaceExplorer } from './surface.js';

export type {
  BarrierType,
  BarrierInfo,
  BarrierAnalysis,
  PathInferenceOptions,
} from './barriers.js';
export { BarrierTracker } from './barriers.js';

export type {
  ReachabilityCategory,
  CategorizedLines,
  ReachabilityStats,
  RecommendationType,
  ReachabilityRecommendation,
  ReachabilityReportData,
} from './report.js';
export { ReachabilityReport } from './report.js';
