import { useSoftieStore } from "../store/index.ts";
import { formatCost, timeAgo } from "../utils.ts";

const WORKFLOW_STEPS = [
  { status: "analyzing", label: "Analyzing", desc: "AI is generating specs from your intent" },
  { status: "spec-review", label: "Spec Review", desc: "Review and approve generated specifications" },
  { status: "planning", label: "Planning", desc: "Decomposing specs into tasks and sprints" },
  { status: "ready", label: "Ready", desc: "Board is ready — start execution" },
  { status: "executing", label: "Executing", desc: "AI agents are working on tasks" },
  { status: "sprint-review", label: "Sprint Review", desc: "Reviewing completed sprint" },
  { status: "completed", label: "Completed", desc: "All sprints completed" },
];

function WorkflowProgress({ currentStatus }: { currentStatus: string }) {
  const currentIdx = WORKFLOW_STEPS.findIndex((s) => s.status === currentStatus);

  return (
    <div className="dash-workflow">
      {WORKFLOW_STEPS.map((step, i) => {
        let state: "done" | "active" | "pending" = "pending";
        if (i < currentIdx) state = "done";
        else if (i === currentIdx) state = "active";

        return (
          <div key={step.status} className={`dash-workflow-step dash-workflow-${state}`}>
            <div className="dash-workflow-dot">
              {state === "done" ? "✓" : state === "active" ? "●" : "○"}
            </div>
            <div className="dash-workflow-label">{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardView() {
  const { metadata, progress, specs, boardTasks, sprints, activities, setActiveView } = useSoftieStore();

  const status = metadata?.status ?? "initializing";
  const totalCost = progress?.totalCostUsd ?? 0;

  const specCount = specs.length;
  const taskCount = boardTasks.length;
  const doneTasks = boardTasks.filter((t) => t.status === "done").length;
  const sprintCount = sprints.length;
  const activeSprint = sprints.find((s) => s.status === "active");

  // Recent activities (last 20)
  const recentActivities = activities.slice(0, 20);

  return (
    <div className="dash-v2">
      {/* Header */}
      <div className="dash-v2-header">
        <h2 className="dash-v2-title">{metadata?.name ?? "Softie"}</h2>
        {metadata?.updatedAt && (
          <span className="dash-v2-updated">Updated {timeAgo(metadata.updatedAt)}</span>
        )}
      </div>

      {/* Workflow progress */}
      <WorkflowProgress currentStatus={status} />

      {/* Status-specific CTA */}
      {status === "spec-review" && (
        <div className="dash-v2-cta">
          <p>Specifications have been generated. Review and approve them to proceed.</p>
          <button className="dash-v2-cta-btn" onClick={() => setActiveView("specs")}>
            Review Specs ({specCount})
          </button>
        </div>
      )}
      {status === "ready" && (
        <div className="dash-v2-cta">
          <p>Board is ready with {taskCount} tasks across {sprintCount} sprints. Start execution to begin.</p>
          <button className="dash-v2-cta-btn" onClick={() => setActiveView("board")}>
            Go to Board
          </button>
        </div>
      )}
      {status === "failed" && (
        <div className="dash-v2-cta dash-v2-cta-error">
          <p>Execution failed. Check logs for details.</p>
          <button className="dash-v2-cta-btn" onClick={() => setActiveView("ide")}>
            View Logs
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="dash-v2-stats">
        <div className="dash-v2-stat" onClick={() => setActiveView("specs")}>
          <div className="dash-v2-stat-value">{specCount}</div>
          <div className="dash-v2-stat-label">Specs</div>
        </div>
        <div className="dash-v2-stat" onClick={() => setActiveView("board")}>
          <div className="dash-v2-stat-value">{taskCount > 0 ? `${doneTasks}/${taskCount}` : "—"}</div>
          <div className="dash-v2-stat-label">Tasks</div>
        </div>
        <div className="dash-v2-stat">
          <div className="dash-v2-stat-value">{sprintCount > 0 ? (activeSprint?.name ?? `${sprintCount} sprints`) : "—"}</div>
          <div className="dash-v2-stat-label">Sprint</div>
        </div>
        <div className="dash-v2-stat">
          <div className="dash-v2-stat-value">{totalCost > 0 ? formatCost(totalCost) : "—"}</div>
          <div className="dash-v2-stat-label">Cost</div>
        </div>
      </div>

      {/* Activity stream */}
      <div className="dash-v2-activity">
        <div className="dash-v2-section-label">Recent Activity</div>
        {recentActivities.length === 0 ? (
          <div className="dash-v2-empty">Waiting for activity...</div>
        ) : (
          <div className="dash-v2-activity-list">
            {recentActivities.map((a) => (
              <div key={a.id} className="dash-v2-activity-item">
                <span className="dash-v2-activity-msg">{a.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
