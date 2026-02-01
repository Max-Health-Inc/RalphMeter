/**
 * Tests for File Size Gate
 */

import { describe, it, expect } from 'vitest';
import { FileSizeGate } from './file-size.js';
import type { ProjectMeta, GateArtifact } from '../core/gate-plugin.js';

describe('FileSizeGate', () => {
  const gate = new FileSizeGate();

  describe('metadata', () => {
    it('should have correct ID and category', () => {
      expect(gate.id).toBe('file-size');
      expect(gate.category).toBe('quality');
    });
  });

  describe('appliesWhen', () => {
    it('should apply to all projects', () => {
      const projectMeta: ProjectMeta = {
        rootPath: '/project',
        languages: ['typescript'],
        hasTests: true,
        hasExplorableSurface: false,
      };

      expect(gate.appliesWhen(projectMeta)).toBe(true);
    });
  });

  describe('check', () => {
    it('should pass for small files', async () => {
      const content = 'const x = 1;\n'.repeat(100);
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/test.ts',
        content,
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.score).toBe(100);
        expect(result.value.findings).toHaveLength(0);
      }
    });

    it('should fail for large files', async () => {
      const content = 'const x = 1;\n'.repeat(600);
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/large.ts',
        content,
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.findings).toHaveLength(1);
        expect(result.value.findings?.[0]?.severity).toBe('warning');
      }
    });

    it('should respect custom maxLines config', async () => {
      const content = 'const x = 1;\n'.repeat(150);
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/test.ts',
        content,
      };

      const result = await gate.check(artifact, { maxLines: 100 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
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

    it('should include metadata in result', async () => {
      const content = 'const x = 1;\n'.repeat(99) + 'const x = 1;'; // Exactly 100 lines without trailing newline
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/test.ts',
        content,
      };

      const result = await gate.check(artifact);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata?.['lineCount']).toBe(100);
        expect(result.value.metadata?.['maxLines']).toBe(500);
      }
    });
  });
});
