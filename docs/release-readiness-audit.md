# SpeakUp AI — Release Readiness Audit

**Audit date:** 2026-10-19  
**Audited branch:** `main` at `21cbd60bf7e21a9cce8241822a95919445418f74`  
**Purpose:** Separate verified repository/CI status from checks that require a deployment-like environment.

## Current status

| Area | Status | Evidence / next action |
| --- | --- | --- |
| Feature integration | Implemented features listed below are present on `main`; verify each through the app before release. | Repository source and main-branch CI; see feature inventory. |
| Main-branch CI | Passed for the latest reviewed merge commit. | [Run 39295637214](https://github.com/uttarooque73/learn-english/actions/runs/39295637214) |
| Open feature PRs | None at audit time. | Stale/duplicate PRs #111–#116 were closed because their changes were already present on `main`. |
| Migration upgrade against a representative deployed database | **Not yet verified in staging.** | Run acceptance item 1 below and record the database snapshot/version. |
| Multiple independent worker processes contending for the same database | **Not yet verified in staging.** | Run acceptance item 2 below; in-process tests do not prove cross-process behavior. |
| Provider outage/retry behavior under deployed conditions | **Not yet verified in staging.** | Run acceptance item 3 below. |
| Controlled load and latency measurements | **Not yet verified in staging.** | Run acceptance item 4 below and preserve measurements. |
| Operations endpoint auth/privacy in deployment | Automated coverage exists; deployed configuration still needs verification. | Run acceptance item 5 below. |
| Backup/restore of a deployment-like database | CI integrity regression coverage exists; staging restore still needs verification. | Run acceptance item 6 below. |

Do not describe the system as production-ready until the deployment-specific items have been executed and their results recorded. CI passing is necessary, but it is not a substitute for staging acceptance.

## Feature inventory on `main`

The current implementation includes these learning experiences and supporting capabilities. This inventory confirms repository integration, not a claim that every real-world provider/browser combination has been manually tested.

- AI conversation partner and conversation coaching, including specialist-agent routing and suggested replies.
- Pronunciation practice, speech/transcript feedback, and repeat practice where browser capabilities allow.
- Grammar and sentence improvement, vocabulary learning/revision, and English Quest / SpeakUp Adventures.
- Real-world challenge simulations and speaking roleplay.
- Personal learning dashboard, daily speaking missions, mission history, progress signals, recommendations, and weekly learning reports.
- Listening comprehension, proficiency assessment, and AI discussion / paragraph practice.
- Account and learner-data functionality, including owner-scoped persistence, learning history, and account management.
- Adaptive learning workflow, LangGraph orchestration, durable jobs, recovery paths, operational metrics, and automation controls.

### Known compatibility boundaries

- Browser speech recognition and speech synthesis vary by browser, permissions, and device. Typed practice must remain available where microphone recognition is unsupported.
- Transcript similarity is a practice hint, not a phoneme-level pronunciation score.
- Provider availability, credentials, model configuration, and latency must be checked in the actual deployment environment.
- Do not run multiple application instances with separate local SQLite files and assume they share one durable queue.

## Required staging acceptance

Run these checks in a deployment-like staging environment. Fill in the execution record at the end of this document (or link to the team's test record) with actual results; never mark a check passed without evidence.

### 1. Database migration and preservation

- [ ] Start with a fresh database and apply all migrations.
- [ ] Upgrade a representative copy of an existing database.
- [ ] Run migrations a second time where the migration runner promises idempotency.
- [ ] Compare expected learner records and key counts before/after; investigate any discrepancy.
- [ ] Record database engine/version, migration commit, and logs.

### 2. Independent worker contention

- [ ] Start at least two independent worker processes against the **same** database.
- [ ] Send concurrent authenticated requests to `/api/learning/worker` using distinct `X-Worker-Id` values.
- [ ] Verify lease ownership, retry bounds, abandoned-lease recovery, and no duplicate plan/evidence side effects.
- [ ] Inspect job-attempt rows and plan versions; retain sanitized evidence.

### 3. Provider failure and retry behavior

- [ ] Simulate provider timeout and provider unavailability.
- [ ] Verify bounded retries, safe failure codes, and no duplicate learning-evidence writes.
- [ ] Confirm interactive/manual practice remains usable while automation is paused or the provider is unavailable.

### 4. Controlled load and latency

- [ ] Define a realistic workload, concurrency, and test duration before execution.
- [ ] Record queue depth, expired leases, workflow failure rate, and p50/p95 workflow duration.
- [ ] Check resource use and database lock/busy behavior.
- [ ] Document thresholds, actual results, and any follow-up fixes.

### 5. Operations endpoint security

- [ ] Verify missing and incorrect bearer secrets are rejected.
- [ ] Verify a valid operator secret returns only aggregate operational metrics.
- [ ] Confirm no learner IDs, goals, responses, job payloads, checkpoint contents, or credentials are exposed.
- [ ] Confirm secret rotation and automation pause/rollback procedures are understood by the operator.

### 6. Backup and restore

- [ ] Create a backup of the staging database.
- [ ] Restore it to a separate database file/location without overwriting the active database.
- [ ] Run SQLite `PRAGMA integrity_check` on the restored copy.
- [ ] Verify representative expected learner records and migration ledger entries.
- [ ] Record restore duration and any data loss window.

## Execution record

| Field | Value |
| --- | --- |
| Environment / deployment URL (no secrets) | Not yet recorded |
| Application commit SHA | Not yet recorded |
| Database engine/version | Not yet recorded |
| Date and operator | Not yet recorded |
| Worker concurrency | Not yet recorded |
| Load-test workload and duration | Not yet recorded |
| Results / evidence links | Not yet recorded |
| Blocking defects / remediation PRs | Not yet recorded |
| Release decision | **Pending staging acceptance** |

## CI commands

Run the repository's required checks on the candidate commit:

```sh
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

See [Learning automation operations](learning-operations.md) for deployment and rollback details.
