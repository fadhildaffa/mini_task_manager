import { useState } from "react";
import { useTasks } from "./hooks/useTasks";
import { CreateTaskForm } from "./components/CreateTaskForm";
import { TaskCard } from "./components/TaskCard";
import { AuditLogPanel } from "./components/AuditLogPanel";
import type { Task, TaskStatus, Actor } from "./types";

export default function App() {
  const { tasks, loading, error, createTask, updateStatus, removeTask, refresh } =
    useTasks();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleUpdateStatus = async (
    id: string,
    status: TaskStatus,
    actor: Actor
  ) => {
    await updateStatus(id, status, actor);
  };

  const handleViewLogs = (id: string) => {
    const task = tasks.find((t) => t.id === id) ?? null;
    setSelectedTask(task);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            📋 Mini Task Manager
          </h1>
          <button
            onClick={() => void refresh()}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ↺ Refresh
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar — create form */}
          <aside className="lg:col-span-1">
            <CreateTaskForm onSubmit={createTask} />
          </aside>

          {/* Task list */}
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                Tasks ({tasks.length})
              </h2>
            </div>

            {loading && (
              <div className="text-center py-16 text-gray-400">Loading…</div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && tasks.length === 0 && (
              <div className="text-center py-16 text-gray-400 italic">
                No tasks yet — create one!
              </div>
            )}

            {!loading &&
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={removeTask}
                  onViewLogs={handleViewLogs}
                />
              ))}
          </section>
        </div>
      </main>

      {/* Audit log modal */}
      {selectedTask && (
        <AuditLogPanel
          taskId={selectedTask.id}
          taskTitle={selectedTask.title}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}

