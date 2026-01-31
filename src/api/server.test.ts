/**
 * API Server tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createServer, type RalphMeterServer } from './server.js';

describe('RalphMeterServer', () => {
  let server: RalphMeterServer;
  let request: ReturnType<typeof supertest>;

  beforeEach(() => {
    server = createServer();
    request = supertest(server.getApp());
  });

  // ============================================================================
  // Health Check
  // ============================================================================

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request.get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        service: 'ralphmeter',
      });
    });
  });

  // ============================================================================
  // POST /api/sessions
  // ============================================================================

  describe('POST /api/sessions', () => {
    it('should create a new session without tags', async () => {
      const response = await request
        .post('/api/sessions')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'active',
      });
      expect(response.body.sessionId).toBeDefined();
      expect(typeof response.body.sessionId).toBe('string');
      expect(response.body.createdAt).toBeDefined();
    });

    it('should create a new session with tags', async () => {
      const tags = { mode: 'wiggum', methodology: 'tdd' };
      const response = await request
        .post('/api/sessions')
        .send({ tags });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'active',
      });
      expect(response.body.sessionId).toBeDefined();
    });

    it('should validate tags field type', async () => {
      const response = await request
        .post('/api/sessions')
        .send({ tags: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid request body', async () => {
      const response = await request
        .post('/api/sessions')
        .send({ tags: { key: 123 } }); // number value instead of string

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // POST /api/sessions/:id/events
  // ============================================================================

  describe('POST /api/sessions/:id/events', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await request.post('/api/sessions').send({});
      sessionId = response.body.sessionId as string;
    });

    it('should emit a valid event to session', async () => {
      const event = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'iteration_start',
        payload: { 
          iterationNumber: 1,
          storyId: 'US-001' 
        },
      };

      const response = await request
        .post(`/api/sessions/${sessionId}/events`)
        .send({ event });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        eventType: 'iteration_start',
      });
    });

    it('should emit tokens_in event', async () => {
      const event = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'tokens_in',
        payload: { count: 100 },
      };

      const response = await request
        .post(`/api/sessions/${sessionId}/events`)
        .send({ event });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        eventType: 'tokens_in',
      });
    });

    it('should reject event with mismatched sessionId', async () => {
      // Use a different but valid UUID
      const differentSessionId = crypto.randomUUID();
      
      const event = {
        timestamp: new Date().toISOString(),
        sessionId: differentSessionId,
        eventType: 'iteration_start',
        payload: { 
          iterationNumber: 1,
          storyId: 'US-001' 
        },
      };

      const response = await request
        .post(`/api/sessions/${sessionId}/events`)
        .send({ event });

      expect(response.status).toBe(400);
      // The session ID check happens AFTER event validation succeeds
      expect(response.body.code).toBe('SESSION_ID_MISMATCH');
    });

    it('should reject invalid event structure', async () => {
      const response = await request
        .post(`/api/sessions/${sessionId}/events`)
        .send({ event: { invalid: true } });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_EVENT');
    });

    it('should reject missing event field', async () => {
      const response = await request
        .post(`/api/sessions/${sessionId}/events`)
        .send({ notEvent: { invalid: true } }); // Wrong field name

      expect(response.status).toBe(400);
      // The event validation fails because notEvent is treated as unknown
      expect(response.body.code).toBe('INVALID_EVENT');
    });
  });

  // ============================================================================
  // GET /api/sessions
  // ============================================================================

  describe('GET /api/sessions', () => {
    it('should return empty list when no sessions exist', async () => {
      const response = await request.get('/api/sessions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        sessions: [],
        count: 0,
      });
    });

    it('should list all sessions', async () => {
      // Create two sessions
      const response1 = await request.post('/api/sessions').send({});
      const response2 = await request
        .post('/api/sessions')
        .send({ tags: { mode: 'test' } });

      const sessionId1 = response1.body.sessionId as string;
      const sessionId2 = response2.body.sessionId as string;

      // List sessions
      const response = await request.get('/api/sessions');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.sessions).toHaveLength(2);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const session1 = response.body.sessions.find(
        (s: { sessionId: string }) => s.sessionId === sessionId1
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const session2 = response.body.sessions.find(
        (s: { sessionId: string }) => s.sessionId === sessionId2
      );

      expect(session1).toMatchObject({
        sessionId: sessionId1,
        status: 'active',
        eventCount: 1, // session_start event
      });

      expect(session2).toMatchObject({
        sessionId: sessionId2,
        status: 'active',
        eventCount: 1,
        tags: { mode: 'test' },
      });
    });
  });

  // ============================================================================
  // GET /api/sessions/:id
  // ============================================================================

  describe('GET /api/sessions/:id', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await request
        .post('/api/sessions')
        .send({ tags: { env: 'test' } });
      sessionId = response.body.sessionId as string;
    });

    it('should return session details', async () => {
      const response = await request.get(`/api/sessions/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        sessionId,
        status: 'active',
        tags: { env: 'test' },
      });
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0].eventType).toBe('session_start');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request.get(
        '/api/sessions/00000000-0000-0000-0000-000000000000'
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should include all events', async () => {
      // Emit additional events
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'iteration_start',
          payload: { 
            iterationNumber: 1,
            storyId: 'US-001' 
          },
        },
      });

      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_in',
          payload: { count: 150 },
        },
      });

      const response = await request.get(`/api/sessions/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(3);
    });
  });

  // ============================================================================
  // GET /api/sessions/:id/metrics
  // ============================================================================

  describe('GET /api/sessions/:id/metrics', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await request.post('/api/sessions').send({});
      sessionId = response.body.sessionId as string;

      // Emit some events to generate metrics
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'iteration_start',
          payload: { 
            iterationNumber: 1,
            storyId: 'US-001' 
          },
        },
      });

      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_in',
          payload: { count: 100 },
        },
      });

      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_out',
          payload: { count: 50 },
        },
      });

      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'iteration_end',
          payload: { 
            iterationNumber: 1,
            storyId: 'US-001',
            success: true
          },
        },
      });
    });

    it('should return basic metrics without rootPath', async () => {
      const response = await request.get(`/api/sessions/${sessionId}/metrics`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId', sessionId);
      expect(response.body).toHaveProperty('basicMetrics');
      expect(response.body.basicMetrics).toMatchObject({
        totalIterations: 1,
        totalTokensIn: 100,
        totalTokensOut: 50,
      });
    });

    it('should return full metrics report with rootPath', async () => {
      const response = await request
        .get(`/api/sessions/${sessionId}/metrics`)
        .query({ rootPath: process.cwd() });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('synthTrend');
      expect(response.body).toHaveProperty('locBreakdown');
      expect(response.body).toHaveProperty('gateStats');
      expect(response.body).toHaveProperty('sessionMetrics');

      // Verify metrics structure
      expect(response.body.metrics).toHaveProperty('totalLOC');
      expect(response.body.metrics).toHaveProperty('verifiedLOC');
      expect(response.body.metrics).toHaveProperty('tokensPerLOC');
      expect(response.body.metrics.totalTokens).toBe(150);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request.get(
        '/api/sessions/00000000-0000-0000-0000-000000000000/metrics'
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should reject invalid rootPath query parameter', async () => {
      const response = await request
        .get(`/api/sessions/${sessionId}/metrics`)
        .query({ rootPath: ['not', 'a', 'string'] }); // Array instead of string

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request.get('/api/unknown');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    it('should support full session workflow', async () => {
      // 1. Create session
      const createResponse = await request
        .post('/api/sessions')
        .send({ tags: { test: 'workflow' } });
      expect(createResponse.status).toBe(201);
      const sessionId = createResponse.body.sessionId as string;

      // 2. Start iteration
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'iteration_start',
          payload: { 
            iterationNumber: 1,
            storyId: 'US-001' 
          },
        },
      });

      // 3. Record tokens
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_in',
          payload: { count: 1000 },
        },
      });

      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_out',
          payload: { count: 500 },
        },
      });

      // 4. Record compilation
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'compilation_result',
          payload: { success: true, errors: [] },
        },
      });

      // 5. Record test result
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'test_result',
          payload: { 
            success: true, 
            totalTests: 10,
            passed: 10, 
            failed: 0
          },
        },
      });

      // 6. End iteration
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'iteration_end',
          payload: { 
            iterationNumber: 1,
            storyId: 'US-001',
            success: true
          },
        },
      });

      // 7. Complete story
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'story_complete',
          payload: { storyId: 'US-001', passes: true },
        },
      });

      // 8. End session
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'session_end',
          payload: { success: true },
        },
      });

      // 9. Verify session state
      const sessionResponse = await request.get(`/api/sessions/${sessionId}`);
      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body.status).toBe('completed');
      expect(sessionResponse.body.success).toBe(true);
      expect(sessionResponse.body.events).toHaveLength(9);

      // 10. Get metrics
      const metricsResponse = await request.get(
        `/api/sessions/${sessionId}/metrics`
      );
      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.basicMetrics).toMatchObject({
        totalIterations: 1,
        totalTokensIn: 1000,
        totalTokensOut: 500,
        compilationAttempts: 1,
        compilationSuccesses: 1,
        testAttempts: 1,
        testSuccesses: 1,
        storiesCompleted: 1,
        storiesPassed: 1,
      });
    });
  });

  // ============================================================================
  // GET /api/sessions/:id/export
  // ============================================================================

  describe('GET /api/sessions/:id/export', () => {
    it('should export session data without rootPath', async () => {
      // 1. Create a session
      const createResponse = await request.post('/api/sessions').send({});
      const sessionId = createResponse.body.sessionId as string;

      // 2. Add some events
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_in',
          payload: { count: 100 },
        },
      });

      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_out',
          payload: { count: 200 },
        },
      });

      // 3. Export without rootPath
      const response = await request.get(`/api/sessions/${sessionId}/export`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        version: 'v1',
        sessionMetadata: {
          id: sessionId,
          status: 'active',
        },
      });
      expect(response.body.exportedAt).toBeDefined();
      expect(response.body.allEvents).toHaveLength(3); // session_start + 2 token events
      expect(response.body.sessionMetrics).toBeTruthy();
      expect(response.body.sessionMetrics.totalTokensIn).toBe(100);
      expect(response.body.sessionMetrics.totalTokensOut).toBe(200);
      expect(response.body.computedMetrics).toBeNull();
      expect(response.body.locBreakdown).toBeNull();
      expect(response.body.synthTrend).toEqual([]);
    });

    it('should export session data with rootPath', async () => {
      // 1. Create a session
      const createResponse = await request.post('/api/sessions').send({});
      const sessionId = createResponse.body.sessionId as string;

      // 2. Add some events
      await request.post(`/api/sessions/${sessionId}/events`).send({
        event: {
          timestamp: new Date().toISOString(),
          sessionId,
          eventType: 'tokens_in',
          payload: { count: 100 },
        },
      });

      // 3. Export with rootPath
      const response = await request
        .get(`/api/sessions/${sessionId}/export`)
        .query({ rootPath: process.cwd() });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        version: 'v1',
        sessionMetadata: {
          id: sessionId,
          status: 'active',
        },
      });
      expect(response.body.computedMetrics).toBeTruthy();
      expect(response.body.locBreakdown).toBeTruthy();
      expect(response.body.computedMetrics.totalLOC).toBeGreaterThan(0);
      expect(response.body.locBreakdown.total).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request.get(
        '/api/sessions/00000000-0000-0000-0000-000000000000/export'
      );

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should include gate history when gates are recorded', async () => {
      // 1. Create a session
      const createResponse = await request.post('/api/sessions').send({});
      const sessionId = createResponse.body.sessionId as string;

      // 2. Record some gate results (via the gate tracker directly)
      const gateTracker = server.getGateTracker();
      gateTracker.record(sessionId, {
        timestamp: new Date().toISOString(),
        gate: 'G1_COMPILE',
        filePath: 'test.ts',
        lineResults: [
          { lineNumber: 1, passed: true },
          { lineNumber: 2, passed: false, errorMessage: 'Type error' },
        ],
      });

      // 3. Export the session
      const response = await request.get(`/api/sessions/${sessionId}/export`);

      expect(response.status).toBe(200);
      expect(response.body.gateHistory).toBeTruthy();
      expect(response.body.gateHistory.totalLinesChecked).toBe(2);
      expect(response.body.gateHistory.perGate).toBeTruthy();
      expect(response.body.gateHistory.perGate.G1_COMPILE).toBeTruthy();
    });
  });
});
