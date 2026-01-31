/**
 * Tests for Ralph Integration - Hook System
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import {
  createRalphHooks,
  type SessionStartParams,
  type SessionEndParams,
  type IterationStartParams,
  type IterationEndParams,
  type CompilationParams,
  type TestRunParams,
  type StoryCompleteParams,
} from './ralph-hooks.js';

// ============================================================================
// Test Setup
// ============================================================================

/**
 * Mock RalphMeter API server for testing
 */
function createMockServer(): { app: Express; events: unknown[] } {
  const app = express();
  const events: unknown[] = [];

  app.use(express.json());

  // POST /api/sessions - create session
  app.post('/api/sessions', (_req: Request, res: Response) => {
    res.json({
      sessionId: crypto.randomUUID(),
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  });

  // POST /api/sessions/:id/events - emit event
  app.post('/api/sessions/:id/events', (req: Request, res: Response) => {
    events.push(req.body.event);
    res.json({ success: true });
  });

  return { app, events };
}

describe('RalphHooks', () => {
  let server: Server;
  let mockEvents: unknown[];
  let meterUrl: string;

  beforeAll(async () => {
    const { app, events } = createMockServer();
    mockEvents = events;

    // Start server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address !== null && typeof address !== 'string') {
          meterUrl = `http://localhost:${String(address.port)}`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  // ============================================================================
  // Factory Tests
  // ============================================================================

  describe('createRalphHooks', () => {
    it('should create hooks with string URL', () => {
      const hooks = createRalphHooks('http://localhost:3333');

      expect(hooks).toBeDefined();
      expect(hooks.getSessionId()).toBeDefined();
      expect(typeof hooks.getSessionId()).toBe('string');
    });

    it('should create hooks with config object', () => {
      const sessionId = crypto.randomUUID();
      const hooks = createRalphHooks({
        meterUrl: 'http://localhost:3333',
        sessionId,
        verbose: false,
        timeout: 5000,
      });

      expect(hooks).toBeDefined();
      expect(hooks.getSessionId()).toBe(sessionId);
    });

    it('should generate sessionId if not provided in config', () => {
      const hooks = createRalphHooks({
        meterUrl: 'http://localhost:3333',
      });

      expect(hooks.getSessionId()).toBeDefined();
      expect(typeof hooks.getSessionId()).toBe('string');
    });

    it('should use default values for optional config', () => {
      const hooks = createRalphHooks({
        meterUrl: 'http://localhost:3333',
      });

      expect(hooks).toBeDefined();
      // Just verify it works - defaults are internal
    });

    it('should normalize trailing slash in meterUrl', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks({
        meterUrl: `${meterUrl}/`, // with trailing slash
        timeout: 1000,
      });

      await hooks.onSessionStart({});

      // Should still work (events sent successfully)
      expect(mockEvents.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Hook Tests
  // ============================================================================

  describe('onSessionStart', () => {
    it('should send session_start event', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);

      const params: SessionStartParams = {
        tags: { mode: 'DEVELOP', methodology: 'ralph-wiggum' },
      };

      await hooks.onSessionStart(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        sessionId: string;
        timestamp: string;
        payload: { tags?: Record<string, string> };
      };
      expect(event.eventType).toBe('session_start');
      expect(event.sessionId).toBe(hooks.getSessionId());
      expect(event.payload.tags).toEqual(params.tags);
      expect(event.timestamp).toBeDefined();
    });

    it('should send session_start without tags', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);

      await hooks.onSessionStart({});

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { tags?: Record<string, string> };
      };
      expect(event.eventType).toBe('session_start');
      expect(event.payload.tags).toBeUndefined();
    });
  });

  describe('onSessionEnd', () => {
    it('should send session_end event with success', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: SessionEndParams = {
        success: true,
        reason: 'All stories completed',
      };

      await hooks.onSessionEnd(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { success: boolean; reason?: string };
      };
      expect(event.eventType).toBe('session_end');
      expect(event.payload.success).toBe(true);
      expect(event.payload.reason).toBe('All stories completed');
    });

    it('should send session_end event without reason', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      await hooks.onSessionEnd({ success: false });

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { success: boolean; reason?: string };
      };
      expect(event.eventType).toBe('session_end');
      expect(event.payload.success).toBe(false);
      expect(event.payload.reason).toBeUndefined();
    });
  });

  describe('onIterationStart', () => {
    it('should send iteration_start event', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: IterationStartParams = {
        iterationNumber: 1,
        storyId: 'US-001',
      };

      await hooks.onIterationStart(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { iterationNumber: number; storyId: string };
      };
      expect(event.eventType).toBe('iteration_start');
      expect(event.payload.iterationNumber).toBe(1);
      expect(event.payload.storyId).toBe('US-001');
    });
  });

  describe('onIterationEnd', () => {
    it('should send iteration_end event', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: IterationEndParams = {
        iterationNumber: 1,
        storyId: 'US-001',
        success: true,
      };

      await hooks.onIterationEnd(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { iterationNumber: number; storyId: string; success: boolean };
      };
      expect(event.eventType).toBe('iteration_end');
      expect(event.payload.iterationNumber).toBe(1);
      expect(event.payload.storyId).toBe('US-001');
      expect(event.payload.success).toBe(true);
    });
  });

  describe('onTokensIn', () => {
    it('should send tokens_in event with model', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      await hooks.onTokensIn({ count: 1000, model: 'gpt-4' });

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { count: number; model?: string };
      };
      expect(event.eventType).toBe('tokens_in');
      expect(event.payload.count).toBe(1000);
      expect(event.payload.model).toBe('gpt-4');
    });

    it('should send tokens_in event without model', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      await hooks.onTokensIn({ count: 500 });

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { count: number; model?: string };
      };
      expect(event.eventType).toBe('tokens_in');
      expect(event.payload.count).toBe(500);
      expect(event.payload.model).toBeUndefined();
    });
  });

  describe('onTokensOut', () => {
    it('should send tokens_out event', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      await hooks.onTokensOut({ count: 750, model: 'gpt-4' });

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { count: number; model?: string };
      };
      expect(event.eventType).toBe('tokens_out');
      expect(event.payload.count).toBe(750);
      expect(event.payload.model).toBe('gpt-4');
    });
  });

  describe('onCompilation', () => {
    it('should send compilation_result event for success', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: CompilationParams = {
        success: true,
      };

      await hooks.onCompilation(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: {
          success: boolean;
          errorCount?: number;
          errors?: {
            file: string;
            line: number;
            column?: number;
            message: string;
          }[];
        };
      };
      expect(event.eventType).toBe('compilation_result');
      expect(event.payload.success).toBe(true);
      expect(event.payload.errorCount).toBeUndefined();
      expect(event.payload.errors).toBeUndefined();
    });

    it('should send compilation_result event for failure with errors', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: CompilationParams = {
        success: false,
        errorCount: 2,
        errors: [
          {
            file: 'src/index.ts',
            line: 42,
            column: 10,
            message: 'Type error',
          },
          {
            file: 'src/utils.ts',
            line: 15,
            message: 'Missing import',
          },
        ],
      };

      await hooks.onCompilation(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: {
          success: boolean;
          errorCount?: number;
          errors?: {
            file: string;
            line: number;
            column?: number;
            message: string;
          }[];
        };
      };
      expect(event.eventType).toBe('compilation_result');
      expect(event.payload.success).toBe(false);
      expect(event.payload.errorCount).toBe(2);
      expect(event.payload.errors).toHaveLength(2);
      expect(event.payload.errors?.[0]?.file).toBe('src/index.ts');
    });
  });

  describe('onTestRun', () => {
    it('should send test_result event with all fields', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: TestRunParams = {
        success: true,
        totalTests: 50,
        passed: 48,
        failed: 0,
        skipped: 2,
        coveragePercent: 85.5,
      };

      await hooks.onTestRun(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: {
          success: boolean;
          totalTests: number;
          passed: number;
          failed: number;
          skipped?: number;
          coveragePercent?: number;
        };
      };
      expect(event.eventType).toBe('test_result');
      expect(event.payload.success).toBe(true);
      expect(event.payload.totalTests).toBe(50);
      expect(event.payload.passed).toBe(48);
      expect(event.payload.failed).toBe(0);
      expect(event.payload.skipped).toBe(2);
      expect(event.payload.coveragePercent).toBe(85.5);
    });

    it('should send test_result event without optional fields', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: TestRunParams = {
        success: false,
        totalTests: 20,
        passed: 18,
        failed: 2,
      };

      await hooks.onTestRun(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: {
          success: boolean;
          totalTests: number;
          passed: number;
          failed: number;
          skipped?: number;
          coveragePercent?: number;
        };
      };
      expect(event.eventType).toBe('test_result');
      expect(event.payload.success).toBe(false);
      expect(event.payload.totalTests).toBe(20);
      expect(event.payload.passed).toBe(18);
      expect(event.payload.failed).toBe(2);
      expect(event.payload.skipped).toBeUndefined();
      expect(event.payload.coveragePercent).toBeUndefined();
    });
  });

  describe('onStoryComplete', () => {
    it('should send story_complete event with locCount', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: StoryCompleteParams = {
        storyId: 'US-001',
        passes: true,
        locCount: 150,
      };

      await hooks.onStoryComplete(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { storyId: string; passes: boolean; locCount?: number };
      };
      expect(event.eventType).toBe('story_complete');
      expect(event.payload.storyId).toBe('US-001');
      expect(event.payload.passes).toBe(true);
      expect(event.payload.locCount).toBe(150);
    });

    it('should send story_complete event without locCount', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);
      await hooks.onSessionStart({});
      mockEvents.length = 0;

      const params: StoryCompleteParams = {
        storyId: 'US-002',
        passes: false,
      };

      await hooks.onStoryComplete(params);

      expect(mockEvents.length).toBe(1);
      const event = mockEvents[0] as {
        eventType: string;
        payload: { storyId: string; passes: boolean; locCount?: number };
      };
      expect(event.eventType).toBe('story_complete');
      expect(event.payload.storyId).toBe('US-002');
      expect(event.payload.passes).toBe(false);
      expect(event.payload.locCount).toBeUndefined();
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Complete workflow', () => {
    it('should handle a complete Ralph session workflow', async () => {
      mockEvents.length = 0;
      const hooks = createRalphHooks(meterUrl);

      // Session start
      await hooks.onSessionStart({ tags: { mode: 'DEVELOP' } });

      // Iteration 1 for US-001
      await hooks.onIterationStart({ iterationNumber: 1, storyId: 'US-001' });
      await hooks.onTokensIn({ count: 1200, model: 'gpt-4' });
      await hooks.onTokensOut({ count: 800, model: 'gpt-4' });
      await hooks.onCompilation({ success: false, errorCount: 3 });
      await hooks.onIterationEnd({
        iterationNumber: 1,
        storyId: 'US-001',
        success: false,
      });

      // Iteration 2 for US-001
      await hooks.onIterationStart({ iterationNumber: 2, storyId: 'US-001' });
      await hooks.onTokensIn({ count: 1000, model: 'gpt-4' });
      await hooks.onTokensOut({ count: 700, model: 'gpt-4' });
      await hooks.onCompilation({ success: true });
      await hooks.onTestRun({
        success: true,
        totalTests: 10,
        passed: 10,
        failed: 0,
      });
      await hooks.onIterationEnd({
        iterationNumber: 2,
        storyId: 'US-001',
        success: true,
      });
      await hooks.onStoryComplete({
        storyId: 'US-001',
        passes: true,
        locCount: 100,
      });

      // Session end
      await hooks.onSessionEnd({ success: true, reason: 'All stories complete' });

      // Verify all events were sent (14 total: 1 session_start + 12 others + 1 session_end)
      expect(mockEvents.length).toBe(14);

      const eventTypes = mockEvents.map(
        (e) => (e as { eventType: string }).eventType
      );
      expect(eventTypes).toEqual([
        'session_start',
        'iteration_start',
        'tokens_in',
        'tokens_out',
        'compilation_result',
        'iteration_end',
        'iteration_start',
        'tokens_in',
        'tokens_out',
        'compilation_result',
        'test_result',
        'iteration_end',
        'story_complete',
        'session_end',
      ]);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error handling', () => {
    it('should not throw when API is unavailable', async () => {
      const hooks = createRalphHooks({
        meterUrl: 'http://localhost:99999', // Invalid port
        timeout: 100,
      });

      // Should not throw - hooks fail gracefully
      await expect(hooks.onSessionStart({})).resolves.toBeUndefined();
      await expect(
        hooks.onIterationStart({ iterationNumber: 1, storyId: 'US-001' })
      ).resolves.toBeUndefined();
    });

    it('should handle timeout gracefully', async () => {
      // Create a slow server
      const slowApp = express();
      slowApp.use(express.json());
      slowApp.post('/api/sessions', (_req: Request, res: Response) => {
        // Delay response
        setTimeout(() => {
          res.json({ sessionId: crypto.randomUUID() });
        }, 2000);
      });

      const slowServer = await new Promise<Server>((resolve) => {
        const s = slowApp.listen(0, () => {
          resolve(s);
        });
      });

      const address = slowServer.address();
      const slowUrl =
        address !== null && typeof address !== 'string'
          ? `http://localhost:${String(address.port)}`
          : '';

      const hooks = createRalphHooks({
        meterUrl: slowUrl,
        timeout: 100, // Very short timeout
      });

      // Should not throw - hooks handle timeout gracefully
      await expect(hooks.onSessionStart({})).resolves.toBeUndefined();

      slowServer.close();
    });
  });
});
