CREATE DATABASE IF NOT EXISTS rifft;

CREATE TABLE IF NOT EXISTS rifft.spans (
  trace_id String,
  span_id String,
  parent_span_id Nullable(String),
  name String,
  start_time DateTime64(9, 'UTC'),
  end_time DateTime64(9, 'UTC'),
  duration_ms Float64,
  status Enum('ok' = 1, 'error' = 2, 'unset' = 3),
  attributes String,
  events String,
  resource String,
  agent_id String,
  framework String,
  project_id String
)
ENGINE = MergeTree
ORDER BY (project_id, trace_id, start_time, span_id);

