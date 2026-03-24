CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 30,
  cost_threshold_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  timeout_threshold_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  root_span_name TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'unset')),
  framework TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  agent_count INTEGER NOT NULL DEFAULT 0,
  span_count INTEGER NOT NULL DEFAULT 0,
  total_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  mast_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS traces_project_started_at_idx
  ON traces (project_id, started_at DESC);

CREATE TABLE IF NOT EXISTS fork_drafts (
  trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
  span_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trace_id, span_id)
);

CREATE INDEX IF NOT EXISTS fork_drafts_trace_updated_at_idx
  ON fork_drafts (trace_id, updated_at DESC);

INSERT INTO projects (id, name, api_key)
VALUES (
  'default',
  'Default Project',
  encode(gen_random_bytes(24), 'hex')
)
ON CONFLICT (id) DO NOTHING;
