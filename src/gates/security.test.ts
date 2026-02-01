/**
 * Tests for Security Gate
 */

import { describe, it, expect } from 'vitest';
import { SecurityGate } from './security.js';
import type { ProjectMeta, GateArtifact } from '../core/gate-plugin.js';

describe('SecurityGate', () => {
  const gate = new SecurityGate();

  describe('metadata', () => {
    it('should have correct ID and category', () => {
      expect(gate.id).toBe('security');
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
    it('should pass when disabled', async () => {
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/test.ts',
        content: 'const x = 1;',
      };

      const result = await gate.check(artifact, { enabled: false });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.metadata?.['note']).toContain('not enabled');
      }
    });

    it('should pass for safe code', async () => {
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/test.ts',
        content: 'const x = 1;\nconsole.log(x);',
      };

      const result = await gate.check(artifact, { enabled: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.findings).toHaveLength(0);
      }
    });

    it('should detect eval usage', async () => {
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/dangerous.ts',
        content: 'const result = eval("1 + 1");',
      };

      const result = await gate.check(artifact, { enabled: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.findings).toHaveLength(1);
        expect(result.value.findings?.[0]?.ruleId).toBe('no-eval');
      }
    });

    it('should detect hardcoded passwords', async () => {
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/config.ts',
        content: 'const password = "mySecretPassword123";',
      };

      const result = await gate.check(artifact, { enabled: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.findings).toHaveLength(1);
        expect(result.value.findings?.[0]?.ruleId).toBe(
          'no-hardcoded-credentials'
        );
      }
    });

    it('should detect hardcoded API keys', async () => {
      const artifact: GateArtifact = {
        type: 'file',
        filePath: '/config.ts',
        content: 'const api_key = "sk-1234567890";',
      };

      const result = await gate.check(artifact, { enabled: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.findings?.[0]?.ruleId).toBe(
          'no-hardcoded-credentials'
        );
      }
    });

    it('should pass for non-file artifacts', async () => {
      const artifact: GateArtifact = {
        type: 'codebase',
        rootPath: '/project',
      };

      const result = await gate.check(artifact, { enabled: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
      }
    });
  });
});
