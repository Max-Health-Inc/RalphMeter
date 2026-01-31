/**
 * Benchmarks module - Reference PRDs for calibration
 */

export type {
  Range,
  BenchmarkMetadata,
  UserStory,
  BenchmarkPRD,
  BenchmarkResult,
} from './types.js';

export {
  loadBenchmark,
  loadAllBenchmarks,
  listBenchmarks,
  validateBenchmark,
} from './loader.js';

export type {
  MetricComparison,
  EfficiencyScore,
  Recommendation,
  ComparisonReport,
  ComparisonError,
} from './comparison.js';

export { BenchmarkComparison } from './comparison.js';
