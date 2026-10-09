import { useState, useEffect, useCallback } from "react";
import * as api from "../api/client";
import type { Task, AuditLog, TaskStatus, Actor } from "../types";

// ── useTasks ────────────────────────────────────────────────────────────────

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await api.getTasks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTask = useCallback(
    async (data: { title: string; description?: string; createdBy: Actor }) => {
      const task = await api.createTask(data);
      setTasks((prev) => [task, ...prev]);
      return task;
    },
    []
  );

  const updateStatus = useCallback(
    async (id: string, status: TaskStatus, actor: Actor) => {
      const updated = await api.updateTaskStatus(id, status, actor);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    },
    []
  );

  const removeTask = useCallback(async (id: string) => {
    await api.deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { tasks, loading, error, refresh, createTask, updateStatus, removeTask };
}

// ── useAuditLogs ────────────────────────────────────────────────────────────

export function useAuditLogs(taskId: string | null) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await api.getTaskAuditLogs(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (taskId) void fetchLogs(taskId);
    else setLogs([]);
  }, [taskId, fetchLogs]);

  return { logs, loading, error, refresh: taskId ? () => fetchLogs(taskId) : undefined };
}

