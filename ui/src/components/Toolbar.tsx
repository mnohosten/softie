import { useSoftieStore } from "../store/index.ts";
import { formatCost } from "../utils.ts";

export function Toolbar() {
  const {
    metadata,
    progress,
    approvalState,
    wsConnected,
    contextPanelOpen,
    totalCost,
    toggleContextPanel,
    setBraveMode,
    setApprovalMode,
  } = useSoftieStore();

  const statusColors: Record<string, string> = {
    executing: "var(--blue)",
    completed: "var(--green)",
    failed: "var(--red)",
    analyzing: "var(--yellow)",
    "team-review": "var(--yellow)",
    initializing: "var(--text-muted)",
    paused: "var(--orange)",
    "milestone-review": "var(--yellow)",
  };

  const status = metadata?.status || "idle";
  const statusDotColor = statusColors[status] || "var(--text-muted)";

  const costDisplay = totalCost > 0 ? formatCost(totalCost) : null;

  return (
    <div className="toolbar">
      <span className="toolbar-logo">⟁ Softie</span>

      {metadata && (
        <>
          <span className="toolbar-project">{metadata.name || metadata.intent.slice(0, 60)}</span>
          <div className="toolbar-status">
            <span
              className="toolbar-status-dot"
              style={{ background: statusDotColor }}
            />
            <span>{status}</span>
          </div>
        </>
      )}

      {costDisplay && (
        <span className="toolbar-cost">{costDisplay}</span>
      )}

      {progress && progress.totalPhases > 0 && (
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {progress.completedPhases}/{progress.totalPhases} phases
        </span>
      )}

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
        ⚡ Brave
      </button>

      <button
        className={`toolbar-btn ${contextPanelOpen ? "active" : ""}`}
        onClick={toggleContextPanel}
        title="Toggle context panel"
      >
        ☰ Panel
      </button>

      <div
        className={`ws-dot ${wsConnected ? "connected" : ""}`}
        title={wsConnected ? "Connected" : "Disconnected"}
      />
    </div>
  );
}
