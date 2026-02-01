/**
 * Tests for Coverage Gate
 */

import { describe, it, expect } from 'vitest';
import { CoverageGate } from './coverage.js';
import type { ProjectMeta, GateArtifact } from '../core/gate-plugin.js';

describe('CoverageGate', () => {
  const gate = new CoverageGate();

  describe('metadata', () => {
    it('should have correct ID and category', () => {
      expect(gate.id).toBe('coverage');
      expect(gate.category).toBe('quality');
    });
  });

  describe('appliesWhen', () => {
    it('should apply to projects with tests', () => {
      const projectMeta: ProjectMeta = {
        rootPath: '/project',
        languages: ['typescript'],
        hasTests: true,
        hasExplorableSurface: false,
      };

      expect(gate.appliesWhen(projectMeta)).toBe(true);
    });

    it('should not apply to projects without tests', () => {
      const projectMeta: ProjectMeta = {
        rootPath: '/project',
        languages: ['typescript'],
        hasTests: false,
        hasExplorableSurface: false,
      };

      expect(gate.appliesWhen(projectMeta)).toBe(false);
    });
  });

  describe('check', () => {
    it('should pass when coverage meets threshold', async () => {
      const artifact: GateArtifact = {
        type: 'codebase',
        rootPath: '/project',
        data: {
          coverage: {
            percentage: 85,
            lines: { covered: 85, total: 100 },
          },
        },
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.score).toBe(85);
      }
    });

    it('should fail when coverage below threshold', async () => {
      const artifact: GateArtifact = {
        type: 'codebase',
        rootPath: '/project',
        data: {
          coverage: {
            percentage: 60,
            lines: { covered: 60, total: 100 },
          },
        },
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.findings).toHaveLength(1);
        expect(result.value.findings?.[0]?.severity).toBe('error');
      }
    });

    it('should respect custom minCoverage config', async () => {
      const artifact: GateArtifact = {
        type: 'codebase',
        rootPath: '/project',
        data: {
          coverage: {
            percentage: 75,
            lines: { covered: 75, total: 100 },
          },
        },
      };

      const result = await gate.check(artifact, { minCoverage: 90 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
      }
    });

    it('should pass when no coverage data provided', async () => {
      const artifact: GateArtifact = {
        type: 'codebase',
        rootPath: '/project',
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.metadata?.['note']).toContain(
          'No coverage data provided'
        );
      }
    });
  });
});
