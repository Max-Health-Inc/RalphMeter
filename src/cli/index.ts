#!/usr/bin/env node

/**
 * RalphMeter CLI
 *
 * Command-line interface for starting the server and viewing metrics.
 */

import { Command } from 'commander';
import { createServer } from '../api/server.js';
import { EventCollector } from '../core/collector.js';
import { GateTracker } from '../core/gates.js';
import { LOCCounter } from '../core/loc.js';
import { MetricsCalculator } from '../core/metrics.js';

// ============================================================================
// CLI Commands
// ============================================================================

/**
 * Start command - launches the API server
 */
async function startCommand(options: { port?: string }): Promise<void> {
  const port = options.port !== undefined ? parseInt(options.port, 10) : 3333;

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Error: Invalid port number: ${options.port ?? 'undefined'}`);
    process.exit(1);
  }

  console.log('Starting RalphMeter API server...');
  const server = createServer();
  server.listen(port);
}

/**
 * Status command - shows running sessions summary
 */
async function statusCommand(options: { url?: string }): Promise<void> {
  const baseUrl = options.url ?? 'http://localhost:3333';

  try {
    const response = await fetch(`${baseUrl}/api/sessions`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`Error: Failed to fetch sessions (HTTP ${String(response.status)})`);
      process.exit(1);
    }

    const data = (await response.json()) as {
      sessions: Array<{
        sessionId: string;
        status: string;
        startedAt: string;
        endedAt?: string;
        success?: boolean;
        tags?: Record<string, string>;
        eventCount: number;
      }>;
      count: number;
    };

    console.log(`\n📊 RalphMeter Status\n`);
    console.log(`Total sessions: ${String(data.count)}\n`);

    if (data.sessions.length === 0) {
      console.log('No sessions found.');
      return;
    }

    // Group sessions by status
    const active = data.sessions.filter((s) => s.status === 'active');
    const completed = data.sessions.filter((s) => s.status === 'completed');
    const failed = data.sessions.filter((s) => s.status === 'failed');

    if (active.length > 0) {
      console.log(`🟢 Active Sessions (${String(active.length)}):`);
      for (const session of active) {
        const tags = session.tags !== undefined
          ? ` [${Object.entries(session.tags).map(([k, v]) => `${k}=${v}`).join(', ')}]`
          : '';
        console.log(`  • ${session.sessionId}${tags}`);
        console.log(`    Started: ${session.startedAt}`);
        console.log(`    Events: ${String(session.eventCount)}`);
      }
      console.log();
    }

    if (completed.length > 0) {
      console.log(`✅ Completed Sessions (${String(completed.length)}):`);
      for (const session of completed) {
        const successMark = session.success === true ? '✓' : '✗';
        console.log(`  ${successMark} ${session.sessionId}`);
        console.log(`    Started: ${session.startedAt}`);
        if (session.endedAt !== undefined) {
          console.log(`    Ended: ${session.endedAt}`);
        }
        console.log(`    Events: ${String(session.eventCount)}`);
      }
      console.log();
    }

    if (failed.length > 0) {
      console.log(`❌ Failed Sessions (${String(failed.length)}):`);
      for (const session of failed) {
        console.log(`  • ${session.sessionId}`);
        console.log(`    Started: ${session.startedAt}`);
        if (session.endedAt !== undefined) {
          console.log(`    Ended: ${session.endedAt}`);
        }
        console.log(`    Events: ${String(session.eventCount)}`);
      }
      console.log();
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(`Error: Cannot connect to RalphMeter server at ${baseUrl}`);
      console.error('Make sure the server is running with: ralphmeter start');
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Report command - prints full metrics report for a session
 */
async function reportCommand(
  sessionId: string,
  options: { url?: string; rootPath?: string }
): Promise<void> {
  const baseUrl = options.url ?? 'http://localhost:3333';

  try {
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (options.rootPath !== undefined) {
      queryParams.set('rootPath', options.rootPath);
    }

    const queryString = queryParams.toString();
    const url = `${baseUrl}/api/sessions/${sessionId}/metrics${queryString !== '' ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.error(`Error: Session not found: ${sessionId}`);
      } else {
        console.error(`Error: Failed to fetch metrics (HTTP ${String(response.status)})`);
      }
      process.exit(1);
    }

    const data = await response.json();

    // If we got basic metrics only
    if ('basicMetrics' in data && typeof data === 'object' && data !== null) {
      console.log(`\n📊 Session Report: ${sessionId}\n`);
      console.log('Basic Metrics:');
      const basicMetrics = data.basicMetrics as {
        totalIterations: number;
        totalTokensIn: number;
        totalTokensOut: number;
        compilationAttempts: number;
        compilationSuccesses: number;
        testAttempts: number;
        testSuccesses: number;
        storiesCompleted: number;
        storiesPassed: number;
      };
      console.log(`  Iterations: ${String(basicMetrics.totalIterations)}`);
      console.log(`  Tokens In: ${String(basicMetrics.totalTokensIn)}`);
      console.log(`  Tokens Out: ${String(basicMetrics.totalTokensOut)}`);
      console.log(`  Total Tokens: ${String(basicMetrics.totalTokensIn + basicMetrics.totalTokensOut)}`);
      console.log(`  Compilations: ${String(basicMetrics.compilationSuccesses)}/${String(basicMetrics.compilationAttempts)}`);
      console.log(`  Tests: ${String(basicMetrics.testSuccesses)}/${String(basicMetrics.testAttempts)}`);
      console.log(`  Stories: ${String(basicMetrics.storiesPassed)}/${String(basicMetrics.storiesCompleted)}`);
      console.log('\n💡 Tip: Use --root-path to get full metrics with LOC analysis\n');
      return;
    }

    // Full metrics report
    if ('metrics' in data && typeof data === 'object' && data !== null) {
      const report = data as {
        metrics: {
          verifiedLOC: number;
          totalLOC: number;
          verificationRate: number;
          locPerMinute: number;
          vlocPerMinute: number;
          tokensPerLOC: number;
          poeLOC: number;
          totalMinutes: number;
          totalTokens: number;
          codeLines: number;
          commentLines: number;
          blankLines: number;
        };
        locBreakdown: {
          total: number;
          code: number;
          comments: number;
          blank: number;
        };
        sessionMetrics: {
          totalIterations: number;
          totalTokensIn: number;
          totalTokensOut: number;
        } | null;
        gateStats: {
          overallPoE: number;
          gates: Record<string, { linesChecked: number; linesPassed: number; passRate: number; poe: number }>;
        } | null;
      };

      console.log(`\n📊 Full Metrics Report: ${sessionId}\n`);

      // Core metrics
      console.log('═══ Core Metrics ═══');
      console.log(`  Ralph (tokens/LOC): ${report.metrics.tokensPerLOC.toFixed(2)}`);
      console.log(`  Verified LOC: ${String(report.metrics.verifiedLOC)} / ${String(report.metrics.totalLOC)} (${(report.metrics.verificationRate * 100).toFixed(1)}%)`);
      console.log(`  PoE-LOC: ${(report.metrics.poeLOC * 100).toFixed(2)}%`);
      console.log();

      // Productivity
      console.log('═══ Productivity ═══');
      console.log(`  Duration: ${report.metrics.totalMinutes.toFixed(1)} minutes`);
      console.log(`  LOC/min: ${report.metrics.locPerMinute.toFixed(1)}`);
      console.log(`  vLOC/min: ${report.metrics.vlocPerMinute.toFixed(1)}`);
      console.log(`  Total Tokens: ${String(report.metrics.totalTokens)}`);
      console.log();

      // LOC breakdown
      console.log('═══ LOC Breakdown ═══');
      console.log(`  Total Lines: ${String(report.locBreakdown.total)}`);
      console.log(`  Code: ${String(report.locBreakdown.code)}`);
      console.log(`  Comments: ${String(report.locBreakdown.comments)}`);
      console.log(`  Blank: ${String(report.locBreakdown.blank)}`);
      console.log();

      // Gate statistics
      if (report.gateStats !== null) {
        console.log('═══ Gate Statistics ═══');
        console.log(`  Overall PoE: ${(report.gateStats.overallPoE * 100).toFixed(2)}%`);
        for (const [gate, stats] of Object.entries(report.gateStats.gates)) {
          console.log(`  ${gate}:`);
          console.log(`    Lines: ${String(stats.linesPassed)} / ${String(stats.linesChecked)} (${(stats.passRate * 100).toFixed(1)}%)`);
          console.log(`    PoE: ${(stats.poe * 100).toFixed(2)}%`);
        }
        console.log();
      }

      // Session metrics
      if (report.sessionMetrics !== null) {
        console.log('═══ Session Metrics ═══');
        console.log(`  Iterations: ${String(report.sessionMetrics.totalIterations)}`);
        console.log(`  Tokens In: ${String(report.sessionMetrics.totalTokensIn)}`);
        console.log(`  Tokens Out: ${String(report.sessionMetrics.totalTokensOut)}`);
        console.log();
      }
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(`Error: Cannot connect to RalphMeter server at ${baseUrl}`);
      console.error('Make sure the server is running with: ralphmeter start');
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Local report command - generates report without server
 */
async function localReportCommand(
  sessionId: string,
  options: { rootPath?: string }
): Promise<void> {
  console.error('Error: Local report generation not yet implemented.');
  console.error('Please use the API server: ralphmeter report <sessionId> --url http://localhost:3333');
  process.exit(1);
}

// ============================================================================
// Main Program
// ============================================================================

const program = new Command();

program
  .name('ralphmeter')
  .description('RalphMeter - Metering and transparency layer for AI coding agents')
  .version('0.1.0');

// Start command
program
  .command('start')
  .description('Launch the RalphMeter API server')
  .option('-p, --port <port>', 'Port to listen on', '3333')
  .action(startCommand);

// Status command
program
  .command('status')
  .description('Show running sessions summary')
  .option('--url <url>', 'API server URL', 'http://localhost:3333')
  .action(statusCommand);

// Report command
program
  .command('report <sessionId>')
  .description('Print full metrics report for a session')
  .option('--url <url>', 'API server URL', 'http://localhost:3333')
  .option('--root-path <path>', 'Root path of the codebase for LOC analysis')
  .action(reportCommand);

// Parse arguments
program.parse();
