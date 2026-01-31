# RalphMeter Architecture

This document establishes the coding standards and architectural patterns for RalphMeter.

## Project Structure

```
src/
├── index.ts              # Main entry point, barrel exports
├── types/
│   └── index.ts          # Centralized type exports
├── schemas/
│   └── index.ts          # Centralized Zod schema exports
├── shared/
│   ├── index.ts          # Shared utilities barrel
│   └── result.ts         # Result<T, E> error handling type
├── core/                 # Core metering functionality
│   ├── events.ts         # Event schemas and types
│   ├── collector.ts      # Event collection
│   ├── loc.ts            # LOC counting
│   ├── gates.ts          # Gate verification
│   └── metrics.ts        # Metrics calculation
├── api/                  # REST API
│   └── server.ts         # Express server
├── cli/                  # Command line interface
│   └── index.ts          # CLI entry point
├── integrations/         # External integrations
│   └── ralph-hooks.ts    # Ralph agent hooks
├── benchmarks/           # Benchmark suite
│   ├── types.ts          # Benchmark types
│   ├── loader.ts         # Benchmark loader
│   ├── comparison.ts     # Comparison engine
│   └── references/       # Reference PRDs
├── export/               # Export functionality
│   ├── format.ts         # Export format
│   ├── exporter.ts       # Export logic
│   └── schema.json       # JSON schema
├── explorer/             # AI Explorer
│   ├── coverage.ts       # Coverage instrumentation
│   ├── surface.ts        # Surface explorer
│   ├── barriers.ts       # Auth barrier detection
│   └── report.ts         # Reachability report
└── gates/                # Pluggable quality gates
    ├── complexity.ts     # Cyclomatic complexity
    ├── coverage.ts       # Test coverage
    └── security.ts       # SAST integration
```

## Coding Standards

### TypeScript Configuration

- **Strict mode enabled**: `strict: true` in tsconfig.json
- **No unchecked indexed access**: `noUncheckedIndexedAccess: true`
- **Exact optional properties**: `exactOptionalPropertyTypes: true`
- All code must pass `npm run typecheck` with zero errors

### ESLint Rules

- Using `@typescript-eslint` with strict type-checked rules
- `no-unused-vars` is an error (use `_` prefix for intentionally unused)
- Explicit function return types required
- Consistent type imports enforced (`import type`)
- No floating promises
- Strict boolean expressions

### Prettier Configuration

- Semi: true
- Single quotes: true
- Trailing comma: es5
- Tab width: 2
- Print width: 80

### Error Handling Pattern

Use the `Result<T, E>` type from `src/shared/result.ts` for operations that can fail:

```typescript
import { Result, ok, err, isOk } from '../shared/result.js';

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return err('Division by zero');
  }
  return ok(a / b);
}

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
}
```

### Module Organization

1. **Barrel exports**: Each directory has an `index.ts` that exports its public API
2. **Types in dedicated files**: Export types from `src/types/index.ts`
3. **Schemas in dedicated files**: Export Zod schemas from `src/schemas/index.ts`
4. **File extension in imports**: Always use `.js` extension for ESM imports

### Naming Conventions

- **Interfaces/Types**: PascalCase (e.g., `EventSchema`, `GateResult`)
- **Enums**: PascalCase (e.g., `GateType`)
- **Functions/Variables**: camelCase (e.g., `validateEvent`, `sessionId`)
- **Constants**: UPPER_SNAKE_CASE for true constants, camelCase for configuration

### Testing

- Tests are co-located with source files: `*.test.ts`
- Use Vitest for testing
- Run tests with `npm test` (watch mode) or `npm run test:run` (single run)

## Key Concepts

### The Physical Unit

RalphMeter measures the "energy" of AI code synthesis (=ralphesis):

- **Input**: PRD (intent specification)
- **Output**: Verified Application (LOC that passes all gates)
- **Measure**: Ralph = Cumulative Tokens / Current LOC

### 3-Gate Verification Model

1. **G1 Compile**: Compiler errors point to specific lines
2. **G2 Correct**: Test coverage maps to lines
3. **G3 Reachable**: Runtime coverage shows executed lines

A line is verified only when it passes ALL applicable gates.

### Metrics

- **PoE-LOC**: Probability of Error per Line of Code
- **Ralph**: Cumulative Tokens / Current LOC (efficiency measure)
- **vLOC**: Verified Lines of Code
- **Verification Rate**: vLOC / total LOC

## Scripts

```bash
npm run dev        # Development with hot reload
npm run build      # Build for production
npm run typecheck  # Type check without emitting
npm run lint       # Run ESLint
npm run lint:fix   # Run ESLint with auto-fix
npm run format     # Format with Prettier
npm run test       # Run tests in watch mode
npm run test:run   # Run tests once
```

## Dependencies

### Runtime
- `zod`: Schema validation
- `express`: REST API
- `commander`: CLI framework
- `better-sqlite3`: Local persistence
- `cors`: CORS middleware

### Development
- `typescript`: TypeScript compiler
- `eslint` + `typescript-eslint`: Linting
- `prettier`: Code formatting
- `vitest`: Testing framework
- `tsx`: TypeScript execution
- `supertest`: API testing
