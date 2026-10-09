export type TaskStatus = "to_do" | "pending" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  taskId: string;
  taskRefId: string | null;
  taskTitle: string;
  actor: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  timestamp: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export const ACTORS = ["alice", "bob", "charlie", "diana", "system"] as const;
export type Actor = (typeof ACTORS)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  to_do: "To Do",
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  to_do: "bg-gray-100 text-gray-700",
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
};

/** Valid transitions matching backend rules */
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  to_do: ["pending", "in_progress"],
  pending: ["in_progress", "to_do"],
  in_progress: ["done", "pending"],
  done: [],
};

