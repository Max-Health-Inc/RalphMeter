/**
 * Tests for Barrier Tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BarrierTracker } from './barriers.js';
import type { CapturedResponse } from './surface.js';

describe('BarrierTracker', () => {
  let tracker: BarrierTracker;

  beforeEach(() => {
    tracker = new BarrierTracker();
  });

  describe('detectBarriers', () => {
    it('should detect 401 authentication barriers', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const barriers = tracker.detectBarriers(responses);

      expect(barriers).toHaveLength(1);
      expect(barriers[0]).toMatchObject({
        url: 'http://example.com/api/users',
        status: 401,
        method: 'GET',
      });
    });

    it('should detect 403 permission barriers', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/admin',
          status: 403,
          method: 'POST',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const barriers = tracker.detectBarriers(responses);

      expect(barriers).toHaveLength(1);
      expect(barriers[0]).toMatchObject({
        url: 'http://example.com/api/admin',
        status: 403,
        method: 'POST',
      });
    });

    it('should detect 402 payment required barriers', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/premium',
          status: 402,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const barriers = tracker.detectBarriers(responses);

      expect(barriers).toHaveLength(1);
      expect(barriers[0]).toMatchObject({
        url: 'http://example.com/api/premium',
        status: 402,
        method: 'GET',
      });
    });

    it('should detect multiple barriers of different types', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/admin',
          status: 403,
          method: 'POST',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/premium',
          status: 402,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const barriers = tracker.detectBarriers(responses);

      expect(barriers).toHaveLength(3);
      expect(barriers.map((b) => b.status)).toEqual([401, 403, 402]);
    });

    it('should ignore non-barrier status codes', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 200,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/posts',
          status: 404,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/error',
          status: 500,
          method: 'POST',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const barriers = tracker.detectBarriers(responses);

      expect(barriers).toHaveLength(0);
    });

    it('should return empty array for empty responses', () => {
      const barriers = tracker.detectBarriers([]);
      expect(barriers).toEqual([]);
    });

    it('should preserve all barrier information', () => {
      const timestamp = new Date().toISOString();
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'POST',
          contentType: 'application/json',
          timestamp,
        },
      ];

      const barriers = tracker.detectBarriers(responses);

      expect(barriers[0]).toEqual({
        url: 'http://example.com/api/users',
        status: 401,
        method: 'POST',
        timestamp,
      });
    });
  });

  describe('categorizeBarriers', () => {
    beforeEach(() => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/profile',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/admin',
          status: 403,
          method: 'POST',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/premium',
          status: 402,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);
    });

    it('should categorize barriers by type', () => {
      const categorized = tracker.categorizeBarriers();

      expect(categorized.auth).toHaveLength(2);
      expect(categorized.permission).toHaveLength(1);
      expect(categorized.paywall).toHaveLength(1);
    });

    it('should categorize auth barriers correctly', () => {
      const categorized = tracker.categorizeBarriers();

      expect(categorized.auth.every((b) => b.status === 401)).toBe(true);
      expect(categorized.auth.map((b) => b.url)).toEqual([
        'http://example.com/api/users',
        'http://example.com/api/profile',
      ]);
    });

    it('should categorize permission barriers correctly', () => {
      const categorized = tracker.categorizeBarriers();

      expect(categorized.permission.every((b) => b.status === 403)).toBe(true);
      expect(categorized.permission[0]?.url).toBe(
        'http://example.com/api/admin'
      );
    });

    it('should categorize paywall barriers correctly', () => {
      const categorized = tracker.categorizeBarriers();

      expect(categorized.paywall.every((b) => b.status === 402)).toBe(true);
      expect(categorized.paywall[0]?.url).toBe(
        'http://example.com/api/premium'
      );
    });

    it('should return empty arrays when no barriers detected', () => {
      tracker.clear();
      const categorized = tracker.categorizeBarriers();

      expect(categorized.auth).toEqual([]);
      expect(categorized.permission).toEqual([]);
      expect(categorized.paywall).toEqual([]);
    });
  });

  describe('inferBlockedPaths', () => {
    it('should infer paths for auth-gated URLs', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        useHeuristics: true,
      });

      expect(blocked.authGated.length).toBeGreaterThan(0);
      expect(blocked.authGated.some((line) => line.filePath.includes('users')))
        .toBe(true);
    });

    it('should infer paths for permission-gated URLs', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/admin',
          status: 403,
          method: 'POST',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        useHeuristics: true,
      });

      expect(blocked.permissionGated.length).toBeGreaterThan(0);
      expect(
        blocked.permissionGated.some((line) => line.filePath.includes('admin'))
      ).toBe(true);
    });

    it('should infer paths for paywall-gated URLs', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/premium',
          status: 402,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        useHeuristics: true,
      });

      expect(blocked.paywallGated.length).toBeGreaterThan(0);
      expect(
        blocked.paywallGated.some((line) => line.filePath.includes('premium'))
      ).toBe(true);
    });

    it('should return empty arrays when heuristics disabled', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        useHeuristics: false,
      });

      expect(blocked.authGated).toEqual([]);
      expect(blocked.permissionGated).toEqual([]);
      expect(blocked.paywallGated).toEqual([]);
    });

    it('should return empty arrays when no barriers detected', () => {
      const blocked = tracker.inferBlockedPaths();

      expect(blocked.authGated).toEqual([]);
      expect(blocked.permissionGated).toEqual([]);
      expect(blocked.paywallGated).toEqual([]);
    });

    it('should use default rootPath when not provided', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths();

      // Should use process.cwd() as default
      expect(blocked.authGated.length).toBeGreaterThan(0);
    });

    it('should support custom route patterns', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        routePatterns: ['custom/routes', 'custom/api'],
      });

      expect(blocked.authGated.length).toBeGreaterThan(0);
      expect(
        blocked.authGated.some((line) => line.filePath.includes('custom'))
      ).toBe(true);
    });
  });

  describe('analyze', () => {
    it('should provide complete barrier analysis', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/admin',
          status: 403,
          method: 'POST',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/premium',
          status: 402,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const analysis = tracker.analyze(responses, {
        rootPath: '/app',
        useHeuristics: true,
      });

      expect(analysis.barriers).toHaveLength(3);
      expect(analysis.authGated.length).toBeGreaterThan(0);
      expect(analysis.permissionGated.length).toBeGreaterThan(0);
      expect(analysis.paywallGated.length).toBeGreaterThan(0);
    });

    it('should handle empty responses', () => {
      const analysis = tracker.analyze([]);

      expect(analysis.barriers).toEqual([]);
      expect(analysis.authGated).toEqual([]);
      expect(analysis.permissionGated).toEqual([]);
      expect(analysis.paywallGated).toEqual([]);
    });

    it('should work without options', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const analysis = tracker.analyze(responses);

      expect(analysis.barriers).toHaveLength(1);
      expect(analysis.authGated.length).toBeGreaterThan(0);
    });
  });

  describe('getBarriers', () => {
    it('should return all detected barriers', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const barriers = tracker.getBarriers();

      expect(barriers).toHaveLength(1);
      expect(barriers[0]?.status).toBe(401);
    });

    it('should return copy of barriers array', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const barriers1 = tracker.getBarriers();
      const barriers2 = tracker.getBarriers();

      expect(barriers1).not.toBe(barriers2);
      expect(barriers1).toEqual(barriers2);
    });

    it('should return empty array when no barriers', () => {
      const barriers = tracker.getBarriers();
      expect(barriers).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all detected barriers', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      expect(tracker.getBarriers()).toHaveLength(1);

      tracker.clear();

      expect(tracker.getBarriers()).toHaveLength(0);
    });

    it('should allow detection after clear', () => {
      const responses1: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses1);
      tracker.clear();

      const responses2: CapturedResponse[] = [
        {
          url: 'http://example.com/api/admin',
          status: 403,
          method: 'POST',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses2);

      expect(tracker.getBarriers()).toHaveLength(1);
      expect(tracker.getBarriers()[0]?.status).toBe(403);
    });
  });

  describe('edge cases', () => {
    it('should handle URLs with query parameters', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users?page=1&limit=10',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        useHeuristics: true,
      });

      expect(blocked.authGated.length).toBeGreaterThan(0);
      expect(blocked.authGated.some((line) => line.filePath.includes('users')))
        .toBe(true);
    });

    it('should handle URLs with fragments', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/users#section',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        useHeuristics: true,
      });

      expect(blocked.authGated.length).toBeGreaterThan(0);
    });

    it('should handle nested URL paths', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/v1/users/profile',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        useHeuristics: true,
      });

      expect(blocked.authGated.length).toBeGreaterThan(0);
      expect(
        blocked.authGated.some((line) => line.filePath.includes('profile'))
      ).toBe(true);
    });

    it('should handle root path barriers', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];
      tracker.detectBarriers(responses);

      const blocked = tracker.inferBlockedPaths({
        rootPath: '/app',
        useHeuristics: true,
      });

      // Root path has no segments, so should return empty
      expect(blocked.authGated).toEqual([]);
    });

    it('should handle mixed successful and barrier responses', () => {
      const responses: CapturedResponse[] = [
        {
          url: 'http://example.com/api/public',
          status: 200,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/users',
          status: 401,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
        {
          url: 'http://example.com/api/posts',
          status: 200,
          method: 'GET',
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
        },
      ];

      const barriers = tracker.detectBarriers(responses);

      expect(barriers).toHaveLength(1);
      expect(barriers[0]?.url).toBe('http://example.com/api/users');
    });
  });
});
