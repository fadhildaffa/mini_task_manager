import type { Task, AuditLog, TaskStatus, Actor, ApiResponse } from "../types";

const BASE_URL = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export async function getTasks(): Promise<Task[]> {
  const res = await fetchJson<ApiResponse<Task[]>>("/tasks");
  return res.data;
}

export async function getTask(id: string): Promise<Task> {
  const res = await fetchJson<ApiResponse<Task>>(`/tasks/${id}`);
  return res.data;
}

export async function createTask(data: {
  title: string;
  description?: string;
  createdBy: Actor;
}): Promise<Task> {
  const res = await fetchJson<ApiResponse<Task>>("/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data;
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  actor: Actor,
): Promise<Task> {
  const res = await fetchJson<ApiResponse<Task>>(`/tasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, actor }),
  });
  return res.data;
}

export async function deleteTask(id: string): Promise<void> {
  await fetch(`${BASE_URL}/tasks/${id}`, { method: "DELETE" });
}

// ── Audit Logs ─────────────────────────────────────────────────────────────

export async function getTaskAuditLogs(taskId: string): Promise<AuditLog[]> {
  const res = await fetchJson<ApiResponse<AuditLog[]>>(
    `/tasks/${taskId}/audit-logs`,
  );
  return res.data;
}

export async function getAllAuditLogs(): Promise<AuditLog[]> {
  const res = await fetchJson<ApiResponse<AuditLog[]>>("/audit-logs");
  return res.data;
}
