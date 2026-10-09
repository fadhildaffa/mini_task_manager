import { PrismaClient, TaskStatus } from "@prisma/client";
import { isValidTransition } from "../validation/schemas";

export class TaskService {
  constructor(private readonly db: PrismaClient) {}

  async getAllTasks() {
    return this.db.task.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async getTaskById(id: string) {
    return this.db.task.findUnique({ where: { id } });
  }

  async createTask(data: {
    title: string;
    description?: string;
    createdBy: string;
  }) {
    return this.db.task.create({
      data: {
        title: data.title,
        description: data.description,
        createdBy: data.createdBy,
        status: "to_do",
      },
    });
  }

  /**
   * Updates task status inside a single serialisable Prisma transaction.
   *
   * Concurrency strategy
   * --------------------
   * We use Prisma's `$transaction` with isolation level SERIALIZABLE.
   * Within the transaction we first SELECT … FOR UPDATE (via findUniqueOrThrow
   * with a raw lock) the task row to acquire a row-level exclusive lock.
   * Any concurrent transaction attempting to update the same task will block
   * until this transaction commits or rolls back, preventing lost-update
   * anomalies and inconsistent audit logs.
   *
   * An alternative (optimistic locking) approach would use a `version` field
   * and conditional UPDATE WHERE version = expected; that is documented in
   * the README as a trade-off.
   */
  async updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    actor: string
  ): Promise<
    | { kind: "updated"; task: object; auditLog: object }
    | { kind: "no_op"; task: object }
  > {
    return this.db.$transaction(
      async (tx) => {
        // ── 1. Lock the task row (SELECT … FOR UPDATE) ──────────────────────
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            title: string;
            status: TaskStatus;
          }>
        >`SELECT id, title, status FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;

        if (rows.length === 0) {
          throw new NotFoundError(`Task ${taskId} not found`);
        }

        const current = rows[0];

        // ── 2. No-op if status is unchanged ─────────────────────────────────
        if (current.status === newStatus) {
          const task = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
          return { kind: "no_op" as const, task };
        }

        // ── 3. Validate transition ───────────────────────────────────────────
        if (!isValidTransition(current.status, newStatus)) {
          throw new InvalidTransitionError(
            `Cannot transition from "${current.status}" to "${newStatus}"`
          );
        }

        // ── 4. Update task ───────────────────────────────────────────────────
        const updatedTask = await tx.task.update({
          where: { id: taskId },
          data: { status: newStatus },
        });

        // ── 5. Insert audit log ──────────────────────────────────────────────
        const auditLog = await tx.auditLog.create({
          data: {
            taskId: taskId,       // immutable snapshot
            taskRefId: taskId,    // nullable FK (set to NULL on task delete)
            taskTitle: current.title,
            actor,
            fromStatus: current.status,
            toStatus: newStatus,
            timestamp: new Date(),
          },
        });

        return { kind: "updated" as const, task: updatedTask, auditLog };
      },
      { isolationLevel: "Serializable" }
    );
  }

  async deleteTask(id: string) {
    return this.db.task.delete({ where: { id } });
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

