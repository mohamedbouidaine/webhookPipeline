CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS pipelines (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  source_token  UUID        UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  action_type   TEXT        NOT NULL,
  action_config JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_subscribers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID        NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  url         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id  UUID        NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'pending',
  payload      JSONB       NOT NULL,
  result       JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS delivery_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  subscriber_url  TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  attempt_count   INT         NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  response_status INT,
  response_body   TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the queries the worker runs most often
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_id    ON jobs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_job_id   ON delivery_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status   ON delivery_attempts(status, next_retry_at);
