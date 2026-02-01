/**
 * Tests for Gate Registry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GateRegistry } from './gate-registry.js';
import {
  type Gate,
  type ProjectMeta,
  type GateArtifact,
  type GateResult,
} from './gate-plugin.js';
import { ok, type Result } from '../shared/result.js';

// Mock gates for testing
class MockCoreGate implements Gate {
  id = 'mock-core';
  name = 'Mock Core Gate';
  category = 'core' as const;
  description = 'A mock core gate';

  appliesWhen(_projectMeta: ProjectMeta): boolean {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(
    _artifact: GateArtifact,
    _config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    return ok({ pass: true, score: 100 });
  }
}

class MockQualityGate implements Gate {
  id = 'mock-quality';
  name = 'Mock Quality Gate';
  category = 'quality' as const;
  description = 'A mock quality gate';

  appliesWhen(_projectMeta: ProjectMeta): boolean {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(
    _artifact: GateArtifact,
    _config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    return ok({ pass: true, score: 95 });
  }
}

class FailingGate implements Gate {
  id = 'failing-gate';
  name = 'Failing Gate';
  category = 'quality' as const;
  description = 'Always fails';

  appliesWhen(_projectMeta: ProjectMeta): boolean {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(
    _artifact: GateArtifact,
    _config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    return ok({
      pass: false,
      score: 0,
      findings: [
        {
          severity: 'error',
          filePath: '/test.ts',
          message: 'Test failure',
        },
      ],
    });
  }
}

class ConditionalGate implements Gate {
  id = 'conditional-gate';
  name = 'Conditional Gate';
  category = 'quality' as const;
  description = 'Only applies to TypeScript';

  appliesWhen(projectMeta: ProjectMeta): boolean {
    return projectMeta.languages.includes('typescript');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async check(
    _artifact: GateArtifact,
    _config?: Record<string, unknown>
  ): Promise<Result<GateResult>> {
    return ok({ pass: true, score: 100 });
  }
}

describe('GateRegistry', () => {
  let registry: GateRegistry;
  let projectMeta: ProjectMeta;
  let artifact: GateArtifact;

  beforeEach(() => {
    registry = new GateRegistry();
    projectMeta = {
      rootPath: '/project',
      languages: ['typescript'],
      hasTests: true,
      hasExplorableSurface: false,
    };
    artifact = {
      type: 'file',
      filePath: '/test.ts',
      content: 'const x = 1;',
    };
  });

  describe('register', () => {
    it('should register a gate', () => {
      const gate = new MockCoreGate();
      const result = registry.register(gate);

      expect(result.ok).toBe(true);
      expect(registry.getGate('mock-core')).toBe(gate);
    });

    it('should fail to register duplicate gate', () => {
      const gate1 = new MockCoreGate();
      const gate2 = new MockCoreGate();

      registry.register(gate1);
      const result = registry.register(gate2);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GATE_ALREADY_REGISTERED');
      }
    });
  });

  describe('unregister', () => {
    it('should unregister a gate', () => {
      const gate = new MockCoreGate();
      registry.register(gate);

      const result = registry.unregister('mock-core');

      expect(result.ok).toBe(true);
      expect(registry.getGate('mock-core')).toBeUndefined();
    });

    it('should fail to unregister non-existent gate', () => {
      const result = registry.unregister('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GATE_NOT_FOUND');
      }
    });
  });

  describe('getApplicable', () => {
    it('should return applicable gates', () => {
      const gate1 = new MockCoreGate();
      const gate2 = new ConditionalGate();

      registry.register(gate1);
      registry.register(gate2);

      const applicable = registry.getApplicable(projectMeta);

      expect(applicable).toHaveLength(2);
      expect(applicable.map((g) => g.id)).toContain('mock-core');
      expect(applicable.map((g) => g.id)).toContain('conditional-gate');
    });

    it('should exclude non-applicable gates', () => {
      const gate = new ConditionalGate();
      registry.register(gate);

      const jsProject: ProjectMeta = {
        rootPath: '/project',
        languages: ['javascript'],
        hasTests: false,
        hasExplorableSurface: false,
      };

      const applicable = registry.getApplicable(jsProject);

      expect(applicable).toHaveLength(0);
    });

    it('should exclude disabled gates', () => {
      const gate = new MockCoreGate();
      registry.register(gate);
      registry.configure('mock-core', {
        id: 'mock-core',
        enabled: false,
      });

      const applicable = registry.getApplicable(projectMeta);

      expect(applicable).toHaveLength(0);
    });
  });

  describe('runAll', () => {
    it('should run all applicable gates in core mode', async () => {
      const coreGate = new MockCoreGate();
      const qualityGate = new MockQualityGate();

      registry.register(coreGate);
      registry.register(qualityGate);
      registry.setMode('core');

      const result = await registry.runAll(artifact, projectMeta);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('core');
        expect(result.value.totalGates).toBe(1); // Only core gate
        expect(result.value.overallPass).toBe(true);
      }
    });

    it('should run all gates in strict mode', async () => {
      const coreGate = new MockCoreGate();
      const qualityGate = new MockQualityGate();

      registry.register(coreGate);
      registry.register(qualityGate);
      registry.setMode('strict');

      const result = await registry.runAll(artifact, projectMeta);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('strict');
        expect(result.value.totalGates).toBe(2); // Core + quality
        expect(result.value.overallPass).toBe(true);
      }
    });

    it('should run only selected gates in custom mode', async () => {
      const coreGate = new MockCoreGate();
      const qualityGate = new MockQualityGate();

      registry.register(coreGate);
      registry.register(qualityGate);
      registry.setMode('custom', ['mock-quality']);

      const result = await registry.runAll(artifact, projectMeta);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mode).toBe('custom');
        expect(result.value.totalGates).toBe(1); // Only selected gate
        expect(result.value.gateResults[0]?.gateId).toBe('mock-quality');
      }
    });

    it('should detect overall failure when gate fails', async () => {
      const passingGate = new MockCoreGate();
      const failingGate = new FailingGate();

      registry.register(passingGate);
      registry.register(failingGate);
      registry.setMode('strict');

      const result = await registry.runAll(artifact, projectMeta);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.overallPass).toBe(false);
        expect(result.value.gatesPassed).toBe(1);
        expect(result.value.totalGates).toBe(2);
      }
    });
  });

  describe('setMode', () => {
    it('should set core mode', () => {
      const result = registry.setMode('core');

      expect(result.ok).toBe(true);
      expect(registry.getMode()).toBe('core');
    });

    it('should set strict mode', () => {
      const result = registry.setMode('strict');

      expect(result.ok).toBe(true);
      expect(registry.getMode()).toBe('strict');
    });

    it('should set custom mode with gate IDs', () => {
      const gate = new MockQualityGate();
      registry.register(gate);

      const result = registry.setMode('custom', ['mock-quality']);

      expect(result.ok).toBe(true);
      expect(registry.getMode()).toBe('custom');
    });

    it('should fail custom mode without gate IDs', () => {
      const result = registry.setMode('custom');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MODE');
      }
    });

    it('should fail custom mode with non-existent gate', () => {
      const result = registry.setMode('custom', ['non-existent']);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GATE_NOT_FOUND');
      }
    });
  });

  describe('configure', () => {
    it('should configure a gate', () => {
      const gate = new MockCoreGate();
      registry.register(gate);

      const result = registry.configure('mock-core', {
        id: 'mock-core',
        enabled: false,
        config: { threshold: 90 },
      });

      expect(result.ok).toBe(true);

      const config = registry.getConfiguration('mock-core');
      expect(config?.enabled).toBe(false);
      expect(config?.config?.['threshold']).toBe(90);
    });

    it('should fail to configure non-existent gate', () => {
      const result = registry.configure('non-existent', {
        id: 'non-existent',
        enabled: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('GATE_NOT_FOUND');
      }
    });
  });

  describe('getAllGates', () => {
    it('should return all registered gates', () => {
      const gate1 = new MockCoreGate();
      const gate2 = new MockQualityGate();

      registry.register(gate1);
      registry.register(gate2);

      const gates = registry.getAllGates();

      expect(gates).toHaveLength(2);
      expect(gates.map((g) => g.id)).toContain('mock-core');
      expect(gates.map((g) => g.id)).toContain('mock-quality');
    });
  });
});
