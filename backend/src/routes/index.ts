import { Router, Request, Response, NextFunction } from "express";
import { TaskService, NotFoundError, InvalidTransitionError } from "../services/taskService";
import { AuditLogService } from "../services/auditLogService";
import {
  CreateTaskSchema,
  UpdateTaskStatusSchema,
  TaskIdParamSchema,
} from "../validation/schemas";
import { prisma } from "../db/client";
import { ZodError } from "zod";

export function createTaskRouter(): Router {
  const router = Router();
  const taskService = new TaskService(prisma);
  const auditLogService = new AuditLogService(prisma);

  // ── GET /tasks ───────────────────────────────────────────────────────────
  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tasks = await taskService.getAllTasks();
      res.json({ data: tasks });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /tasks/:id ───────────────────────────────────────────────────────
  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = TaskIdParamSchema.parse(req.params);
        const task = await taskService.getTaskById(id);
        if (!task) {
          res.status(404).json({ error: "Task not found" });
          return;
        }
        res.json({ data: task });
      } catch (err) {
        next(err);
      }
    }
  );

  // ── POST /tasks ──────────────────────────────────────────────────────────
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = CreateTaskSchema.parse(req.body);
      const task = await taskService.createTask(body);
      res.status(201).json({ data: task });
    } catch (err) {
      next(err);
    }
  });

  // ── PATCH /tasks/:id/status ──────────────────────────────────────────────
  router.patch(
    "/:id/status",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = TaskIdParamSchema.parse(req.params);
        const { status, actor } = UpdateTaskStatusSchema.parse(req.body);

        const result = await taskService.updateTaskStatus(id, status, actor);

        if (result.kind === "no_op") {
          res.json({ data: result.task, message: "Status unchanged — no audit log created" });
          return;
        }

        res.json({
          data: result.task,
          auditLog: result.auditLog,
          message: "Status updated successfully",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ── DELETE /tasks/:id ────────────────────────────────────────────────────
  router.delete(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = TaskIdParamSchema.parse(req.params);
        await taskService.deleteTask(id);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  // ── GET /tasks/:id/audit-logs ────────────────────────────────────────────
  router.get(
    "/:id/audit-logs",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = TaskIdParamSchema.parse(req.params);
        const logs = await auditLogService.getLogsForTask(id);
        res.json({ data: logs });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

export function createAuditLogRouter(): Router {
  const router = Router();
  const auditLogService = new AuditLogService(prisma);

  // ── GET /audit-logs ──────────────────────────────────────────────────────
  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = await auditLogService.getAllLogs();
      res.json({ data: logs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ── Error handler middleware (attach after routes in app.ts) ────────────────
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: err.errors });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof InvalidTransitionError) {
    res.status(422).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

