import { PrismaClient } from "@prisma/client";

/**
 * AuditLogService — read-only access only.
 *
 * Mutation operations (create) are intentionally NOT exposed here; they are
 * performed exclusively inside the TaskService transaction.  This prevents
 * any part of the application from inserting audit logs outside a proper
 * status transition, and ensures no UPDATE or DELETE is ever issued against
 * audit_logs from the application layer.
 */
export class AuditLogService {
  constructor(private readonly db: PrismaClient) {}

  async getLogsForTask(taskId: string) {
    return this.db.auditLog.findMany({
      where: { taskId },
      orderBy: { timestamp: "asc" },
    });
  }

  async getAllLogs() {
    return this.db.auditLog.findMany({
      orderBy: { timestamp: "desc" },
    });
  }
}

