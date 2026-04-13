CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'default',
  token TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_project_id_idx
  ON api_keys (project_id);

CREATE INDEX IF NOT EXISTS api_keys_token_active_idx
  ON api_keys (token)
  WHERE revoked_at IS NULL;

INSERT INTO projects (id, name)
VALUES (
  'default',
  'Default Project'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_keys (id, project_id, name, token)
VALUES (
  'key_default',
  'default',
  'default',
  'rft_live_default_local_dev'
)
ON CONFLICT (id) DO NOTHING;
