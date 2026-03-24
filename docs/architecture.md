# Architecture Notes

Rifft uses a split-storage design:

- ClickHouse stores span-level trace data and graph-friendly event records.
- Postgres stores project metadata, trace summaries, auth-linked project membership, and configuration.
- The collector receives OTLP traffic and normalizes spans into the Rifft storage model.
- The API reads aggregate views from ClickHouse and metadata from Postgres.
- The web app renders graph, timeline, and agent-focused debugging views.

This repository currently contains the initial runnable scaffold for those services.

