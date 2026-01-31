/**
 * Loader for benchmark PRD files
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type { BenchmarkPRD } from './types.js';
import type { Result } from '../shared/result.js';
import { ok, err } from '../shared/result.js';

// Zod schemas for validation
const RangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

const BenchmarkMetadataSchema = z.object({
  expectedLOC: RangeSchema,
  complexityScore: z.number().min(1).max(10),
  expectedIterations: RangeSchema,
});

const UserStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  priority: z.number(),
  passes: z.boolean(),
  notes: z.string().optional(),
});

const BenchmarkPRDSchema = z.object({
  project: z.string(),
  branchName: z.string(),
  description: z.string(),
  userStories: z.array(UserStorySchema),
  metadata: BenchmarkMetadataSchema,
});

/**
 * Get the directory path for benchmark references
 */
function getReferencesDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  return join(currentDir, 'references');
}

/**
 * Load a benchmark PRD from a file
 */
export function loadBenchmark(
  filename: string
): Result<BenchmarkPRD, string> {
  try {
    const referencesDir = getReferencesDir();
    const filePath = join(referencesDir, filename);
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as unknown;

    const result = BenchmarkPRDSchema.safeParse(data);
    if (!result.success) {
      return err(
        `Validation failed for ${filename}: ${result.error.message}`
      );
    }

    return ok(result.data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return err(`Failed to load ${filename}: ${message}`);
  }
}

/**
 * Load all benchmark PRDs from the references directory
 */
export function loadAllBenchmarks(): Result<
  Map<string, BenchmarkPRD>,
  string
> {
  try {
    const referencesDir = getReferencesDir();
    const files = readdirSync(referencesDir).filter((f) =>
      f.endsWith('.json')
    );

    const benchmarks = new Map<string, BenchmarkPRD>();
    const errors: string[] = [];

    for (const file of files) {
      const result = loadBenchmark(file);
      if (result.ok) {
        const benchmarkId = file.replace('.json', '');
        benchmarks.set(benchmarkId, result.value);
      } else {
        errors.push(result.error);
      }
    }

    if (errors.length > 0) {
      return err(`Failed to load some benchmarks: ${errors.join('; ')}`);
    }

    return ok(benchmarks);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return err(`Failed to load benchmarks: ${message}`);
  }
}

/**
 * Get list of available benchmark IDs
 */
export function listBenchmarks(): Result<string[], string> {
  try {
    const referencesDir = getReferencesDir();
    const files = readdirSync(referencesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));

    return ok(files);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return err(`Failed to list benchmarks: ${message}`);
  }
}

/**
 * Validate a benchmark PRD object without loading from file
 */
export function validateBenchmark(
  data: unknown
): Result<BenchmarkPRD, string> {
  const result = BenchmarkPRDSchema.safeParse(data);
  if (!result.success) {
    return err(`Validation failed: ${result.error.message}`);
  }
  return ok(result.data);
}
