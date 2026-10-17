#!/usr/bin/env bash
set -Eeuo pipefail

: "${LEARNING_SCHEDULER_URL:?Set LEARNING_SCHEDULER_URL to the /api/learning/scheduler endpoint}"
: "${LEARNING_WORKER_SECRET:?Set LEARNING_WORKER_SECRET to the same secret configured on the app server}"
command -v curl >/dev/null 2>&1 || {
  printf 'curl is required to trigger the learning scheduler.\n' >&2
  exit 2
}

curl --silent --show-error --fail --max-time 30 \
  --request POST "$LEARNING_SCHEDULER_URL" \
  --header "Authorization: Bearer $LEARNING_WORKER_SECRET" \
  --header "Content-Type: application/json" \
  --data '{}'
printf '\n'
