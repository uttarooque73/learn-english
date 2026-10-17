# Learning automation operations

## Authenticated operational metrics

The `GET /api/learning/operations` endpoint uses the same `LEARNING_WORKER_SECRET` bearer-token authentication as the worker. It reports a rolling 24-hour aggregate of LangGraph run status/duration, bounded failure-code counts, and durable queue/attempt status. It does not return learner IDs, goals, practice responses, job payloads, or checkpoint content. Treat the endpoint and secret as operator-only; rotate the secret immediately if it is exposed.

Example:

```sh
curl --fail --silent --show-error \
  --header "Authorization: Bearer $LEARNING_WORKER_SECRET" \
  "$LEARNING_OPERATIONS_URL"
```

Set `LEARNING_OPERATIONS_URL` explicitly to the deployed `/api/learning/operations` URL; do not rely on path rewriting from the worker URL.

## Staged pause / rollback

Set `LEARNING_AUTOMATION_ENABLED=false` (or `0`) and restart/redeploy the application to pause scheduled enqueueing and automated job processing. Manual learning-plan generation and practice endpoints remain available. Unset the variable or set it to `true` to restore the previous behavior. The default remains enabled for backward compatibility.

Before pausing, inspect the queue and current failures with the authenticated operations endpoint. Pausing does not delete queued jobs or learner history; queued work can resume when automation is enabled again.

## Operational validation

The CI suite includes automated checks for clean migrations, legacy-schema adoption, owner/data preservation, unique job claims across repeated worker claims, and SQLite backup/restore integrity. Run the following commands before rollout:

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

Before production rollout:

1. Exercise a fresh database and an upgrade from a representative existing database.
2. Run multiple independent worker processes against the same SQLite database and verify lease ownership, bounded retries, and no duplicate plan side effects. The in-process claim test is a regression check, not a substitute for this deployment test.
3. Simulate provider timeout/unavailability and verify bounded retries and safe error codes.
4. Record queue depth, expired leases, workflow failure rate, and p50/p95 workflow duration during a controlled load test.
5. Verify that the operations endpoint rejects missing/incorrect secrets and never emits learner content.
6. Back up the SQLite database and restore it to a separate file; verify `PRAGMA integrity_check` and expected learner records before enabling scheduled automation.

Do not enable multiple app instances against separate local SQLite files and assume they share a queue. SQLite/WAL is a single-database deployment design; multi-instance deployment requires shared durable storage or a separately reviewed database architecture.
