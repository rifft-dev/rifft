#!/usr/bin/env bash

set -euo pipefail

TRACE_IDS=("$@")

if [ ${#TRACE_IDS[@]} -eq 0 ]; then
  TRACE_IDS=(
    "526efa099fd7814f635c236a5042d197"
    "933c473323aefa323d15679a457d4ee4"
    "9747ce18d1191eaca3b3eb6496c51184"
    "0606b0e82811bd783f3f2256acc1e6c4"
    "7155fe35354be6bb02b26ae746d1d15b"
    "74edc35615c24a684fff7f9029e6311a"
    "f468ccb1e2a5bcbd30c71e081dbd17fa"
    "aa229e07db767fb80194db348fc7e54c"
    "e31476431b2706b73199e24eb4dbf842"
  )
fi

if [ ${#TRACE_IDS[@]} -eq 0 ]; then
  echo "No trace IDs provided."
  exit 0
fi

printf "Cleaning %s stale demo trace(s)\n" "${#TRACE_IDS[@]}"

PG_VALUES=""
CH_VALUES=""
for trace_id in "${TRACE_IDS[@]}"; do
  if [ -n "$PG_VALUES" ]; then
    PG_VALUES+=", "
    CH_VALUES+=", "
  fi
  PG_VALUES+="'${trace_id}'"
  CH_VALUES+="'${trace_id}'"
done

docker compose exec -T postgres psql -U rifft -d rifft -c "DELETE FROM traces WHERE trace_id IN (${PG_VALUES});"
docker compose exec -T clickhouse clickhouse-client --user rifft --password rifft --query "DELETE FROM rifft.spans WHERE trace_id IN (${CH_VALUES}) SETTINGS mutations_sync = 1"

echo "Done."
