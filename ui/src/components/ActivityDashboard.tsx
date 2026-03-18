import { useMemo, useEffect, useState } from "react";
import { useSoftieStore } from "../store/index.ts";
import { formatTime } from "../utils.ts";
import type { Activity } from "../types.ts";

// ── PhaseProgressBar ──────────────────────────────────────────────────────────

function PhaseProgressBar() {
  const { plan } = useSoftieStore();
  if (!plan || plan.phases.length === 0) return null;

  const sorted = [...plan.phases].sort((a, b) => a.order - b.order);

  return (
    <div className="dash-phase-bar">
      {sorted.map((phase) => (
        <div
          key={phase.id}
          className={`dash-phase-pill dash-phase-${phase.status}`}
          title={phase.description || phase.name}
        >
          <span className="dash-phase-dot" />
          <span className="dash-phase-name">{phase.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── AgentGrid ─────────────────────────────────────────────────────────────────

type AgentStatus = "active" | "idle" | "done" | "waiting";

interface AgentState {
  name: string;
  status: AgentStatus;
  lastActivity: Activity | null;
  currentTool: string | null;
}

function AgentCard({ agent }: { agent: AgentState }) {
  const dotClass =
    agent.status === "active"
      ? "agent-dot-active"
      : agent.status === "idle"
      ? "agent-dot-idle"
      : agent.status === "done"
      ? "agent-dot-done"
      : "agent-dot-waiting";

  return (
    <div className="dash-agent-card">
      <div className="dash-agent-header">
        <span className={`dash-agent-dot ${dotClass}`} />
        <span className="dash-agent-name">{agent.name}</span>
        {agent.currentTool && (
          <span className="dash-agent-tool">{agent.currentTool}</span>
        )}
      </div>
      {agent.lastActivity && (
        <div className="dash-agent-msg">
          {agent.lastActivity.message.replace(/^\[[^\]]+\]\s*/, "").slice(0, 80)}
        </div>
      )}
    </div>
  );
}

function AgentGrid() {
  const { team, activities, isRunning } = useSoftieStore();
  const [tick, setTick] = useState(0);

  // Tick every 5 seconds for status recalculation
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const agentStates = useMemo(() => {
    // Collect all agent names
    const names = new Set<string>();
    if (team?.agents) {
      for (const a of team.agents) names.add(a.name);
    }
    for (const act of activities) {
      const agentName = act.meta?.agentName as string | undefined;
      if (agentName) names.add(agentName);
    }

    const now = Date.now();
    return Array.from(names).map((name): AgentState => {
      const agentActivities = activities.filter(
        (a) => a.meta?.agentName === name || a.message.startsWith(`[${name}]`)
      );
      const last = agentActivities[0] ?? null;
      const lastTime = last ? new Date(last.timestamp).getTime() : 0;
      const age = now - lastTime;

      let status: AgentStatus = "waiting";
      if (last) {
        if (isRunning && age < 30_000) status = "active";
        else if (isRunning) status = "idle";
        else status = "done";
      }

      const toolAct = agentActivities.find((a) => a.type === "sdk:tool");
      const currentTool =
        status === "active" && toolAct
          ? (toolAct.meta?.toolName as string | undefined) ?? null
          : null;

      return { name, status, lastActivity: last, currentTool };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, activities, isRunning, tick]);

  if (agentStates.length === 0) return null;

  return (
    <div className="dash-agent-grid">
      <div className="dash-section-label">Agents</div>
      {agentStates.map((a) => (
        <AgentCard key={a.name} agent={a} />
      ))}
    </div>
  );
}

// ── ActivityStream ────────────────────────────────────────────────────────────

function StreamEntry({ activity }: { activity: Activity }) {
  const type = activity.type;

  if (type === "sdk:tool") {
    const toolName = activity.meta?.toolName as string | undefined;
    const agentName = activity.meta?.agentName as string | undefined;
    return (
      <div className="stream-entry stream-tool">
        <span className="stream-time">{formatTime(activity.timestamp)}</span>
        {agentName && <span className="stream-agent-name">{agentName}</span>}
        {toolName && <span className="stream-tool-badge">{toolName}</span>}
        <span className="stream-msg">{activity.message.replace(/^\[[^\]]+\]\s*[^:]+:\s*/, "")}</span>
      </div>
    );
  }

  if (type === "sdk:text") {
    const agentName = activity.meta?.agentName as string | undefined;
    return (
      <div className="stream-entry stream-text">
        <span className="stream-time">{formatTime(activity.timestamp)}</span>
        {agentName && <span className="stream-agent-name">{agentName}</span>}
        <span className="stream-msg stream-pre">{activity.message.replace(/^\[[^\]]+\]\s*/, "")}</span>
      </div>
    );
  }

  if (type === "phase:started" || type === "phase:completed" || type === "phase:failed") {
    return (
      <div className="stream-entry stream-system stream-phase">
        <span className="stream-msg">{activity.message}</span>
        <span className="stream-time">{formatTime(activity.timestamp)}</span>
      </div>
    );
  }

  if (type === "parallel:launch") {
    const names = activity.meta?.agentNames as string[] | undefined;
    return (
      <div className="stream-entry stream-system">
        <span className="stream-msg">Parallel launch:</span>
        {names?.map((n) => (
          <span key={n} className="stream-agent-badge">{n}</span>
        ))}
        <span className="stream-time">{formatTime(activity.timestamp)}</span>
      </div>
    );
  }

  // Default / agent:activity
  return (
    <div className="stream-entry">
      <span className="stream-time">{formatTime(activity.timestamp)}</span>
      <span className="stream-msg">{activity.message}</span>
    </div>
  );
}

function ActivityStream() {
  const { activities } = useSoftieStore();
  const visible = activities.slice(0, 80);

  return (
    <div className="dash-stream">
      <div className="dash-section-label">Activity Stream</div>
      <div className="dash-stream-entries">
        {visible.length === 0 ? (
          <div className="dash-stream-empty">Waiting for activity…</div>
        ) : (
          visible.map((a) => <StreamEntry key={a.id} activity={a} />)
        )}
      </div>
    </div>
  );
}

// ── ActivityDashboard (main export) ──────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  executing:       { label: "Running",   color: "var(--green)" },
  analyzing:       { label: "Analyzing", color: "var(--blue)" },
  initializing:    { label: "Init",      color: "var(--blue)" },
  completed:       { label: "Completed", color: "var(--green)" },
};

export function ActivityDashboard() {
  const { metadata, isRunning } = useSoftieStore();
  const status = metadata?.status ?? "";
  const badge = STATUS_BADGE[status];

  return (
    <div className="dash-root">
      <div className="dash-header">
        <span className="dash-title">{metadata?.name ?? "Project Dashboard"}</span>
        {badge && (
          <span className="dash-running-badge" style={{ color: badge.color, borderColor: `color-mix(in srgb, ${badge.color} 25%, var(--border))`, background: `color-mix(in srgb, ${badge.color} 8%, var(--bg-2))` }}>
            {isRunning && <span className="activity-pulse-dot" style={{ marginRight: 5, background: badge.color }} />}
            {badge.label}
          </span>
        )}
      </div>
      <PhaseProgressBar />
      <div className="dash-body">
        <AgentGrid />
        <ActivityStream />
      </div>
    </div>
  );
}
