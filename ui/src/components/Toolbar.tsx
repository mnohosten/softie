import { useSoftieStore } from "../store/index.ts";
import { formatCost } from "../utils.ts";
import type { ViewId } from "../types.ts";
import { NotificationBell } from "./NotificationBell.tsx";

const VIEW_ITEMS: { id: ViewId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◉" },
  { id: "specs", label: "Specs", icon: "📋" },
  { id: "board", label: "Board", icon: "▦" },
  { id: "ide", label: "IDE", icon: "⟁" },
  { id: "design", label: "Design", icon: "🎨" },
];

export function Toolbar() {
  const {
    metadata,
    approvalState,
    wsConnected,
    totalCost,
    activeView,
    setActiveView,
    setBraveMode,
    setApprovalMode,
    projectExists,
  } = useSoftieStore();

  const statusColors: Record<string, string> = {
    executing: "var(--blue)",
    completed: "var(--green)",
    failed: "var(--red)",
    analyzing: "var(--blue)",
    "spec-review": "var(--yellow)",
    planning: "var(--blue)",
    ready: "var(--green)",
    "sprint-review": "var(--yellow)",
    initializing: "var(--text-muted)",
    paused: "var(--orange)",
    // v1 compat
    "team-review": "var(--yellow)",
    "milestone-review": "var(--yellow)",
  };

  const status = metadata?.status || "idle";
  const statusDotColor = statusColors[status] || "var(--text-muted)";

  const costDisplay = totalCost > 0 ? formatCost(totalCost) : null;

  return (
    <div className="toolbar">
      <span className="toolbar-logo">⟁ Softie</span>

      {/* View switcher */}
      {projectExists && (
        <div className="toolbar-views">
          {VIEW_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`toolbar-view-btn ${activeView === item.id ? "active" : ""}`}
              onClick={() => setActiveView(item.id)}
              title={item.label}
            >
              <span className="toolbar-view-icon">{item.icon}</span>
              <span className="toolbar-view-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {metadata && (
        <div className="toolbar-status">
          <span
            className="toolbar-status-dot"
            style={{ background: statusDotColor }}
          />
          <span>{status}</span>
        </div>
      )}

      {costDisplay && (
        <span className="toolbar-cost">{costDisplay}</span>
      )}

      <NotificationBell />

      <div className="toolbar-spacer" />

      <button
        className={`toolbar-btn brave ${approvalState.braveMode ? "active" : ""}`}
        onClick={() => {
          setBraveMode(!approvalState.braveMode);
          if (!approvalState.braveMode) setApprovalMode("brave");
          else setApprovalMode("granular");
          fetch("/api/approval", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: !approvalState.braveMode ? "brave" : "granular",
              braveMode: !approvalState.braveMode,
            }),
          }).catch(console.error);
        }}
        title="Brave mode: auto-approve all tasks"
      >
        Brave
      </button>

      <div
        className={`ws-dot ${wsConnected ? "connected" : ""}`}
        title={wsConnected ? "Connected" : "Disconnected"}
      />
    </div>
  );
}
