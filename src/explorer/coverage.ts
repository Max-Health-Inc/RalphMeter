/**
 * Coverage Collector for RalphMeter
 *
 * Provides runtime coverage instrumentation using V8/c8.
 * Starts apps with coverage enabled and collects per-line execution data.
 * This is the foundation for G3 (Reachable) gate verification.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Result, ok, err } from '../shared/result.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a line in a file
 */
export interface Line {
  /** Path to the file */
  filePath: string;
  /** Line number (1-based) */
  lineNumber: number;
}

/**
 * Coverage data for per-line execution
 */
export interface CoverageData {
  /** Lines that were executed during the run */
  executed: Line[];
  /** Lines that were not executed */
  notExecuted: Line[];
}

/**
 * Options for starting an instrumented app
 */
export interface InstrumentedOptions {
  /** Working directory for the app */
  cwd?: string;
  /** Environment variables to pass to the app */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Temporary directory for coverage reports (default: .coverage-tmp) */
  coverageDir?: string;
  /** Include patterns for coverage (default: src/**) */
  include?: string[];
  /** Exclude patterns for coverage (default: node_modules, test files) */
  exclude?: string[];
}

/**
 * V8 Coverage format interfaces (from c8/v8)
 */
interface V8Range {
  startOffset: number;
  endOffset: number;
  count: number;
}

interface V8FunctionCoverage {
  functionName: string;
  ranges: V8Range[];
  isBlockCoverage: boolean;
}

interface V8ScriptCoverage {
  scriptId: string;
  url: string;
  functions: V8FunctionCoverage[];
}

interface V8Coverage {
  result: V8ScriptCoverage[];
}

// ============================================================================
// CoverageCollector
// ============================================================================

/**
 * Manages instrumented app execution and coverage collection
 */
export class CoverageCollector {
  private process: ChildProcess | null = null;
  private coverageDir: string;
  private timeout: number;
  private startTime: number | null = null;

  constructor() {
    this.coverageDir = '.coverage-tmp';
    this.timeout = 30000; // 30 seconds default
  }

  /**
   * Start an app with V8 coverage instrumentation using c8
   *
   * @param appCommand - Command to run (e.g., 'node server.js')
   * @param options - Configuration options
   * @returns Result with session info or error
   */
  startInstrumented(
    appCommand: string,
    options: InstrumentedOptions = {}
  ): Result<{ pid: number; coverageDir: string }, string> {
    if (this.process !== null) {
      return err('A process is already running. Call stopAndCollect() first.');
    }

    // Set options with defaults
    this.coverageDir = options.coverageDir ?? '.coverage-tmp';
    this.timeout = options.timeout ?? 30000;
    const cwd = options.cwd ?? process.cwd();
    const env = { ...process.env, ...options.env };

    // Parse command
    const trimmed = appCommand.trim();
    if (trimmed === '') {
      return err('Invalid command: empty string');
    }

    const parts = trimmed.split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    if (command === undefined) {
      return err('Invalid command: empty string');
    }

    // Clean up old coverage directory if it exists
    if (fs.existsSync(this.coverageDir)) {
      fs.rmSync(this.coverageDir, { recursive: true, force: true });
    }

    // Create coverage directory
    fs.mkdirSync(this.coverageDir, { recursive: true });

    // Build c8 arguments
    const c8Args = [
      '--temp-directory',
      path.join(this.coverageDir, 'tmp'),
      '--reports-dir',
      this.coverageDir,
      '--reporter=json',
      '--clean=false', // We'll clean manually
    ];

    // Add include patterns
    const includePatterns = options.include ?? ['src/**'];
    for (const pattern of includePatterns) {
      c8Args.push('--include', pattern);
    }

    // Add exclude patterns
    const excludePatterns = options.exclude ?? [
      'node_modules/**',
      '**/*.test.ts',
      '**/*.test.js',
      '**/test/**',
    ];
    for (const pattern of excludePatterns) {
      c8Args.push('--exclude', pattern);
    }

    // Add the actual command and its args
    c8Args.push(command, ...args);

    // Spawn the process with c8
    try {
      this.process = spawn('npx', ['c8', ...c8Args], {
        cwd,
        env,
        stdio: 'pipe',
      });

      this.startTime = Date.now();

      // Handle process events
      this.process.on('error', (error) => {
        console.error('Process error:', error);
      });

      const pid = this.process.pid ?? -1;

      return ok({ pid, coverageDir: this.coverageDir });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return err(`Failed to start instrumented process: ${message}`);
    }
  }

  /**
   * Stop the instrumented app and collect coverage data
   *
   * @returns Result with coverage data or error
   */
  async stopAndCollect(): Promise<Result<CoverageData, string>> {
    if (this.process === null) {
      return err('No process is running');
    }

    // Check if process has already exited
    if (this.process.exitCode !== null) {
      // Process already exited, wait for c8 to finish writing
      await new Promise((r) => setTimeout(r, 1000));
      const result = await this.parseCoverageData();
      this.process = null;
      return result;
    }

    // Kill the process gracefully
    return new Promise((resolve) => {
      if (this.process === null) {
        resolve(err('Process became null'));
        return;
      }

      const timeoutId = setTimeout(() => {
        if (this.process !== null && this.process.exitCode === null) {
          this.process.kill('SIGKILL');
        }
      }, 5000);

      this.process.on('exit', async () => {
        clearTimeout(timeoutId);

        // Wait for c8 to write coverage files
        await new Promise((r) => setTimeout(r, 1000));

        // Parse coverage data
        const coverageResult = await this.parseCoverageData();
        this.process = null;

        resolve(coverageResult);
      });

      // Send SIGTERM to gracefully shut down (if not already exited)
      if (this.process.exitCode === null) {
        this.process.kill('SIGTERM');
      }
    });
  }

  /**
   * Parse coverage data from c8 JSON reports
   */
  private async parseCoverageData(): Promise<Result<CoverageData, string>> {
    const coverageFile = path.join(this.coverageDir, 'coverage-final.json');

    if (!fs.existsSync(coverageFile)) {
      return err(
        `Coverage file not found: ${coverageFile}. The process may not have generated coverage data.`
      );
    }

    try {
      const coverageJson = fs.readFileSync(coverageFile, 'utf-8');
      const coverage: Record<string, any> = JSON.parse(coverageJson);

      const executed: Line[] = [];
      const notExecuted: Line[] = [];

      // Parse V8 coverage format
      for (const [filePath, fileCoverage] of Object.entries(coverage)) {
        if (typeof fileCoverage !== 'object' || fileCoverage === null) {
          continue;
        }

        // Get line coverage information
        const statementMap =
          (fileCoverage as any).statementMap ?? ({} as Record<string, any>);
        const statements =
          (fileCoverage as any).s ?? ({} as Record<string, number>);

        // Build a map of line numbers to execution counts
        const lineExecutionCounts = new Map<number, number>();

        for (const [key, location] of Object.entries(statementMap)) {
          if (
            typeof location !== 'object' ||
            location === null ||
            typeof (location as any).start !== 'object'
          ) {
            continue;
          }

          const lineNumber = (location as any).start.line as number;
          const executionCount = statements[key] ?? 0;

          // Accumulate execution counts per line
          const currentCount = lineExecutionCounts.get(lineNumber) ?? 0;
          lineExecutionCounts.set(
            lineNumber,
            currentCount + executionCount
          );
        }

        // Convert to Line objects
        for (const [lineNumber, count] of lineExecutionCounts.entries()) {
          const line: Line = {
            filePath,
            lineNumber,
          };

          if (count > 0) {
            executed.push(line);
          } else {
            notExecuted.push(line);
          }
        }
      }

      return ok({ executed, notExecuted });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return err(`Failed to parse coverage data: ${message}`);
    }
  }

  /**
   * Check if a process is currently running
   */
  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * Get the elapsed time since the process started (in milliseconds)
   */
  getElapsedTime(): number | null {
    if (this.startTime === null) {
      return null;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Clean up coverage directory
   */
  cleanup(): void {
    if (fs.existsSync(this.coverageDir)) {
      fs.rmSync(this.coverageDir, { recursive: true, force: true });
    }
  }
}
