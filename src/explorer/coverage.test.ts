/**
 * Tests for CoverageCollector
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CoverageCollector } from './coverage.js';
import { isOk, isErr } from '../shared/result.js';

describe('CoverageCollector', () => {
  let collector: CoverageCollector;
  const testCoverageDir = '.test-coverage-tmp';

  beforeEach(() => {
    collector = new CoverageCollector();
    // Clean up any leftover coverage directories
    if (fs.existsSync(testCoverageDir)) {
      fs.rmSync(testCoverageDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test coverage directory
    if (fs.existsSync(testCoverageDir)) {
      fs.rmSync(testCoverageDir, { recursive: true, force: true });
    }
    collector.cleanup();
  });

  describe('startInstrumented', () => {
    it('should start a process with coverage instrumentation', () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.pid).toBeGreaterThan(0);
        expect(result.value.coverageDir).toBe(testCoverageDir);
      }
      expect(collector.isRunning()).toBe(true);
    });

    it('should return error if command is empty', () => {
      const result = collector.startInstrumented('', {
        coverageDir: testCoverageDir,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toContain('Invalid command');
      }
    });

    it('should return error if process is already running', () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result1 = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });
      expect(isOk(result1)).toBe(true);

      const result2 = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });
      expect(isErr(result2)).toBe(true);
      if (isErr(result2)) {
        expect(result2.error).toContain('already running');
      }
    });

    it('should create coverage directory', () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });

      expect(isOk(result)).toBe(true);
      expect(fs.existsSync(testCoverageDir)).toBe(true);
    });

    it('should clean up old coverage directory before starting', () => {
      // Create a dummy file in the coverage directory
      fs.mkdirSync(testCoverageDir, { recursive: true });
      fs.writeFileSync(path.join(testCoverageDir, 'old-file.txt'), 'old');

      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });

      expect(isOk(result)).toBe(true);
      expect(fs.existsSync(path.join(testCoverageDir, 'old-file.txt'))).toBe(
        false
      );
    });

    it('should accept custom include patterns', () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
        include: ['src/**/*.ts', 'lib/**/*.js'],
      });

      expect(isOk(result)).toBe(true);
    });

    it('should accept custom exclude patterns', () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
        exclude: ['**/*.test.ts', '**/fixtures/**'],
      });

      expect(isOk(result)).toBe(true);
    });

    it('should accept custom environment variables', () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
        env: { NODE_ENV: 'test', CUSTOM_VAR: 'value' },
      });

      expect(isOk(result)).toBe(true);
    });
  });

  describe('stopAndCollect', () => {
    it('should return error if no process is running', async () => {
      const result = await collector.stopAndCollect();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toContain('No process is running');
      }
    });

    it('should stop process and collect coverage data', async () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const startResult = collector.startInstrumented(
        `node ${sampleAppPath}`,
        {
          coverageDir: testCoverageDir,
        }
      );
      expect(isOk(startResult)).toBe(true);

      // Wait for the app to complete and c8 to write files (sample app exits after 100ms)
      // Add extra buffer when running with other tests
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const result = await collector.stopAndCollect();

      if (isErr(result)) {
        console.log('Stop and collect error:', result.error);
        // Check if directory exists
        console.log('Coverage dir exists:', fs.existsSync(testCoverageDir));
        if (fs.existsSync(testCoverageDir)) {
          const files = fs.readdirSync(testCoverageDir);
          console.log('Files in coverage dir:', files);
        }
      }

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toHaveProperty('executed');
        expect(result.value).toHaveProperty('notExecuted');
        expect(Array.isArray(result.value.executed)).toBe(true);
        expect(Array.isArray(result.value.notExecuted)).toBe(true);
      }
      expect(collector.isRunning()).toBe(false);
    }, 15000);

    it('should identify executed lines', async () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const startResult = collector.startInstrumented(
        `node ${sampleAppPath}`,
        {
          coverageDir: testCoverageDir,
        }
      );
      expect(isOk(startResult)).toBe(true);

      // Wait for the app to complete (sample app exits after 100ms)
      await new Promise((resolve) => setTimeout(resolve, 800));

      const result = await collector.stopAndCollect();

      if (isErr(result)) {
        console.log('Identify executed lines error:', result.error);
      }

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const { executed } = result.value;
        // Should have some executed lines
        expect(executed.length).toBeGreaterThan(0);

        // Each executed line should have filePath and lineNumber
        for (const line of executed) {
          expect(line).toHaveProperty('filePath');
          expect(line).toHaveProperty('lineNumber');
          expect(typeof line.filePath).toBe('string');
          expect(typeof line.lineNumber).toBe('number');
          expect(line.lineNumber).toBeGreaterThan(0);
        }
      }
    }, 10000);

    it('should identify non-executed lines', async () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const startResult = collector.startInstrumented(
        `node ${sampleAppPath}`,
        {
          coverageDir: testCoverageDir,
        }
      );
      expect(isOk(startResult)).toBe(true);

      // Wait for the app to complete (sample app exits after 100ms)
      await new Promise((resolve) => setTimeout(resolve, 800));

      const result = await collector.stopAndCollect();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const { notExecuted } = result.value;
        // Should have some non-executed lines (the unused() function)
        expect(notExecuted.length).toBeGreaterThan(0);

        // Each non-executed line should have filePath and lineNumber
        for (const line of notExecuted) {
          expect(line).toHaveProperty('filePath');
          expect(line).toHaveProperty('lineNumber');
          expect(typeof line.filePath).toBe('string');
          expect(typeof line.lineNumber).toBe('number');
          expect(line.lineNumber).toBeGreaterThan(0);
        }
      }
    }, 10000);
  });

  describe('isRunning', () => {
    it('should return false when no process is running', () => {
      expect(collector.isRunning()).toBe(false);
    });

    it('should return true when process is running', () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });
      expect(isOk(result)).toBe(true);

      expect(collector.isRunning()).toBe(true);
    });

    it('should return false after stopAndCollect', async () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const startResult = collector.startInstrumented(
        `node ${sampleAppPath}`,
        {
          coverageDir: testCoverageDir,
        }
      );
      expect(isOk(startResult)).toBe(true);

      // Wait for the app to complete (sample app exits after 100ms)
      await new Promise((resolve) => setTimeout(resolve, 800));
      await collector.stopAndCollect();

      expect(collector.isRunning()).toBe(false);
    }, 10000);
  });

  describe('getElapsedTime', () => {
    it('should return null when no process has started', () => {
      expect(collector.getElapsedTime()).toBeNull();
    });

    it('should return elapsed time when process is running', async () => {
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      const result = collector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });
      expect(isOk(result)).toBe(true);

      const delayMs = 100;
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const elapsed = collector.getElapsedTime();
      expect(elapsed).not.toBeNull();
      // Allow for slight timing variance (10ms buffer)
      const minExpectedElapsedMs = delayMs - 10;
      expect(elapsed).toBeGreaterThanOrEqual(minExpectedElapsedMs);
    });
  });

  describe('cleanup', () => {
    it('should remove coverage directory', () => {
      fs.mkdirSync(testCoverageDir, { recursive: true });
      fs.writeFileSync(path.join(testCoverageDir, 'test.txt'), 'test');

      // Create a new collector with custom coverage directory
      const customCollector = new CoverageCollector();
      const sampleAppPath = path.join(
        __dirname,
        'test-fixtures',
        'sample-app.js'
      );
      customCollector.startInstrumented(`node ${sampleAppPath}`, {
        coverageDir: testCoverageDir,
      });

      expect(fs.existsSync(testCoverageDir)).toBe(true);

      customCollector.cleanup();

      expect(fs.existsSync(testCoverageDir)).toBe(false);
    });

    it('should not throw if directory does not exist', () => {
      expect(() => { collector.cleanup(); }).not.toThrow();
    });
  });
});
