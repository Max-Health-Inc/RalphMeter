# RalphMeter

> The physical unit for AI code synthesis.

**Ralph** — Tokens per Verified LOC. Lower is better.

![RalphMeter Architecture](image.png)

## What This Measures

```
PRD (Intent) → [Agent + Energy] → Verified Application
```

RalphMeter captures the transformation from human intent to working code, measuring:

- **Verified LOC (vLOC)**: Lines of code that pass all applicable gates
- **Ralph**: Tokens per Verified LOC (lower is better) — the cost of synthesis
- **vLOC/M**: Verified LOC per Minute — effective productivity
- **Verification Rate**: vLOC / LOC — how much survives the gates
- **PoE-LOC**: Probability of Error per Line of Code

For true energy accounting, Ralph can be converted to Joules using provider-specific token-to-watt estimates.

## Measurement Hierarchy

```
Session (full Ralph run)
├── Story 1 (may take N iterations)
│   ├── Iteration 1: +1,200 tokens
│   ├── Iteration 2: +1,400 tokens  
│   └── Iteration 3: PASSES
├── Story 2 (1 iteration)
│   └── Iteration 1: +800 tokens, PASSES
└── Story 3 (stuck)
    └── Iterations 1-5: +10,000 tokens, no pass
```

**Cumulative Ralph** — recalculated after each story:

```
After Story 1:  3,600 tokens,  100 LOC → Ralph = 36
After Story 2:  4,400 tokens,  180 LOC → Ralph = 24 ✓ improving
After Story 3: 14,400 tokens,  180 LOC → Ralph = 80 ⚠️ spike!
```

| Signal | Meaning |
|--------|--------|
| Ralph trending down | Healthy convergence |
| Ralph spike | Problem story — tokens burned, little LOC added |
| Ralph flat | Steady progress |

LOC is measured as a codebase snapshot. Ralph = cumulative tokens / current LOC. Spikes reveal problem stories; per-story deltas enable drill-down analysis.

## The 3-Gate Model

Each gate provides **line-level verification** through different mechanisms:

| Gate | What It Checks | Line-Level How | Applies When |
|------|----------------|----------------|--------------|
| G1 | Compiles | Compiler errors point to specific lines | Always |
| G2 | Correct | Test coverage maps passing tests to lines | Has tests |
| G3 | Reachable | Runtime coverage shows executed lines | Has explorable surface |

A line is **verified** when it passes all applicable gates:

```typescript
Line 42: validateUser(input)
  G1 ✓ No compile error
  G2 ✓ Covered by passing test  
  G3 ✓ Executed during exploration
  → Verified ✓

Line 87: unusedHelper()
  G1 ✓ Compiles fine
  G2 ✗ Not covered by any passing test
  G3 ✗ Never executed
  → NOT verified (dead code)
```

### Configurable Thresholds

Story success can depend on gate thresholds:

```json
{
  "gates": {
    "G1": { "required": true },
    "G2": { "required": true, "threshold": 0.80 },
    "G3": { "skip": true }
  }
}
```

- **required**: Must pass for story to complete
- **threshold**: Minimum % of lines that must pass this gate
- **skip**: Gate is not evaluated (e.g., no tests yet, no explorable surface)

Code is **verified** when all *applicable* gates pass at the line level.

## Extensibility

The 3-gate model is the default, but gates are **pluggable**:

- Add custom gates (security scans, performance budgets, accessibility)
- Skip gates that don't apply to your project
- Configure pass thresholds per gate

See [Quality Gate Plugins](#) for the extension API.

## Session Metadata

Sessions support optional tags for arbitrary metadata:

```json
{
  "sessionId": "abc-123",
  "tags": {
    "mode": "DEVELOP",
    "methodology": "ralph-wiggum",
    "human_intervention": "false"
  }
}
```

Use tags to:
- Track different methodologies (Josh Mandel's modes, custom workflows)
- A/B test agent configurations
- Compare human-assisted vs fully autonomous sessions

## Quick Start

```bash
npm install
npm run dev
```

## Ralph Integration

RalphMeter provides a hook system that can be integrated into Ralph's loop to automatically meter agent activity.

### TypeScript/JavaScript Integration

```typescript
import { createRalphHooks } from 'ralphmeter';

// Create hooks instance
const hooks = createRalphHooks('http://localhost:3333');

// Start session with optional tags
await hooks.onSessionStart({
  tags: {
    mode: 'DEVELOP',
    methodology: 'ralph-wiggum',
    human_intervention: 'false'
  }
});

// Iteration loop
for (let i = 1; i <= maxIterations; i++) {
  await hooks.onIterationStart({
    iterationNumber: i,
    storyId: currentStory.id
  });

  // Track token usage
  await hooks.onTokensIn({ count: promptTokens, model: 'gpt-4' });
  await hooks.onTokensOut({ count: completionTokens, model: 'gpt-4' });

  // Track compilation
  const compileResult = await compile();
  await hooks.onCompilation({
    success: compileResult.success,
    errorCount: compileResult.errors.length,
    errors: compileResult.errors
  });

  // Track tests
  const testResult = await runTests();
  await hooks.onTestRun({
    success: testResult.success,
    totalTests: testResult.total,
    passed: testResult.passed,
    failed: testResult.failed,
    coveragePercent: testResult.coverage
  });

  // End iteration
  await hooks.onIterationEnd({
    iterationNumber: i,
    storyId: currentStory.id,
    success: testResult.success && compileResult.success
  });

  // Mark story complete if iteration succeeded
  if (testResult.success && compileResult.success) {
    await hooks.onStoryComplete({
      storyId: currentStory.id,
      passes: true,
      locCount: await countLOC()
    });
    break;
  }
}

// End session
await hooks.onSessionEnd({
  success: allStoriesComplete,
  reason: 'All stories completed'
});
```

### Shell Script Integration

You can integrate RalphMeter into shell-based Ralph loops like `ralph.sh`:

```bash
#!/bin/bash
# ralph.sh with RalphMeter integration

METER_URL="http://localhost:3333"
SESSION_ID=$(uuidgen)

# Helper to send events to RalphMeter
send_event() {
  local event_type=$1
  local payload=$2
  
  curl -s -X POST "$METER_URL/api/sessions/$SESSION_ID/events" \
    -H "Content-Type: application/json" \
    -d "{
      \"event\": {
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",
        \"sessionId\": \"$SESSION_ID\",
        \"eventType\": \"$event_type\",
        \"payload\": $payload
      }
    }"
}

# Create session
curl -s -X POST "$METER_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"tags": {"mode": "DEVELOP"}}'

# Start session
send_event "session_start" '{"tags": {"mode": "DEVELOP"}}'

# Iteration loop
ITERATION=1
STORY_ID="US-001"

while [ $ITERATION -le 10 ]; do
  echo "Iteration $ITERATION for $STORY_ID"
  
  # Start iteration
  send_event "iteration_start" "{\"iterationNumber\": $ITERATION, \"storyId\": \"$STORY_ID\"}"
  
  # Run your agent code here...
  # Track tokens, compilation, tests, etc.
  
  # Example: track compilation
  if npm run typecheck 2>&1 | grep -q "error"; then
    send_event "compilation_result" '{"success": false, "errorCount": 1}'
    SUCCESS=false
  else
    send_event "compilation_result" '{"success": true}'
    SUCCESS=true
  fi
  
  # End iteration
  send_event "iteration_end" "{\"iterationNumber\": $ITERATION, \"storyId\": \"$STORY_ID\", \"success\": $SUCCESS}"
  
  # Break if successful
  if [ "$SUCCESS" = "true" ]; then
    send_event "story_complete" "{\"storyId\": \"$STORY_ID\", \"passes\": true}"
    break
  fi
  
  ITERATION=$((ITERATION + 1))
done

# End session
send_event "session_end" '{"success": true, "reason": "Completed"}'
```

### Configuration Options

```typescript
const hooks = createRalphHooks({
  meterUrl: 'http://localhost:3333',
  sessionId: 'custom-session-id', // Optional: auto-generated if not provided
  verbose: true,                   // Optional: log hook calls to console
  timeout: 5000                    // Optional: request timeout in ms (default: 5000)
});
```

### Viewing Metrics

After running a Ralph session with hooks enabled:

```bash
# View session summary
curl http://localhost:3333/api/sessions

# Get detailed metrics for a session
curl http://localhost:3333/api/sessions/{sessionId}/metrics

# Or use the CLI (coming in US-008)
ralphmeter report {sessionId}
```

## Status

🚧 Under construction — being built by Ralph, for Ralph.

## The Vision

An open standard for measuring AI coding agent efficiency, with:
- **Open spec** for the metric format
- **Reference benchmarks** for calibration
- **Commercial tooling** for insights

---

*"We're measuring exhaust, not combustion. The actual energy is reliable intent transformation under uncertainty."*
