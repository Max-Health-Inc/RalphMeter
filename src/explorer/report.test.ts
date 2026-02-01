/**
 * Tests for Reachability Report
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReachabilityReport } from './report.js';
import type { CoverageData } from './coverage.js';
import type { BarrierAnalysis } from './barriers.js';

describe('ReachabilityReport', () => {
  let report: ReachabilityReport;

  beforeEach(() => {
    report = new ReachabilityReport();
  });

  describe('generate', () => {
    it('should generate a complete report with all categories', () => {
      const coverage: CoverageData = {
        executed: [
          { filePath: '/src/app.ts', lineNumber: 1 },
          { filePath: '/src/app.ts', lineNumber: 2 },
        ],
        notExecuted: [
          { filePath: '/src/auth.ts', lineNumber: 10 },
          { filePath: '/src/admin.ts', lineNumber: 20 },
          { filePath: '/src/premium.ts', lineNumber: 30 },
          { filePath: '/src/dead.ts', lineNumber: 40 },
        ],
      };

      const barriers: BarrierAnalysis = {
        authGated: [{ filePath: '/src/auth.ts', lineNumber: 10 }],
        permissionGated: [{ filePath: '/src/admin.ts', lineNumber: 20 }],
        paywallGated: [{ filePath: '/src/premium.ts', lineNumber: 30 }],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.categories.exercised).toHaveLength(2);
      expect(result.categories.authGated).toHaveLength(1);
      expect(result.categories.permissionGated).toHaveLength(1);
      expect(result.categories.paywallGated).toHaveLength(1);
      expect(result.categories.unreached).toHaveLength(1);
      expect(result.stats.total).toBe(6);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.generatedAt).toBeTruthy();
    });

    it('should categorize exercised lines correctly', () => {
      const coverage: CoverageData = {
        executed: [
          { filePath: '/src/app.ts', lineNumber: 1 },
          { filePath: '/src/app.ts', lineNumber: 2 },
          { filePath: '/src/app.ts', lineNumber: 3 },
        ],
        notExecuted: [],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.categories.exercised).toHaveLength(3);
      expect(result.categories.authGated).toHaveLength(0);
      expect(result.categories.permissionGated).toHaveLength(0);
      expect(result.categories.paywallGated).toHaveLength(0);
      expect(result.categories.unreached).toHaveLength(0);
    });

    it('should categorize auth-gated lines correctly', () => {
      const coverage: CoverageData = {
        executed: [],
        notExecuted: [
          { filePath: '/src/auth.ts', lineNumber: 10 },
          { filePath: '/src/auth.ts', lineNumber: 11 },
        ],
      };

      const barriers: BarrierAnalysis = {
        authGated: [
          { filePath: '/src/auth.ts', lineNumber: 10 },
          { filePath: '/src/auth.ts', lineNumber: 11 },
        ],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.categories.exercised).toHaveLength(0);
      expect(result.categories.authGated).toHaveLength(2);
      expect(result.categories.permissionGated).toHaveLength(0);
      expect(result.categories.paywallGated).toHaveLength(0);
      expect(result.categories.unreached).toHaveLength(0);
    });

    it('should categorize permission-gated lines correctly', () => {
      const coverage: CoverageData = {
        executed: [],
        notExecuted: [{ filePath: '/src/admin.ts', lineNumber: 20 }],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [{ filePath: '/src/admin.ts', lineNumber: 20 }],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.categories.exercised).toHaveLength(0);
      expect(result.categories.authGated).toHaveLength(0);
      expect(result.categories.permissionGated).toHaveLength(1);
      expect(result.categories.paywallGated).toHaveLength(0);
      expect(result.categories.unreached).toHaveLength(0);
    });

    it('should categorize paywall-gated lines correctly', () => {
      const coverage: CoverageData = {
        executed: [],
        notExecuted: [{ filePath: '/src/premium.ts', lineNumber: 30 }],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [{ filePath: '/src/premium.ts', lineNumber: 30 }],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.categories.exercised).toHaveLength(0);
      expect(result.categories.authGated).toHaveLength(0);
      expect(result.categories.permissionGated).toHaveLength(0);
      expect(result.categories.paywallGated).toHaveLength(1);
      expect(result.categories.unreached).toHaveLength(0);
    });

    it('should categorize unreached lines correctly', () => {
      const coverage: CoverageData = {
        executed: [],
        notExecuted: [
          { filePath: '/src/dead.ts', lineNumber: 40 },
          { filePath: '/src/dead.ts', lineNumber: 41 },
        ],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.categories.exercised).toHaveLength(0);
      expect(result.categories.authGated).toHaveLength(0);
      expect(result.categories.permissionGated).toHaveLength(0);
      expect(result.categories.paywallGated).toHaveLength(0);
      expect(result.categories.unreached).toHaveLength(2);
    });

    it('should handle empty coverage and barriers', () => {
      const coverage: CoverageData = {
        executed: [],
        notExecuted: [],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.categories.exercised).toHaveLength(0);
      expect(result.categories.authGated).toHaveLength(0);
      expect(result.categories.permissionGated).toHaveLength(0);
      expect(result.categories.paywallGated).toHaveLength(0);
      expect(result.categories.unreached).toHaveLength(0);
      expect(result.stats.total).toBe(0);
    });
  });

  describe('stats calculation', () => {
    it('should calculate percentages correctly', () => {
      const coverage: CoverageData = {
        executed: [
          { filePath: '/src/app.ts', lineNumber: 1 },
          { filePath: '/src/app.ts', lineNumber: 2 },
          { filePath: '/src/app.ts', lineNumber: 3 },
          { filePath: '/src/app.ts', lineNumber: 4 },
          { filePath: '/src/app.ts', lineNumber: 5 },
          { filePath: '/src/app.ts', lineNumber: 6 },
          { filePath: '/src/app.ts', lineNumber: 7 },
          { filePath: '/src/app.ts', lineNumber: 8 },
        ],
        notExecuted: [
          { filePath: '/src/auth.ts', lineNumber: 10 },
          { filePath: '/src/dead.ts', lineNumber: 40 },
        ],
      };

      const barriers: BarrierAnalysis = {
        authGated: [{ filePath: '/src/auth.ts', lineNumber: 10 }],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.stats.total).toBe(10);
      expect(result.stats.exercisedCount).toBe(8);
      expect(result.stats.exercisedPercent).toBe(80);
      expect(result.stats.authGatedCount).toBe(1);
      expect(result.stats.authGatedPercent).toBe(10);
      expect(result.stats.unreachedCount).toBe(1);
      expect(result.stats.unreachedPercent).toBe(10);
    });

    it('should handle zero total without division by zero', () => {
      const coverage: CoverageData = {
        executed: [],
        notExecuted: [],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      expect(result.stats.total).toBe(0);
      expect(result.stats.exercisedPercent).toBe(0);
      expect(result.stats.authGatedPercent).toBe(0);
      expect(result.stats.permissionGatedPercent).toBe(0);
      expect(result.stats.paywallGatedPercent).toBe(0);
      expect(result.stats.unreachedPercent).toBe(0);
    });
  });

  describe('recommendations', () => {
    it('should recommend authentication when auth-gated lines exist', () => {
      const coverage: CoverageData = {
        executed: [{ filePath: '/src/app.ts', lineNumber: 1 }],
        notExecuted: [{ filePath: '/src/auth.ts', lineNumber: 10 }],
      };

      const barriers: BarrierAnalysis = {
        authGated: [{ filePath: '/src/auth.ts', lineNumber: 10 }],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const authRec = result.recommendations.find((r) =>
        r.message.includes('authentication')
      );
      expect(authRec).toBeDefined();
      expect(authRec?.type).toBe('action');
    });

    it('should recommend privileged access when permission-gated lines exist', () => {
      const coverage: CoverageData = {
        executed: [{ filePath: '/src/app.ts', lineNumber: 1 }],
        notExecuted: [{ filePath: '/src/admin.ts', lineNumber: 20 }],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [{ filePath: '/src/admin.ts', lineNumber: 20 }],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const permRec = result.recommendations.find((r) =>
        r.message.includes('privileged')
      );
      expect(permRec).toBeDefined();
      expect(permRec?.type).toBe('action');
    });

    it('should note paywall-gated lines', () => {
      const coverage: CoverageData = {
        executed: [{ filePath: '/src/app.ts', lineNumber: 1 }],
        notExecuted: [{ filePath: '/src/premium.ts', lineNumber: 30 }],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [{ filePath: '/src/premium.ts', lineNumber: 30 }],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const paywallRec = result.recommendations.find((r) =>
        r.message.includes('payment')
      );
      expect(paywallRec).toBeDefined();
      expect(paywallRec?.type).toBe('info');
    });

    it('should give success message for excellent reachability (>=80%)', () => {
      const coverage: CoverageData = {
        executed: Array.from({ length: 80 }, (_, i) => ({
          filePath: '/src/app.ts',
          lineNumber: i + 1,
        })),
        notExecuted: Array.from({ length: 20 }, (_, i) => ({
          filePath: '/src/dead.ts',
          lineNumber: i + 1,
        })),
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const successRec = result.recommendations.find(
        (r) => r.type === 'success' && r.message.includes('Excellent')
      );
      expect(successRec).toBeDefined();
    });

    it('should give info message for good reachability (60-79%)', () => {
      const coverage: CoverageData = {
        executed: Array.from({ length: 70 }, (_, i) => ({
          filePath: '/src/app.ts',
          lineNumber: i + 1,
        })),
        notExecuted: Array.from({ length: 30 }, (_, i) => ({
          filePath: '/src/dead.ts',
          lineNumber: i + 1,
        })),
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const infoRec = result.recommendations.find(
        (r) => r.type === 'info' && r.message.includes('Good')
      );
      expect(infoRec).toBeDefined();
    });

    it('should give warning for low reachability (<60%)', () => {
      const coverage: CoverageData = {
        executed: Array.from({ length: 40 }, (_, i) => ({
          filePath: '/src/app.ts',
          lineNumber: i + 1,
        })),
        notExecuted: Array.from({ length: 60 }, (_, i) => ({
          filePath: '/src/dead.ts',
          lineNumber: i + 1,
        })),
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const warningRec = result.recommendations.find(
        (r) => r.type === 'warning' && r.message.includes('Low')
      );
      expect(warningRec).toBeDefined();
    });

    it('should warn about potential dead code (>=20% unreached)', () => {
      const coverage: CoverageData = {
        executed: Array.from({ length: 70 }, (_, i) => ({
          filePath: '/src/app.ts',
          lineNumber: i + 1,
        })),
        notExecuted: Array.from({ length: 30 }, (_, i) => ({
          filePath: '/src/dead.ts',
          lineNumber: i + 1,
        })),
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const deadCodeRec = result.recommendations.find(
        (r) => r.type === 'warning' && r.message.includes('unreachable')
      );
      expect(deadCodeRec).toBeDefined();
    });

    it('should note some unreached lines (10-19%)', () => {
      const coverage: CoverageData = {
        executed: Array.from({ length: 85 }, (_, i) => ({
          filePath: '/src/app.ts',
          lineNumber: i + 1,
        })),
        notExecuted: Array.from({ length: 15 }, (_, i) => ({
          filePath: '/src/dead.ts',
          lineNumber: i + 1,
        })),
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const unreachedRec = result.recommendations.find(
        (r) => r.type === 'info' && r.message.includes('not reached')
      );
      expect(unreachedRec).toBeDefined();
    });

    it('should praise no dead code', () => {
      const coverage: CoverageData = {
        executed: Array.from({ length: 100 }, (_, i) => ({
          filePath: '/src/app.ts',
          lineNumber: i + 1,
        })),
        notExecuted: [],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);

      const noDeadCodeRec = result.recommendations.find(
        (r) =>
          r.type === 'success' && r.message.includes('no dead code detected')
      );
      expect(noDeadCodeRec).toBeDefined();
    });
  });

  describe('formatReport', () => {
    it('should format a complete report as text', () => {
      const coverage: CoverageData = {
        executed: [
          { filePath: '/src/app.ts', lineNumber: 1 },
          { filePath: '/src/app.ts', lineNumber: 2 },
        ],
        notExecuted: [
          { filePath: '/src/auth.ts', lineNumber: 10 },
          { filePath: '/src/dead.ts', lineNumber: 40 },
        ],
      };

      const barriers: BarrierAnalysis = {
        authGated: [{ filePath: '/src/auth.ts', lineNumber: 10 }],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);
      const formatted = report.formatReport(result);

      expect(formatted).toContain('G3 REACHABILITY REPORT');
      expect(formatted).toContain('SUMMARY');
      expect(formatted).toContain('Total Lines Analyzed: 4');
      expect(formatted).toContain('REACHABILITY BREAKDOWN');
      expect(formatted).toContain('Exercised:');
      expect(formatted).toContain('Auth Gated:');
      expect(formatted).toContain('Permission Gated:');
      expect(formatted).toContain('Paywall Gated:');
      expect(formatted).toContain('Unreached:');
      expect(formatted).toContain('RECOMMENDATIONS');
      expect(formatted).toContain('Generated:');
    });

    it('should include all percentages in formatted output', () => {
      const coverage: CoverageData = {
        executed: [
          { filePath: '/src/app.ts', lineNumber: 1 },
          { filePath: '/src/app.ts', lineNumber: 2 },
          { filePath: '/src/app.ts', lineNumber: 3 },
          { filePath: '/src/app.ts', lineNumber: 4 },
        ],
        notExecuted: [{ filePath: '/src/dead.ts', lineNumber: 40 }],
      };

      const barriers: BarrierAnalysis = {
        authGated: [],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);
      const formatted = report.formatReport(result);

      expect(formatted).toContain('80.0%'); // exercised
      expect(formatted).toContain('20.0%'); // unreached
    });

    it('should display recommendations with details', () => {
      const coverage: CoverageData = {
        executed: [{ filePath: '/src/app.ts', lineNumber: 1 }],
        notExecuted: [{ filePath: '/src/auth.ts', lineNumber: 10 }],
      };

      const barriers: BarrierAnalysis = {
        authGated: [{ filePath: '/src/auth.ts', lineNumber: 10 }],
        permissionGated: [],
        paywallGated: [],
        barriers: [],
      };

      const result = report.generate(coverage, barriers);
      const formatted = report.formatReport(result);

      expect(formatted).toContain('RECOMMENDATIONS');
      expect(formatted).toContain('authentication');
    });
  });
});
