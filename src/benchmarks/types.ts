/**
 * Benchmark types for reference PRD comparisons
 */

/**
 * Expected range for numeric values
 */
export interface Range {
  min: number;
  max: number;
}

/**
 * Metadata about a benchmark PRD
 */
export interface BenchmarkMetadata {
  /**
   * Expected lines of code range
   */
  expectedLOC: Range;
  /**
   * Complexity score (1-10, where 10 is most complex)
   */
  complexityScore: number;
  /**
   * Expected iterations range
   */
  expectedIterations: Range;
}

/**
 * User story in Ralph PRD format
 */
export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes?: string | undefined;
}

/**
 * Reference PRD in Ralph format with benchmark metadata
 */
export interface BenchmarkPRD {
  project: string;
  branchName: string;
  description: string;
  userStories: UserStory[];
  metadata: BenchmarkMetadata;
}

/**
 * Benchmark result from a session
 */
export interface BenchmarkResult {
  benchmarkId: string;
  sessionId: string;
  actualLOC: number;
  actualIterations: number;
  actualRalph: number;
  timestamp: string;
}
