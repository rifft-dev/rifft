#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR"
node --import ./packages/sdk-js/node_modules/tsx/dist/loader.mjs ./playgrounds/debug-handoff/src/run-broken.ts
