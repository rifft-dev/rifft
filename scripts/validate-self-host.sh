#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Rifft self-host validation"
echo "Workspace: $ROOT_DIR"

start_ts="$(date +%s)"

echo
echo "1. Restarting the stack"
docker compose down
docker compose up -d --build

echo
echo "2. Waiting for services to become healthy"
services=(postgres clickhouse collector api web)

for service in "${services[@]}"; do
  echo "Waiting for $service..."
  until docker compose ps --format json "$service" | grep -q '"Health":"healthy"'; do
    sleep 2
  done
done

end_ts="$(date +%s)"
duration="$((end_ts - start_ts))"

echo
echo "3. Verifying key routes"
web_health="$(curl -s http://localhost:3000/api/health)"
api_health="$(curl -s http://localhost:4000/health)"
traces_status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/traces)"

echo "web health: $web_health"
echo "api health: $api_health"
echo "traces status: $traces_status"

echo
echo "4. Current container status"
docker compose ps

echo
echo "Validation summary"
echo "startup_seconds=$duration"
echo "web_health=$web_health"
echo "api_health=$api_health"
echo "traces_status=$traces_status"
