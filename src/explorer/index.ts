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
