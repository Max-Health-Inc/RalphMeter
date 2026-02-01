/**
 * LOC Counter for RalphMeter
 *
 * Analyzes code files and categorizes lines into code, comments, and blank.
 * Supports TypeScript, JavaScript, and Python comment styles.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported programming languages
 */
export type Language = 'typescript' | 'javascript' | 'python' | 'unknown';

/**
 * Result of counting lines in a file or content
 */
export interface LOCResult {
  /** Total number of lines */
  total: number;
  /** Number of code lines (non-blank, non-comment) */
  code: number;
  /** Number of comment lines */
  comments: number;
  /** Number of blank lines */
  blank: number;
}

/**
 * Result of counting a specific file
 */
export interface FileResult extends LOCResult {
  /** File path */
  path: string;
  /** Detected or specified language */
  language: Language;
}

/**
 * Codebase snapshot result
 */
export interface CodebaseSnapshot {
  /** Root path that was scanned */
  rootPath: string;
  /** Timestamp of the snapshot */
  timestamp: string;
  /** Aggregated LOC totals */
  totals: LOCResult;
  /** Per-file breakdown */
  files: FileResult[];
  /** Count by language */
  byLanguage: Record<Language, LOCResult>;
}

// ============================================================================
// Language Detection
// ============================================================================

/**
 * File extension to language mapping
 */
const EXTENSION_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
};

/**
 * Detects programming language from file path extension
 */
export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'unknown';
}

// ============================================================================
// Line Counting
// ============================================================================

/**
 * Comment style configuration per language
 */
interface CommentStyle {
  lineComment: string | null;
  blockStart: string | null;
  blockEnd: string | null;
}

const COMMENT_STYLES: Record<Language, CommentStyle> = {
  typescript: { lineComment: '//', blockStart: '/*', blockEnd: '*/' },
  javascript: { lineComment: '//', blockStart: '/*', blockEnd: '*/' },
  python: { lineComment: '#', blockStart: '"""', blockEnd: '"""' },
  unknown: { lineComment: null, blockStart: null, blockEnd: null },
};

/**
 * Counts lines in content, categorizing as code, comments, or blank
 */
export function countLines(content: string, language: Language): LOCResult {
  const lines = content.split(/\r?\n/);
  const style = COMMENT_STYLES[language];

  const total = lines.length;
  let code = 0;
  let comments = 0;
  let blank = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank line
    if (trimmed === '') {
      blank++;
      continue;
    }

    // Handle block comments
    if (style.blockStart !== null && style.blockEnd !== null) {
      // Check if we're starting a block comment
      if (!inBlockComment && trimmed.includes(style.blockStart)) {
        // Check if block comment ends on same line
        const startIdx = trimmed.indexOf(style.blockStart);
        const afterStart = trimmed.substring(
          startIdx + style.blockStart.length
        );

        if (afterStart.includes(style.blockEnd)) {
          // Single-line block comment - check if there's code before or after
          const beforeComment = trimmed.substring(0, startIdx).trim();
          const endIdx = afterStart.indexOf(style.blockEnd);
          const afterComment = afterStart
            .substring(endIdx + style.blockEnd.length)
            .trim();

          if (beforeComment !== '' || afterComment !== '') {
            // Has code on same line
            code++;
          } else {
            comments++;
          }
          continue;
        } else {
          // Block comment starts but doesn't end on this line
          // Check if there's code before the comment
          const beforeComment = trimmed.substring(0, startIdx).trim();
          if (beforeComment !== '') {
            code++;
          } else {
            comments++;
          }
          inBlockComment = true;
          continue;
        }
      }

      // Inside block comment
      if (inBlockComment) {
        if (trimmed.includes(style.blockEnd)) {
          // Check if there's code after the block end
          const endIdx = trimmed.indexOf(style.blockEnd);
          const afterEnd = trimmed
            .substring(endIdx + style.blockEnd.length)
            .trim();
          if (
            afterEnd !== '' &&
            !afterEnd.startsWith(style.lineComment ?? '')
          ) {
            code++;
          } else {
            comments++;
          }
          inBlockComment = false;
        } else {
          comments++;
        }
        continue;
      }
    }

    // Line comment
    if (style.lineComment !== null && trimmed.startsWith(style.lineComment)) {
      comments++;
      continue;
    }

    // Check for inline line comment
    if (style.lineComment !== null && trimmed.includes(style.lineComment)) {
      // Has code with inline comment
      code++;
      continue;
    }

    // Regular code line
    code++;
  }

  return { total, code, comments, blank };
}

/**
 * Counts lines in a file given its path and content
 */
export function countFile(filePath: string, content: string): FileResult {
  const language = detectLanguage(filePath);
  const result = countLines(content, language);

  return {
    ...result,
    path: filePath,
    language,
  };
}

/**
 * Aggregates multiple LOC results into a single total
 */
export function aggregate(results: LOCResult[]): LOCResult {
  return results.reduce(
    (acc, result) => ({
      total: acc.total + result.total,
      code: acc.code + result.code,
      comments: acc.comments + result.comments,
      blank: acc.blank + result.blank,
    }),
    { total: 0, code: 0, comments: 0, blank: 0 }
  );
}

// ============================================================================
// Codebase Snapshot
// ============================================================================

/**
 * Directories to skip when scanning codebase
 */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  '.tox',
  '.eggs',
]);

/**
 * File extensions to include when scanning
 */
const INCLUDE_EXTENSIONS = new Set(Object.keys(EXTENSION_MAP));

/**
 * Recursively finds all code files in a directory
 */
function findCodeFiles(rootPath: string): string[] {
  const files: string[] = [];

  function scan(dirPath: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      // Skip directories we can't read
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (INCLUDE_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  scan(rootPath);
  return files;
}

/**
 * Creates an empty LOCResult
 */
function emptyResult(): LOCResult {
  return { total: 0, code: 0, comments: 0, blank: 0 };
}

/**
 * Creates a snapshot of all LOC in a codebase at a point in time
 */
export function snapshotCodebase(rootPath: string): CodebaseSnapshot {
  const absoluteRoot = path.resolve(rootPath);
  const files = findCodeFiles(absoluteRoot);
  const fileResults: FileResult[] = [];

  const byLanguage: Record<Language, LOCResult> = {
    typescript: emptyResult(),
    javascript: emptyResult(),
    python: emptyResult(),
    unknown: emptyResult(),
  };

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const result = countFile(filePath, content);
      fileResults.push(result);

      // Accumulate by language
      const langResult = byLanguage[result.language];
      langResult.total += result.total;
      langResult.code += result.code;
      langResult.comments += result.comments;
      langResult.blank += result.blank;
    } catch {
      // Skip files we can't read
    }
  }

  const totals = aggregate(fileResults);

  return {
    rootPath: absoluteRoot,
    timestamp: new Date().toISOString(),
    totals,
    files: fileResults,
    byLanguage,
  };
}

// ============================================================================
// LOCCounter Class
// ============================================================================

/**
 * LOCCounter provides methods for counting lines of code
 *
 * This class wraps the functional API into a class-based interface
 * for consistency with other RalphMeter components.
 */
export class LOCCounter {
  /**
   * Detects programming language from file path extension
   */
  detectLanguage(filePath: string): Language {
    return detectLanguage(filePath);
  }

  /**
   * Counts lines in content, categorizing as code, comments, or blank
   */
  countLines(content: string, language: Language): LOCResult {
    return countLines(content, language);
  }

  /**
   * Counts lines in a file given its path and content
   */
  countFile(filePath: string, content: string): FileResult {
    return countFile(filePath, content);
  }

  /**
   * Aggregates multiple LOC results into a single total
   */
  aggregate(results: LOCResult[]): LOCResult {
    return aggregate(results);
  }

  /**
   * Creates a snapshot of all LOC in a codebase at a point in time
   */
  snapshotCodebase(rootPath: string): CodebaseSnapshot {
    return snapshotCodebase(rootPath);
  }
}
