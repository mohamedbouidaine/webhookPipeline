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

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Ensure schema is applied

The SQL migration is auto-mounted for first startup. You can also run the migration command explicitly (safe due to `IF NOT EXISTS`):

```bash
npm run db:migrate
```

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
