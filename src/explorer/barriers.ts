/**
 * Barrier Tracker for RalphMeter
 *
 * Tracks authentication and authorization barriers during AI exploration.
 * Detects 401 (unauthenticated), 403 (forbidden), and 402 (payment required) responses.
 * Maps blocked URLs to code paths for G3 verification categorization.
 * Prevents false positives - code behind auth is not dead code.
 */

import { type Line } from './coverage.js';
import { type CapturedResponse } from './surface.js';

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP status codes that represent barriers to access
 */
export type BarrierType = 401 | 403 | 402;

/**
 * Information about a detected barrier
 */
export interface BarrierInfo {
  /** The URL that was blocked */
  url: string;
  /** HTTP status code */
  status: BarrierType;
  /** HTTP method used */
  method: string;
  /** Timestamp when barrier was encountered */
  timestamp: string;
}

/**
 * Analysis of barriers encountered during exploration
 */
export interface BarrierAnalysis {
  /** Lines behind 401 authentication barriers */
  authGated: Line[];
  /** Lines behind 403 permission/authorization barriers */
  permissionGated: Line[];
  /** Lines behind 402 payment barriers */
  paywallGated: Line[];
  /** All barrier information for reference */
  barriers: BarrierInfo[];
}

/**
 * Options for inferring blocked code paths from URLs
 */
export interface PathInferenceOptions {
  /** Root directory of the codebase (default: process.cwd()) */
  rootPath?: string;
  /** Common route handler patterns to search for */
  routePatterns?: string[];
  /** Whether to use heuristic matching (default: true) */
  useHeuristics?: boolean;
}

// ============================================================================
// BarrierTracker
// ============================================================================

/**
 * Tracks and analyzes authentication/authorization barriers during exploration
 */
export class BarrierTracker {
  private barriers: BarrierInfo[] = [];

  /**
   * Detect barriers from a list of captured responses
   *
   * @param responses - HTTP responses from exploration
   * @returns Array of detected barriers
   */
  detectBarriers(responses: CapturedResponse[]): BarrierInfo[] {
    this.barriers = [];

    for (const response of responses) {
      if (this.isBarrierStatus(response.status)) {
        this.barriers.push({
          url: response.url,
          status: response.status,
          method: response.method,
          timestamp: response.timestamp,
        });
      }
    }

    return this.barriers;
  }

  /**
   * Check if a status code represents a barrier
   */
  private isBarrierStatus(status: number): status is BarrierType {
    return status === 401 || status === 403 || status === 402;
  }

  /**
   * Categorize barriers by type
   *
   * @returns Categorized barriers
   */
  categorizeBarriers(): {
    auth: BarrierInfo[];
    permission: BarrierInfo[];
    paywall: BarrierInfo[];
  } {
    return {
      auth: this.barriers.filter((b) => b.status === 401),
      permission: this.barriers.filter((b) => b.status === 403),
      paywall: this.barriers.filter((b) => b.status === 402),
    };
  }

  /**
   * Infer which code paths are blocked by barriers
   *
   * This uses simple heuristics to map URLs to likely source file locations.
   * For more accurate mapping, integrate with actual source maps or code analysis.
   *
   * @param options - Path inference options
   * @returns Lines of code inferred to be behind barriers
   */
  inferBlockedPaths(
    options: PathInferenceOptions = {}
  ): Pick<BarrierAnalysis, 'authGated' | 'permissionGated' | 'paywallGated'> {
    const categorized = this.categorizeBarriers();

    return {
      authGated: this.inferLinesFromBarriers(categorized.auth, options),
      permissionGated: this.inferLinesFromBarriers(
        categorized.permission,
        options
      ),
      paywallGated: this.inferLinesFromBarriers(categorized.paywall, options),
    };
  }

  /**
   * Infer code lines from barrier URLs using heuristics
   *
   * Simple heuristic: extract path from URL and map to likely handler file
   * Example: /api/users -> src/api/users.ts or src/routes/users.ts
   *
   * @param barriers - Barriers to infer from
   * @param options - Inference options
   * @returns Inferred code lines
   */
  private inferLinesFromBarriers(
    barriers: BarrierInfo[],
    options: PathInferenceOptions
  ): Line[] {
    const lines: Line[] = [];
    const useHeuristics = options.useHeuristics ?? true;

    if (!useHeuristics || barriers.length === 0) {
      return lines;
    }

    // For each barrier, extract the path and create heuristic mappings
    for (const barrier of barriers) {
      const urlPath = this.extractPath(barrier.url);
      const inferredPaths = this.inferSourcePaths(urlPath, options);

      // Create line entries for inferred paths
      // In a real implementation, this would check if files exist and scan for route handlers
      // For now, we use line 1 as a placeholder
      for (const filePath of inferredPaths) {
        lines.push({
          filePath,
          lineNumber: 1,
        });
      }
    }

    return lines;
  }

  /**
   * Extract path from URL
   */
  private extractPath(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.pathname;
    } catch {
      // If not a full URL, assume it's already a path
      return url;
    }
  }

  /**
   * Infer possible source file paths from a URL path
   *
   * @param urlPath - The URL path (e.g., '/api/users')
   * @param options - Inference options
   * @returns Array of possible source file paths
   */
  private inferSourcePaths(
    urlPath: string,
    options: PathInferenceOptions
  ): string[] {
    const rootPath = options.rootPath ?? process.cwd();
    const paths: string[] = [];

    // Remove leading slash and split into segments
    const segments = urlPath.replace(/^\//, '').split('/').filter(Boolean);

    if (segments.length === 0) {
      return paths;
    }

    // Common patterns for route handlers
    const patterns = options.routePatterns ?? [
      'src/api',
      'src/routes',
      'api',
      'routes',
      'src/controllers',
      'controllers',
    ];

    // Build possible file paths
    // We know segments.length > 0 from check above
    const lastSegment = segments[segments.length - 1];
    if (lastSegment === undefined) {
      return paths;
    }
    const filename = lastSegment;
    const dirname = segments.slice(0, -1).join('/');

    for (const pattern of patterns) {
      // Pattern: src/api/users.ts
      paths.push(`${rootPath}/${pattern}/${segments.join('/')}.ts`);
      paths.push(`${rootPath}/${pattern}/${segments.join('/')}.js`);

      // Pattern: src/api/users/index.ts
      paths.push(`${rootPath}/${pattern}/${segments.join('/')}/index.ts`);
      paths.push(`${rootPath}/${pattern}/${segments.join('/')}/index.js`);

      // If there's a directory component, try that too
      if (dirname !== '') {
        paths.push(`${rootPath}/${pattern}/${dirname}/${filename}.ts`);
        paths.push(`${rootPath}/${pattern}/${dirname}/${filename}.js`);
      }
    }

    return paths;
  }

  /**
   * Analyze barriers and return complete analysis
   *
   * @param responses - HTTP responses from exploration
   * @param options - Path inference options
   * @returns Complete barrier analysis
   */
  analyze(
    responses: CapturedResponse[],
    options: PathInferenceOptions = {}
  ): BarrierAnalysis {
    this.detectBarriers(responses);
    const blockedPaths = this.inferBlockedPaths(options);

    return {
      ...blockedPaths,
      barriers: this.barriers,
    };
  }

  /**
   * Get all detected barriers
   */
  getBarriers(): BarrierInfo[] {
    return [...this.barriers];
  }

  /**
   * Clear all detected barriers
   */
  clear(): void {
    this.barriers = [];
  }
}
