# Mini Task Manager

A full-stack task management application with a complete audit trail, built with:

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Frontend   | React 18 + TypeScript + Vite + Tailwind CSS  |
| Backend    | Node.js + Express + TypeScript               |
| Database   | PostgreSQL 16                                |
| ORM        | Prisma ORM                                   |
| Validation | Zod                                          |
| Testing    | Vitest + Supertest                           |

---

## Table of Contents

1. [Why PostgreSQL](#why-postgresql)
2. [Database Schema](#database-schema)
3. [Status Transition Rules](#status-transition-rules)
4. [Prisma Transactions & Consistency](#prisma-transactions--consistency)
5. [Concurrent Update Handling](#concurrent-update-handling)
6. [Audit Log Immutability](#audit-log-immutability)
7. [PostgreSQL Trigger](#postgresql-trigger)
8. [Security Limitations](#security-limitations)
9. [Local Setup with Docker Compose](#local-setup-with-docker-compose)
10. [Running Tests](#running-tests)
11. [API Reference](#api-reference)

---

## Why PostgreSQL

PostgreSQL was selected as the primary database for the following reasons:

- **ACID transactions** — full serialisable transaction support ensures task status updates and audit log inserts are always atomic, consistent, isolated, and durable.
- **Row-level locking** (`SELECT … FOR UPDATE`) — enables fine-grained concurrency control without locking unrelated rows.
- **Serialisable isolation** — prevents write-skew and lost-update anomalies that READ COMMITTED cannot prevent.
- **Triggers** — server-side triggers protect the `audit_logs` table at the database level, independently of application code.
- **Native UUID support** — `gen_random_uuid()` and the `uuid` column type give collision-resistant identifiers at no application cost.
- **Timestamptz** — all timestamps are stored with time-zone information and normalised to UTC, avoiding ambiguity.
- **Proven reliability** — well-established open-source RDBMS with excellent tooling and a large ecosystem.

---

## Database Schema

### `tasks`

| Column        | Type         | Notes                                        |
|---------------|--------------|----------------------------------------------|
| `id`          | UUID PK      | `gen_random_uuid()`                          |
| `title`       | TEXT NOT NULL|                                              |
| `description` | TEXT NULL    |                                              |
| `status`      | TaskStatus   | Enum: `to_do`, `pending`, `in_progress`, `done`. Default `to_do`. |
| `createdBy`   | TEXT NOT NULL| Must be a predefined actor username          |
| `createdAt`   | TIMESTAMPTZ  | Server-generated, UTC                        |
| `updatedAt`   | TIMESTAMPTZ  | Auto-updated by trigger on every row update  |

### `audit_logs`

| Column       | Type        | Notes                                                  |
|--------------|-------------|--------------------------------------------------------|
| `id`         | UUID PK     | `gen_random_uuid()`                                    |
| `taskId`     | UUID NOT NULL | **Immutable snapshot** of the original task ID. Never changes even after the task is deleted. |
| `taskRefId`  | UUID NULL   | Nullable FK → `tasks.id` `ON DELETE SET NULL`. Allows querying the live task object, but becomes `NULL` after deletion. |
| `taskTitle`  | TEXT NOT NULL | Snapshot of the task title at transition time.       |
| `actor`      | TEXT NOT NULL | Username who performed the change.                   |
| `fromStatus` | TaskStatus  | Previous status.                                       |
| `toStatus`   | TaskStatus  | New status.                                            |
| `timestamp`  | TIMESTAMPTZ | Server-generated, UTC.                                 |

**Indexes:** `audit_logs(taskId)`, `audit_logs(timestamp)`

### Why the dual-field design (`taskId` + `taskRefId`)?

Historical audit records must remain queryable by task ID even after the task is deleted.  Using a single nullable FK would allow the task ID column itself to become `NULL` on deletion, destroying historical references.  The dual-field approach keeps:

- `taskId` — always the original task UUID (immutable, never `NULL`)
- `taskRefId` — a nullable FK used for optional JOIN queries to the live task row; safely becomes `NULL` when the task is deleted

---

## Status Transition Rules

```
to_do  ──→  pending
to_do  ──→  in_progress
pending ──→  in_progress
pending ──→  to_do
in_progress ──→  done
in_progress ──→  pending
done    (terminal — no further transitions)
```

Attempting any other transition returns **HTTP 422 Unprocessable Entity**.

---

## Prisma Transactions & Consistency

Every status change is executed inside a **single Prisma transaction** at the `Serializable` isolation level:

```
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

  SELECT id, title, status FROM tasks WHERE id = $taskId FOR UPDATE;
  -- ^ acquires an exclusive row-level lock

  -- Validate transition
  -- Guard: if status unchanged → no-op, return early (no audit log)

  UPDATE tasks SET status = $newStatus, "updatedAt" = NOW() WHERE id = $taskId;

  INSERT INTO audit_logs (taskId, taskRefId, taskTitle, actor, fromStatus, toStatus, timestamp)
  VALUES ($taskId, $taskId, $title, $actor, $fromStatus, $toStatus, NOW());

COMMIT;
```

If any step throws — invalid transition, task not found, DB error — Prisma automatically rolls back the entire transaction. This guarantees:

- A task status update **always** has exactly one corresponding audit log (or none on no-op).
- An audit log **never** exists without a matching task status update in the same commit.
- Neither half of the pair is visible to other connections until both are committed.

---

## Concurrent Update Handling

**Chosen strategy: pessimistic locking with `SELECT … FOR UPDATE` inside a `SERIALIZABLE` transaction.**

When two requests arrive simultaneously for the same task:

1. Both transactions begin and attempt `SELECT … FOR UPDATE` on the same task row.
2. One transaction acquires the exclusive row lock; the other **blocks** until the first commits.
3. The first transaction validates, updates, and inserts the audit log, then commits.
4. The second transaction unblocks, re-reads the (now updated) row, and:
   - If the target status is the same as the current status → **no-op** (no second audit log).
   - If the target status is now an invalid transition from the new current status → **422 error**.
   - Otherwise it proceeds with its own update.

This prevents:
- **Lost updates** — neither write silently overwrites the other.
- **Duplicate audit logs** — the no-op guard stops double-logging of identical transitions.
- **Inconsistent state** — status and audit log are always committed together.

### Trade-off vs. optimistic locking

An alternative approach would add a `version: Int` column and use `UPDATE … WHERE version = $expected` as a conditional write. If the update affects 0 rows, the transaction is retried. Optimistic locking is preferable under low-contention workloads because it avoids blocking. Pessimistic locking (chosen here) is safer under higher contention and simpler to reason about for correctness.

---

## Audit Log Immutability

Audit logs are protected at **two independent layers**:

### Application layer
- `AuditLogService` exposes only `GET` methods — there are no `update` or `delete` operations.
- Audit log `INSERT`s are performed exclusively inside the `TaskService` transaction — no other code path can create audit logs.
- No `PATCH`, `PUT`, or `DELETE` endpoints exist for audit logs.
- Task deletion via `DELETE /api/tasks/:id` removes the task row only; the `ON DELETE SET NULL` FK constraint keeps all audit logs intact with `taskRefId = NULL`.

### Database layer (PostgreSQL trigger)
The migration installs a `BEFORE UPDATE OR DELETE` trigger on `audit_logs`:

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'audit_logs are immutable — UPDATE is not allowed (row id: %)', OLD.id;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'audit_logs are immutable — DELETE is not allowed (row id: %)', OLD.id;
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
```

Any `UPDATE` or `DELETE` statement against `audit_logs` — from the application, a migration script, or a direct `psql` session — will raise a PostgreSQL exception and be rejected at the storage engine level before any row is modified.

---

## Security Limitations

> **Important:** The triggers and application-level safeguards described above protect against accidental or unauthorised changes made through normal database connections and the application API. They do **not** provide absolute protection in all cases:
>
> - A **database superuser** (e.g., the `postgres` role) can `DROP TRIGGER`, `ALTER TABLE … DISABLE TRIGGER ALL`, or execute `TRUNCATE` (which bypasses row-level triggers) to bypass the immutability trigger.
> - A **DBA with `SUPERUSER`** or `BYPASSRLS` privileges can similarly circumvent any trigger or row-level security policy.
> - **Physical-level access** (direct file system, WAL manipulation, point-in-time recovery restores) bypasses all logical controls.
>
> For stronger guarantees, consider:
> - Restricting the application's database role so it cannot `ALTER TABLE`, `DROP TRIGGER`, or `TRUNCATE` the `audit_logs` table.
> - Running migrations under a separate, more privileged role.
> - Using PostgreSQL **Row-Level Security (RLS)** with a policy that prevents deletions.
> - Replicating audit logs to an external append-only store (e.g., an event stream or write-once object storage).

---

## Local Setup with Docker Compose

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Compose)
- Node.js ≥ 20
- npm ≥ 10

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd Ai_engineer_code_test

# Copy environment templates
cp .env.example backend/.env
# Edit backend/.env if your local ports differ
```

### 2. Start PostgreSQL

```bash
docker compose up -d
# Starts:
#   mini_task_manager_db      → localhost:5432  (development)
#   mini_task_manager_test_db → localhost:5433  (tests)

# Verify containers are healthy
docker compose ps
```

### 3. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend (in a separate terminal)
cd ../frontend
npm install
```

### 4. Run Prisma migrations

```bash
cd backend

# Development database
npx prisma migrate deploy

# Test database
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/mini_task_manager_test?schema=public" \
  npx prisma migrate deploy
```

> `prisma migrate deploy` applies all pending migrations including the immutability trigger.

### 5. Seed the database (optional)

```bash
cd backend
npm run db:seed
```

This creates one sample task per predefined actor (`alice`, `bob`, `charlie`, `diana`, `system`).

### 6. Start the backend

```bash
cd backend
npm run dev
# API available at http://localhost:3000
# Health check: http://localhost:3000/health
```

### 7. Start the frontend

```bash
cd frontend
npm run dev
# UI available at http://localhost:5173
```

---

## Running Tests

Tests use the **isolated test database** on port 5433 and clean up after themselves.

```bash
cd backend

# Ensure test database is migrated (one-time setup)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/mini_task_manager_test?schema=public" \
  npx prisma migrate deploy

# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

### What the tests cover

| Scenario | Test |
|---|---|
| Successful transition creates exactly one audit log | ✅ |
| Multiple sequential transitions produce the correct log count | ✅ |
| Invalid transitions return 422 and create no audit log | ✅ |
| Same-status update is a no-op — no audit log created | ✅ |
| Failed transaction leaves task and audit history unchanged | ✅ |
| Deleting a task preserves its audit history | ✅ |
| `taskId` snapshot remains correct after task deletion | ✅ |
| PostgreSQL rejects `UPDATE` on audit log records (trigger) | ✅ |
| PostgreSQL rejects `DELETE` on audit log records (trigger) | ✅ |
| Concurrent requests produce exactly one audit log | ✅ |
| Concurrent conflicting transitions leave a consistent state | ✅ |

---

## API Reference

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tasks` | List all tasks |
| `GET` | `/api/tasks/:id` | Get a single task |
| `POST` | `/api/tasks` | Create a task |
| `PATCH` | `/api/tasks/:id/status` | Update task status (transactional) |
| `DELETE` | `/api/tasks/:id` | Delete a task (audit logs preserved) |
| `GET` | `/api/tasks/:id/audit-logs` | Get audit logs for a task |

### Audit Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/audit-logs` | List all audit logs |

> No `POST`, `PATCH`, or `DELETE` endpoints exist for audit logs — they are append-only.

### Create Task — `POST /api/tasks`

```json
{
  "title": "Implement feature X",
  "description": "Optional description",
  "createdBy": "alice"
}
```

### Update Status — `PATCH /api/tasks/:id/status`

```json
{
  "status": "in_progress",
  "actor": "bob"
}
```

**Predefined actors:** `alice`, `bob`, `charlie`, `diana`, `system`

**Status values:** `to_do`, `pending`, `in_progress`, `done`

---

## Predefined Actors

The system validates all `createdBy` and `actor` fields against a fixed list:

```
alice · bob · charlie · diana · system
```

Any other value returns HTTP 400 Validation Error.

