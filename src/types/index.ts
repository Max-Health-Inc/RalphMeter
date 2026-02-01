/**
 * Centralized type exports for RalphMeter
 *
 * All shared types should be exported from this barrel file.
 * Feature-specific types should be defined in their respective modules
 * and re-exported here for public API access.
 */

// Re-export shared types
export * from '../shared/result.js';

// Re-export core types
export type {
  SessionStartEvent,
  SessionEndEvent,
  IterationStartEvent,
  IterationEndEvent,
  TokensInEvent,
  TokensOutEvent,
  CompilationResultEvent,
  TestResultEvent,
  StoryCompleteEvent,
  MeterEvent,
  EventType,
  ValidationError,
} from '../core/events.js';

// Re-export core types (will be populated as features are added)
// export * from '../core/collector.js';
// export * from '../core/loc.js';
// export * from '../core/gates.js';
// export * from '../core/metrics.js';

// Re-export explorer types
export type {
  Line,
  CoverageData,
  InstrumentedOptions,
} from '../explorer/coverage.js';

export type {
  ExploreOptions,
  ExplorationAction,
  CapturedResponse,
  ExplorationLog,
} from '../explorer/surface.js';
