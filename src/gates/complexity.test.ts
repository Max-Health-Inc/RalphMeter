/**
 * Tests for Complexity Gate
 */

import { describe, it, expect } from 'vitest';
import { ComplexityGate } from './complexity.js';
import type { ProjectMeta, GateArtifact } from '../core/gate-plugin.js';

describe('ComplexityGate', () => {
  const gate = new ComplexityGate();

  describe('metadata', () => {
    it('should have correct ID and category', () => {
      expect(gate.id).toBe('complexity');
      expect(gate.category).toBe('quality');
    });
  });

  describe('appliesWhen', () => {
    it('should apply to TypeScript projects', () => {
      const projectMeta: ProjectMeta = {
        rootPath: '/project',
        languages: ['typescript'],
        hasTests: true,
        hasExplorableSurface: false,
      };

      expect(gate.appliesWhen(projectMeta)).toBe(true);
    });

    it('should apply to JavaScript projects', () => {
      const projectMeta: ProjectMeta = {
        rootPath: '/project',
        languages: ['javascript'],
        hasTests: true,
        hasExplorableSurface: false,
      };

      expect(gate.appliesWhen(projectMeta)).toBe(true);
    });

    it('should not apply to Python projects', () => {
      const projectMeta: ProjectMeta = {
        rootPath: '/project',
        languages: ['python'],
        hasTests: true,
        hasExplorableSurface: false,
      };

      expect(gate.appliesWhen(projectMeta)).toBe(false);
    });
  });

  describe('check', () => {
    it('should pass for simple code', async () => {
      const content = `
function simple() {
  return 1;
}
      `.trim();

      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/test.ts',
        content,
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
      }
    });

    it('should fail for complex code', async () => {
      const content = `
function complex(x, y, z) {
  if (x > 0) {
    if (y > 0) {
      if (z > 0) {
        for (let i = 0; i < 10; i++) {
          while (true) {
            if (i % 2 === 0) {
              return i;
            } else if (i % 3 === 0) {
              break;
            } else {
              continue;
            }
          }
        }
      }
    }
  }
  return 0;
}
      `.trim();

      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/complex.ts',
        content,
      };

      const result = await gate.check(artifact, { maxComplexity: 5 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.findings).toHaveLength(1);
      }
    });

    it('should pass for non-file artifacts', async () => {
      const artifact: GateArtifact = {
        type: 'codebase',
        rootPath: '/project',
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
      }
    });
  });
});
