import { useState } from "react";
import { useSoftieStore } from "../store/index.ts";
import { statusColor } from "../utils.ts";
import type { BoardTask, BoardTaskStatus, Sprint } from "../types.ts";

const COLUMNS: { status: BoardTaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "Todo" },
  { status: "in-progress", label: "In Progress" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

function TaskCard({ task }: { task: BoardTask }) {
  const { specs } = useSoftieStore();
  const spec = task.specId ? specs.find((s) => s.id === task.specId) : null;

  const priorityColors: Record<string, string> = {
    p0: "var(--red)",
    p1: "var(--yellow)",
    p2: "var(--text-muted)",
  };

  return (
    <div className="board-task-card">
      <div className="board-task-header">
        <span className="board-task-title">{task.title}</span>
        <span
          className="board-task-priority"
          style={{ color: priorityColors[task.priority] }}
        >
          {task.priority.toUpperCase()}
        </span>
      </div>
      {task.description && (
        <div className="board-task-desc">
          {task.description.length > 80
            ? task.description.slice(0, 77) + "..."
            : task.description}
        </div>
      )}
      <div className="board-task-footer">
        {spec && (
          <span className="board-task-spec" title={spec.title}>
            {spec.type}
          </span>
        )}
        {task.assignedAgentId && (
          <span className="board-task-agent">{task.assignedAgentId}</span>
        )}
        <span className="board-task-complexity">{task.estimatedComplexity}</span>
        {task.dependencies.length > 0 && (
          <span className="board-task-deps" title={`Depends on: ${task.dependencies.join(", ")}`}>
            {task.dependencies.length} dep{task.dependencies.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function SprintSelector({ sprints, activeSprint, onSelect }: {
  sprints: Sprint[];
  activeSprint: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="board-sprint-selector">
      <button
        className={`board-sprint-btn ${activeSprint === null ? "active" : ""}`}
        onClick={() => onSelect(null)}
      >
        All Tasks
      </button>
      {sprints.map((s) => (
        <button
          key={s.id}
          className={`board-sprint-btn ${activeSprint === s.id ? "active" : ""}`}
          onClick={() => onSelect(s.id)}
        >
          <span
            className="board-sprint-dot"
            style={{ background: statusColor(s.status === "active" ? "active" : s.status === "completed" ? "completed" : "pending") }}
          />
          {s.name}
        </button>
      ))}
    </div>
  );
}

export function BoardView() {
  const { boardTasks, sprints, specs } = useSoftieStore();
  const [activeSprint, setActiveSprint] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);

  const filteredTasks = activeSprint
    ? boardTasks.filter((t) => t.sprintId === activeSprint)
    : boardTasks;

  const handlePlanFromSpecs = async () => {
    setPlanning(true);
    try {
      await fetch("/api/board/plan", { method: "POST" });
    } catch {
      // ignore
    }
    // Don't set planning=false here — the result comes via WebSocket events
    setTimeout(() => setPlanning(false), 5000);
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      await fetch("/api/project/execute-v2", { method: "POST" });
    } catch {
      // ignore
    }
    setTimeout(() => setExecuting(false), 5000);
  };

  const hasApprovedSpecs = specs.some((s) => s.status === "approved" || s.status === "draft");

  return (
    <div className="board-view">
      <div className="board-header">
        <span className="board-title">Board</span>
        <SprintSelector
          sprints={sprints}
          activeSprint={activeSprint}
          onSelect={setActiveSprint}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {hasApprovedSpecs && boardTasks.length === 0 && (
            <button
              className="btn btn-sm"
              onClick={handlePlanFromSpecs}
              disabled={planning}
              style={{
                background: planning ? "var(--bg-4)" : "var(--accent)",
                color: "white",
                border: "none",
                padding: "4px 12px",
              }}
            >
              {planning ? "Planning..." : "Plan from Specs"}
            </button>
          )}
          {boardTasks.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={handleExecute}
              disabled={executing}
              style={{
                background: executing ? "var(--bg-4)" : "var(--green)",
                color: executing ? "var(--text-muted)" : "var(--bg-1)",
                border: "none",
                padding: "4px 12px",
                fontWeight: 600,
              }}
            >
              {executing ? "Executing..." : "Execute"}
            </button>
          )}
        </div>
      </div>

      {boardTasks.length === 0 ? (
        <div className="board-empty">
          <div style={{ fontSize: 32, marginBottom: 12 }}>▦</div>
          <h3>No tasks yet</h3>
          <p style={{ color: "var(--text-muted)", fontSize: 12, maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>
            {specs.length > 0
              ? "Click 'Plan from Specs' to generate tasks from your approved specifications."
              : "Create specs first, then the planning orchestrator will decompose them into tasks."}
          </p>
        </div>
      ) : (
        <div className="board-columns">
          {COLUMNS.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <div key={col.status} className="board-column">
                <div className="board-column-header">
                  <span>{col.label}</span>
                  <span className="board-column-count">{columnTasks.length}</span>
                </div>
                <div className="board-column-body">
                  {columnTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
