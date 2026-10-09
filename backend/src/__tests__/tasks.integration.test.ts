/**
 * Integration tests for task status transitions and audit logging.
 *
 * Uses a dedicated test PostgreSQL database (port 5433).
 * Each test (or describe block) cleans up after itself.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { testPrisma } from "./setup";
import { TaskStatus } from "@prisma/client";

const app = createApp();

// ── Helpers ────────────────────────────────────────────────────────────────

async function createTask(overrides?: Partial<{
  title: string;
  description: string;
  createdBy: string;
  status: TaskStatus;
}>) {
  return testPrisma.task.create({
    data: {
      title: overrides?.title ?? "Test Task",
      description: overrides?.description,
      createdBy: overrides?.createdBy ?? "alice",
      status: overrides?.status ?? "to_do",
    },
  });
}

async function cleanDb() {
  // Delete in correct order — FK constraint
  await testPrisma.auditLog.deleteMany({});
  await testPrisma.task.deleteMany({});
}

// ── Test suites ────────────────────────────────────────────────────────────

describe("Task CRUD", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("creates a task via POST /api/tasks", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "New Task", createdBy: "alice" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "New Task",
      status: "to_do",
      createdBy: "alice",
    });
  });

  it("rejects task creation with unknown actor", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Task", createdBy: "unknown_user" });

    expect(res.status).toBe(400);
  });

  it("rejects task creation with empty title", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "", createdBy: "alice" });

    expect(res.status).toBe(400);
  });

  it("lists all tasks", async () => {
    await createTask({ title: "Task A" });
    await createTask({ title: "Task B" });

    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("returns 404 for nonexistent task", async () => {
    const res = await request(app).get(
      "/api/tasks/00000000-0000-0000-0000-000000000001"
    );
    expect(res.status).toBe(404);
  });
});

describe("Status transitions — success paths", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("transitions to_do → pending and creates exactly one audit log", async () => {
    const task = await createTask({ status: "to_do" });

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "bob" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.auditLog).toBeDefined();

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe("to_do");
    expect(logs[0].toStatus).toBe("pending");
    expect(logs[0].actor).toBe("bob");
    expect(logs[0].taskTitle).toBe(task.title);
  });

  it("transitions to_do → in_progress and creates exactly one audit log", async () => {
    const task = await createTask({ status: "to_do" });

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "in_progress", actor: "charlie" });

    expect(res.status).toBe(200);

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe("to_do");
    expect(logs[0].toStatus).toBe("in_progress");
  });

  it("multiple valid transitions produce the correct number of audit logs", async () => {
    const task = await createTask({ status: "to_do" });

    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "alice" });

    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "in_progress", actor: "bob" });

    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "done", actor: "charlie" });

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
      orderBy: { timestamp: "asc" },
    });

    expect(logs).toHaveLength(3);
    expect(logs[0].fromStatus).toBe("to_do");
    expect(logs[0].toStatus).toBe("pending");
    expect(logs[2].toStatus).toBe("done");
  });
});

describe("Status transitions — no-op", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("same-status update returns success without creating an audit log", async () => {
    const task = await createTask({ status: "to_do" });

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "to_do", actor: "alice" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("unchanged");

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(0);
  });
});

describe("Status transitions — invalid", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("rejects invalid transition done → to_do with 422 and creates no audit log", async () => {
    const task = await createTask({ status: "done" });

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "to_do", actor: "alice" });

    expect(res.status).toBe(422);

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(0);
  });

  it("rejects invalid transition pending → done with 422", async () => {
    const task = await createTask({ status: "pending" });

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "done", actor: "alice" });

    expect(res.status).toBe(422);
  });

  it("rejects unknown actor", async () => {
    const task = await createTask();

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "hacker" });

    expect(res.status).toBe(400);

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(0);
  });

  it("rejects invalid status value", async () => {
    const task = await createTask();

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "flying", actor: "alice" });

    expect(res.status).toBe(400);
  });
});

describe("Task deletion — audit log preservation", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("deleting a task preserves its audit history", async () => {
    const task = await createTask({ status: "to_do" });

    // Perform a valid transition to generate an audit log
    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "alice" });

    const logsBefore = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logsBefore).toHaveLength(1);

    // Delete the task
    const deleteRes = await request(app).delete(`/api/tasks/${task.id}`);
    expect(deleteRes.status).toBe(204);

    // Confirm task is gone
    const taskAfter = await testPrisma.task.findUnique({
      where: { id: task.id },
    });
    expect(taskAfter).toBeNull();

    // Audit logs must still exist with the immutable taskId snapshot
    const logsAfter = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logsAfter).toHaveLength(1);
    expect(logsAfter[0].taskId).toBe(task.id);
    // taskRefId (FK) is now null — FK was set to NULL on delete
    expect(logsAfter[0].taskRefId).toBeNull();
  });
});

describe("Audit log immutability — PostgreSQL trigger", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("PostgreSQL rejects UPDATE on audit_logs", async () => {
    const task = await createTask({ status: "to_do" });

    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "alice" });

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(1);
    const logId = logs[0].id;

    // Direct UPDATE should be rejected by the trigger
    await expect(
      testPrisma.$executeRaw`UPDATE audit_logs SET actor = 'hacker' WHERE id = ${logId}::uuid`
    ).rejects.toThrow();
  });

  it("PostgreSQL rejects DELETE on audit_logs", async () => {
    const task = await createTask({ status: "to_do" });

    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "alice" });

    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    const logId = logs[0].id;

    // Direct DELETE should be rejected by the trigger
    await expect(
      testPrisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${logId}::uuid`
    ).rejects.toThrow();
  });
});

describe("Concurrent updates", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("two concurrent requests produce exactly one audit log and one final status", async () => {
    const task = await createTask({ status: "to_do" });

    // Both requests attempt to transition to_do → pending simultaneously.
    // One should succeed (200), the other should either succeed as a no-op
    // (same status, 200) or fail (422/500 due to serialisation conflict).
    const [res1, res2] = await Promise.all([
      request(app)
        .patch(`/api/tasks/${task.id}/status`)
        .send({ status: "pending", actor: "alice" }),
      request(app)
        .patch(`/api/tasks/${task.id}/status`)
        .send({ status: "pending", actor: "bob" }),
    ]);

    // At least one must succeed
    const succeeded = [res1, res2].filter((r) => r.status === 200);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    // Final task status must be pending
    const finalTask = await testPrisma.task.findUnique({
      where: { id: task.id },
    });
    expect(finalTask?.status).toBe("pending");

    // Exactly one audit log must exist (no-op second request doesn't log)
    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(1);
  });

  it("two concurrent conflicting transitions leave a consistent state", async () => {
    const task = await createTask({ status: "to_do" });

    // One tries to go to pending, the other to in_progress.
    // The serialisable transaction ensures only one wins.
    const [res1, res2] = await Promise.all([
      request(app)
        .patch(`/api/tasks/${task.id}/status`)
        .send({ status: "pending", actor: "alice" }),
      request(app)
        .patch(`/api/tasks/${task.id}/status`)
        .send({ status: "in_progress", actor: "bob" }),
    ]);

    // One succeeds, one may fail (serialisation error or invalid transition)
    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);

    // Only one audit log must exist regardless
    const logs = await testPrisma.auditLog.findMany({
      where: { taskId: task.id },
    });
    expect(logs).toHaveLength(1);
  });
});

describe("Audit log retrieval API", () => {
  beforeEach(cleanDb);
  afterEach(cleanDb);

  it("GET /api/audit-logs returns all logs", async () => {
    const task = await createTask({ status: "to_do" });
    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "alice" });

    const res = await request(app).get("/api/audit-logs");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/tasks/:id/audit-logs returns logs for a specific task", async () => {
    const task = await createTask({ status: "to_do" });
    await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: "pending", actor: "alice" });

    const res = await request(app).get(`/api/tasks/${task.id}/audit-logs`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].taskId).toBe(task.id);
  });
});

