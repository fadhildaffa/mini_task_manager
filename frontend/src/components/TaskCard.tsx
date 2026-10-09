import { useState } from "react";
import type { Task, TaskStatus, Actor } from "../types";
import {
  ACTORS,
  STATUS_LABELS,
  STATUS_COLORS,
  VALID_TRANSITIONS,
} from "../types";

interface TaskCardProps {
  task: Task;
  onUpdateStatus: (
    id: string,
    status: TaskStatus,
    actor: Actor
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onViewLogs: (id: string) => void;
}

export function TaskCard({
  task,
  onUpdateStatus,
  onDelete,
  onViewLogs,
}: TaskCardProps) {
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>(task.status);
  const [selectedActor, setSelectedActor] = useState<Actor>("alice");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTransitions = VALID_TRANSITIONS[task.status];

  const handleUpdate = async () => {
    if (selectedStatus === task.status) return;
    setLoading(true);
    setError(null);
    try {
      await onUpdateStatus(task.id, selectedStatus, selectedActor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task? Audit logs will be preserved.")) return;
    try {
      await onDelete(task.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
          {task.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[task.status]}`}
        >
          {STATUS_LABELS[task.status]}
        </span>
      </div>

      {/* Meta */}
      <div className="text-xs text-gray-400 flex gap-3">
        <span>by {task.createdBy}</span>
        <span>{new Date(task.createdAt).toLocaleDateString()}</span>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      {/* Transition controls */}
      {availableTransitions.length > 0 ? (
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs text-gray-500 mb-1">
              New status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as TaskStatus)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={task.status} disabled>
                {STATUS_LABELS[task.status]} (current)
              </option>
              {availableTransitions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[100px]">
            <label className="block text-xs text-gray-500 mb-1">Actor</label>
            <select
              value={selectedActor}
              onChange={(e) => setSelectedActor(e.target.value as Actor)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ACTORS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => void handleUpdate()}
            disabled={loading || selectedStatus === task.status}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg px-3 py-1.5 transition-colors"
          >
            {loading ? "Saving…" : "Update"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No further transitions available</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <button
          onClick={() => onViewLogs(task.id)}
          className="text-xs text-blue-600 hover:underline"
        >
          View audit logs
        </button>
        <span className="text-gray-200">|</span>
        <button
          onClick={() => void handleDelete()}
          className="text-xs text-red-500 hover:underline"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

