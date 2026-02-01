/**
 * Express REST API for RalphMeter
 *
 * Provides HTTP endpoints for:
 * - Creating and managing sessions
 * - Emitting events
 * - Retrieving metrics and reports
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import { z } from 'zod';
import { EventCollector } from '../core/collector.js';
import { GateTracker } from '../core/gates.js';
import { LOCCounter } from '../core/loc.js';
import { MetricsCalculator } from '../core/metrics.js';
import { safeValidateEvent, type MeterEvent } from '../core/events.js';
import { exportSession as exportSessionData } from '../export/exporter.js';
import { ReachabilityReport } from '../explorer/report.js';
import type { CoverageData } from '../explorer/coverage.js';
import type { BarrierAnalysis } from '../explorer/barriers.js';
import {
  SessionTimelineGenerator,
  SessionDiagnosis,
} from '../analysis/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * API Error response
 */
interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Session creation request
 */
const CreateSessionSchema = z.object({
  tags: z.record(z.string(), z.string()).optional(),
});

/**
 * Event submission request
 */
const EmitEventSchema = z.object({
  event: z.unknown(), // Will be validated by safeValidateEvent
});

/**
 * Metrics query parameters
 */
const MetricsQuerySchema = z.object({
  rootPath: z.string().optional(),
});

/**
 * Reachability report request body
 */
const ReachabilityRequestSchema = z.object({
  coverage: z.object({
    executed: z.array(
      z.object({
        filePath: z.string(),
        lineNumber: z.number(),
      })
    ),
    notExecuted: z.array(
      z.object({
        filePath: z.string(),
        lineNumber: z.number(),
      })
    ),
  }),
  barriers: z.object({
    authGated: z.array(
      z.object({
        filePath: z.string(),
        lineNumber: z.number(),
      })
    ),
    permissionGated: z.array(
      z.object({
        filePath: z.string(),
        lineNumber: z.number(),
      })
    ),
    paywallGated: z.array(
      z.object({
        filePath: z.string(),
        lineNumber: z.number(),
      })
    ),
    barriers: z.array(z.unknown()),
  }),
});

/**
 * Session creation response
 */
interface CreateSessionResponse {
  sessionId: string;
  status: string;
  createdAt: string;
}

// ============================================================================
// Server Class
// ============================================================================

/**
 * Express API server for RalphMeter
 */
export class RalphMeterServer {
  private app: express.Express;
  private collector: EventCollector;
  private gateTracker: GateTracker;
  private locCounter: LOCCounter;
  private metricsCalculator: MetricsCalculator;
  private reachabilityReport: ReachabilityReport;
  private timelineGenerator: SessionTimelineGenerator;
  private diagnosis: SessionDiagnosis;

  constructor() {
    this.app = express();
    this.collector = new EventCollector();
    this.gateTracker = new GateTracker();
    this.locCounter = new LOCCounter();
    this.metricsCalculator = new MetricsCalculator(
      this.collector,
      this.gateTracker,
      this.locCounter
    );
    this.reachabilityReport = new ReachabilityReport();
    this.timelineGenerator = new SessionTimelineGenerator(this.collector);
    this.diagnosis = new SessionDiagnosis(this.collector, this.gateTracker);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Gets the Express app instance
   */
  getApp(): express.Express {
    return this.app;
  }

  /**
   * Gets the EventCollector instance (for testing)
   */
  getCollector(): EventCollector {
    return this.collector;
  }

  /**
   * Gets the GateTracker instance (for testing)
   */
  getGateTracker(): GateTracker {
    return this.gateTracker;
  }

  /**
   * Gets the LOCCounter instance (for testing)
   */
  getLOCCounter(): LOCCounter {
    return this.locCounter;
  }

  /**
   * Gets the MetricsCalculator instance (for testing)
   */
  getMetricsCalculator(): MetricsCalculator {
    return this.metricsCalculator;
  }

  /**
   * Sets up middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Sets up API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'ralphmeter' });
    });

    // POST /api/sessions - create new session
    this.app.post(
      '/api/sessions',
      this.asyncHandler(this.createSession.bind(this))
    );

    // POST /api/sessions/:id/events - emit event to session
    this.app.post(
      '/api/sessions/:id/events',
      this.asyncHandler(this.emitEvent.bind(this))
    );

    // GET /api/sessions - list all sessions
    this.app.get(
      '/api/sessions',
      this.asyncHandler(this.listSessions.bind(this))
    );

    // GET /api/sessions/:id - get session details
    this.app.get(
      '/api/sessions/:id',
      this.asyncHandler(this.getSession.bind(this))
    );

    // GET /api/sessions/:id/metrics - get calculated metrics
    this.app.get(
      '/api/sessions/:id/metrics',
      this.asyncHandler(this.getMetrics.bind(this))
    );

    // GET /api/sessions/:id/export - export session data
    this.app.get(
      '/api/sessions/:id/export',
      this.asyncHandler(this.exportSession.bind(this))
    );

    // POST /api/sessions/:id/reachability - generate reachability report
    this.app.post(
      '/api/sessions/:id/reachability',
      this.asyncHandler(this.getReachability.bind(this))
    );

    // GET /api/sessions/:id/timeline - get session timeline
    this.app.get(
      '/api/sessions/:id/timeline',
      this.asyncHandler(this.getTimeline.bind(this))
    );

    // GET /api/sessions/:id/diagnosis/:storyId - diagnose story
    this.app.get(
      '/api/sessions/:id/diagnosis/:storyId',
      this.asyncHandler(this.getDiagnosis.bind(this))
    );
  }

  /**
   * Sets up error handling middleware
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        code: 'NOT_FOUND',
      } satisfies ApiError);
    });

    // Global error handler
    this.app.use(
      (err: Error, _req: Request, res: Response, _next: NextFunction) => {
        console.error('Server error:', err);
        res.status(500).json({
          error: 'Internal Server Error',
          code: 'INTERNAL_ERROR',
          details: err.message,
        } satisfies ApiError);
      }
    );
  }

  /**
   * Wraps async route handlers to catch errors
   */
  private asyncHandler(
    fn: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => Promise<void> | void
  ): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // ============================================================================
  // Route Handlers
  // ============================================================================

  /**
   * POST /api/sessions - Create new session
   */
  private createSession(req: Request, res: Response): void {
    // Validate request body
    const parseResult = CreateSessionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.issues,
      } satisfies ApiError);
      return;
    }

    const { tags } = parseResult.data;

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Create session_start event
    const sessionStartEvent: MeterEvent = {
      timestamp: new Date().toISOString(),
      sessionId,
      eventType: 'session_start',
      payload: {
        ...(tags !== undefined && { tags }),
      },
    };

    // Emit the event
    const emitResult = this.collector.emit(sessionStartEvent);
    if (!emitResult.ok) {
      res.status(400).json({
        error: 'Failed to create session',
        code: 'SESSION_CREATE_ERROR',
        details: emitResult.error,
      } satisfies ApiError);
      return;
    }

    // Return session info
    const response: CreateSessionResponse = {
      sessionId,
      status: 'active',
      createdAt: sessionStartEvent.timestamp,
    };

    res.status(201).json(response);
  }

  /**
   * POST /api/sessions/:id/events - Emit event to session
   */
  private emitEvent(req: Request, res: Response): void {
    const sessionId = req.params['id'];

    if (sessionId === undefined || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID',
      } satisfies ApiError);
      return;
    }

    // Validate request body structure
    const bodyResult = EmitEventSchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: bodyResult.error.issues,
      } satisfies ApiError);
      return;
    }

    // Validate the event itself
    const eventResult = safeValidateEvent(bodyResult.data.event);
    if (!eventResult.ok) {
      res.status(400).json({
        error: 'Invalid event',
        code: 'INVALID_EVENT',
        details: eventResult.error,
      } satisfies ApiError);
      return;
    }

    const event = eventResult.value;

    // Verify sessionId matches
    if (event.sessionId !== sessionId) {
      res.status(400).json({
        error: 'Event sessionId does not match URL parameter',
        code: 'SESSION_ID_MISMATCH',
      } satisfies ApiError);
      return;
    }

    // Emit the event
    const emitResult = this.collector.emit(event);
    if (!emitResult.ok) {
      res.status(400).json({
        error: 'Failed to emit event',
        code: 'EMIT_ERROR',
        details: emitResult.error,
      } satisfies ApiError);
      return;
    }

    res.status(200).json({
      status: 'ok',
      eventType: event.eventType,
      timestamp: event.timestamp,
    });
  }

  /**
   * GET /api/sessions - List all sessions
   */
  private listSessions(_req: Request, res: Response): void {
    const sessions = this.collector.getAllSessions();
    res.json({
      sessions: sessions.map((s) => ({
        sessionId: s.metadata.id,
        status: s.metadata.status,
        startedAt: s.metadata.startedAt,
        endedAt: s.metadata.endedAt,
        success: s.metadata.success,
        tags: s.metadata.tags,
        eventCount: s.events.length,
      })),
      count: sessions.length,
    });
  }

  /**
   * GET /api/sessions/:id - Get session details
   */
  private getSession(req: Request, res: Response): void {
    const sessionId = req.params['id'];

    if (sessionId === undefined || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID',
      } satisfies ApiError);
      return;
    }

    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      } satisfies ApiError);
      return;
    }

    const session = sessionResult.value;
    res.json({
      sessionId: session.metadata.id,
      status: session.metadata.status,
      startedAt: session.metadata.startedAt,
      endedAt: session.metadata.endedAt,
      success: session.metadata.success,
      tags: session.metadata.tags,
      events: session.events,
    });
  }

  /**
   * GET /api/sessions/:id/metrics - Get calculated metrics
   */
  private getMetrics(req: Request, res: Response): void {
    const sessionId = req.params['id'];

    if (sessionId === undefined || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID',
      } satisfies ApiError);
      return;
    }

    // Validate query parameters
    const queryResult = MetricsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        details: queryResult.error.issues,
      } satisfies ApiError);
      return;
    }

    const { rootPath } = queryResult.data;

    // Verify session exists
    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      } satisfies ApiError);
      return;
    }

    // Get basic session metrics
    const metricsResult = this.collector.getMetrics(sessionId);
    if (!metricsResult.ok) {
      res.status(500).json({
        error: 'Failed to calculate metrics',
        code: 'METRICS_ERROR',
        details: metricsResult.error,
      } satisfies ApiError);
      return;
    }

    const basicMetrics = metricsResult.value;

    // If rootPath provided, calculate full metrics with LOC snapshot
    if (rootPath !== undefined) {
      const snapshot = this.locCounter.snapshotCodebase(rootPath);
      const reportResult = this.metricsCalculator.getReport(
        sessionId,
        snapshot
      );

      if (!reportResult.ok) {
        res.status(500).json({
          error: 'Failed to calculate report',
          code: 'REPORT_ERROR',
          details: reportResult.error,
        } satisfies ApiError);
        return;
      }

      res.json(reportResult.value);
    } else {
      // Return basic metrics only
      res.json({
        sessionId,
        basicMetrics,
      });
    }
  }

  /**
   * GET /api/sessions/:id/export - Export session data
   */
  private exportSession(req: Request, res: Response): void {
    const sessionId = req.params['id'];

    if (sessionId === undefined || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID',
      } satisfies ApiError);
      return;
    }

    // Validate query parameters
    const queryResult = MetricsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        details: queryResult.error.issues,
      } satisfies ApiError);
      return;
    }

    const { rootPath } = queryResult.data;

    // Export the session
    const exportResult = exportSessionData(
      sessionId,
      {
        collector: this.collector,
        gateTracker: this.gateTracker,
        locCounter: this.locCounter,
        metricsCalculator: this.metricsCalculator,
      },
      rootPath
    );

    if (!exportResult.ok) {
      const statusCode =
        exportResult.error.code === 'SESSION_NOT_FOUND' ? 404 : 500;
      res.status(statusCode).json({
        error: exportResult.error.message,
        code: exportResult.error.code,
        details: exportResult.error.details,
      } satisfies ApiError);
      return;
    }

    res.json(exportResult.value);
  }

  /**
   * POST /api/sessions/:id/reachability - Generate reachability report
   */
  private getReachability(req: Request, res: Response): void {
    const sessionId = req.params['id'];

    if (sessionId === undefined || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Session ID is required',
        code: 'MISSING_SESSION_ID',
      } satisfies ApiError);
      return;
    }

    // Verify session exists
    const sessionResult = this.collector.getSession(sessionId);
    if (!sessionResult.ok) {
      res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      } satisfies ApiError);
      return;
    }

    // Validate request body
    const bodyResult = ReachabilityRequestSchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: bodyResult.error.issues,
      } satisfies ApiError);
      return;
    }

    const { coverage, barriers } = bodyResult.data;

    // Generate the reachability report
    const report = this.reachabilityReport.generate(
      coverage as CoverageData,
      barriers as BarrierAnalysis
    );

    res.json(report);
  }

  /**
   * GET /api/sessions/:id/timeline - Get session timeline
   */
  private getTimeline(req: Request, res: Response): void {
    const sessionId = req.params['id'];

    if (sessionId === undefined || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Missing session ID',
        code: 'VALIDATION_ERROR',
      } satisfies ApiError);
      return;
    }

    // Get Ralph trend from metrics calculator
    const synthTrend = this.metricsCalculator.getSynthTrend(sessionId);

    // Generate timeline
    const timelineResult = this.timelineGenerator.generate(
      sessionId,
      synthTrend
    );

    if (!timelineResult.ok) {
      const statusCode =
        timelineResult.error.code === 'SESSION_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json({
        error: timelineResult.error.message,
        code: timelineResult.error.code,
        details: timelineResult.error.details,
      } satisfies ApiError);
      return;
    }

    res.json(timelineResult.value);
  }

  /**
   * GET /api/sessions/:id/diagnosis/:storyId - Diagnose story
   */
  private getDiagnosis(req: Request, res: Response): void {
    const sessionId = req.params['id'];
    const storyId = req.params['storyId'];

    if (
      sessionId === undefined ||
      typeof sessionId !== 'string' ||
      storyId === undefined ||
      typeof storyId !== 'string'
    ) {
      res.status(400).json({
        error: 'Missing session ID or story ID',
        code: 'VALIDATION_ERROR',
      } satisfies ApiError);
      return;
    }

    // Diagnose the story
    const diagnosisResult = this.diagnosis.diagnose(sessionId, storyId);

    if (!diagnosisResult.ok) {
      const statusCode =
        diagnosisResult.error.code === 'SESSION_NOT_FOUND' ||
        diagnosisResult.error.code === 'STORY_NOT_FOUND'
          ? 404
          : 400;
      res.status(statusCode).json({
        error: diagnosisResult.error.message,
        code: diagnosisResult.error.code,
        details: diagnosisResult.error.details,
      } satisfies ApiError);
      return;
    }

    res.json(diagnosisResult.value);
  }

  /**
   * Starts the server on the specified port
   */
  listen(port: number): void {
    this.app.listen(port, () => {
      console.log(`RalphMeter API listening on port ${String(port)}`);
    });
  }
}

/**
 * Creates and returns a new RalphMeter server instance
 */
export function createServer(): RalphMeterServer {
  return new RalphMeterServer();
}
