# Learning automation operations

## Authenticated operational metrics

The `GET /api/learning/operations` endpoint uses the same `LEARNING_WORKER_SECRET` bearer-token authentication as the worker. It reports a rolling 24-hour aggregate of LangGraph run status/duration, bounded failure-code counts, and durable queue/attempt status. It does not return learner IDs, goals, practice responses, job payloads, or checkpoint content. Treat the endpoint and secret as operator-only; rotate the secret immediately if it is exposed.

Example:

```sh
curl --fail --silent --show-error \
  --header "Authorization: Bearer $LEARNING_WORKER_SECRET" \
  "$LEARNING_WORKER_URL/../operations"
```

For deployments where the worker base URL is `https://example.com/api/learning/worker`, set the operations URL explicitly to `https://example.com/api/learning/operations`; do not depend on path rewriting in production scripts.

## Staged pause / rollback

Set `LEARNING_AUTOMATION_ENABLED=false` (or `0`) and restart/redeploy the application to pause scheduled enqueueing and automated job processing. Manual learning-plan generation and practice endpoints remain available. Unset the variable or set it to `true` to restore the previous behavior. The default remains enabled for backward compatibility.

Before pausing, inspect the queue and current failures with the authenticated operations endpoint. Pausing does not delete queued jobs or learner history; queued work can resume when automation is enabled again.

## Operational validation

Before production rollout:

1. Run the full CI pipeline (lint, shell syntax, type-check, unit/integration coverage, production build, and Playwright).
2. Exercise a fresh database and an upgrade from a representative existing database.
3. Run multiple workers against the same SQLite database and verify lease ownership, bounded retries, and no duplicate plan side effects.
4. Simulate provider timeout/unavailability and verify bounded retries and safe error codes.
5. Record queue depth, expired leases, workflow failure rate, and p50/p95 workflow duration during a controlled load test.
6. Verify that the operations endpoint rejects missing/incorrect secrets and never emits learner content.
7. Back up the SQLite database and verify a restore before enabling scheduled automation.

Do not enable multiple app instances against separate local SQLite files and assume they share a queue. SQLite/WAL is a single-database deployment design; multi-instance deployment requires shared durable storage or a separately reviewed database architecture.
