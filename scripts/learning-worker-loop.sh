#!/usr/bin/env bash
set -Eeuo pipefail

: "${LEARNING_WORKER_URL:?Set LEARNING_WORKER_URL to the /api/learning/worker endpoint}"
: "${LEARNING_WORKER_SECRET:?Set LEARNING_WORKER_SECRET to the same secret configured on the app server}"
INTERVAL_SECONDS="${LEARNING_WORKER_INTERVAL_SECONDS:-10}"

[[ "$INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]] || {
  printf 'LEARNING_WORKER_INTERVAL_SECONDS must be a positive integer.\n' >&2
  exit 2
}
command -v curl >/dev/null 2>&1 || {
  printf 'curl is required to run the learning worker.\n' >&2
  exit 2
}

while true; do
  if ! curl --silent --show-error --fail --max-time 120 \
    --request POST "$LEARNING_WORKER_URL" \
    --header "Authorization: Bearer $LEARNING_WORKER_SECRET" \
    --header "Content-Type: application/json" \
    --header "X-Worker-Id: ${LEARNING_WORKER_ID:-worker-loop}" \
    --data '{"limit":5}' >/dev/null; then
    printf '[learning-worker] Request failed at %s; queued jobs remain durable and will be retried.\n' "$(date -Is)" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done
