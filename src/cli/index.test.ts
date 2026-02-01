/**
 * Tests for CLI commands
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RalphMeterServer } from '../api/server.js';
import type { Server as HttpServer } from 'node:http';
import { spawn } from 'node:child_process';

/**
 * Helper to run CLI command and capture output
 */
async function runCLI(args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('node', ['dist/cli/index.js', ...args], {
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

describe('CLI Commands', () => {
  let server: RalphMeterServer;
  let httpServer: HttpServer;
  let testPort: number;
  let serverReady: Promise<void>;

  beforeEach(async () => {
    // Start test server
    server = new RalphMeterServer();
    testPort = 0; // Use random available port

    serverReady = new Promise<void>((resolve) => {
      httpServer = server.getApp().listen(testPort, () => {
        const addr = httpServer.address();
        if (addr !== null && typeof addr === 'object') {
          testPort = addr.port;
        }
        resolve();
      });
    });

    await serverReady;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });

  describe('--help', () => {
    it('should display help for main command', async () => {
      const result = await runCLI(['--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('RalphMeter');
      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('status');
      expect(result.stdout).toContain('report');
    });

    it('should display help for start command', async () => {
      const result = await runCLI(['start', '--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Launch the RalphMeter API server');
      expect(result.stdout).toContain('--port');
    });

    it('should display help for status command', async () => {
      const result = await runCLI(['status', '--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Show running sessions summary');
      expect(result.stdout).toContain('--url');
    });

    it('should display help for report command', async () => {
      const result = await runCLI(['report', '--help']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Print full metrics report');
      expect(result.stdout).toContain('--url');
      expect(result.stdout).toContain('--root-path');
    });
  });

  describe('status command', () => {
    it('should show no sessions when server is empty', async () => {
      const result = await runCLI([
        'status',
        '--url',
        `http://localhost:${String(testPort)}`,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Total sessions: 0');
      expect(result.stdout).toContain('No sessions found');
    });

    it('should show active sessions', async () => {
      // Create a test session
      const sessionEvent = {
        timestamp: new Date().toISOString(),
        sessionId: crypto.randomUUID(),
        eventType: 'session_start' as const,
        payload: {
          tags: { test: 'cli' },
        },
      };
      server.getCollector().emit(sessionEvent);

      const result = await runCLI([
        'status',
        '--url',
        `http://localhost:${String(testPort)}`,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Total sessions: 1');
      expect(result.stdout).toContain('Active Sessions');
      expect(result.stdout).toContain(sessionEvent.sessionId);
    });

    it('should handle unreachable server', async () => {
      const result = await runCLI(['status', '--url', 'http://localhost:9999']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot connect to RalphMeter server');
    });
  });

  describe('report command', () => {
    it('should show basic metrics for existing session', async () => {
      // Create a test session
      const sessionId = crypto.randomUUID();
      const sessionEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'session_start' as const,
        payload: {},
      };
      server.getCollector().emit(sessionEvent);

      // Add some tokens
      server.getCollector().emit({
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'tokens_in',
        payload: { count: 100 },
      });

      const result = await runCLI([
        'report',
        sessionId,
        '--url',
        `http://localhost:${String(testPort)}`,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Session Report');
      expect(result.stdout).toContain('Basic Metrics');
      expect(result.stdout).toContain('Tokens In: 100');
    });

    it('should handle non-existent session', async () => {
      const result = await runCLI([
        'report',
        'non-existent-session',
        '--url',
        `http://localhost:${String(testPort)}`,
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Session not found');
    });

    it('should handle unreachable server', async () => {
      const result = await runCLI([
        'report',
        'some-session',
        '--url',
        'http://localhost:9999',
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot connect to RalphMeter server');
    });
  });
});
