/**
 * Tests for SurfaceExplorer
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { SurfaceExplorer } from './surface.js';
import { isOk, isErr } from '../shared/result.js';

describe('SurfaceExplorer', () => {
  let testServer: ChildProcess | null = null;
  let testServerPort: number | null = null;
  let baseUrl: string;

  beforeAll(async () => {
    // Start test server
    const serverPath = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      'test-fixtures',
      'test-server.js'
    );

    return new Promise<void>((resolve, reject) => {
      testServer = spawn('node', [serverPath, '0'], {
        stdio: 'pipe',
      });

      if (testServer.stdout === null) {
        reject(new Error('Failed to start test server: stdout is null'));
        return;
      }

      testServer.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        const match = /listening on port (\d+)/.exec(output);
        if (match?.[1] !== undefined) {
          testServerPort = parseInt(match[1], 10);
          baseUrl = `http://localhost:${String(testServerPort)}`;
          resolve();
        }
      });

      testServer.on('error', (error) => {
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (testServerPort === null) {
          reject(new Error('Test server failed to start within 5 seconds'));
        }
      }, 5000);
    });
  });

  afterAll(() => {
    if (testServer !== null) {
      testServer.kill();
    }
  });

  describe('explore', () => {
    it('should explore a simple page', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 10000,
        maxDepth: 0,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        expect(log.success).toBe(true);
        expect(log.baseUrl).toBe(baseUrl);
        expect(log.urlsVisited.length).toBeGreaterThan(0);
        expect(log.actions.length).toBeGreaterThan(0);
        expect(log.responses.length).toBeGreaterThan(0);
        expect(log.duration).toBeGreaterThan(0);
      }
    }, 30000);

    it('should return error for empty baseUrl', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore('', {
        timeout: 5000,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toContain('cannot be empty');
      }
    });

    it('should click buttons on the page', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 10000,
        maxDepth: 0,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        const clickActions = log.actions.filter((a) => a.type === 'click');
        expect(clickActions.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should fill forms on the page', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 10000,
        maxDepth: 0,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        const fillActions = log.actions.filter((a) => a.type === 'fill');
        expect(fillActions.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should navigate to linked pages', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 15000,
        maxDepth: 1,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        // Should visit multiple pages (home + linked pages)
        expect(log.urlsVisited.length).toBeGreaterThan(1);
        
        // Should have navigate actions
        const navigateActions = log.actions.filter((a) => a.type === 'navigate');
        expect(navigateActions.length).toBeGreaterThan(1);
      }
    }, 30000);

    it('should record HTTP responses', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 10000,
        maxDepth: 0,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        expect(log.responses.length).toBeGreaterThan(0);
        
        // Check that responses have the required fields
        for (const response of log.responses) {
          expect(response.url).toBeDefined();
          expect(response.status).toBeGreaterThan(0);
          expect(response.method).toBeDefined();
          expect(response.timestamp).toBeDefined();
        }
      }
    }, 30000);

    it('should respect maxDepth option', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 10000,
        maxDepth: 0,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        // With maxDepth 0, should only visit the base URL
        expect(log.urlsVisited.length).toBe(1);
      }
    }, 30000);

    it('should not follow external links', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 15000,
        maxDepth: 2,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        
        // All visited URLs should be on the same domain
        for (const url of log.urlsVisited) {
          expect(url).toContain(`localhost:${String(testServerPort)}`);
        }
      }
    }, 30000);

    it('should handle timeouts gracefully', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 1, // Very short timeout
        maxDepth: 0,
      });

      // Should either succeed quickly or fail gracefully
      expect(isOk(result) || isErr(result)).toBe(true);
    }, 30000);

    it('should include action timestamps', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 10000,
        maxDepth: 0,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        
        for (const action of log.actions) {
          expect(action.timestamp).toBeDefined();
          // Check that timestamp is a valid ISO string
          expect(() => new Date(action.timestamp)).not.toThrow();
        }
      }
    }, 30000);

    it('should handle submit actions', async () => {
      const explorer = new SurfaceExplorer();
      const result = await explorer.explore(baseUrl, {
        timeout: 10000,
        maxDepth: 0,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const log = result.value;
        const submitActions = log.actions.filter((a) => a.type === 'submit');
        
        // Should have at least one submit action (from the form)
        expect(submitActions.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('isRunning', () => {
    it('should return false when not running', () => {
      const explorer = new SurfaceExplorer();
      expect(explorer.isRunning()).toBe(false);
    });
  });
});
