# Webhook Pipeline

A webhook-driven processing pipeline built with Node.js, TypeScript, Fastify, PostgreSQL, and a polling worker.

The system receives webhook events, stores them as jobs, applies a configurable action per pipeline, and delivers transformed results to subscribed URLs with retry support.

## Features

- Pipeline management with per-pipeline action configuration
- Ingestion endpoint for source webhooks
- Persistent job queue in PostgreSQL
- Worker that processes jobs and creates delivery attempts
- Delivery retries with exponential backoff
- Typed validation for API input and action configs
- Integration and unit tests with Vitest

## Tech Stack

- Runtime: Node.js + TypeScript
- API: Fastify
- DB access: Drizzle ORM + pg
- Validation: zod
- Templating: mustache
- Testing: vitest
- Containers: Docker + docker compose

## Project Structure

```text
src/
  api/          # Fastify server, routes, middleware
  actions/      # Action implementations (transform/filter/template)
  db/           # DB client, schema, migrations, query helpers
  queue/        # Enqueue/dequeue job logic
  worker/       # Job processing + delivery retry loop
tests/
  integration/  # API integration tests
  unit/         # Action unit tests
```

## Setup

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure environment

Create a local `.env` file (or export env vars) with:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/webhook_pipeline
PORT=3000
WORKER_POLL_INTERVAL=2000
MAX_DELIVERY_ATTEMPTS=5
```

#### Environment variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Full PostgreSQL connection URL. Both the API and the worker must point to the same database. |
| `PORT` | No | `3000` | TCP port the API server listens on. Not used by the worker. |
| `WORKER_POLL_INTERVAL` | No | `2000` | Milliseconds between worker polling ticks. Lower values reduce job latency but increase DB query frequency. |
| `MAX_DELIVERY_ATTEMPTS` | No | `5` | Maximum number of HTTP delivery attempts per subscriber before a delivery is permanently marked `failed`. |

> **Note:** `DATABASE_URL` must be a valid PostgreSQL connection URL (validated at startup). The process exits immediately if any required variable is missing or invalid.

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Ensure schema is applied

The SQL migration (`src/db/migrations/0001_initial.sql`) is auto-mounted into the PostgreSQL container on first startup when the Docker volume is empty. It uses `CREATE TABLE IF NOT EXISTS` so it is safe to re-run.

You can also apply it explicitly at any time:

```bash
npm run db:migrate
```

#### Applying schema changes after the initial migration

If you add columns or tables, create a new numbered SQL file (e.g. `0002_add_column.sql`) and update `src/db/migrate.ts` to run it. Mount the new file in `docker-compose.yml` if you want it applied automatically to fresh containers.

## Run API and Worker

Run each process in a separate terminal.

### Development mode

```bash
npm run dev:api
```

```bash
npm run dev:worker
```

### Production-like mode

```bash
npm run build
npm run start:api
```

```bash
npm run start:worker
```

### Run both API and worker with Docker Compose

```bash
docker compose up --build
```

## Testing

Tests use the dedicated database in `docker-compose.test.yml` on port `5433`.

```bash
docker compose -f docker-compose.test.yml up -d postgres-test
npm test
docker compose -f docker-compose.test.yml down -v
```

## API Reference

Base URL (local): `http://localhost:3000`

### Health

#### GET /health

- Description: Returns service health status.
- Request body: none
- Success response (`200`):

```json
{
  "status": "ok",
  "timestamp": "2026-03-24T12:34:56.000Z"
}
```

---

### Pipelines

#### POST /pipelines

- Description: Create a pipeline and subscriber list.
- Request body:

```json
{
  "name": "User Signup Pipeline",
  "actionType": "json_transform",
  "actionConfig": {
    "userId": "user.id",
    "email": "user.email"
  },
  "subscribers": [
    "https://example.com/hook"
  ]
}
```

- Validation notes:
  - `name` required
  - `actionType` must be one of: `json_transform`, `conditional_filter`, `text_template`
  - `subscribers` must contain at least one valid URL
  - `actionConfig` must match the selected action type
- Success response (`201`):

```json
{
  "id": "4b1fd2f5-d5fd-48a5-84f3-b7202d1d8f5f",
  "name": "User Signup Pipeline",
  "sourceToken": "845463f8-0b76-4be6-bda7-9012d9b0a057",
  "actionType": "json_transform",
  "actionConfig": {
    "userId": "user.id",
    "email": "user.email"
  },
  "createdAt": "2026-03-24T12:34:56.000Z",
  "updatedAt": "2026-03-24T12:34:56.000Z",
  "subscribers": [
    {
      "id": "f3d27bb1-0f77-4210-b752-361f50c778aa",
      "pipelineId": "4b1fd2f5-d5fd-48a5-84f3-b7202d1d8f5f",
      "url": "https://example.com/hook",
      "createdAt": "2026-03-24T12:34:56.000Z"
    }
  ]
}
```

- Error responses:
  - `400`: invalid payload or invalid action configuration

#### GET /pipelines

- Description: List all pipelines.
- Request body: none
- Success response (`200`):

```json
[
  {
    "id": "4b1fd2f5-d5fd-48a5-84f3-b7202d1d8f5f",
    "name": "User Signup Pipeline",
    "sourceToken": "845463f8-0b76-4be6-bda7-9012d9b0a057",
    "actionType": "json_transform",
    "actionConfig": {
      "userId": "user.id"
    },
    "createdAt": "2026-03-24T12:34:56.000Z",
    "updatedAt": "2026-03-24T12:34:56.000Z"
  }
]
```

#### GET /pipelines/:id

- Description: Get one pipeline with subscribers.
- URL params:
  - `id` (UUID)
- Success response (`200`):

```json
{
  "id": "4b1fd2f5-d5fd-48a5-84f3-b7202d1d8f5f",
  "name": "User Signup Pipeline",
  "sourceToken": "845463f8-0b76-4be6-bda7-9012d9b0a057",
  "actionType": "json_transform",
  "actionConfig": {
    "userId": "user.id"
  },
  "createdAt": "2026-03-24T12:34:56.000Z",
  "updatedAt": "2026-03-24T12:34:56.000Z",
  "subscribers": [
    {
      "id": "f3d27bb1-0f77-4210-b752-361f50c778aa",
      "pipelineId": "4b1fd2f5-d5fd-48a5-84f3-b7202d1d8f5f",
      "url": "https://example.com/hook",
      "createdAt": "2026-03-24T12:34:56.000Z"
    }
  ]
}
```

- Error responses:
  - `404`: pipeline not found

#### PUT /pipelines/:id

- Description: Update pipeline fields and optionally replace all subscribers.
- URL params:
  - `id` (UUID)
- Request body (all fields optional):

```json
{
  "name": "Updated Pipeline Name",
  "actionType": "text_template",
  "actionConfig": {
    "template": "Hello {{user.name}}"
  },
  "subscribers": [
    "https://example.com/new-hook"
  ]
}
```

- Success response (`200`): updated pipeline with `subscribers` array.
- Error responses:
  - `400`: invalid body
  - `404`: pipeline not found

#### DELETE /pipelines/:id

- Description: Delete a pipeline and cascade related subscribers/jobs/deliveries.
- URL params:
  - `id` (UUID)
- Success response: `204 No Content`
- Error responses:
  - `404`: pipeline not found

---

### Webhooks

#### POST /webhooks/:token

- Description: Ingest webhook payload into the job queue.
- URL params:
  - `token` (pipeline `sourceToken` UUID)
- Request body: arbitrary JSON payload

Example request body:

```json
{
  "user": {
    "id": 42,
    "email": "alice@example.com"
  },
  "event": "signup"
}
```

- Success response (`202`):

```json
{
  "message": "Webhook received and queued for processing",
  "jobId": "a0720bc7-67e6-4954-9f85-3219daec04a6"
}
```

- Error responses:
  - `404`: token not mapped to any pipeline

---

### Jobs

#### GET /jobs

- Description: List jobs, optionally filtered.
- Query params:
  - `pipeline_id` (UUID, optional)
  - `status` (optional): `pending`, `processing`, `completed`, `failed`
- Success response (`200`):

```json
[
  {
    "id": "a0720bc7-67e6-4954-9f85-3219daec04a6",
    "pipelineId": "4b1fd2f5-d5fd-48a5-84f3-b7202d1d8f5f",
    "status": "pending",
    "payload": {
      "user": {
        "id": 42
      }
    },
    "result": null,
    "error": null,
    "createdAt": "2026-03-24T12:34:56.000Z",
    "updatedAt": "2026-03-24T12:34:56.000Z",
    "completedAt": null
  }
]
```

- Error responses:
  - `400`: invalid query parameters

#### GET /jobs/:id

- Description: Get one job by ID.
- URL params:
  - `id` (UUID)
- Success response (`200`): same job shape as in `GET /jobs`.
- Error responses:
  - `404`: job not found

#### GET /jobs/:id/deliveries

- Description: List delivery attempts for a job.
- URL params:
  - `id` (UUID)
- Success response (`200`):

```json
[
  {
    "id": "cdd5f69e-f6c8-4af8-a9f3-3e39be90ceee",
    "jobId": "a0720bc7-67e6-4954-9f85-3219daec04a6",
    "subscriberUrl": "https://example.com/hook",
    "status": "pending",
    "attemptCount": 0,
    "nextRetryAt": null,
    "responseStatus": null,
    "responseBody": null,
    "error": null,
    "createdAt": "2026-03-24T12:34:56.000Z",
    "updatedAt": "2026-03-24T12:34:56.000Z"
  }
]
```

- Error responses:
  - `404`: job not found

## Action Types

### json_transform

- Config: key/value map where value is a dot-path in payload.

Example config:

```json
{
  "userId": "user.id",
  "eventType": "event.type"
}
```

- Output: object with mapped keys/values.

### conditional_filter

- Config shape:

```json
{
  "conditions": [
    { "field": "event.type", "operator": "eq", "value": "signup" }
  ]
}
```

- Supported operators: `eq`, `neq`, `gt`, `lt`, `contains`, `exists`.
- Output:
  - If all conditions pass: original payload.
  - If any condition fails: `{ "filtered": true, "reason": "..." }`.

### text_template

- Config shape:

```json
{
  "template": "Hello {{user.name}}, welcome!"
}
```

- Output: `{ "rendered": "..." }`.

## Architecture

```mermaid
flowchart LR
    A[Webhook Source] -->|POST /webhooks/:token| B[Fastify API]
    B --> C[(PostgreSQL jobs)]

    D[Worker Loop] -->|dequeue pending jobs| C
    D --> E[Action Engine]
    E --> F[(PostgreSQL jobs.result)]
    D --> G[(delivery_attempts)]

    D -->|POST transformed result| H[Subscriber URL 1..N]
    H -->|status/body| D
    D -->|success/fail + retry schedule| G
```

### Processing flow

1. API receives webhook payload at `/webhooks/:token`.
2. API resolves pipeline by token and inserts a `pending` job.
3. Worker claims jobs using SQL row locks (`FOR UPDATE SKIP LOCKED`) and marks them `processing`.
4. Worker executes the configured action and stores result on the job.
5. If not filtered, worker creates delivery attempts for each subscriber.
6. Worker sends POST deliveries and updates each attempt:
   - success: mark `success`
   - failure: increment attempts and retry with exponential backoff
   - max attempts reached: mark `failed`

## Delivery Retry Behavior

When a delivery attempt fails (non-2xx response or network error), the worker schedules a retry using **exponential backoff**:

```
nextRetryAt = now + (2 ^ attemptCount) × BASE_DELAY_MS
```

Where `BASE_DELAY_MS = 5000` ms (5 seconds). Example schedule:

| Attempt | Delay before next retry |
|---|---|
| 1st failure | 10 s |
| 2nd failure | 20 s |
| 3rd failure | 40 s |
| 4th failure | 80 s |
| `MAX_DELIVERY_ATTEMPTS` reached | Marked `failed` permanently — no further retries |

Filtered jobs (where `conditional_filter` returns `{ filtered: true }`) are marked `completed` but no delivery attempts are created — subscribers are never notified.

## sourceToken Security

Each pipeline is assigned a random UUID `sourceToken` at creation time. This token is embedded in the webhook ingestion URL (`POST /webhooks/:token`) and acts as a shared secret between the webhook source and the pipeline.

- Treat `sourceToken` values as secrets — anyone with the token can inject jobs into the pipeline.
- If a token is compromised, delete and recreate the pipeline to generate a new token.
- The token is intentionally simple (no HMAC signature verification). For production use, consider adding signature verification (e.g. `X-Hub-Signature-256`) as an additional layer.

## Key Design Decisions

1. PostgreSQL-backed queue instead of in-memory queue
   - Reasoning: durable job state, auditable history, easier recovery after restarts.

2. Tokenized webhook ingestion (`/webhooks/:token`)
   - Reasoning: simple source-to-pipeline routing without requiring per-source auth integration in this layer.

3. Action abstraction (`json_transform`, `conditional_filter`, `text_template`)
   - Reasoning: allows pipeline behavior changes through config rather than redeploying code.

4. Worker claim strategy with `FOR UPDATE SKIP LOCKED`
   - Reasoning: safe concurrent workers with minimal contention and no duplicate processing.

5. Delivery retries with exponential backoff
   - Reasoning: resilient downstream delivery while limiting immediate retry storms.

6. Strict input/config validation with zod
   - Reasoning: fail fast on malformed API payloads and action configs, reducing runtime ambiguity.

## Operations

### Worker crash recovery

If the worker process crashes mid-tick, any jobs that were claimed and marked `processing` will remain in that state. The worker does **not** automatically reset them on restart.

To recover stuck jobs, run:

```sql
UPDATE jobs SET status = 'pending', updated_at = now()
WHERE status = 'processing';
```

Similarly, delivery attempts left in `pending` with a past `next_retry_at` will be retried automatically on the next worker tick — no manual intervention is needed for those.

In Docker Compose, the worker has `restart: unless-stopped`, so it restarts automatically after a crash. Re-running the above SQL once after an unclean shutdown is sufficient to requeue stuck jobs.

### Monitoring and observability

All processing is logged to stdout using `console.log` / `console.error`. Key log patterns:

| Log prefix | Meaning |
|---|---|
| `[processor] Processing job <id>` | Worker picked up a job |
| `[processor] Job <id> filtered` | Job was filtered — no deliveries |
| `[processor] Job <id> failed: ...` | Job processing error |
| `[delivery] ✓ <url> — <status>` | Delivery succeeded |
| `[delivery] ✗ <url> — retry in Xs` | Delivery failed, retry scheduled |
| `[delivery] ✗ <url> — permanently failed` | Max attempts reached |

To check job and delivery state, use the read-only API endpoints:

```bash
# List all failed jobs
curl "http://localhost:3000/jobs?status=failed"

# Check deliveries for a specific job
curl "http://localhost:3000/jobs/<jobId>/deliveries"
```

## Troubleshooting

### Jobs stuck in `processing` status

This happens when the worker crashed or was killed mid-tick. Reset them using the SQL snippet in [Worker crash recovery](#worker-crash-recovery) above.

### Deliveries permanently failing

Check the `error` field on the delivery attempt:

```bash
curl "http://localhost:3000/jobs/<jobId>/deliveries"
```

Common causes:
- Subscriber URL is unreachable or returns non-2xx responses consistently.
- The subscriber took longer than 10 seconds to respond (request timeout).
- DNS resolution failure for the subscriber URL.

### API returns 400 on pipeline creation

- Ensure `actionConfig` matches the selected `actionType` (e.g. `conditional_filter` requires at least one condition; `text_template` requires a non-empty `template` string).
- Ensure all subscriber URLs are valid absolute URLs (e.g. `https://...`).

### Worker not processing jobs

- Check that `DATABASE_URL` is the same for both the API and the worker.
- Verify the worker process is running (`docker compose ps`).
- Confirm jobs exist in `pending` status via `GET /jobs?status=pending`.

## CI/CD

GitHub Actions workflow is defined in `.github/workflows/ci.yml`.

On every push it runs:

1. `npm run lint`
2. `npm test` (with temporary Postgres from `docker-compose.test.yml`)
3. `npm run build`

## Useful Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```