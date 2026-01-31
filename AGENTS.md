# AGENTS.md - RalphMeter

## Project Context

RalphMeter is a metering and transparency layer for AI coding agents. It measures the "energy" required to transform a PRD (intent) into a verified application.

## Key Concepts

### The 3-Gate Verification Model

Each gate provides **line-level verification**. See [README.md](README.md#the-3-gate-model) for details.

| Gate | Line-Level How | Applies When |
|------|----------------|--------------|
| **G1** | Compiler errors point to lines | Always |
| **G2** | Test coverage maps to lines | Has tests |
| **G3** | Runtime coverage shows executed lines | Has explorable surface |

#### Gate Applicability by Project Type

| Project Type | G1 | G2 | G3 |
|--------------|----|----|----|  
| Library (no tests) | ✓ | — | — |
| Library (with tests) | ✓ | ✓ | — |
| CLI tool | ✓ | ✓ | — |
| Web app / API | ✓ | ✓ | ✓ |

### What is Verified LOC (vLOC)?

A line of code is **verified** when it passes ALL applicable gates:

```
Line 42: validateUser(input)

G1 ✓ Compiles     → TypeScript accepts it
G2 ✓ Correct      → Tests cover this line and pass
G3 ✓ Reachable    → AI Explorer executed this line

Result: Line 42 is 1 vLOC ✓
```

**Important**: Verification is line-level. Each line must pass ALL applicable gates.
Lines not covered by tests or not executed during exploration are NOT verified.

### G3 Reachability - The AI Explorer Approach
G3 is NOT test coverage. It's **actual runtime reachability from the app**.

AI Explorer:
1. Starts app with coverage instrumentation
2. AI explores ALL surfaces (clicks, forms, API calls)
3. Tracks auth barriers (401, 403, 402)
4. Lines executed = G3 PASS
5. Lines behind auth = G3 UNKNOWN (not dead, just gated)
6. Lines never hit = G3 FAIL (truly dead code)

### Reachability Categories
- **Exercised**: Lines proven reachable by AI exploration
- **Auth-gated**: Behind 401 - needs credentials to verify
- **Permission-gated**: Behind 403 - needs elevated role
- **Paywall-gated**: Behind 402 - needs payment
- **Unreached**: No barrier, but never executed = dead code

### Core Metrics
See [README.md](README.md) for full metric definitions. Key metrics:
- **Ralph**: Cumulative Tokens / Current LOC (lower is better)
- **vLOC**: Lines passing all applicable gates
- **Verification Rate**: vLOC / LOC

### Ralph Calculation (Cumulative)
```
After Story 1:  3,600 tokens,  100 LOC → Ralph = 36
After Story 2:  4,400 tokens,  180 LOC → Ralph = 24 ✓ improving
After Story 3: 14,400 tokens,  180 LOC → Ralph = 80 ⚠️ spike!
```

Ralph = cumulative tokens / current LOC (codebase snapshot).
Stories are the **measurement boundary** — Ralph is recalculated when a story completes.
Verification is **line-level** — each line must pass all applicable gates.

### Architecture
```
┌─────────────────────────────────────────────┐
│           LOC-Based Metrics                 │
├─────────────────────────────────────────────┤
│         Benchmark Suite                     │
├─────────────────────────────────────────────┤
│       Transparency Dashboard                │
├─────────────────────────────────────────────┤
│          Metering Layer                     │
├─────────────────────────────────────────────┤
│          AI Explorer (G3)                   │
│   Playwright + Coverage + Auth Barriers     │
├─────────────────────────────────────────────┤
│             Ralph (or any agent)            │
└─────────────────────────────────────────────┘
```

## Tech Stack
- TypeScript + Node.js
- Express (API)
- React + TailwindCSS (Dashboard)
- SQLite (Persistence)
- Vitest (Testing)
- Playwright (AI Surface Exploration)
- c8 / V8 Coverage (Runtime instrumentation)

## Learnings

(This section will be updated as patterns are discovered)

## File Structure Conventions

```
src/
  core/           # Metering core (events, LOC counter, gates)
  api/            # Express REST API
  dashboard/      # React frontend
  benchmarks/     # Reference PRDs and comparison engine
  cli/            # CLI tool
  export/         # Open format exporter
  explorer/       # AI-driven reachability (G3)
    coverage.ts   # Runtime coverage instrumentation
    surface.ts    # AI surface exploration
    barriers.ts   # Auth barrier detection
    report.ts     # Reachability report generator
```
