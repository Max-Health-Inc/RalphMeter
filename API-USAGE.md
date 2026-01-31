# RalphMeter API Usage

## Starting the Server

```typescript
import { createServer } from './src/api/server.js';

const server = createServer();
server.listen(3333);
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Create Session
```bash
POST /api/sessions
Content-Type: application/json

{
  "tags": {
    "mode": "wiggum",
    "methodology": "tdd"
  }
}
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "createdAt": "2026-01-31T07:00:00.000Z"
}
```

### Emit Event
```bash
POST /api/sessions/:sessionId/events
Content-Type: application/json

{
  "event": {
    "timestamp": "2026-01-31T07:00:00.000Z",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "eventType": "iteration_start",
    "payload": {
      "iterationNumber": 1,
      "storyId": "US-001"
    }
  }
}
```

### List All Sessions
```bash
GET /api/sessions
```

Response:
```json
{
  "sessions": [
    {
      "sessionId": "...",
      "status": "active",
      "startedAt": "...",
      "eventCount": 5
    }
  ],
  "count": 1
}
```

### Get Session Details
```bash
GET /api/sessions/:sessionId
```

Response:
```json
{
  "sessionId": "...",
  "status": "active",
  "startedAt": "...",
  "tags": {},
  "events": [...]
}
```

### Get Session Metrics
```bash
# Basic metrics
GET /api/sessions/:sessionId/metrics

# Full metrics with LOC snapshot
GET /api/sessions/:sessionId/metrics?rootPath=/path/to/codebase
```

## Event Types

All events share this structure:
```typescript
{
  timestamp: string;      // ISO 8601
  sessionId: string;      // UUID
  eventType: string;      // See below
  payload: object;        // Event-specific
}
```

### Event Types:
- `session_start` - Start of session
- `session_end` - End of session
- `iteration_start` - Start of iteration
- `iteration_end` - End of iteration
- `tokens_in` - Input tokens consumed
- `tokens_out` - Output tokens generated
- `compilation_result` - Build/compile result
- `test_result` - Test run result
- `story_complete` - Story completion

## Example Workflow

```typescript
// 1. Create session
const session = await fetch('http://localhost:3333/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tags: { mode: 'test' } })
}).then(r => r.json());

// 2. Emit events
await fetch(`http://localhost:3333/api/sessions/${session.sessionId}/events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event: {
      timestamp: new Date().toISOString(),
      sessionId: session.sessionId,
      eventType: 'tokens_in',
      payload: { count: 100 }
    }
  })
});

// 3. Get metrics
const metrics = await fetch(
  `http://localhost:3333/api/sessions/${session.sessionId}/metrics?rootPath=/path/to/code`
).then(r => r.json());
```

## Error Handling

All errors return this structure:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common error codes:
- `VALIDATION_ERROR` - Invalid request data
- `INVALID_EVENT` - Event validation failed
- `SESSION_NOT_FOUND` - Session doesn't exist
- `SESSION_ID_MISMATCH` - Event sessionId doesn't match URL
- `NOT_FOUND` - Unknown endpoint
