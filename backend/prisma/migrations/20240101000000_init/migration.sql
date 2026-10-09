-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('to_do', 'pending', 'in_progress', 'done');

-- CreateTable
CREATE TABLE "tasks" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "title"       TEXT        NOT NULL,
    "description" TEXT,
    "status"      "TaskStatus" NOT NULL DEFAULT 'to_do',
    "createdBy"   TEXT        NOT NULL,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "taskId"     UUID        NOT NULL,
    "taskRefId"  UUID,
    "taskTitle"  TEXT        NOT NULL,
    "actor"      TEXT        NOT NULL,
    "fromStatus" "TaskStatus" NOT NULL,
    "toStatus"   "TaskStatus" NOT NULL,
    "timestamp"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (nullable — SET NULL on task deletion)
ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_taskRefId_fkey"
    FOREIGN KEY ("taskRefId")
    REFERENCES "tasks"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "audit_logs_taskId_idx"     ON "audit_logs"("taskId");
CREATE INDEX "audit_logs_timestamp_idx"  ON "audit_logs"("timestamp");

-- ────────────────────────────────────────────────────────────────────────────
-- Immutability trigger: prevent UPDATE or DELETE on audit_logs
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION
            'audit_logs are immutable — UPDATE is not allowed (row id: %)', OLD.id;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'audit_logs are immutable — DELETE is not allowed (row id: %)', OLD.id;
    END IF;
    -- Should never reach here, but return OLD to satisfy the function signature.
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

-- ────────────────────────────────────────────────────────────────────────────
-- updatedAt auto-update trigger for tasks
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON "tasks"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

