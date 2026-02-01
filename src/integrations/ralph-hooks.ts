/**
 * Ralph Integration - Hook System
 *
 * This module provides a hook system that can be injected into Ralph's loop
 * to send metering events to RalphMeter API.
 *
 * Usage:
 * ```typescript
 * const hooks = createRalphHooks('http://localhost:3333');
 * await hooks.onSessionStart({ tags: { mode: 'DEVELOP' } });
 * await hooks.onIterationStart({ iterationNumber: 1, storyId: 'US-001' });
 * // ... your code ...
 * await hooks.onIterationEnd({ iterationNumber: 1, storyId: 'US-001', success: true });
 * await hooks.onSessionEnd({ success: true });
 * ```
 */

import type {
  SessionStartEvent,
  SessionEndEvent,
  IterationStartEvent,
  IterationEndEvent,
  TokensInEvent,
  TokensOutEvent,
  CompilationResultEvent,
  TestResultEvent,
  StoryCompleteEvent,
} from '../core/events.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Hook parameters for session start
 */
export interface SessionStartParams {
  /** Optional tags for arbitrary metadata */
  tags?: Record<string, string>;
}

/**
 * Hook parameters for session end
 */
export interface SessionEndParams {
  /** Whether the session completed successfully */
  success: boolean;
  /** Optional reason for session end */
  reason?: string;
}

/**
 * Hook parameters for iteration start
 */
export interface IterationStartParams {
  /** Iteration number within the session */
  iterationNumber: number;
  /** The story ID this iteration is targeting */
  storyId: string;
}

/**
 * Hook parameters for iteration end
 */
export interface IterationEndParams {
  /** Iteration number within the session */
  iterationNumber: number;
  /** The story ID this iteration targeted */
  storyId: string;
  /** Whether the iteration was successful */
  success: boolean;
}

/**
 * Hook parameters for token input
 */
export interface TokensInParams {
  /** Number of input tokens */
  count: number;
  /** Optional model identifier */
  model?: string;
}

/**
 * Hook parameters for token output
 */
export interface TokensOutParams {
  /** Number of output tokens */
  count: number;
  /** Optional model identifier */
  model?: string;
}

/**
 * Hook parameters for compilation result
 */
export interface CompilationParams {
  /** Whether compilation succeeded */
  success: boolean;
  /** Number of errors (if failed) */
  errorCount?: number;
  /** Error messages (if failed) */
  errors?: {
    file: string;
    line: number;
    column?: number;
    message: string;
  }[];
}

/**
 * Hook parameters for test run
 */
export interface TestRunParams {
  /** Whether all tests passed */
  success: boolean;
  /** Total number of tests run */
  totalTests: number;
  /** Number of tests passed */
  passed: number;
  /** Number of tests failed */
  failed: number;
  /** Number of tests skipped */
  skipped?: number;
  /** Coverage percentage (if available) */
  coveragePercent?: number;
}

/**
 * Hook parameters for story completion
 */
export interface StoryCompleteParams {
  /** The story ID that was completed */
  storyId: string;
  /** Whether the story passed all quality gates */
  passes: boolean;
  /** Lines of code in the final implementation */
  locCount?: number;
}

/**
 * Ralph hooks interface
 */
export interface RalphHooks {
  /** Get the current session ID */
  getSessionId: () => string;

  /** Hook for session start */
  onSessionStart: (params: SessionStartParams) => Promise<void>;

  /** Hook for session end */
  onSessionEnd: (params: SessionEndParams) => Promise<void>;

  /** Hook for iteration start */
  onIterationStart: (params: IterationStartParams) => Promise<void>;

  /** Hook for iteration end */
  onIterationEnd: (params: IterationEndParams) => Promise<void>;

  /** Hook for token input */
  onTokensIn: (params: TokensInParams) => Promise<void>;

  /** Hook for token output */
  onTokensOut: (params: TokensOutParams) => Promise<void>;

  /** Hook for compilation result */
  onCompilation: (params: CompilationParams) => Promise<void>;

  /** Hook for test run */
  onTestRun: (params: TestRunParams) => Promise<void>;

  /** Hook for story completion */
  onStoryComplete: (params: StoryCompleteParams) => Promise<void>;
}

/**
 * Configuration for Ralph hooks
 */
export interface RalphHooksConfig {
  /** Base URL of the RalphMeter API (e.g., 'http://localhost:3333') */
  meterUrl: string;
  /** Optional session ID (generated if not provided) */
  sessionId?: string;
  /** Whether to log hook calls to console (default: false) */
  verbose?: boolean;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Creates Ralph hooks that send events to RalphMeter API
 */
export function createRalphHooks(
  meterUrlOrConfig: string | RalphHooksConfig
): RalphHooks {
  // Parse config
  const config: Required<RalphHooksConfig> =
    typeof meterUrlOrConfig === 'string'
      ? {
          meterUrl: meterUrlOrConfig,
          sessionId: crypto.randomUUID(),
          verbose: false,
          timeout: 5000,
        }
      : {
          meterUrl: meterUrlOrConfig.meterUrl,
          sessionId: meterUrlOrConfig.sessionId ?? crypto.randomUUID(),
          verbose: meterUrlOrConfig.verbose ?? false,
          timeout: meterUrlOrConfig.timeout ?? 5000,
        };

  const { meterUrl, sessionId, verbose, timeout } = config;

  // Normalize meterUrl (remove trailing slash)
  const baseUrl = meterUrl.endsWith('/') ? meterUrl.slice(0, -1) : meterUrl;

  /**
   * Helper to send event to API
   */
  async function sendEvent(
    event:
      | SessionStartEvent
      | SessionEndEvent
      | IterationStartEvent
      | IterationEndEvent
      | TokensInEvent
      | TokensOutEvent
      | CompilationResultEvent
      | TestResultEvent
      | StoryCompleteEvent
  ): Promise<void> {
    const url = `${baseUrl}/api/sessions/${sessionId}/events`;

    if (verbose) {
      console.log(`[RalphHooks] Sending ${event.eventType} event to ${url}`);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${String(response.status)} ${response.statusText} - ${errorText}`
        );
      }

      if (verbose) {
        console.log(`[RalphHooks] Event ${event.eventType} sent successfully`);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error(
            `[RalphHooks] Request timeout after ${String(timeout)}ms for ${event.eventType}`
          );
        } else {
          console.error(
            `[RalphHooks] Failed to send ${event.eventType}:`,
            error.message
          );
        }
      }
      // Don't throw - we don't want hook failures to crash Ralph
    }
  }

  /**
   * Create a session on the API server
   */
  async function createSession(tags?: Record<string, string>): Promise<void> {
    const url = `${baseUrl}/api/sessions`;

    if (verbose) {
      console.log(`[RalphHooks] Creating session ${sessionId} at ${url}`);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(tags !== undefined && { tags }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to create session: ${String(response.status)} ${response.statusText} - ${errorText}`
        );
      }

      const result = (await response.json()) as { sessionId: string };
      // Note: We're using our own sessionId, but the API returns its generated one
      // For now, we ignore the API's sessionId and use our own

      if (verbose) {
        console.log(
          `[RalphHooks] Session created successfully (API returned: ${result.sessionId})`
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error(
            `[RalphHooks] Session creation timeout after ${String(timeout)}ms`
          );
        } else {
          console.error(
            '[RalphHooks] Failed to create session:',
            error.message
          );
        }
      }
      // Don't throw - we don't want hook failures to crash Ralph
    }
  }

  // ============================================================================
  // Hook Implementations
  // ============================================================================

  return {
    getSessionId: () => sessionId,

    onSessionStart: async (params: SessionStartParams) => {
      // First create the session via API
      await createSession(params.tags);

      // Then send the session_start event
      const event: SessionStartEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'session_start',
        payload: {
          ...(params.tags !== undefined && { tags: params.tags }),
        },
      };

      await sendEvent(event);
    },

    onSessionEnd: async (params: SessionEndParams) => {
      const event: SessionEndEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'session_end',
        payload: {
          success: params.success,
          ...(params.reason !== undefined && { reason: params.reason }),
        },
      };

      await sendEvent(event);
    },

    onIterationStart: async (params: IterationStartParams) => {
      const event: IterationStartEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'iteration_start',
        payload: {
          iterationNumber: params.iterationNumber,
          storyId: params.storyId,
        },
      };

      await sendEvent(event);
    },

    onIterationEnd: async (params: IterationEndParams) => {
      const event: IterationEndEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'iteration_end',
        payload: {
          iterationNumber: params.iterationNumber,
          storyId: params.storyId,
          success: params.success,
        },
      };

      await sendEvent(event);
    },

    onTokensIn: async (params: TokensInParams) => {
      const event: TokensInEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'tokens_in',
        payload: {
          count: params.count,
          ...(params.model !== undefined && { model: params.model }),
        },
      };

      await sendEvent(event);
    },

    onTokensOut: async (params: TokensOutParams) => {
      const event: TokensOutEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'tokens_out',
        payload: {
          count: params.count,
          ...(params.model !== undefined && { model: params.model }),
        },
      };

      await sendEvent(event);
    },

    onCompilation: async (params: CompilationParams) => {
      const event: CompilationResultEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'compilation_result',
        payload: {
          success: params.success,
          ...(params.errorCount !== undefined && {
            errorCount: params.errorCount,
          }),
          ...(params.errors !== undefined && { errors: params.errors }),
        },
      };

      await sendEvent(event);
    },

    onTestRun: async (params: TestRunParams) => {
      const event: TestResultEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'test_result',
        payload: {
          success: params.success,
          totalTests: params.totalTests,
          passed: params.passed,
          failed: params.failed,
          ...(params.skipped !== undefined && { skipped: params.skipped }),
          ...(params.coveragePercent !== undefined && {
            coveragePercent: params.coveragePercent,
          }),
        },
      };

      await sendEvent(event);
    },

    onStoryComplete: async (params: StoryCompleteParams) => {
      const event: StoryCompleteEvent = {
        timestamp: new Date().toISOString(),
        sessionId,
        eventType: 'story_complete',
        payload: {
          storyId: params.storyId,
          passes: params.passes,
          ...(params.locCount !== undefined && { locCount: params.locCount }),
        },
      };

      await sendEvent(event);
    },
  };
}
