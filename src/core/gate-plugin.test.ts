/**
 * Tests for Gate Plugin System
 */

import { describe, it, expect } from 'vitest';
import {
  type Gate,
  type ProjectMeta,
  type GateArtifact,
  type GateResult,
} from './gate-plugin.js';
import { ok, type Result } from '../shared/result.js';

// Mock gate for testing
class MockGate implements Gate {
  id = 'mock-gate';
  name = 'Mock Gate';
  category = 'quality' as const;
  description = 'A mock gate for testing';

  appliesWhen(projectMeta: ProjectMeta): boolean {
    return projectMeta.languages.includes('typescript');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(
    artifact: GateArtifact,
    _config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    return ok({
      pass: artifact.type === 'file',
      score: 100,
      findings: [],
    });
  }
}

describe('Gate Plugin System', () => {
  describe('Gate Interface', () => {
    it('should implement gate interface', () => {
      const gate = new MockGate();

      expect(gate.id).toBe('mock-gate');
      expect(gate.name).toBe('Mock Gate');
      expect(gate.category).toBe('quality');
      expect(gate.description).toBeTruthy();
    });

    it('should check applicability based on project meta', () => {
      const gate = new MockGate();

      const tsProject: ProjectMeta = {
        rootPath: '/project',
        languages: ['typescript'],
        hasTests: true,
        hasExplorableSurface: false,
      };

      const jsProject: ProjectMeta = {
        rootPath: '/project',
        languages: ['javascript'],
        hasTests: false,
        hasExplorableSurface: false,
      };

      expect(gate.appliesWhen(tsProject)).toBe(true);
      expect(gate.appliesWhen(jsProject)).toBe(false);
    });

    it('should check artifact and return result', async () => {
      const gate = new MockGate();

      const fileArtifact: GateArtifact = {
        type: 'file',
        filePath: '/test.ts',
        content: 'const x = 1;',
      };

      const result = await gate.check(fileArtifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.score).toBe(100);
      }
    });
  });

  describe('GateArtifact Types', () => {
    it('should support file artifacts', () => {
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/src/test.ts',
        content: 'console.log("test");',
      };

      expect(artifact.type).toBe('file');
      expect(artifact.filePath).toBe('/src/test.ts');
      expect(artifact.content).toBeTruthy();
    });

    it('should support codebase artifacts', () => {
      const artifact: GateArtifact = {
        type: 'codebase',
        rootPath: '/project',
        data: {
          files: ['a.ts', 'b.ts'],
        },
      };

      expect(artifact.type).toBe('codebase');
      expect(artifact.rootPath).toBe('/project');
      expect(artifact.data?.['files']).toEqual(['a.ts', 'b.ts']);
    });

    it('should support test-results artifacts', () => {
      const artifact: GateArtifact = {
        type: 'test-results',
        data: {
          passed: 10,
          failed: 2,
        },
      };

      expect(artifact.type).toBe('test-results');
      expect(artifact.data?.['passed']).toBe(10);
    });
  });

  describe('GateResult', () => {
    it('should include pass/fail status', () => {
      const result: GateResult = {
        pass: true,
      };

      expect(result.pass).toBe(true);
    });

    it('should include optional score', () => {
      const result: GateResult = {
        pass: true,
        score: 85,
      };

      expect(result.score).toBe(85);
    });

    it('should include optional findings', () => {
      const result: GateResult = {
        pass: false,
        findings: [
          {
            severity: 'error',
            filePath: '/test.ts',
            lineNumber: 42,
            message: 'Test error',
            ruleId: 'test-rule',
          },
        ],
      };

      expect(result.findings).toHaveLength(1);
      expect(result.findings?.[0]?.severity).toBe('error');
      expect(result.findings?.[0]?.lineNumber).toBe(42);
    });
  });
});
