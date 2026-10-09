import type { AuditLog } from "../types";
import { STATUS_LABELS, STATUS_COLORS } from "../types";
import { useAuditLogs } from "../hooks/useTasks";

interface AuditLogPanelProps {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}

export function AuditLogPanel({ taskId, taskTitle, onClose }: AuditLogPanelProps) {
  const { logs, loading, error } = useAuditLogs(taskId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-900">Audit Log</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{taskTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <p className="text-sm text-gray-500 text-center py-8">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center py-8">{error}</p>
          )}
          {!loading && !error && logs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8 italic">
              No audit entries yet.
            </p>
          )}
          {!loading && !error && logs.length > 0 && (
            <ol className="space-y-3">
              {logs.map((log: AuditLog, idx) => (
                <li key={log.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    {idx < logs.length - 1 && (
                      <span className="w-px flex-1 bg-gray-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[log.fromStatus]}`}
                      >
                        {STATUS_LABELS[log.fromStatus]}
                      </span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[log.toStatus]}`}
                      >
                        {STATUS_LABELS[log.toStatus]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      by <span className="font-medium text-gray-700">{log.actor}</span>
                      {" · "}
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            Audit logs are append-only and protected by a PostgreSQL trigger.
          </p>
        </div>
      </div>
    </div>
  );
}

