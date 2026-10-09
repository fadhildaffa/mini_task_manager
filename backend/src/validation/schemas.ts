import { z } from "zod";
import { TaskStatus } from "@prisma/client";
import { PREDEFINED_ACTORS } from "../config";

export const taskStatusValues = [
  "to_do",
  "pending",
  "in_progress",
  "done",
] as const;

export const TaskStatusSchema = z.nativeEnum(TaskStatus);
export const ActorSchema = z.enum(
  PREDEFINED_ACTORS as unknown as [string, ...string[]]
);

export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(2000).optional(),
  createdBy: ActorSchema,
});

export const UpdateTaskStatusSchema = z.object({
  status: TaskStatusSchema,
  actor: ActorSchema,
});

export const TaskIdParamSchema = z.object({
  id: z.string().uuid("Task id must be a valid UUID"),
});

/**
 * Valid status transitions.
 * Key = fromStatus, Value = set of allowed toStatuses.
 */
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  to_do: ["pending", "in_progress"],
  pending: ["in_progress", "to_do"],
  in_progress: ["done", "pending"],
  done: [],
};

export function isValidTransition(
  from: TaskStatus,
  to: TaskStatus
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

