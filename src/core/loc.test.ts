/**
 * Tests for LOC Counter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  LOCCounter,
  detectLanguage,
  countLines,
  countFile,
  aggregate,
  snapshotCodebase,
  type LOCResult,
} from './loc.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// Line 1: /**
// Line 2:  * Sample TypeScript file
// Line 3:  */
// Line 4: (blank)
// Line 5: import { foo } from './bar.js';
// Line 6: (blank)
// Line 7: // Single line comment
// Line 8: export function hello(name: string): string {
// Line 9:   /* inline block */ return `Hello, ${name}!`;  <- code (has code after block comment)
// Line 10: }
// Line 11: (blank)
// Line 12: /*
// Line 13:  * Multi-line
// Line 14:  * block comment
// Line 15:  */
// Line 16: export const value = 42;
// Line 17: (blank from trailing newline)
const TYPESCRIPT_CODE = `/**
 * Sample TypeScript file
 */

import { foo } from './bar.js';

// Single line comment
export function hello(name: string): string {
  /* inline block */ return \`Hello, \${name}!\`;
}

/*
 * Multi-line
 * block comment
 */
export const value = 42;
`;

const JAVASCRIPT_CODE = `// JavaScript file

function add(a, b) {
  return a + b; // inline comment
}

/* Block comment */
module.exports = { add };
`;

const PYTHON_CODE = `"""
Python module docstring
"""

# Single line comment
def greet(name):
    """Function docstring"""
    return f"Hello, {name}!"

class Greeter:
    pass
`;

const BLANK_ONLY = `

`;

const COMMENTS_ONLY = `// Comment 1
// Comment 2
/* Block */`;

const CODE_ONLY = `const a = 1;
const b = 2;
const c = a + b;`;

const _MIXED_CONTENT = `// Header comment
const x = 1;

/* Block
comment */
const y = 2;
// trailing`;

// ============================================================================
// detectLanguage Tests
// ============================================================================

describe('detectLanguage', () => {
  it('detects TypeScript from .ts extension', () => {
    expect(detectLanguage('file.ts')).toBe('typescript');
  });

  it('detects TypeScript from .tsx extension', () => {
    expect(detectLanguage('component.tsx')).toBe('typescript');
  });

  it('detects TypeScript from .mts extension', () => {
    expect(detectLanguage('module.mts')).toBe('typescript');
  });

  it('detects TypeScript from .cts extension', () => {
    expect(detectLanguage('config.cts')).toBe('typescript');
  });

  it('detects JavaScript from .js extension', () => {
    expect(detectLanguage('file.js')).toBe('javascript');
  });

  it('detects JavaScript from .jsx extension', () => {
    expect(detectLanguage('component.jsx')).toBe('javascript');
  });

  it('detects JavaScript from .mjs extension', () => {
    expect(detectLanguage('module.mjs')).toBe('javascript');
  });

  it('detects JavaScript from .cjs extension', () => {
    expect(detectLanguage('config.cjs')).toBe('javascript');
  });

  it('detects Python from .py extension', () => {
    expect(detectLanguage('script.py')).toBe('python');
  });

  it('detects Python from .pyw extension', () => {
    expect(detectLanguage('gui.pyw')).toBe('python');
  });

  it('returns unknown for unsupported extension', () => {
    expect(detectLanguage('file.rs')).toBe('unknown');
    expect(detectLanguage('file.go')).toBe('unknown');
    expect(detectLanguage('file.java')).toBe('unknown');
  });

  it('returns unknown for no extension', () => {
    expect(detectLanguage('Makefile')).toBe('unknown');
  });

  it('handles full paths', () => {
    expect(detectLanguage('/home/user/project/src/index.ts')).toBe(
      'typescript'
    );
    expect(detectLanguage('C:\\Users\\dev\\project\\main.py')).toBe('python');
  });

  it('handles case-insensitive extensions', () => {
    expect(detectLanguage('file.TS')).toBe('typescript');
    expect(detectLanguage('file.PY')).toBe('python');
  });
});

// ============================================================================
// countLines Tests
// ============================================================================

describe('countLines', () => {
  describe('TypeScript/JavaScript', () => {
    it('counts code, comments, and blank lines in TypeScript', () => {
      const result = countLines(TYPESCRIPT_CODE, 'typescript');

      // Total: 17 lines
      // Blank: 4 (lines 4, 6, 11, 17 - trailing newline)
      // Comments: 8 (lines 1-3: block comment start/middle/end, line 7: line comment, lines 12-15: block comment)
      // Code: 5 (lines 5, 8, 9 has code after block comment, 10, 16)
      expect(result.total).toBe(17);
      expect(result.blank).toBe(4);
      expect(result.comments).toBe(8);
      expect(result.code).toBe(5);
    });

    it('counts code, comments, and blank lines in JavaScript', () => {
      const result = countLines(JAVASCRIPT_CODE, 'javascript');

      // Total: 9 lines
      // Blank: 3 (lines 2, 6, 9 - trailing newline)
      // Comments: 2 (line 1: line comment, line 7: single-line block comment)
      // Code: 4 (lines 3, 4 has inline comment, 5, 8)
      expect(result.total).toBe(9);
      expect(result.blank).toBe(3);
      expect(result.comments).toBe(2);
      expect(result.code).toBe(4);
    });

    it('counts single-line block comment', () => {
      const content = '/* single line block */';
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(1);
      expect(result.comments).toBe(1);
      expect(result.code).toBe(0);
    });

    it('counts multi-line block comment', () => {
      const content = `/*
 * Line 1
 * Line 2
 */`;
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(4);
      expect(result.comments).toBe(4);
      expect(result.code).toBe(0);
    });

    it('counts code before block comment', () => {
      const content = 'const x = 1; /* comment */';
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(1);
      expect(result.code).toBe(1);
      expect(result.comments).toBe(0);
    });

    it('counts code after block comment', () => {
      const content = '/* comment */ const x = 1;';
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(1);
      expect(result.code).toBe(1);
    });

    it('counts inline line comments as code', () => {
      const content = 'const x = 1; // comment';
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(1);
      expect(result.code).toBe(1);
      expect(result.comments).toBe(0);
    });

    it('counts code after multi-line block comment ends', () => {
      const content = `/*
comment
*/ const x = 1;`;
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(3);
      expect(result.comments).toBe(2);
      expect(result.code).toBe(1);
    });
  });

  describe('Python', () => {
    it('counts code, comments, and blank lines in Python', () => {
      const result = countLines(PYTHON_CODE, 'python');

      // Total: 12 lines
      // Blank: 3 (lines 4, 9, 12 - trailing newline)
      // Comments: 5 (lines 1-3: docstring, line 5: hash comment, line 7: single-line docstring)
      // Code: 4 (lines 6, 8, 10, 11)
      expect(result.total).toBe(12);
      expect(result.blank).toBe(3);
      expect(result.comments).toBe(5);
      expect(result.code).toBe(4);
    });

    it('counts hash comments', () => {
      const content = `# Comment 1
# Comment 2`;
      const result = countLines(content, 'python');

      expect(result.total).toBe(2);
      expect(result.comments).toBe(2);
      expect(result.code).toBe(0);
    });

    it('counts triple-quote docstrings', () => {
      const content = `"""
Docstring
"""`;
      const result = countLines(content, 'python');

      expect(result.total).toBe(3);
      expect(result.comments).toBe(3);
    });

    it('counts single-line docstring', () => {
      const content = '"""Single line docstring"""';
      const result = countLines(content, 'python');

      expect(result.total).toBe(1);
      expect(result.comments).toBe(1);
    });
  });

  describe('Unknown language', () => {
    it('counts all non-blank lines as code for unknown language', () => {
      const content = `// Not a comment for unknown
Some text
/* Also not a comment */`;
      const result = countLines(content, 'unknown');

      expect(result.total).toBe(3);
      expect(result.code).toBe(3);
      expect(result.comments).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('handles empty content', () => {
      const result = countLines('', 'typescript');

      expect(result.total).toBe(1);
      expect(result.blank).toBe(1);
      expect(result.code).toBe(0);
      expect(result.comments).toBe(0);
    });

    it('handles blank-only content', () => {
      const result = countLines(BLANK_ONLY, 'typescript');

      // 3 lines: two explicit blank lines + trailing newline
      expect(result.total).toBe(3);
      expect(result.blank).toBe(3);
      expect(result.code).toBe(0);
    });

    it('handles comment-only content', () => {
      const result = countLines(COMMENTS_ONLY, 'typescript');

      expect(result.total).toBe(3);
      expect(result.comments).toBe(3);
      expect(result.code).toBe(0);
    });

    it('handles code-only content', () => {
      const result = countLines(CODE_ONLY, 'typescript');

      expect(result.total).toBe(3);
      expect(result.code).toBe(3);
      expect(result.comments).toBe(0);
    });

    it('handles Windows line endings (CRLF)', () => {
      const content = 'line1\r\nline2\r\nline3';
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(3);
      expect(result.code).toBe(3);
    });

    it('handles mixed line endings', () => {
      const content = 'line1\nline2\r\nline3';
      const result = countLines(content, 'typescript');

      expect(result.total).toBe(3);
    });
  });
});

// ============================================================================
// countFile Tests
// ============================================================================

describe('countFile', () => {
  it('counts file and detects TypeScript', () => {
    const result = countFile('src/index.ts', CODE_ONLY);

    expect(result.path).toBe('src/index.ts');
    expect(result.language).toBe('typescript');
    expect(result.code).toBe(3);
  });

  it('counts file and detects Python', () => {
    const result = countFile('script.py', '# Comment\nx = 1');

    expect(result.path).toBe('script.py');
    expect(result.language).toBe('python');
    expect(result.comments).toBe(1);
    expect(result.code).toBe(1);
  });

  it('counts file with unknown language', () => {
    const result = countFile('file.txt', 'line 1\nline 2');

    expect(result.language).toBe('unknown');
    expect(result.code).toBe(2);
  });
});

// ============================================================================
// aggregate Tests
// ============================================================================

describe('aggregate', () => {
  it('aggregates multiple LOC results', () => {
    const results: LOCResult[] = [
      { total: 10, code: 5, comments: 3, blank: 2 },
      { total: 20, code: 15, comments: 2, blank: 3 },
      { total: 5, code: 3, comments: 1, blank: 1 },
    ];

    const result = aggregate(results);

    expect(result.total).toBe(35);
    expect(result.code).toBe(23);
    expect(result.comments).toBe(6);
    expect(result.blank).toBe(6);
  });

  it('returns zeros for empty array', () => {
    const result = aggregate([]);

    expect(result.total).toBe(0);
    expect(result.code).toBe(0);
    expect(result.comments).toBe(0);
    expect(result.blank).toBe(0);
  });

  it('returns same values for single result', () => {
    const single: LOCResult = { total: 10, code: 5, comments: 3, blank: 2 };
    const result = aggregate([single]);

    expect(result).toEqual(single);
  });
});

// ============================================================================
// snapshotCodebase Tests
// ============================================================================

describe('snapshotCodebase', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('snapshots empty directory', () => {
    const result = snapshotCodebase(tempDir);

    expect(result.rootPath).toBe(path.resolve(tempDir));
    expect(result.files).toHaveLength(0);
    expect(result.totals.total).toBe(0);
  });

  it('snapshots directory with TypeScript files', () => {
    fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);
    fs.writeFileSync(path.join(tempDir, 'utils.ts'), TYPESCRIPT_CODE);

    const result = snapshotCodebase(tempDir);

    expect(result.files).toHaveLength(2);
    expect(result.byLanguage.typescript.code).toBeGreaterThan(0);
  });

  it('snapshots directory with mixed languages', () => {
    fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);
    fs.writeFileSync(path.join(tempDir, 'script.py'), PYTHON_CODE);
    fs.writeFileSync(path.join(tempDir, 'app.js'), JAVASCRIPT_CODE);

    const result = snapshotCodebase(tempDir);

    expect(result.files).toHaveLength(3);
    expect(result.byLanguage.typescript.total).toBeGreaterThan(0);
    expect(result.byLanguage.python.total).toBeGreaterThan(0);
    expect(result.byLanguage.javascript.total).toBeGreaterThan(0);
  });

  it('skips node_modules directory', () => {
    const nodeModules = path.join(tempDir, 'node_modules');
    fs.mkdirSync(nodeModules);
    fs.writeFileSync(path.join(nodeModules, 'dep.js'), 'const x = 1;');
    fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);

    const result = snapshotCodebase(tempDir);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toContain('index.ts');
  });

  it('skips .git directory', () => {
    const gitDir = path.join(tempDir, '.git');
    fs.mkdirSync(gitDir);
    fs.writeFileSync(path.join(gitDir, 'config.js'), 'const x = 1;');
    fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);

    const result = snapshotCodebase(tempDir);

    expect(result.files).toHaveLength(1);
  });

  it('skips dist directory', () => {
    const distDir = path.join(tempDir, 'dist');
    fs.mkdirSync(distDir);
    fs.writeFileSync(path.join(distDir, 'bundle.js'), 'const x = 1;');
    fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);

    const result = snapshotCodebase(tempDir);

    expect(result.files).toHaveLength(1);
  });

  it('skips non-code files', () => {
    fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);
    fs.writeFileSync(path.join(tempDir, 'readme.md'), '# README');
    fs.writeFileSync(path.join(tempDir, 'data.json'), '{}');

    const result = snapshotCodebase(tempDir);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toContain('index.ts');
  });

  it('handles nested directories', () => {
    const srcDir = path.join(tempDir, 'src');
    const libDir = path.join(srcDir, 'lib');
    fs.mkdirSync(srcDir);
    fs.mkdirSync(libDir);
    fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);
    fs.writeFileSync(path.join(srcDir, 'app.ts'), CODE_ONLY);
    fs.writeFileSync(path.join(libDir, 'utils.ts'), CODE_ONLY);

    const result = snapshotCodebase(tempDir);

    expect(result.files).toHaveLength(3);
  });

  it('includes timestamp in ISO format', () => {
    const result = snapshotCodebase(tempDir);

    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('calculates correct totals', () => {
    fs.writeFileSync(
      path.join(tempDir, 'file1.ts'),
      'const a = 1;\n\n// comment'
    );
    fs.writeFileSync(path.join(tempDir, 'file2.ts'), 'const b = 2;');

    const result = snapshotCodebase(tempDir);

    expect(result.totals.total).toBe(4);
    expect(result.totals.code).toBe(2);
    expect(result.totals.comments).toBe(1);
    expect(result.totals.blank).toBe(1);
  });
});

// ============================================================================
// LOCCounter Class Tests
// ============================================================================

describe('LOCCounter', () => {
  let counter: LOCCounter;

  beforeEach(() => {
    counter = new LOCCounter();
  });

  it('provides detectLanguage method', () => {
    expect(counter.detectLanguage('file.ts')).toBe('typescript');
  });

  it('provides countLines method', () => {
    const result = counter.countLines(CODE_ONLY, 'typescript');
    expect(result.code).toBe(3);
  });

  it('provides countFile method', () => {
    const result = counter.countFile('test.ts', CODE_ONLY);
    expect(result.path).toBe('test.ts');
    expect(result.language).toBe('typescript');
  });

  it('provides aggregate method', () => {
    const results: LOCResult[] = [
      { total: 10, code: 5, comments: 3, blank: 2 },
      { total: 5, code: 3, comments: 1, blank: 1 },
    ];
    const result = counter.aggregate(results);
    expect(result.total).toBe(15);
  });

  describe('snapshotCodebase', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-class-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('provides snapshotCodebase method', () => {
      fs.writeFileSync(path.join(tempDir, 'index.ts'), CODE_ONLY);

      const result = counter.snapshotCodebase(tempDir);

      expect(result.files).toHaveLength(1);
      expect(result.totals.code).toBe(3);
    });
  });
});
