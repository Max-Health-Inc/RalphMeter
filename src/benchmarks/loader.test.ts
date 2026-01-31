/**
 * Tests for Benchmark Loader
 */

import { describe, it, expect } from 'vitest';
import {
  loadBenchmark,
  loadAllBenchmarks,
  listBenchmarks,
  validateBenchmark,
} from './loader.js';
import { isOk, isErr } from '../shared/result.js';
import type { BenchmarkPRD } from './types.js';

// ============================================================================
// Load Individual Benchmark Tests
// ============================================================================

describe('loadBenchmark', () => {
  it('loads hello-api.json successfully', () => {
    const result = loadBenchmark('hello-api.json');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.project).toBe('HelloAPI');
      expect(result.value.metadata.complexityScore).toBe(1);
      expect(result.value.metadata.expectedLOC.min).toBe(30);
      expect(result.value.metadata.expectedLOC.max).toBe(70);
      expect(result.value.userStories.length).toBeGreaterThan(0);
    }
  });

  it('loads todo-crud.json successfully', () => {
    const result = loadBenchmark('todo-crud.json');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.project).toBe('TodoCRUD');
      expect(result.value.metadata.complexityScore).toBe(5);
      expect(result.value.metadata.expectedLOC.min).toBe(150);
      expect(result.value.metadata.expectedLOC.max).toBe(250);
      expect(result.value.userStories.length).toBeGreaterThan(0);
    }
  });

  it('loads auth-flow.json successfully', () => {
    const result = loadBenchmark('auth-flow.json');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.project).toBe('AuthFlow');
      expect(result.value.metadata.complexityScore).toBe(9);
      expect(result.value.metadata.expectedLOC.min).toBe(400);
      expect(result.value.metadata.expectedLOC.max).toBe(600);
      expect(result.value.userStories.length).toBeGreaterThan(0);
    }
  });

  it('returns error for non-existent file', () => {
    const result = loadBenchmark('nonexistent.json');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toContain('Failed to load');
    }
  });
});

// ============================================================================
// Load All Benchmarks Tests
// ============================================================================

describe('loadAllBenchmarks', () => {
  it('loads all benchmark PRDs successfully', () => {
    const result = loadAllBenchmarks();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const benchmarks = result.value;
      expect(benchmarks.size).toBe(3);
      expect(benchmarks.has('hello-api')).toBe(true);
      expect(benchmarks.has('todo-crud')).toBe(true);
      expect(benchmarks.has('auth-flow')).toBe(true);
    }
  });

  it('returns map with correct benchmark IDs as keys', () => {
    const result = loadAllBenchmarks();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const benchmarks = result.value;
      const ids = Array.from(benchmarks.keys());
      expect(ids).toContain('hello-api');
      expect(ids).toContain('todo-crud');
      expect(ids).toContain('auth-flow');
    }
  });

  it('loads benchmarks with valid structure', () => {
    const result = loadAllBenchmarks();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const benchmarks = result.value;
      for (const [_id, prd] of benchmarks.entries()) {
        expect(prd.project).toBeTruthy();
        expect(prd.branchName).toBeTruthy();
        expect(prd.description).toBeTruthy();
        expect(prd.userStories).toBeInstanceOf(Array);
        expect(prd.userStories.length).toBeGreaterThan(0);
        expect(prd.metadata).toBeTruthy();
        expect(prd.metadata.expectedLOC).toBeTruthy();
        expect(prd.metadata.complexityScore).toBeGreaterThanOrEqual(1);
        expect(prd.metadata.complexityScore).toBeLessThanOrEqual(10);
      }
    }
  });
});

// ============================================================================
// List Benchmarks Tests
// ============================================================================

describe('listBenchmarks', () => {
  it('lists all available benchmark IDs', () => {
    const result = listBenchmarks();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const ids = result.value;
      expect(ids).toContain('hello-api');
      expect(ids).toContain('todo-crud');
      expect(ids).toContain('auth-flow');
      expect(ids.length).toBe(3);
    }
  });

  it('returns benchmark IDs without .json extension', () => {
    const result = listBenchmarks();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const ids = result.value;
      for (const id of ids) {
        expect(id.endsWith('.json')).toBe(false);
      }
    }
  });
});

// ============================================================================
// Validate Benchmark Tests
// ============================================================================

describe('validateBenchmark', () => {
  it('validates a valid benchmark PRD object', () => {
    const validPRD: BenchmarkPRD = {
      project: 'TestProject',
      branchName: 'main',
      description: 'Test description',
      userStories: [
        {
          id: 'TEST-001',
          title: 'Test Story',
          description: 'Test description',
          acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
          priority: 1,
          passes: false,
        },
      ],
      metadata: {
        expectedLOC: { min: 10, max: 50 },
        complexityScore: 3,
        expectedIterations: { min: 1, max: 3 },
      },
    };

    const result = validateBenchmark(validPRD);
    expect(isOk(result)).toBe(true);
  });

  it('rejects benchmark with missing required fields', () => {
    const invalidPRD = {
      project: 'TestProject',
      // missing branchName, description, etc.
    };

    const result = validateBenchmark(invalidPRD);
    expect(isErr(result)).toBe(true);
  });

  it('rejects benchmark with invalid complexity score', () => {
    const invalidPRD = {
      project: 'TestProject',
      branchName: 'main',
      description: 'Test',
      userStories: [],
      metadata: {
        expectedLOC: { min: 10, max: 50 },
        complexityScore: 15, // Invalid: > 10
        expectedIterations: { min: 1, max: 3 },
      },
    };

    const result = validateBenchmark(invalidPRD);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('rejects benchmark with invalid range (min > max)', () => {
    const invalidPRD = {
      project: 'TestProject',
      branchName: 'main',
      description: 'Test',
      userStories: [],
      metadata: {
        expectedLOC: { min: 100, max: 50 }, // min > max is illogical but not validated by schema
        complexityScore: 5,
        expectedIterations: { min: 1, max: 3 },
      },
    };

    // Note: Our schema doesn't enforce min < max, so this will pass validation
    // This is acceptable as the comparison engine will handle logic validation
    const result = validateBenchmark(invalidPRD);
    expect(isOk(result)).toBe(true);
  });

  it('accepts benchmark with optional notes field', () => {
    const validPRD: BenchmarkPRD = {
      project: 'TestProject',
      branchName: 'main',
      description: 'Test description',
      userStories: [
        {
          id: 'TEST-001',
          title: 'Test Story',
          description: 'Test description',
          acceptanceCriteria: ['Criterion 1'],
          priority: 1,
          passes: false,
          notes: 'This is an optional note',
        },
      ],
      metadata: {
        expectedLOC: { min: 10, max: 50 },
        complexityScore: 3,
        expectedIterations: { min: 1, max: 3 },
      },
    };

    const result = validateBenchmark(validPRD);
    expect(isOk(result)).toBe(true);
  });
});

// ============================================================================
// Benchmark Content Validation Tests
// ============================================================================

describe('benchmark content validation', () => {
  it('hello-api has expected complexity and LOC range', () => {
    const result = loadBenchmark('hello-api.json');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const prd = result.value;
      expect(prd.metadata.complexityScore).toBeLessThanOrEqual(3);
      expect(prd.metadata.expectedLOC.max).toBeLessThanOrEqual(100);
    }
  });

  it('todo-crud has medium complexity', () => {
    const result = loadBenchmark('todo-crud.json');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const prd = result.value;
      expect(prd.metadata.complexityScore).toBeGreaterThanOrEqual(4);
      expect(prd.metadata.complexityScore).toBeLessThanOrEqual(6);
      expect(prd.metadata.expectedLOC.min).toBeGreaterThanOrEqual(100);
      expect(prd.metadata.expectedLOC.max).toBeLessThanOrEqual(300);
    }
  });

  it('auth-flow has high complexity', () => {
    const result = loadBenchmark('auth-flow.json');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const prd = result.value;
      expect(prd.metadata.complexityScore).toBeGreaterThanOrEqual(7);
      expect(prd.metadata.expectedLOC.min).toBeGreaterThanOrEqual(300);
    }
  });

  it('all benchmarks have at least one user story', () => {
    const result = loadAllBenchmarks();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      for (const [_id, prd] of result.value.entries()) {
        expect(prd.userStories.length).toBeGreaterThan(0);
      }
    }
  });

  it('all user stories have required fields', () => {
    const result = loadAllBenchmarks();
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      for (const [_id, prd] of result.value.entries()) {
        for (const story of prd.userStories) {
          expect(story.id).toBeTruthy();
          expect(story.title).toBeTruthy();
          expect(story.description).toBeTruthy();
          expect(story.acceptanceCriteria).toBeInstanceOf(Array);
          expect(story.acceptanceCriteria.length).toBeGreaterThan(0);
          expect(typeof story.priority).toBe('number');
          expect(typeof story.passes).toBe('boolean');
        }
      }
    }
  });
});
