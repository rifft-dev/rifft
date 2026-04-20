CREATE TABLE IF NOT EXISTS incident_shares (
  token TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incident_shares_trace_id_idx
  ON incident_shares (trace_id);
